// Gameplay screen — core-agnostic emulator loop driven by src/cores. Runs the
// built-in CHIP-8 / Game Boy cores and any bundled libretro WASM core (NES,
// SNES, Genesis, GBA, PS1 … up to four players from keyboard, physical
// gamepads and phone remotes). Features: save states with thumbnails, instant
// resume, 60-second continuous rewind, retro display filters, replay capture,
// and the floating Game Bar (Guide button / L1+R1+Select / Shift+Tab).

import { useEffect, useRef, useState } from 'react'
import type { Game } from '../system/library'
import { sfx } from '../system/mixer'
import { beginSession, endSession } from '../lib/playtime'
import { createRewind, type Rewind } from '../system/rewind'
import { canvasStyleFor, overlayStyleFor, type FilterMode } from '../system/filters'
import { ReplayBuffer, captureScreenshot } from '../system/capture'
import { tryInvoke } from '../system/ipc'
import * as db from '../system/db'
import {
  applyPortsToCore, createCore, coreStatusLine, keyToButton, platformForKind,
  setKeyboardButton, setKeyboardStick,
  type EmuCore, type PlatformDef,
} from '../cores'
import { LibretroCore } from '../cores/libretro'
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

export default function PlayView({ game, onExit, filterMode, onFilterChange, smooth, targetFps, vsync }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coreRef = useRef<EmuCore | null>(null)
  const romRef = useRef<Uint8Array | null>(null)
  const realPathRef = useRef<string | null>(null)
  const rewindRef = useRef<Rewind | null>(null)
  const pausedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [platDef, setPlatDef] = useState<PlatformDef | null>(platformForKind(game.kind) ?? null)
  const [paused, setPaused] = useState(false)
  const [pauseSel, setPauseSel] = useState(0)
  const [fps, setFps] = useState(60)
  const [resumed, setResumed] = useState(false)
  const [gameBarOpen, setGameBarOpen] = useState(false)
  const gameBarApiRef = useRef<GameBarApi | null>(null)
  const replayRef = useRef<ReplayBuffer>(new ReplayBuffer())

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

    // ---------- audio ----------
    let audioCtx: AudioContext | null = null
    let gain: GainNode | null = null // CHIP-8-style beep gain
    let scriptNode: ScriptProcessorNode | null = null
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

    const beepGain = () => {
      const core = coreRef.current
      if (!gain) return
      const level = core?.beep?.() ?? 0
      gain.gain.value = level > 0 ? level * 0.09 : 0
    }

    /** Libretro cores stream real samples through a ring buffer. */
    const attachStreamAudio = (core: LibretroCore) => {
      if (!audioCtx || scriptNode) return
      try {
        const node = audioCtx.createScriptProcessor(4096, 1, 2)
        const sink = new Float32Array(8192)
        node.onaudioprocess = (ev) => {
          const n = core.audio.pull(sink)
          const L = ev.outputBuffer.getChannelData(0)
          const R = ev.outputBuffer.getChannelData(1)
          for (let i = 0; i < L.length; i++) {
            L[i] = sink[i * 2] ?? 0
            R[i] = sink[i * 2 + 1] ?? L[i]
          }
          void n
        }
        node.connect(audioCtx.destination)
        scriptNode = node
      } catch {
        scriptNode = null
      }
    }

    // ---------- rendering ----------
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')!
    let img: ImageData | null = null

    const renderCore = (core: EmuCore) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const { width: w, height: h, pixels } = core.video
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        off.width = w
        off.height = h
        img = offCtx.createImageData(w, h)
      }
      if (!img) return
      new Uint32Array(img.data.buffer).set(pixels)
      offCtx.putImageData(img, 0, 0)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0)
    }

    // ---------- frame loop ----------
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const core = coreRef.current
      if (!core) return

      const cap = targetFpsRef.current > 0 ? targetFpsRef.current : vsyncRef.current ? 0 : 240
      if (cap > 0 && now - lastFrame < 1000 / cap - 1) return
      lastFrame = now

      frames++
      if (now - fpsT > 500) {
        setFps(Math.round((frames * 1000) / (now - fpsT)))
        frames = 0
        fpsT = now
      }

      // self-rendering cores (mini-RetroArch builds) own their loop, canvas
      // and audio — we only feed inputs and manage pause; the rewind buffer
      // stays off (they carry hundreds-of-MB states, their own rewind exists)
      if (core.selfRender) {
        const wantRunning = !pausedRef.current && !gameBarOpenRef.current
        core.setRunning?.(wantRunning)
        if (pausedRef.current) return
        applyPortsToCore(core)
        return
      }

      if (pausedRef.current) {
        if (gain) gain.gain.value = 0
        return
      }

      // pace to the emulated machine's native refresh (59.73, 60, 75.47 …)
      if (now - lastCoreFrame < 1000 / core.fps - 2.2) return
      lastCoreFrame = now

      // gather inputs from keyboard + gamepads + phones, then run
      if (!(core instanceof LibretroCore)) applyPortsToCore(core)
      core.runFrame()
      renderCore(core)
      beepGain()
      rewindRef.current?.tick()
    }
    let lastCoreFrame = 0

    // ---------- keyboard ----------
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const core = coreRef.current
      if (!core) return

      // Game Bar toggle: Esc / Shift+Tab while playing
      if (down && !e.repeat && (e.code === 'Escape' || (e.shiftKey && e.code === 'Tab'))) {
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

      const btn = keyToButton(e.code, {})
      if (btn) {
        e.preventDefault()
        setKeyboardButton(btn, down)
        if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
          setKeyboardStick(btn, down)
        }
        return
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

    // ---------- load ----------
    const loadRom = async () => {
      try {
        let bytes: Uint8Array
        let realPath: string | null = null
        if (game.rom && (game.rom.includes('\\') || game.rom.includes('/'))) {
          // absolute path (scanned ROM): read from disk via Tauri
          const b64 = await tryInvoke<string>('read_rom_bytes', { path: game.rom })
          if (!b64) throw new Error('ROM unreadable')
          bytes = base64ToBytes(b64)
          realPath = game.rom
        } else {
          const r = await fetch(`${import.meta.env.BASE_URL}roms/${game.rom}`)
          if (!r.ok) throw new Error('ROM missing')
          bytes = new Uint8Array(await r.arrayBuffer())
        }
        if (cancelled) return
        romRef.current = bytes
        realPathRef.current = realPath

        const created = await createCore(game, bytes, canvasRef.current, realPath)
        if (cancelled) {
          created.core?.destroy?.()
          return
        }
        if (!created.core) throw new Error(created.error ?? 'core failed to load')
        coreRef.current = created.core
        setPlatDef(created.platform ?? platformForKind(game.kind) ?? null)

        if (created.core instanceof LibretroCore) attachStreamAudio(created.core)

        // Instant Resume: continue exactly where the last session ended
        const auto = await db.getSaveState(game.id, 'auto')
        if (auto?.data && created.core.restore(auto.data)) {
          setResumed(true)
          setTimeout(() => setResumed(false), 2200)
        }

        // rewind engine: 240 snapshots at 250ms = 60s
        rewindRef.current = createRewind(
          () => coreRef.current?.serialize() ?? '',
          (data) => coreRef.current?.restore(data) ?? false,
        )

        // rolling replay recorder on the game canvas
        const canvas = canvasRef.current
        if (canvas) replayRef.current.start(canvas)

        setStatus('running')
        lastCoreFrame = 0
        raf = requestAnimationFrame(step)
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
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
      scriptNode?.disconnect()
      // Instant Resume: freeze this exact moment for next time
      const core = coreRef.current
      if (core && romRef.current) {
        try {
          const data = core.serialize()
          if (data) void db.putSaveState(game.id, 'auto', data, null)
        } catch {
          /* storage full — skip resume save */
        }
      }
      coreRef.current?.destroy?.()
      coreRef.current = null
      if (audioCtx) void audioCtx.close()
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

  /** Fresh core for restart / soft reset (same ROM, clean machine). */
  const recreateCore = () => {
    const rom = romRef.current
    if (!rom) return
    coreRef.current?.destroy?.()
    void createCore(game, rom, null, realPathRef.current).then((created) => {
      if (created.core) coreRef.current = created.core
    })
    rewindRef.current?.clear()
    void db.deleteSaveState(game.id, 'auto')
    setResumed(false)
  }

  const pauseAction = (i: number) => {
    const core = coreRef.current
    if (i === 0) {
      sfx.select()
      pausedRef.current = false
      setPaused(false)
    } else if (i === 1 && core) {
      void (async () => {
        const data = core.serialize()
        const canvas = canvasRef.current
        const thumb = canvas ? await captureThumbnail(canvas) : null
        if (data) await db.putSaveState(game.id, 'manual', data, thumb)
        sfx.select()
      })()
    } else if (i === 2 && core) {
      void (async () => {
        const st = await db.getSaveState(game.id, 'manual')
        if (st?.data && core.restore(st.data)) {
          sfx.select()
          pausedRef.current = false
          setPaused(false)
          return
        }
        sfx.error()
      })()
    } else if (i === 3 && romRef.current) {
      recreateCore()
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
          const data = core.serialize()
          const canvas = canvasRef.current
          const thumb = canvas ? await captureThumbnail(canvas) : null
          if (data) await db.putSaveState(game.id, slot, data, thumb)
          return thumb
        },
        loadState: async (slot: string): Promise<boolean> => {
          const core = coreRef.current
          if (!core) return false
          const st = await db.getSaveState(game.id, slot)
          if (!st?.data) return false
          return core.restore(st.data)
        },
        listStates: async () => {
          const rows = await db.listSaveStates(game.id)
          return rows
            .filter((r) => r.slot !== 'auto')
            .map((r) => ({ slot: r.slot, thumb: r.thumb, at: r.created_at }))
        },
        rewind: (secondsBack: number) => rewindRef.current?.seek(secondsBack) ?? false,
        rewindDepth: () => rewindRef.current?.depth() ?? 0,
        softReset: () => recreateCore(),
        exit: () => onExitRef.current(),
      }
    }
    return gameBarApiRef.current as GameBarApi
  }

  const canvasStyle = canvasStyleFor(filterMode, smooth)
  const overlayStyle = overlayStyleFor(filterMode)
  const aspect = platDef?.aspect ?? 4 / 3

  return (
    <div className="absolute inset-0 z-30 bg-black anim-fade-in">
      {status === 'running' && (
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="rounded-xl"
              style={{
                width: 'min(84vw, 920px)',
                aspectRatio: `${aspect}`,
                boxShadow: `0 0 80px -18px ${game.colors[0]}, 0 30px 80px -30px rgba(0,0,0,0.9)`,
                ...canvasStyle,
              } as React.CSSProperties}
            />
            {/* filter overlay (scanlines / LCD grid / curvature illusion) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={overlayStyle as React.CSSProperties}
            />
            <div className="absolute -top-9 left-1 text-sm font-bold text-white/60">
              {game.title.toUpperCase()}
            </div>
            {resumed && (
              <div className="absolute -top-9 right-1 rounded-full bg-[var(--acc)]/25 px-3 py-1 text-[11px] font-bold text-[var(--acc)] anim-fade-in">
                ⟲ Resumed where you left off
              </div>
            )}
            <div className="absolute -bottom-8 left-1 text-[11px] font-semibold text-white/35">
              {platDef ? coreStatusLine(platDef) : ''} · Esc Game Bar
            </div>
          </div>
        </div>
      )}
      {status === 'loading' && <LoadingRing label="Loading" initial={game.title.charAt(0)} />}
      {status === 'error' && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="text-2xl font-bold">Game failed to load</div>
          <div className="max-w-xl text-center text-sm text-white/50">{errorMsg || 'The core refused this ROM'}</div>
          <div className="text-sm text-white/50">Press Esc to open the Game Bar and exit</div>
        </div>
      )}

      {/* in-game HUD */}
      <div className="pointer-events-none absolute right-8 top-8 z-40 font-mono text-xs text-white/35">{fps} FPS</div>

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
