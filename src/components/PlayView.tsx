import { useEffect, useRef, useState } from 'react'
import { Chip8, KEY_MAP } from '../chip8/core'
import type { GameDef } from '../lib/games'
import { sfx } from '../lib/sound'
import LoadingRing from './LoadingRing'

interface Props {
  game: GameDef
  onExit: () => void
}

const CANVAS_W = 768
const CANVAS_H = 384
const CYCLES_PER_FRAME = 11

export default function PlayView({ game, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coreRef = useRef<Chip8 | null>(null)
  const romRef = useRef<Uint8Array | null>(null)
  const pausedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading')
  const [paused, setPaused] = useState(false)
  const [pauseSel, setPauseSel] = useState(0)
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let frames = 0
    let fpsT = performance.now()

    // game audio: single square wave, gated by the sound timer (CHIP-8 beeper)
    let audioCtx: AudioContext | null = null
    let gain: GainNode | null = null
    try {
      audioCtx = new AudioContext()
      const osc = audioCtx.createOscillator()
      gain = audioCtx.createGain()
      osc.type = 'square'
      osc.frequency.value = 440
      gain.gain.value = 0
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
    } catch {
      audioCtx = null
    }

    // persistent buffers — zero allocation in the render path
    const off = document.createElement('canvas')
    off.width = 64
    off.height = 32
    const offCtx = off.getContext('2d')!
    const img = offCtx.createImageData(64, 32)

    const render = (core: Chip8) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const px = img.data
      for (let i = 0; i < 64 * 32; i++) {
        if (core.display[i]) {
          px[i * 4] = 255
          px[i * 4 + 1] = 255
          px[i * 4 + 2] = 255
          px[i * 4 + 3] = 255
        }
      }
      offCtx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.drawImage(off, 0, 0, CANVAS_W, CANVAS_H)
    }

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const core = coreRef.current
      if (!core) return

      frames++
      if (now - fpsT > 500) {
        setFps(Math.round((frames * 1000) / (now - fpsT)))
        frames = 0
        fpsT = now
      }

      if (pausedRef.current) {
        if (gain) gain.gain.value = 0
        return
      }

      for (let j = 0; j < CYCLES_PER_FRAME; j++) core.cycle()
      core.tickTimers()
      if (gain) gain.gain.value = core.soundOn ? 0.03 : 0
      if (core.drawFlag) {
        render(core)
        core.drawFlag = false
      }
    }

    const setPausedBoth = (p: boolean) => {
      pausedRef.current = p
      setPaused(p)
      setPauseSel(0)
    }

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const core = coreRef.current
      if (!core) return
      const chipKey = KEY_MAP[e.code]
      if (chipKey !== undefined) {
        e.preventDefault()
        core.keys[chipKey] = down ? 1 : 0
        return
      }
      if (!down || e.repeat) return
      if (e.code === 'Escape') {
        e.preventDefault()
        sfx.pause()
        setPausedBoth(!pausedRef.current)
        return
      }
      if (!pausedRef.current) return
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        setPauseSel((s) => (e.code === 'ArrowUp' ? (s + 2) % 3 : (s + 1) % 3))
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        if (pauseSelRef.current === 0) {
          sfx.select()
          setPausedBoth(false)
        } else if (pauseSelRef.current === 1) {
          if (romRef.current) {
            coreRef.current = new Chip8(romRef.current)
            sfx.select()
            setPausedBoth(false)
          }
        } else {
          sfx.back()
          onExitRef.current()
        }
      }
    }

    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    fetch(`${import.meta.env.BASE_URL}roms/${game.rom}`)
      .then((r) => {
        if (!r.ok) throw new Error('ROM missing')
        return r.arrayBuffer()
      })
      .then((buf) => {
        if (cancelled) return
        romRef.current = new Uint8Array(buf)
        coreRef.current = new Chip8(romRef.current)
        setStatus('running')
        raf = requestAnimationFrame(step)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      if (audioCtx) void audioCtx.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])

  // refs so the key handler always sees fresh values
  const pauseSelRef = useRef(pauseSel)
  pauseSelRef.current = pauseSel
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  return (
    <div className="absolute inset-0 z-30 bg-black anim-fade-in">
      {status === 'running' && (
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="relative">
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="scanlines pixelated rounded-xl"
              style={{
                width: 'min(88vw, 900px)', aspectRatio: '2 / 1',
                boxShadow: `0 0 80px -18px ${game.colors[0]}, 0 30px 80px -30px rgba(0,0,0,0.9)`,
              }}
            />
            <div className="absolute -top-9 left-1 text-sm font-bold text-white/60">{game.title.toUpperCase()}</div>
          </div>
        </div>
      )}
      {status === 'loading' && <LoadingRing label="Loading" initial={game.title.charAt(0)} />}
      {status === 'error' && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="text-2xl font-bold">Game failed to load</div>
          <div className="text-sm text-white/50">Press Esc to go back</div>
        </div>
      )}

      {/* in-game HUD */}
      <div className="pointer-events-none absolute right-6 top-5 font-mono text-xs text-white/40">{fps} FPS</div>

      {/* pause overlay */}
      {paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 anim-fade-in" style={{ backdropFilter: 'blur(10px)' }}>
          <div className="glass w-[380px] rounded-3xl px-8 py-8">
            <div className="mb-6 text-center text-2xl font-black tracking-widest">PAUSED</div>
            {['Resume', 'Restart', 'Quit to Home'].map((opt, i) => (
              <div
                key={opt}
                className={`mb-2 cursor-pointer rounded-2xl px-6 py-3.5 text-center text-sm font-bold transition-all duration-200 ${
                  pauseSel === i ? 'bg-white/15 ring-2 ring-[var(--acc)]' : 'text-white/60'
                }`}
                onMouseEnter={() => setPauseSel(i)}
                onClick={() => {
                  if (i === 0) { pausedRef.current = false; setPaused(false) }
                  else if (i === 1 && romRef.current) { coreRef.current = new Chip8(romRef.current); pausedRef.current = false; setPaused(false) }
                  else onExit()
                }}
              >
                {opt}
              </div>
            ))}
            <div className="mt-4 text-center text-[11px] text-white/35">↑↓ choose · Enter confirm · Esc resume</div>
          </div>
        </div>
      )}
    </div>
  )
}
