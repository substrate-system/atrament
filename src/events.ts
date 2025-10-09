export default class AtramentEventTarget {
    eventListeners: Map<string, Set<(data: any) => void>>

    constructor () {
        this.eventListeners = new Map()
    }

    addEventListener (eventName: string, handler: (data: any) => void): void {
        const handlers = this.eventListeners.get(eventName) || new Set()
        handlers.add(handler)
        this.eventListeners.set(eventName, handlers)
    }

    removeEventListener (eventName: string, handler: (data: any) => void): void {
        const handlers = this.eventListeners.get(eventName)
        if (!handlers) return
        handlers.delete(handler)
    }

    dispatchEvent (eventName: string, data?: any): void {
        const handlers = this.eventListeners.get(eventName)
        if (!handlers) return;
        [...handlers].forEach((handler) => handler(data))
    }
}
