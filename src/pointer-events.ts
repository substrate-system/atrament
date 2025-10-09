import type Atrament from './index.js'

const pointerEventHandler = (handler: (event: PointerEvent) => void, instance: Atrament) => (event: PointerEvent): void => {
    // Ignore pointers such as additional touches on a multi-touch screen
    if (!event.isPrimary || (!instance.secondaryMouseButton && event.button > 0)
    || (instance.ignoreModifiers
      && (event.altKey || event.ctrlKey || event.metaKey || event.button === 1))) {
        return
    }

    if (event.cancelable) {
        event.preventDefault()
    }

    handler(event)
}

interface PointerEventHandlers {
  canvas: HTMLCanvasElement;
  move: (event: PointerEvent) => void;
  down: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
}

export const setupPointerEvents = ({
    canvas,
    move,
    down,
    up,
}: PointerEventHandlers, instance: Atrament): () => void => {
    const moveListener = pointerEventHandler(move, instance)
    const downListener = pointerEventHandler(down, instance)
    const upListener = pointerEventHandler(up, instance)

    canvas.addEventListener('pointermove', moveListener)
    canvas.addEventListener('pointerdown', downListener)
    document.addEventListener('pointerup', upListener)
    document.addEventListener('pointerout', upListener)

    return () => {
        canvas.removeEventListener('pointermove', moveListener)
        canvas.removeEventListener('pointerdown', downListener)
        document.removeEventListener('pointerup', upListener)
        document.removeEventListener('pointerout', upListener)
    }
}
