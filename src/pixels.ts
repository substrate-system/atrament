// colour indices per pixel
const R = 0
const G = 1
const B = 2
export const A = 3

export const PIXEL = 4
export const TRANSPARENT = 0
export const OPAQUE = 255

export const lineDistance = (x1: number, y1: number, x2: number, y2: number): number => {
    // calculate euclidean distance between (x1, y1) and (x2, y2)
    const xs = (x2 - x1) ** 2
    const ys = (y2 - y1) ** 2
    return Math.sqrt(xs + ys)
}

export const hexToRgb = (hexColor: string): [number, number, number] => {
    // Since input type color provides hex and ImageData accepts RGB need to transform
    const m = hexColor.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
    if (!m) throw new Error('Invalid hex color')
    return [
        parseInt(m[1], 16),
        parseInt(m[2], 16),
        parseInt(m[3], 16),
    ]
}

// Pixel color equals comp color?
export const colorMatcher = (data: Uint8ClampedArray, compR: number, compG: number, compB: number, compA: number) => (pixelPos: number): boolean => (
    data[pixelPos + R] === compR
  && data[pixelPos + G] === compG
  && data[pixelPos + B] === compB
  && data[pixelPos + A] === compA
)

export const colorMatcherIgnoreAlpha = (data: Uint8ClampedArray, ...args: [number, number, number, number]) => {
    const match = colorMatcher(data, ...args)

    return (pixelPos: number): boolean => {
        const alpha = data[pixelPos + A]
        if (alpha !== TRANSPARENT && alpha !== OPAQUE) {
            return true
        }

        return match(pixelPos)
    }
}

/* eslint-disable no-param-reassign */
export const pixelPainter = (data: Uint8ClampedArray, fillR: number, fillG: number, fillB: number, fillA: number) => (pixelPos: number): void => {
    data[pixelPos + R] = fillR
    data[pixelPos + G] = fillG
    data[pixelPos + B] = fillB
    data[pixelPos + A] = fillA
}

export const pixelPainterMixAlpha = (data: Uint8ClampedArray, fillR: number, fillG: number, fillB: number, fillA: number) => (pixelPos: number): void => {
    const oldAlpha = data[pixelPos + A]
    // calculate ratio of old vs. new colour to be alpha-mixed
    const mixAlphaOld = oldAlpha === OPAQUE
        ? TRANSPARENT
        : oldAlpha / OPAQUE
    const mixAlphaNew = 1 - mixAlphaOld

    const paint = pixelPainter(
        data,
        Math.floor(mixAlphaOld * data[pixelPos + R] + mixAlphaNew * fillR),
        Math.floor(mixAlphaOld * data[pixelPos + G] + mixAlphaNew * fillG),
        Math.floor(mixAlphaOld * data[pixelPos + B] + mixAlphaNew * fillB),
        fillA,
    )

    return paint(pixelPos)
}
/* eslint-enable no-param-reassign */
