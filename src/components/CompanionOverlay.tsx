// Companion floating stats widget for NATIVELY LAUNCHED PC games.
// In the Tauri app this runs in a small always-on-top frameless window
// (opened by the launcher); in web dev mode it renders in-page when a native
// game is running. Shows live FPS/CPU/GPU/RAM/battery + master volume keys.

import { useEffect, useState } from 'react'
import { perfSampler, type PerfSnapshot } from '../system/stats'
import { invoke } from '../system/ipc'
import { launcher, type NativeLaunch } from '../system/launcher'

interface Props {
  embedded?: boolean // web dev mode: render inline
}

export default function CompanionOverlay({ embedded = false }: Props) {
  const [snap, setSnap] = useState<PerfSnapshot | null>(null)
  const [active, setActive] = useState<NativeLaunch | null>(launcher.getActive())
  useEffect(() => perfSampler.subscribe(setSnap), [])
  useEffect(() => launcher.subscribe(setActive), [])

  const volumeKey = (k: string) => void invoke('send_volume_key', { key: k }).catch(() => undefined)
  const stopGame = () => {
    if (active && window.confirm(`Stop "${active.title}"?`)) void launcher.killActive()
  }

  const fps = snap?.fps ?? 0
  const cpu = snap?.stats?.cpu_percent ?? null
  const gpu = snap?.stats?.gpu_percent ?? null
  const ram = snap?.stats ? `${snap.stats.ram_used_gb.toFixed(1)}/${snap.stats.ram_total_gb.toFixed(0)}G` : null
  const battery = snap?.stats?.battery_percent

  const body = (
    <div
      className={`glass overflow-hidden rounded-2xl ${embedded ? 'w-[340px]' : 'h-full w-full'}`}
      style={{ boxShadow: '0 20px 60px -18px rgba(0,0,0,0.9), 0 0 40px -18px var(--acc)' }}
      data-tauri-drag-region
    >
      <div className="flex items-center justify-between px-3 py-1.5" data-tauri-drag-region>
        <span className="truncate text-[10px] font-black uppercase tracking-widest text-white/60" data-tauri-drag-region>
          {active?.title ?? 'MESHplay'}
        </span>
        <div className="flex items-center gap-1.5">
          <button className="rounded-full px-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white" title="Mute" onClick={() => volumeKey('mute')}>🔇</button>
          <button className="rounded-full px-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white" title="Volume down" onClick={() => volumeKey('down')}>−</button>
          <button className="rounded-full px-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white" title="Volume up" onClick={() => volumeKey('up')}>+</button>
          {active && (
            <button className="rounded-full px-1.5 text-xs text-red-300/70 hover:bg-red-500/20 hover:text-red-200" title="Stop game" onClick={stopGame}>
              ⏹
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 px-2 pb-2">
        <Cell label="FPS" value={`${fps}`} accent={fps < 30 ? '#f87171' : fps < 50 ? '#fbbf24' : '#4ade80'} />
        <Cell label="CPU" value={cpu != null ? `${Math.round(cpu)}%` : '—'} />
        <Cell label="GPU" value={gpu != null ? `${Math.round(gpu)}%` : '—'} />
        <Cell label={battery != null ? `BAT⚡` : 'RAM'} value={battery != null ? `${Math.round(battery)}%` : ram ?? '—'} />
      </div>
    </div>
  )

  if (embedded) return body
  return <div className="h-screen w-screen bg-transparent p-1">{body}</div>
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white/6 px-1.5 py-1.5 text-center">
      <div className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-xs font-black" style={{ color: accent ?? 'rgba(255,255,255,0.9)' }}>{value}</div>
    </div>
  )
}
