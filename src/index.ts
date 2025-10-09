import { Mouse, Point } from './mouse.js'
import AtramentEventTarget from './events.js'
import { lineDistance } from './pixels.js'
import { setupPointerEvents } from './pointer-events.js'

import {
    MIN_LINE_THICKNESS,
    LINE_THICKNESS_RANGE,
    THICKNESS_INCREMENT,
    MIN_SMOOTHING_FACTOR,
    INITIAL_SMOOTHING_FACTOR,
    WEIGHT_SPREAD,
    INITIAL_THICKNESS,
    DEFAULT_PRESSURE,
} from './constants.js'
import { scale } from './util.js'

export const MODE_DRAW = 'draw'
export const MODE_ERASE = 'erase'
export const MODE_FILL = 'fill'
export const MODE_DISABLED = 'disabled'

export type Mode = typeof MODE_DRAW | typeof MODE_ERASE | typeof MODE_FILL | typeof MODE_DISABLED;

const pathDrawingModes: Mode[] = [MODE_DRAW, MODE_ERASE]
const configKeys = ['weight', 'smoothing', 'adaptiveStroke', 'mode', 'secondaryMouseButton', 'ignoreModifiers', 'pressureLow', 'pressureHigh', 'pressureSmoothing'] as const

interface StrokeSegment {
  point: Point;
  time: number;
  pressure: number;
}

export interface CurrentStroke {
  segments: StrokeSegment[];
  mode: Mode;
  weight: number;
  smoothing: number;
  color: string;
  adaptiveStroke: boolean;
}

interface FillData {
  color: string;
  globalAlpha: number;
  width: number;
  height: number;
  startColor: number[];
  startX: number;
  startY: number;
}

interface FillWorkerConstructor {
  new(): Worker;
}

export interface AtramentConfig {
  width?: number;
  height?: number;
  color?: string;
  fill?: FillWorkerConstructor;
  weight?: number;
  smoothing?: number;
  adaptiveStroke?: boolean;
  mode?: Mode;
  secondaryMouseButton?: boolean;
  ignoreModifiers?: boolean;
  pressureLow?: number;
  pressureHigh?: number;
  pressureSmoothing?: number;
}

export default class Atrament extends AtramentEventTarget {
    adaptiveStroke = true
    canvas: HTMLCanvasElement
    recordStrokes = false
    smoothing = INITIAL_SMOOTHING_FACTOR
    thickness = INITIAL_THICKNESS
    secondaryMouseButton = false
    ignoreModifiers = false
    pressureLow = 0
    pressureHigh = 2
    pressureSmoothing = 0.3
    strokeTimestamp?: number

    #context: CanvasRenderingContext2D
    #contextMenu = false
    #dirty = false
    #filling = false
    #fillStack: FillData[] = []
    #fillWorker: Worker | null = null
    #mode: Mode = MODE_DRAW
    #mouse = new Mouse()
    #previousPressure = DEFAULT_PRESSURE
    #removePointerEventListeners: (() => void) | undefined
    #strokeMemory: StrokeSegment[] = []
    #thickness = INITIAL_THICKNESS
    #weight = INITIAL_THICKNESS

    constructor (selector: HTMLCanvasElement | string, config: AtramentConfig = {}) {
        if (typeof window === 'undefined') {
            throw new Error('atrament: looks like we\'re not running in a browser')
        }

        super()

        this.canvas = Atrament.#setupCanvas(selector, config)
        this.#context = Atrament.#setupContext(this.canvas, config)
        this.#setupFill({ FillWorker: config.fill })

        this.#removePointerEventListeners = setupPointerEvents({
            canvas: this.canvas,
            move: this.#pointerMove.bind(this),
            down: this.#pointerDown.bind(this),
            up: this.#pointerUp.bind(this),
        }, this)

        configKeys.forEach((key) => {
            if (config[key] !== undefined) {
                (this as any)[key] = config[key]
            }
        })

        this.canvas.addEventListener('contextmenu', (event) => {
            if (this.secondaryMouseButton && this.mode !== MODE_DISABLED) {
                event.preventDefault()
            } else {
                // On certain browsers/devices, left-clicking away from the contextmenu
                // seems to already trigger pointermove, so this way we prevent the coordinates
                // of that pointermove from being drawn.
                this.#contextMenu = true
            }
        })
    }

    /**
   * Begins a stroke at a given position
   *
   * @param {number} x
   * @param {number} y
   */
    beginStroke (x: number, y: number): void {
        this.#context.moveTo(x, y)
        this.#thickness = this.#weight

        if (this.recordStrokes) {
            this.strokeTimestamp = performance.now()
        }

        this.dispatchEvent('strokestart', { x, y })
    }

    /**
   * Ends a stroke at a given position
   *
   * @param {number} x
   * @param {number} y
   */
    endStroke (x: number, y: number): void {
        this.dispatchEvent('strokeend', { x, y })

        if (this.recordStrokes) {
            this.dispatchEvent('strokerecorded', { stroke: this.currentStroke })
        }
        this.#strokeMemory = []
        delete (this.strokeTimestamp)
    }

    /**
   * Draws the next stroke segment as a smooth quadratic curve
   * with adaptive stroke thickness between two points.
   *
   * @param {number} x current X coordinate
   * @param {number} y current Y coordinate
   * @param {number} previousX previous X coordinate
   * @param {number} previousY previous Y coordinate
   * @param {number} pressure the pointer pressure at this point (defaults to 0.5)
   */
    draw (x: number, y: number, previousX: number, previousY: number, pressure = DEFAULT_PRESSURE): { x: number; y: number } {
    // If the user clicks (or double clicks) without moving the mouse,
    // previousX/Y will be 0. In this case, we don't want to draw a line from (0,0) to (x,y),
    // but a "point" from (x,y) to (x,y).
        const prevX = previousX || x
        const prevY = previousY || y
        // get distance from the previous point
        // and use it to calculate the smoothed coordinates
        const smoothingFactor = this.getSmoothingFactor(lineDistance(x, y, prevX, prevY))
        const procX = x - (x - prevX) * smoothingFactor
        const procY = y - (y - prevY) * smoothingFactor

        // low-pass filtering pressure to avoid jagged stroke ends
        // where stylus pressure tends to be very low
        const pressureDiff = pressure - this.#previousPressure
        const smoothedPressure = pressure - pressureDiff * this.pressureSmoothing

        // recalculate distance from previous point, this time relative to the smoothed coords
        const dist = lineDistance(procX, procY, prevX, prevY)

        // Adaptive stroke allows an effect where thickness changes
        // over the course of the stroke. This simulates the variation in
        // ink discharge of a physical pen.
        // For pressure-sensitive devices, there will be natural variation,
        // so we don't apply adaptive stroke.
        if (this.adaptiveStroke && pressure === DEFAULT_PRESSURE) {
            const ratio = (dist - MIN_LINE_THICKNESS) / LINE_THICKNESS_RANGE
            // Calculate target thickness based on weight settings.
            const targetThickness = ratio * (this.#maxWeight - this.#weight) + this.#weight

            // approach the target gradually
            if (this.#thickness > targetThickness) {
                this.#thickness -= THICKNESS_INCREMENT
            } else if (this.#thickness < targetThickness) {
                this.#thickness += THICKNESS_INCREMENT
            }
        } else {
            this.#thickness = this.#getWeightWithPressure(smoothedPressure)
        }

        // Adjust thickness to intrinsic canvas size;
        this.#context.lineWidth = (this.#thickness / this.canvas.offsetWidth) * this.canvas.width

        const segmentStart = this.#extrinsicToIntrinsicPoint(prevX, prevY)
        const segmentEnd = this.#extrinsicToIntrinsicPoint(procX, procY)

        // Draw the segment using quad interpolation.
        this.#context.beginPath()
        this.#context.moveTo(...segmentStart)
        this.#context.quadraticCurveTo(...segmentStart, ...segmentEnd)
        this.#context.closePath()
        this.#context.stroke()

        if (this.recordStrokes) {
            this.#strokeMemory.push({
                point: new Point(x, y),
                time: performance.now() - this.strokeTimestamp!,
                pressure,
            })

            this.dispatchEvent('segmentdrawn', { stroke: this.currentStroke })
        }

        // At this point, we can be certain the canvas has some drawing on it,
        // so we can toggle the "dirty" state. Checking it here ensures that
        // the state is also updated during programmatic drawing.
        if (!this.#dirty && this.#mode === MODE_DRAW) {
            this.#dirty = true
            this.dispatchEvent('dirty')
        }

        return { x: procX, y: procY }
    }

    clear (): void {
        this.#dirty = false
        this.dispatchEvent('clean')

        // make sure we're in the right compositing mode, and erase everything
        const eraseMode = this.mode === MODE_ERASE
        if (eraseMode) {
            this.mode = MODE_DRAW
        }

        // clear the canvas without the transform
        // code taken from https://stackoverflow.com/a/6722031
        this.#context.save()
        this.#context.setTransform(1, 0, 0, 1, 0, 0)
        this.#context.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.#context.restore()

        if (eraseMode) {
            this.mode = MODE_ERASE
        }
    }

    destroy (): void {
        this.clear()
        this.#removePointerEventListeners?.()
    }

    get color (): string {
        return this.#context.strokeStyle as string
    }

    set color (c: string) {
        if (typeof c !== 'string') throw new Error('atrament: wrong argument type setting color')
        this.#context.strokeStyle = c
    }

    get weight (): number {
        return this.#weight
    }

    set weight (w: number) {
        if (typeof w !== 'number') throw new Error('atrament: wrong argument type setting weight')
        this.#thickness = w
        this.#weight = w
    }

    // For small weights, this allows for a lot of spread,
    // while for larger weights, the effect is less prominent.
    // This means at small weights, Atrament behaves more like an ink pen,
    // and at larger weights more like a marker.
    get #maxWeight (): number {
        return this.#weight + WEIGHT_SPREAD
    }

    // Here we scale the initial smoothing factor by the raw distance
    // - this means that when the mouse moves fast, there is more smoothing,
    // and when we're drawing small detailed stuff, we have more control.
    getSmoothingFactor (dist: number): number {
        return Math.min(
            MIN_SMOOTHING_FACTOR,
            this.smoothing + (dist - 60) / 3000,
        )
    }

    get mode (): Mode {
        return this.#mode
    }

    set mode (m: Mode) {
        switch (m) {
            case MODE_ERASE:
                this.#mode = MODE_ERASE
                this.#context.globalCompositeOperation = 'destination-out'
                break
            case MODE_FILL:
                this.#mode = MODE_FILL
                this.#context.globalCompositeOperation = 'source-over'
                break
            case MODE_DISABLED:
                this.#mode = MODE_DISABLED
                break
            case MODE_DRAW:
                this.#mode = MODE_DRAW
                this.#context.globalCompositeOperation = 'source-over'
                break
            default:
                throw new Error('atrament: mode is not one of the allowed modes.')
        }
    }

    get currentStroke (): CurrentStroke {
        return {
            segments: this.#strokeMemory.slice(),
            mode: this.mode,
            weight: this.weight,
            smoothing: this.smoothing,
            color: this.color,
            adaptiveStroke: this.adaptiveStroke,
        }
    }

    get dirty (): boolean {
        return this.#dirty
    }

    // Translates between extrinsic (DOM) coordinates and intrinsic (bitmap) coordinates.
    // Returns an array for easy passing into argument lists of CanvasRenderingContext2D methods.
    #extrinsicToIntrinsicPoint (offsetX: number, offsetY: number): [number, number] {
        const x = (offsetX / this.canvas.offsetWidth) * this.canvas.width
        const y = (offsetY / this.canvas.offsetHeight) * this.canvas.height
        return [x, y]
    }

    #getWeightWithPressure (pressure: number): number {
        if (pressure === 0.5) {
            return this.#weight
        }

        if (pressure < 0.5) {
            return this.#weight * scale(pressure, 0, 0.5, this.pressureLow, 1)
        }

        return this.#weight * scale(pressure, 0.5, 1, 1, this.pressureHigh)
    }

    static #setupCanvas (selector: HTMLCanvasElement | string, config: AtramentConfig): HTMLCanvasElement {
        let canvas: HTMLCanvasElement | null
        // get canvas element
        if (selector instanceof window.Node && selector.tagName === 'CANVAS') canvas = selector as HTMLCanvasElement
        else if (typeof selector === 'string') canvas = document.querySelector(selector)
        else throw new Error(`atrament: can't look for canvas based on '${selector}'`)
        if (!canvas) throw new Error('atrament: canvas not found')
        canvas.width = config.width || canvas.width
        canvas.height = config.height || canvas.height
        canvas.style.touchAction = 'none'

        return canvas
    }

    static #setupContext (canvas: HTMLCanvasElement, config: AtramentConfig): CanvasRenderingContext2D {
        const context = canvas.getContext('2d')!
        context.globalCompositeOperation = 'source-over'
        context.globalAlpha = 1
        context.strokeStyle = config.color || 'rgba(0,0,0,1)'
        context.lineCap = 'round'
        context.lineJoin = 'round'

        return context
    }

    #pointerMove (event: PointerEvent): void {
        const positions = event.getCoalescedEvents?.() || [event]
        positions.forEach((position) => {
            const x = position.offsetX
            const y = position.offsetY

            // draw if we should draw
            if (this.#mouse.down && pathDrawingModes.includes(this.#mode)) {
                if (this.#contextMenu) {
                    this.#mouse.previous.set(x, y)
                    this.#contextMenu = false
                }
                const { x: newX, y: newY } = this.draw(
                    x,
                    y,
                    this.#mouse.previous.x,
                    this.#mouse.previous.y,
                    position.pressure,
                )

                this.#mouse.set(x, y)
                this.#mouse.previous.set(newX, newY)
                this.#previousPressure = position.pressure
            } else {
                this.#mouse.set(x, y)
                this.#mouse.previous.set(x, y)
            }
        })
    }

    #pointerDown (event: PointerEvent): void {
        this.dispatchEvent('pointerdown', event)

        if (this.mode === MODE_FILL) {
            this.#fill()
            return
        }

        this.#mouse.down = true
        // update position just in case
        this.#pointerMove(event)
        this.#previousPressure = event.pressure

        this.beginStroke(this.#mouse.previous.x, this.#mouse.previous.y)
    }

    #pointerUp (event: PointerEvent): void {
        this.dispatchEvent('pointerup', event)

        if (this.#mode === MODE_FILL) {
            return
        }

        if (!this.#mouse.down) {
            return
        }

        this.#mouse.down = false

        if (this.#mouse.x === event.offsetX
      && this.#mouse.y === event.offsetY && pathDrawingModes.includes(this.mode)) {
            this.draw(
                this.#mouse.x,
                this.#mouse.y,
                this.#mouse.previous.x,
                this.#mouse.previous.y,
                this.#previousPressure,
            )
        }

        this.#mouse.previous.set(0, 0)

        this.endStroke(this.#mouse.x, this.#mouse.y)
    }

    #setupFill ({ FillWorker }: { FillWorker?: FillWorkerConstructor }): void {
        if (!FillWorker) {
            return
        }

        this.#fillWorker = new FillWorker()
        this.#fillWorker.addEventListener('message', ({ data }: MessageEvent) => {
            if (data.type === 'fill-result') {
                this.#filling = false
                this.dispatchEvent('fillend', {})

                const imageData = new ImageData(data.result, this.canvas.width, this.canvas.height)
                this.#context.putImageData(imageData, 0, 0)

                if (this.#fillStack.length > 0) {
                    this.#postToFillWorker(this.#fillStack.shift()!)
                }
            }
        })
    }

    #fill (): void {
        if (!this.#fillWorker) {
            throw new Error('atrament: fill mode only works if the fillWorker option is passed to the Atrament constructor')
        }

        const { x, y } = this.#mouse
        this.dispatchEvent('fillstart', { x, y })

        const startColor = Array.from(this.#context.getImageData(x, y, 1, 1).data)
        const fillData: FillData = {
            color: this.color,
            globalAlpha: this.#context.globalAlpha,
            width: this.canvas.width,
            height: this.canvas.height,
            startColor,
            startX: x,
            startY: y,
        }

        if (!this.#filling) {
            this.#filling = true
            this.#postToFillWorker(fillData)
        } else {
            this.#fillStack.push(fillData)
        }
    }

    #postToFillWorker (fillData: FillData): void {
        const image = this.#context.getImageData(0, 0, this.canvas.width, this.canvas.height).data
        this.#fillWorker?.postMessage({ image, ...fillData }, [image.buffer])
    }
}
