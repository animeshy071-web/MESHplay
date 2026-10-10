// Gameplay screen for CHIP-8 and Game Boy cores: emulator loop, procedural
// beep, pause menu, save states with thumbnails, instant resume, 60-second
// continuous rewind, retro display filters, and the floating Game Bar
// (Guide button / L1+R1+Select / Shift+Tab).

import { useEffect, useRef, useState } from 'react'
import { Chip8, KEY_MAP } from '../chip8/core'
import { GameBoy, GB_W, GB_H, type GbButton } from '../gb/gb'
import type { Game } from '../system/library'
import { sfx } from '../system/mixer'
import { beginSession, endSession } from '../lib/playtime'
import { perfSampler } from '../system/stats'
import { createRewind, type Rewind } from '../system/rewind'
import { canvasStyleFor, overlayStyleFor, type FilterMode } from '../system/filters'
import { ReplayBuffer, captureScreenshot } from '../system/capture'
import { tryInvoke } from '../system/ipc'
import * as db from '../system/db'
import LoadingRing from './LoadingRing'
import GameBar from './GameBar'

export interface GameBarApi {
  screenshot: () => Promise<string | null>
  saveReplay: () => Promise<string | null>
  saveState: (slot: string) => Promise<string | null>
  loadState: (slot: string) => Promise<boolean>
  listStates: () => Promise<Array<{ slot: string; thumb: string | null; at: number }>>
  rewind: (secondsBack: number) => boolean
  rewindDepth: () => number
  softReset: () => void
  exit: () => void
}

interface Props {
  game: Game
  onExit: () => void
  filterMode: FilterMode
  onFilterChange: (m: FilterMode) => void
  smooth: boolean
  targetFps: number // 0 = uncapped
  vsync: boolean
}

const CANVAS_W = 768
const CANVAS_H = 384
const GB_CANVAS_W = 960
const GB_CANVAS_H = 864

export default function PlayView({ game, onExit, filterMode, onFilterChange, smooth, targetFps, vsync }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coreRef = useRef<Chip8 | GameBoy | null>(null)
  const romRef = useRef<Uint8Array | null>(null)
  const rewindRef = useRef<Rewind | null>(null)
  const pausedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading')
  const [paused, setPaused] = useState(false)
  const [pauseSel, setPauseSel] = useState(0)
  const [fps, setFps] = useState(60)
  const [resumed, setResumed] = useState(false)
  const [gameBarOpen, setGameBarOpen] = useState(false)
  const gameBarApiRef = useRef<GameBarApi | null>(null)
  const replayRef = useRef<ReplayBuffer>(new ReplayBuffer())
  const isGb = game.kind === 'gb'

  const PAUSE_ITEMS = ['Resume', 'Save State', 'Load State', 'Restart', 'Quit to Home']

  useEffect(() => {
    beginSession(game.kind === 'native' ? `native:${game.title}` : game.id)
    return () => endSession()
  }, [game.id, game.kind, game.title])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let frames = 0
    let fpsT = performance.now()
    let lastFrame = 0

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
    const isGbCore = game.kind === 'gb'
    const off = document.createElement('canvas')
    off.width = isGbCore ? GB_W : 64
    off.height = isGbCore ? GB_H : 32
    const offCtx = off.getContext('2d')!
    const img = offCtx.createImageData(off.width, off.height)

    const renderChip8 = (core: Chip8) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const px = img.data
      for (let i = 0; i < 64 * 32; i++) {
        const on = core.display[i]
        px[i * 4] = on ? 255 : 0
        px[i * 4 + 1] = on ? 255 : 0
        px[i * 4 + 2] = on ? 255 : 0
        px[i * 4 + 3] = on ? 255 : 0
      }
      offCtx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.drawImage(off, 0, 0, CANVAS_W, CANVAS_H)
    }

    const renderGb = (core: GameBoy) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const fb = core.ppu.framebuffer
      const px = img.data
      for (let i = 0; i < GB_W * GB_H; i++) {
        const c = fb[i]
        px[i * 4] = c & 0xff
        px[i * 4 + 1] = (c >> 8) & 0xff
        px[i * 4 + 2] = (c >> 16) & 0xff
        px[i * 4 + 3] = 0xff
      }
      offCtx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, GB_CANVAS_W, GB_CANVAS_H)
      ctx.drawImage(off, 0, 0, GB_CANVAS_W, GB_CANVAS_H)
    }

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const core = coreRef.current
      if (!core) return

      // Frame budget: target FPS limiter + V-Sync frame pacing.
      // vsync on + uncapped → natural rAF pacing (display refresh).
      // otherwise → gate to the target (30/60/120) or a 240 fps soft cap.
      const cap = targetFpsRef.current > 0 ? targetFpsRef.current : vsyncRef.current ? 0 : 240
      if (cap > 0 && now - lastFrame < 1000 / cap - 1) return
      lastFrame = now

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

      if (core instanceof Chip8) {
        for (let j = 0; j < 11; j++) core.cycle()
        core.tickTimers()
        if (gain) gain.gain.value = core.soundOn ? 0.03 : 0
        if (core.drawFlag) {
          renderChip8(core)
          core.drawFlag = false
        }
        rewindRef.current?.tick()
      } else if (core instanceof GameBoy) {
        core.runFrame()
        // GB audio feeds the mixer's game channel (procedural, no files)
        if (gain) gain.gain.value = 0
        rewindRef.current?.tick()
      }
    }

    const setPausedBoth = (p: boolean) => {
      pausedRef.current = p
      setPaused(p)
      setPauseSel(0)
    }

    // GB keyboard controls: arrows + Z/X = B/A, Enter = Start, Shift = Select
    const GB_KEYS: Record<string, GbButton> = {
      ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down',
      KeyX: 'a', KeyZ: 'b', Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select',
    }

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const core = coreRef.current
      if (!core) return

      // Game Bar toggle: Guide button (handled via input layer event), Shift+Tab, Esc while playing
      if (down && !e.repeat && (e.code === 'Escape' || e.shiftKey && e.code === 'Tab')) {
        e.preventDefault()
        if (e.code === 'Escape' && gameBarOpenRef.current) {
          sfx.back()
          setGameBarOpen(false)
          return
        }
        sfx.pause()
        setGameBarOpen(true)
        return
      }
      if (e.code === 'Escape') {
        e.preventDefault()
        return
      }

      if (core instanceof Chip8) {
        const chipKey = KEY_MAP[e.code]
        if (chipKey !== undefined) {
          e.preventDefault()
          core.keys[chipKey] = down ? 1 : 0
          return
        }
      } else if (core instanceof GameBoy) {
        const gbBtn = GB_KEYS[e.code]
        if (gbBtn !== undefined) {
          e.preventDefault()
          core.setButton(gbBtn, down)
          return
        }
      }

      if (!down || e.repeat) return
      if (!gameBarOpenRef.current && !pausedRef.current) return
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        setPauseSel((s) => (e.code === 'ArrowUp' ? (s + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length : (s + 1) % PAUSE_ITEMS.length))
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        pauseActionRef.current(pauseSelRef.current)
      }
    }

    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    // Guide button from the input layer / phone remote opens the Game Bar
    const onGuide = () => {
      sfx.pause()
      setGameBarOpen(true)
    }
    window.addEventListener('meshplay:gamebar-toggle', onGuide)

    const loadRom = async () => {
      try {
        let bytes: Uint8Array
        if (game.rom && (game.rom.includes('\\') || game.rom.includes('/'))) {
          // absolute path (scanned ROM): read from disk via Tauri
          const b64 = await tryInvoke<string>('read_rom_bytes', { path: game.rom })
          if (!b64) throw new Error('ROM unreadable')
          bytes = base64ToBytes(b64)
        } else {
          const r = await fetch(`${import.meta.env.BASE_URL}roms/${game.rom}`)
          if (!r.ok) throw new Error('ROM missing')
          bytes = new Uint8Array(await r.arrayBuffer())
        }
        if (cancelled) return
        romRef.current = bytes

        let core: Chip8 | GameBoy
        if (isGbCore) {
          core = new GameBoy(bytes)
          core.apu.attachAudio()
        } else {
          core = new Chip8(bytes)
        }
        coreRef.current = core

        // Instant Resume: continue exactly where the last session ended
        const auto = await db.getSaveState(game.id, 'auto')
        if (auto?.data) {
          const ok = core instanceof Chip8 ? (core as Chip8).restore(auto.data) : (core as GameBoy).restore(auto.data)
          if (ok) {
            setResumed(true)
            setTimeout(() => setResumed(false), 2200)
          }
        }

        // rewind engine: 240 snapshots at 250ms = 60s
        rewindRef.current = createRewind(
          () => (core instanceof Chip8 ? (core as Chip8).serialize() : (core as GameBoy).serialize()),
          (data): boolean => {
            if (core instanceof Chip8) {
              ;(core as Chip8).restore(data)
              return true
            }
            return (core as GameBoy).restore(data)
          },
        )

        // rolling replay recorder on the game canvas
        const canvas = canvasRef.current
        if (canvas) replayRef.current.start(canvas)

        setStatus('running')
        raf = requestAnimationFrame(step)
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    void loadRom()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('meshplay:gamebar-toggle', onGuide)
      replayRef.current.stop()
      if (coreRef.current instanceof GameBoy) {
        coreRef.current.apu.detachAudio()
      }
      if (audioCtx) void audioCtx.close()
      // Instant Resume: freeze this exact moment for next time
      const core = coreRef.current
      if (core && romRef.current) {
        try {
          const data = core instanceof Chip8 ? (core as Chip8).serialize() : (core as GameBoy).serialize()
          void db.putSaveState(game.id, 'auto', data, null)
        } catch {
          /* storage full — skip resume save */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.kind])

  // refs so the key handler always sees fresh values
  const pauseSelRef = useRef(pauseSel)
  pauseSelRef.current = pauseSel
  const gameBarOpenRef = useRef(gameBarOpen)
  gameBarOpenRef.current = gameBarOpen
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const filterModeRef = useRef(filterMode)
  filterModeRef.current = filterMode
  const targetFpsRef = useRef(targetFps)
  targetFpsRef.current = targetFps
  const vsyncRef = useRef(vsync)
  vsyncRef.current = vsync

  const pauseAction = (i: number) => {
    const core = coreRef.current
    if (i === 0) {
      sfx.select()
      pausedRef.current = false
      setPaused(false)
    } else if (i === 1 && core) {
      void (async () => {
        const data = core instanceof Chip8 ? (core as Chip8).serialize() : (core as GameBoy).serialize()
        const canvas = canvasRef.current
        const thumb = canvas ? await captureThumbnail(canvas) : null
        await db.putSaveState(game.id, 'manual', data, thumb)
        sfx.select()
      })()
    } else if (i === 2 && core) {
      void (async () => {
        const st = await db.getSaveState(game.id, 'manual')
        if (st?.data) {
          const ok = core instanceof Chip8 ? (core as Chip8).restore(st.data) : (core as GameBoy).restore(st.data)
          if (ok) {
            sfx.select()
            pausedRef.current = false
            setPaused(false)
            return
          }
        }
        sfx.error()
      })()
    } else if (i === 3 && romRef.current) {
      const fresh = romRef.current
      coreRef.current = game.kind === 'gb' ? new GameBoy(fresh) : new Chip8(fresh)
      if (coreRef.current instanceof GameBoy) coreRef.current.apu.attachAudio()
      rewindRef.current?.clear()
      void db.deleteSaveState(game.id, 'auto')
      setResumed(false)
      sfx.select()
      pausedRef.current = false
      setPaused(false)
    } else if (i === 4) {
      sfx.back()
      onExitRef.current()
    }
  }
  const pauseActionRef = useRef(pauseAction)
  pauseActionRef.current = pauseAction

  // ---- Game Bar API ----
  const getGameBarApi = (): GameBarApi => {
    if (!gameBarApiRef.current) {
      gameBarApiRef.current = {
        screenshot: () => {
          const canvas = canvasRef.current
          return canvas ? captureScreenshot(canvas, game.id) : Promise.resolve(null)
        },
        saveReplay: () => replayRef.current.save(game.id),
        saveState: async (slot: string) => {
          const core = coreRef.current
          if (!core) return null
          const data = core instanceof Chip8 ? (core as Chip8).serialize() : (core as GameBoy).serialize()
          const canvas = canvasRef.current
          const thumb = canvas ? await captureThumbnail(canvas) : null
          await db.putSaveState(game.id, slot, data, thumb)
          return thumb
        },
        loadState: async (slot: string): Promise<boolean> => {
          const core = coreRef.current
          if (!core) return false
          const st = await db.getSaveState(game.id, slot)
          if (!st?.data) return false
          if (core instanceof Chip8) {
            ;(core as Chip8).restore(st.data)
            return true
          }
          return (core as GameBoy).restore(st.data)
        },
        listStates: async () => {
          const rows = await db.listSaveStates(game.id)
          return rows
            .filter((r) => r.slot !== 'auto')
            .map((r) => ({ slot: r.slot, thumb: r.thumb, at: r.created_at }))
        },
        rewind: (secondsBack: number) => rewindRef.current?.seek(secondsBack) ?? false,
        rewindDepth: () => rewindRef.current?.depth() ?? 0,
        softReset: () => {
          const rom = romRef.current
          if (!rom) return
          const fresh = game.kind === 'gb' ? new GameBoy(rom) : new Chip8(rom)
          if (fresh instanceof GameBoy) fresh.apu.attachAudio()
          coreRef.current = fresh
          rewindRef.current?.clear()
        },
        exit: () => onExitRef.current(),
      }
    }
    return gameBarApiRef.current as GameBarApi
  }

  const canvasStyle = canvasStyleFor(filterMode, smooth)
  const overlayStyle = overlayStyleFor(filterMode)
  const dims = isGb
    ? { width: GB_CANVAS_W, height: GB_CANVAS_H, cssW: 'min(80vw, 640px)', ratio: '10 / 9' }
    : { width: CANVAS_W, height: CANVAS_H, cssW: 'min(88vw, 900px)', ratio: '2 / 1' }

  return (
    <div className="absolute inset-0 z-30 bg-black anim-fade-in">
      {status === 'running' && (
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={dims.width}
              height={dims.height}
              className="rounded-xl"
              style={{
                width: dims.cssW,
                aspectRatio: dims.ratio,
                boxShadow: `0 0 80px -18px ${game.colors[0]}, 0 30px 80px -30px rgba(0,0,0,0.9)`,
                ...canvasStyle,
              } as React.CSSProperties}
            />
            {/* filter overlay (scanlines / LCD grid / curvature illusion) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={overlayStyle as React.CSSProperties}
            />
            <div className="absolute -top-9 left-1 text-sm font-bold text-white/60">{game.title.toUpperCase()}</div>
            {resumed && (
              <div className="absolute -top-9 right-1 rounded-full bg-[var(--acc)]/25 px-3 py-1 text-[11px] font-bold text-[var(--acc)] anim-fade-in">
                ⟲ Resumed where you left off
              </div>
            )}
            {isGb && (
              <div className="absolute -bottom-8 left-1 text-[11px] font-semibold text-white/35">
                Game Boy · Arrows + Z(X/B) X(A) · Enter Start · Shift Select · Esc Game Bar
              </div>
            )}
          </div>
        </div>
      )}
      {status === 'loading' && <LoadingRing label="Loading" initial={game.title.charAt(0)} />}
      {status === 'error' && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="text-2xl font-bold">Game failed to load</div>
          <div className="text-sm text-white/50">Press Esc to open the Game Bar and exit</div>
        </div>
      )}

      {/* in-game HUD */}
      <div className="pointer-events-none absolute right-6 top-5 font-mono text-xs text-white/40">{fps} FPS</div>

      {/* Floating Game Bar */}
      {gameBarOpen && (
        <GameBar
          game={game}
          api={getGameBarApi()}
          filterMode={filterMode}
          onFilterChange={(m) => onFilterChange(m)}
          onClose={() => {
            setGameBarOpen(false)
            setPaused(false)
            pausedRef.current = false
          }}
        />
      )}

      {/* pause overlay */}
      {paused && !gameBarOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 anim-fade-in" style={{ backdropFilter: 'blur(10px)' }}>
          <div className="glass w-[380px] rounded-3xl px-8 py-8">
            <div className="mb-6 text-center text-2xl font-black tracking-widest">PAUSED</div>
            {PAUSE_ITEMS.map((opt, i) => (
              <div
                key={opt}
                className={`mb-2 cursor-pointer rounded-2xl px-6 py-3.5 text-center text-sm font-bold transition-all duration-200 ${
                  pauseSel === i ? 'bg-white/15 ring-2 ring-[var(--acc)]' : 'text-white/60'
                }`}
                onMouseEnter={() => setPauseSel(i)}
                onClick={() => pauseAction(i)}
              >
                {opt}
              </div>
            ))}
            <div className="mt-4 text-center text-[11px] text-white/35">↑↓ choose · Enter confirm · Esc Game Bar</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Capture a small thumbnail of the game canvas for save-state slots. */
async function captureThumbnail(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const thumb = document.createElement('canvas')
    thumb.width = 160
    thumb.height = 90
    const ctx = thumb.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height)
    return thumb.toDataURL('image/jpeg', 0.6)
  } catch {
    return null
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
