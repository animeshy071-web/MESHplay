// Floating In-Game Game Bar — summoned with the Guide button (Xbox/PS),
// L1+R1+Select, or keyboard shortcuts (Shift+Tab / Esc during play).
// Glass widgets: performance monitor, audio mixer, quick states with
// thumbnails, 60s rewind slider, retro display filters, media capture,
// controller health, and exit/reset. Fully movable and offline.

import { useEffect, useRef, useState } from 'react'
import { perfSampler, type PerfSnapshot } from '../system/stats'
import { setChannelVolume, getChannelVolume, sfx } from '../system/mixer'
import { FILTER_MODES, FILTER_LABELS, type FilterMode } from '../system/filters'
import type { Game } from '../system/library'
import type { GameBarApi } from './PlayView'

interface Props {
  game: Game
  api: GameBarApi
  filterMode: FilterMode
  onFilterChange: (m: FilterMode) => void
  onClose: () => void
}

import Icon, { type IconName } from './Icon'

type Tab = 'perf' | 'audio' | 'states' | 'rewind' | 'filters' | 'capture'

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'perf', label: 'Performance', icon: 'perf' },
  { id: 'audio', label: 'Mixer', icon: 'mixer' },
  { id: 'states', label: 'States', icon: 'states' },
  { id: 'rewind', label: 'Rewind', icon: 'rewind' },
  { id: 'filters', label: 'Filters', icon: 'filters' },
  { id: 'capture', label: 'Capture', icon: 'capture' },
]

export default function GameBar({ game, api, filterMode, onFilterChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('perf')
  const [snap, setSnap] = useState<PerfSnapshot | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [volume, setVolume] = useState({
    master: 0.8, game: getChannelVolume('game'), music: getChannelVolume('music'), voice: getChannelVolume('voice'),
  })
  const [states, setStates] = useState<Array<{ slot: string; thumb: string | null; at: number }>>([])
  const [rewindDepth, setRewindDepth] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'reset' | 'quit' | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => perfSampler.subscribe(setSnap), [])
  useEffect(() => {
    void api.listStates().then(setStates)
    const t = window.setInterval(() => setRewindDepth(api.rewindDepth()), 500)
    return () => clearInterval(t)
  }, [api])

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  // drag anywhere on the bar — edge-snapping + remembered position
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy })
  }
  const onPointerUp = () => {
    dragRef.current = null
    setPos((p) => {
      // N2: snap to edges + vertical guide lines so placement always feels deliberate
      const snapX = Math.abs(p.x) < 48 ? 0 : p.x
      const snapped = { ...p, x: snapX }
      try {
        localStorage.setItem('meshplay.gamebar.pos', JSON.stringify(snapped))
      } catch { /* private mode */ }
      return snapped
    })
  }

  // restore last position
  useEffect(() => {
    try {
      const saved = localStorage.getItem('meshplay.gamebar.pos')
      if (saved) setPos(JSON.parse(saved) as { x: number; y: number })
    } catch { /* ignore */ }
  }, [])

  const captureShot = async () => {
    const p = await api.screenshot()
    flash(p ? 'Screenshot saved' : 'Screenshot failed')
    sfx.chime()
  }
  const saveReplay = async () => {
    const p = await api.saveReplay()
    flash(p ? '30s replay saved' : 'Replay not ready yet')
  }

  const stateThumb = async (slot: string) => {
    const thumb = await api.saveState(slot)
    if (thumb) {
      flash(`Saved slot ${slot.toUpperCase()}`)
      void api.listStates().then(setStates)
    }
  }
  const loadThumb = async (slot: string) => {
    const ok = await api.loadState(slot)
    if (ok) {
      flash(`Loaded slot ${slot.toUpperCase()}`)
      onClose()
    }
  }

  return (
    <div
      className="absolute z-[70] w-[560px] max-w-[94vw] select-none anim-fade-up"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, left: '50%', top: '12vh', marginLeft: '-280px' }}
    >
      <div
        className="cursor-move rounded-[26px] border border-white/10"
        style={{
          // N2: opaque layered material — readable over any game, never see-through
          background: 'rgba(16, 11, 26, 0.96)',
          backdropFilter: 'blur(24px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), 0 30px 90px -20px rgba(0,0,0,0.9), 0 0 70px -24px var(--game-acc, var(--acc))',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* header */}
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--acc)]" style={{ boxShadow: '0 0 10px var(--acc)' }} />
            <span className="text-xs font-black uppercase tracking-widest text-white/70">Game Bar</span>
            <span className="text-[11px] text-white/35">{game.title}</span>
          </div>
          <button
            className="rounded-full px-3 py-1 text-[11px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
            onClick={() => { sfx.back(); onClose() }}
          >
            <Icon name="close" className="mr-1 h-3.5 w-3.5" /> Close
          </button>
        </div>

        {/* tabs */}
        <div className="mb-3 flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`flex-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition-all duration-200 ${
                tab === t.id ? 'bg-white/15 text-white ring-1 ring-[var(--acc)]' : 'bg-white/5 text-white/45 hover:text-white/80'
              }`}
              onClick={() => { sfx.travel(); setTab(t.id) }}
            >
              <Icon name={t.icon} className="mr-1 h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* panels */}
        <div className="min-h-[180px] rounded-3xl bg-black/25 p-4">
          {tab === 'perf' && <PerfPanel snap={snap} />}
          {tab === 'audio' && (
            <AudioPanel
              volume={volume}
              onChange={(ch, v) => {
                setVolume((s) => ({ ...s, [ch]: v }))
                if (ch === 'master') {
                  // master scales all channels proportionally — simple model: route to ui+game
                  setChannelVolume('game', v)
                } else {
                  setChannelVolume(ch, v)
                }
              }}
            />
          )}
          {tab === 'states' && (
            <div>
              <div className="mb-3 flex gap-2">
                {(['a', 'b', 'c'] as const).map((slot) => (
                  <button
                    key={slot}
                    className="flex-1 rounded-2xl bg-white/8 px-3 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/15"
                    onClick={() => void stateThumb(slot)}
                  >
                <Icon name="save" className="mr-1.5 h-3.5 w-3.5" /> Save {slot.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {states.length === 0 && (
                  <div className="col-span-3 py-6 text-center text-xs text-white/35">No save states yet — save one above</div>
                )}
                {states.map((s) => (
                  <button
                    key={s.slot}
                    className="group overflow-hidden rounded-2xl bg-white/5 transition hover:bg-white/12"
                    onClick={() => void loadThumb(s.slot)}
                  >
                    {s.thumb ? (
                      <img src={s.thumb} alt={s.slot} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="aspect-video w-full bg-black/40" />
                    )}
                    <div className="px-2 py-1.5 text-left text-[10px] font-bold text-white/70">
                      Slot {s.slot.toUpperCase()} · {new Date(s.at).toLocaleTimeString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === 'rewind' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-center">
                <div className="text-3xl font-black text-white">{rewindDepth.toFixed(1)}s</div>
                <div className="text-[11px] text-white/40">of rewind buffer (up to 60s)</div>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, rewindDepth)}
                step={0.1}
                defaultValue={0}
                className="w-full accent-[var(--acc)]"
                onMouseUp={(e) => {
                  const v = parseFloat((e.target as HTMLInputElement).value)
                  if (v > 0.2) {
                    api.rewind(v)
      flash(`Rewound ${v.toFixed(1)}s`)
                  }
                }}
              />
              <div className="text-[11px] text-white/35">Drag the slider to scrub gameplay backwards</div>
            </div>
          )}
          {tab === 'filters' && (
            <div className="grid grid-cols-5 gap-2">
              {FILTER_MODES.map((m) => (
                <button
                  key={m}
                  className={`rounded-2xl px-2 py-4 text-[11px] font-bold transition-all ${
                    filterMode === m ? 'bg-white/15 text-white ring-1 ring-[var(--acc)]' : 'bg-white/5 text-white/50 hover:text-white/85'
                  }`}
                  onClick={() => { sfx.select(); onFilterChange(m) }}
                >
                  {FILTER_LABELS[m]}
                </button>
              ))}
            </div>
          )}
          {tab === 'capture' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                className="rounded-3xl bg-white/8 px-4 py-6 text-sm font-bold text-white/85 transition hover:bg-white/15"
                onClick={() => void captureShot()}
              >
                <Icon name="screenshot" className="mr-1.5 h-3.5 w-3.5" /> Screenshot
              </button>
              <button
                className="rounded-3xl bg-white/8 px-4 py-6 text-sm font-bold text-white/85 transition hover:bg-white/15"
                onClick={() => void saveReplay()}
              >
                <Icon name="replay" className="mr-1.5 h-3.5 w-3.5" /> Save 30s Replay
              </button>
            </div>
          )}
        </div>

        {/* footer: controller health + exit */}
        <div className="mt-3 flex items-center justify-between px-1">
          <ControllerHealth snap={snap} />
          <div className="flex gap-2">
            <button
              className="rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/15"
              onClick={() => {
                sfx.select()
                if (confirmAction === 'reset') {
                  setConfirmAction(null)
                  void api.softReset()
                  flash('↻ Soft reset')
                  onClose()
                } else {
                  setConfirmAction('reset')
                  window.setTimeout(() => setConfirmAction((c) => (c === 'reset' ? null : c)), 3000)
                }
              }}
            >
              {confirmAction === 'reset' ? '↻ Sure?' : '↻ Reset'}
            </button>
            <button
              className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-bold text-red-200 transition hover:bg-red-500/35"
              onClick={() => {
                sfx.back()
                if (confirmAction === 'quit') {
                  setConfirmAction(null)
                  void api.exit()
                } else {
                  setConfirmAction('quit')
                  window.setTimeout(() => setConfirmAction((c) => (c === 'quit' ? null : c)), 3000)
                }
              }}
            >
              {confirmAction === 'quit' ? '⏏ Confirm quit' : '⏏ Quit to Dashboard'}
            </button>
          </div>
        </div>

        {toast && (
          <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-xs font-bold text-white anim-fade-in">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

function PerfPanel({ snap }: { snap: PerfSnapshot | null }) {
  const ring = snap?.frameRing ?? []
  const max = Math.max(20, ...ring)
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/40">Frame time</div>
        <svg viewBox="0 0 120 40" className="h-16 w-full">
          <polyline
            fill="none"
            stroke="var(--acc)"
            strokeWidth="1.5"
            points={ring
              .slice(-60)
              .map((v, i) => `${(i / 59) * 120},${40 - Math.min(38, (v / max) * 38)}`)
              .join(' ')}
          />
        </svg>
        <div className="mt-1 font-mono text-xs text-white/60">
          {snap ? `${snap.fps} FPS · ${snap.frametime.toFixed(1)} ms` : '—'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="CPU" value={snap?.stats ? `${Math.round(snap.stats.cpu_percent)}%` : '—'} />
        <Stat label="GPU" value={snap?.stats?.gpu_percent != null ? `${Math.round(snap.stats.gpu_percent)}%` : '—'} />
        <Stat
          label="RAM"
          value={snap?.stats?.ram_total_gb ? `${snap.stats.ram_used_gb.toFixed(1)}/${snap.stats.ram_total_gb.toFixed(0)} GB` : '—'}
        />
        <Stat
          label="Battery"
          value={
            snap?.stats?.battery_percent != null
              ? `${Math.round(snap.stats.battery_percent)}%${snap.stats.charging ? ' ⚡' : ''}`
              : '—'
          }
        />
        {snap?.stats?.gpu_name && <div className="col-span-2 truncate text-[10px] text-white/30">{snap.stats.gpu_name}</div>}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-sm font-bold text-white/85">{value}</div>
    </div>
  )
}

function AudioPanel({ volume, onChange }: { volume: Record<string, number>; onChange: (ch: 'master' | 'game' | 'music' | 'voice', v: number) => void }) {
  const rows: Array<{ id: 'master' | 'game' | 'music' | 'voice'; label: string }> = [
    { id: 'master', label: 'Master' },
    { id: 'game', label: 'Game sound' },
    { id: 'music', label: 'Background music' },
    { id: 'voice', label: 'Voice chat' },
  ]
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="w-36 text-xs font-bold text-white/70">{r.label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume[r.id]}
            className="flex-1 accent-[var(--acc)]"
            onChange={(e) => onChange(r.id, parseFloat(e.target.value))}
          />
          <span className="w-10 text-right font-mono text-xs text-white/50">{Math.round(volume[r.id] * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

function ControllerHealth({ snap }: { snap: PerfSnapshot | null }) {
  const pads = snap?.controllers ?? []
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Controllers</span>
      {pads.length === 0 && <span className="text-[11px] text-white/35">None (keyboard)</span>}
      {pads.map((c) => (
        <span
          key={c.index}
          className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold text-white/75"
          title={`Player ${c.index + 1} battery: ${c.level}`}
        >
          P{c.index + 1} {c.percent === 100 ? '🔋' : c.percent >= 60 ? '🔋' : c.percent >= 25 ? '🪫' : '⚠️'} {Math.round(c.percent)}%
        </span>
      ))}
    </div>
  )
}
