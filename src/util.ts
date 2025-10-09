export const scale = (value: number, smin: number, smax: number, tmin: number, tmax: number): number => ((value - smin) * (tmax - tmin))
  / (smax - smin) + tmin
