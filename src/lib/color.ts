export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) }
}

export function rgbStr(c: Rgb): string {
  return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
}

export function rgbStrA(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${alpha})`
}
