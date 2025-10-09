/* eslint-disable max-classes-per-file */
// make a class for Point
export class Point {
    x: number
    y: number

    constructor (x: number, y: number) {
        this.x = x
        this.y = y
    }

    set (x: number, y: number): void {
        this.x = x
        this.y = y
    }
}

// make a class for the mouse data
export class Mouse extends Point {
    down: boolean
    previous: Point

    constructor () {
        super(0, 0)
        this.down = false
        this.previous = new Point(0, 0)
    }
}
