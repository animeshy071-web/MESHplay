import { useEffect, useRef } from 'react'
import type { Theme } from '../lib/themes'
import { hexToRgb, lerpRgb, rgbStrA, type Rgb } from '../lib/color'

const OW = 384
const OH = 216

interface Blob {
  cx: number; cy: number; r: number
  ax: number; ay: number; sx: number; sy: number; phase: number
  pool: 0 | 1 | 2 // 0 = waveA, 1 = waveB, 2 = bg tint
}

const BLOBS: Blob[] = [
  { cx: 0.22, cy: 0.30, r: 0.55, ax: 0.10, ay: 0.07, sx: 0.11, sy: 0.09, phase: 0.0, pool: 0 },
  { cx: 0.75, cy: 0.22, r: 0.48, ax: 0.08, ay: 0.11, sx: 0.08, sy: 0.13, phase: 2.1, pool: 1 },
  { cx: 0.60, cy: 0.75, r: 0.62, ax: 0.12, ay: 0.06, sx: 0.07, sy: 0.10, phase: 4.0, pool: 0 },
  { cx: 0.10, cy: 0.85, r: 0.50, ax: 0.09, ay: 0.09, sx: 0.12, sy: 0.08, phase: 1.2, pool: 1 },
  { cx: 0.45, cy: 0.45, r: 0.70, ax: 0.06, ay: 0.12, sx: 0.06, sy: 0.07, phase: 3.3, pool: 2 },
]

interface Props {
  theme: Theme
  gameColors: [string, string] | null
}

export default function WaveWallpaper({ theme, gameColors }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cur = useRef({
    bg0: hexToRgb(theme.bg0), bg1: hexToRgb(theme.bg1),
    a: hexToRgb(theme.waveA), b: hexToRgb(theme.waveB),
  })
  const target = useRef({
    bg0: hexToRgb(theme.bg0), bg1: hexToRgb(theme.bg1),
    a: hexToRgb(gameColors ? gameColors[0] : theme.waveA),
    b: hexToRgb(gameColors ? gameColors[1] : theme.waveB),
  })

  useEffect(() => {
    target.current = {
      bg0: hexToRgb(theme.bg0), bg1: hexToRgb(theme.bg1),
      a: hexToRgb(gameColors ? gameColors[0] : theme.waveA),
      b: hexToRgb(gameColors ? gameColors[1] : theme.waveB),
    }
  }, [theme, gameColors])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const off = document.createElement('canvas')
    off.width = OW
    off.height = OH
    const offCtx = off.getContext('2d')!

    let raf = 0
    let last = performance.now()
    let t = 0
    let running = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const onVis = () => {
      running = document.visibilityState === 'visible'
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      t += dt

      const k = 1 - Math.exp(-dt * 3)
      const c = cur.current
      c.bg0 = lerpRgb(c.bg0, target.current.bg0, k)
      c.bg1 = lerpRgb(c.bg1, target.current.bg1, k)
      c.a = lerpRgb(c.a, target.current.a, k)
      c.b = lerpRgb(c.b, target.current.b, k)

      const base = offCtx.createLinearGradient(0, 0, 0, OH)
      base.addColorStop(0, rgbStrA(c.bg1, 1))
      base.addColorStop(1, rgbStrA(c.bg0, 1))
      offCtx.globalCompositeOperation = 'source-over'
      offCtx.fillStyle = base
      offCtx.fillRect(0, 0, OW, OH)

      offCtx.globalCompositeOperation = 'lighter'
      for (const b of BLOBS) {
        const px = (b.cx + Math.sin(t * b.sx * 6.28 + b.phase) * b.ax) * OW
        const py = (b.cy + Math.cos(t * b.sy * 6.28 + b.phase * 1.7) * b.ay) * OH
        const rad = b.r * OH * (1 + 0.1 * Math.sin(t * 0.5 + b.phase * 2))
        const col: Rgb = b.pool === 0 ? c.a : b.pool === 1 ? c.b : c.bg1
        const alpha = b.pool === 2 ? 0.22 : 0.3
        const g = offCtx.createRadialGradient(px, py, 0, px, py, rad)
        g.addColorStop(0, rgbStrA(col, alpha))
        g.addColorStop(1, rgbStrA(col, 0))
        offCtx.save()
        offCtx.translate(px, py)
        offCtx.scale(1.55, 1)
        offCtx.translate(-px, -py)
        offCtx.fillStyle = g
        offCtx.fillRect(px - rad * 1.6, py - rad, rad * 3.2, rad * 2)
        offCtx.restore()
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}
