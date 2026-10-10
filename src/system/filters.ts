// Retro display shader filters — instant toggles on the game canvas:
// CRT Scanlines (+ curvature illusion), LCD Pixel Grid, Sharp Nearest, Smooth
// Bilinear. Implemented as GPU-composited CSS layers — zero per-frame cost.

export type FilterMode = 'off' | 'crt' | 'lcd' | 'sharp' | 'smooth'

export const FILTER_MODES: FilterMode[] = ['off', 'crt', 'lcd', 'sharp', 'smooth']

export const FILTER_LABELS: Record<FilterMode, string> = {
  off: 'Off',
  crt: 'CRT Scanlines',
  lcd: 'LCD Grid',
  sharp: 'Sharp Pixel',
  smooth: 'Smooth Bilinear',
}

/** CSS applied to the canvas element for the chosen filter. */
export function canvasStyleFor(mode: FilterMode, smooth: boolean): {
  imageRendering: string
  filter: string
} {
  switch (mode) {
    case 'crt':
      return {
        imageRendering: 'pixelated',
        filter: 'contrast(1.06) saturate(1.1)',
      }
    case 'lcd':
      return {
        imageRendering: 'pixelated',
        filter: 'contrast(1.04)',
      }
    case 'sharp':
      return { imageRendering: 'pixelated', filter: 'none' }
    case 'smooth':
      return { imageRendering: 'auto', filter: 'none' }
    default:
      return { imageRendering: smooth ? 'auto' : 'pixelated', filter: 'none' }
  }
}

/** Overlay element (inline SVG background) stacked above the canvas. */
export function overlayStyleFor(mode: FilterMode): {
  backgroundImage: string
  backgroundSize: string
  borderRadius: string
  boxShadow?: string
  opacity: number
} {
  switch (mode) {
    case 'crt':
      return {
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px), radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
        backgroundSize: '100% 3px, 100% 100%',
        borderRadius: '18px',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.35)',
        opacity: 1,
      }
    case 'lcd':
      return {
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 2px), repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 2px)',
        backgroundSize: '2px 2px',
        borderRadius: '8px',
        opacity: 1,
      }
    default:
      return {
        backgroundImage: 'none',
        backgroundSize: 'auto',
        borderRadius: '12px',
        opacity: 0,
      }
  }
}
