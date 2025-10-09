import floodFill from './flood.js'

interface FillMessageData {
  image: Uint8ClampedArray;
  width: number;
  height: number;
  color: string;
  globalAlpha: number;
  startX: number;
  startY: number;
  startColor: number[];
}

globalThis.addEventListener('message', ({ data }: MessageEvent<FillMessageData>) => {
    const result = floodFill(data)

    globalThis.postMessage({ type: 'fill-result', result }, [result.buffer])
})
