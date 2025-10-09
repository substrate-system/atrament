/* eslint-disable no-unused-vars */
import Atrament, {
    MODE_DRAW, MODE_FILL, MODE_ERASE, MODE_DISABLED, type Mode
} from '../src/index.js'
import fill from '../src/fill/index.js'
import { setRecorded, playRecorded } from './recording.js'
import colorPicker from './color-picker.js'
import Debug from '@substrate-system/debug'
const log = Debug(import.meta.env.DEV)

// first, we need to set up the canvas
const canvas = document.getElementById('sketcher') as HTMLCanvasElement
const toolbarToggle = document.getElementById('toolbar-toggle')!
const toolbar = document.getElementsByClassName('toolbar')[0] as HTMLElement
const clearButton = document.getElementById('clear') as HTMLButtonElement
const recordButton = document.getElementById('recordButton') as HTMLInputElement
const playButton = document.getElementById('playButton') as HTMLButtonElement
const weightInput = document.getElementById('weight') as HTMLInputElement
const pressureLowInput = document.getElementById('pressure-low') as HTMLInputElement
const pressureLowOutput = document.getElementById('pressure-low-output')!
const pressureHighInput = document.getElementById('pressure-high') as HTMLInputElement
const pressureHighOutput = document.getElementById('pressure-high-output')!
const pressureSmoothingInput = document.getElementById('pressure-smoothing-input') as HTMLInputElement
const pressureSmoothingOutput = document.getElementById('pressure-smoothing-output')!
const smoothingInput = document.getElementById('smoothing') as HTMLInputElement
const adaptiveInput = document.getElementById('adaptive') as HTMLInputElement
const secondaryEraserInput = document.getElementById('secondary-eraser') as HTMLInputElement
const modeInput = document.getElementById('mode') as HTMLSelectElement

const modes: Record<string, Mode> = {
    draw: MODE_DRAW,
    fill: MODE_FILL,
    erase: MODE_ERASE,
    disabled: MODE_DISABLED,
}

// instantiate Atrament
const atrament = new Atrament(canvas, {
    width: canvas.offsetWidth,
    height: canvas.offsetHeight,
    ignoreModifiers: true,
    fill,
})

toolbarToggle.addEventListener('click', () => {
    toolbar.classList.toggle('toolbar-visible')
})

clearButton.addEventListener('click', () => atrament.clear())

recordButton.addEventListener('click', () => {
    atrament.recordStrokes = true
  document.querySelector<HTMLInputElement>('#recordButton')!.value = 'Recording...'
})

playButton.addEventListener('click', () => {
    atrament.clear()
    playRecorded(atrament)
})

weightInput.addEventListener('input', ({ target }: Event) => {
    atrament.weight = parseFloat((target as HTMLInputElement).value)
})

pressureLowInput.addEventListener('input', ({ target }: Event) => {
    const value = (target as HTMLInputElement).value
    atrament.pressureLow = parseFloat(value)
    pressureLowOutput.innerText = value
})
pressureHighInput.addEventListener('input', ({ target }: Event) => {
    const value = (target as HTMLInputElement).value
    atrament.pressureHigh = parseFloat(value)
    pressureHighOutput.innerText = value
})
pressureSmoothingInput.addEventListener('input', ({ target }: Event) => {
    const value = (target as HTMLInputElement).value
    atrament.pressureSmoothing = parseFloat(value)
    pressureSmoothingOutput.innerText = value
})

smoothingInput.addEventListener('change', ({ target }: Event) => {
    atrament.smoothing = parseFloat((target as HTMLInputElement).value)
})

adaptiveInput.addEventListener('change', ({ target }: Event) => {
    atrament.adaptiveStroke = (target as HTMLInputElement).checked
})

secondaryEraserInput.addEventListener('change', ({ target }: Event) => {
    atrament.secondaryMouseButton = (target as HTMLInputElement).checked
})

modeInput.addEventListener('change', ({ target }: Event) => {
    atrament.mode = modes[(target as HTMLSelectElement).value]
})

colorPicker.on('save', (color: any) => {
    atrament.color = color.toRGBA().toString()
    colorPicker.hide()
})

atrament.addEventListener('dirty', () => {
    log('event: dirty')
    clearButton.hidden = false
})

atrament.addEventListener('clean', () => {
    log('event: clean')
})

atrament.addEventListener('fillstart', ({ x, y }: { x: number; y: number }) => {
    log(`event: fillstart x: ${x} y: ${y}`)
})

atrament.addEventListener('fillend', () => {
    log('event: fillend')
})

atrament.addEventListener('strokestart', () => log('event: strokestart'))
atrament.addEventListener('strokeend', () => log('event: strokeend'))

atrament.addEventListener('strokerecorded', ({ stroke }: any) => {
    log(`event: strokerecorded - ${stroke.segments.length} segments`)
    setRecorded(stroke)

    atrament.recordStrokes = false
  document.querySelector<HTMLInputElement>('#recordButton')!.value = 'Record a stroke'
  document.querySelector<HTMLButtonElement>('#playButton')!.hidden = false
})

atrament.addEventListener('segmentdrawn', () => log('event: segmentdrawn'))
