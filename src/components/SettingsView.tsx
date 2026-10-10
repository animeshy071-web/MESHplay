import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../lib/themes'
import type { Settings, Quality } from '../lib/settings'
import { sfx } from '../lib/sound'
import { createRepeater, type Repeater } from '../lib/repeat'
import { formatPlaytime } from '../lib/playtime'
import { GAMES } from '../lib/games'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onBack: () => void
  toast: (msg: string) => void
  onOpenRemote: () => void
}

interface RowDef {
  label: string
  value: () => string
  action: () => void
}

export default function SettingsView({ settings, onChange, onBack, toast, onOpenRemote }: Props) {
  const [section, setSection] = useState(0)
  const [row, setRow] = useState(0)
  const rep = useRef<Repeater | null>(null)
  if (!rep.current) rep.current = createRepeater(420, 200)

  const cycle = <K extends keyof Settings>(key: K, values: Settings[K][]) => () => {
    const idx = values.indexOf(settings[key])
    const next = values[(idx + 1) % values.length]
    onChange({ ...settings, [key]: next })
    sfx.select()
    toast(`${String(key)}: ${String(next)}`)
  }
  const toggle = (key: keyof Settings, name: string) => () => {
    onChange({ ...settings, [key]: !settings[key] } as Settings)
    sfx.select()
  }

  const sections: { name: string; rows: RowDef[] }[] = [
    {
      name: 'General',
      rows: [
        { label: 'Theme', value: () => THEMES.find((t) => t.id === settings.theme)?.name ?? '', action: cycle('theme', THEMES.map((t) => t.id)) },
        { label: 'Default view', value: () => (settings.defaultView === 'row' ? 'Xbox Dashboard' : 'Orbital Crescent'), action: cycle('defaultView', ['row', 'crescent']) },
        { label: 'Boot animation', value: () => (settings.bootAnimation ? 'On' : 'Off'), action: toggle('bootAnimation', 'Boot animation') },
        { label: 'Reduce motion', value: () => (settings.reduceMotion ? 'On' : 'Off'), action: toggle('reduceMotion', 'Reduce motion') },
      ],
    },
    {
      name: 'Video',
      rows: [
        { label: 'FPS counter', value: () => (settings.fps ? 'On' : 'Off'), action: toggle('fps', 'FPS counter') },
        { label: 'CRT scanlines', value: () => (settings.scanlines ? 'On' : 'Off'), action: toggle('scanlines', 'Scanlines') },
        { label: 'Smooth scaling', value: () => (settings.smoothScaling ? 'On' : 'Off'), action: toggle('smoothScaling', 'Smooth scaling') },
        { label: 'Quality', value: () => settings.quality, action: cycle('quality', ['high', 'balanced', 'eco'] as Quality[]) },
      ],
    },
    {
      name: 'Audio',
      rows: [
        { label: 'UI sounds', value: () => (settings.sound ? 'On' : 'Off'), action: toggle('sound', 'UI sounds') },
        { label: 'UI volume', value: () => `${settings.uiVolume}%`, action: cycle('uiVolume', [0, 25, 50, 60, 75, 100]) },
      ],
    },
    {
      name: 'Remote',
      rows: [
        { label: 'Remote Play', value: () => (settings.remoteEnabled ? 'On' : 'Off'), action: toggle('remoteEnabled', 'Remote Play') },
        { label: 'Pair a phone', value: () => 'Open QR', action: () => { sfx.select(); onOpenRemote() } },
      ],
    },
    {
      name: 'About',
      rows: [
        { label: 'Version', value: () => 'MESHplay v0.2.0-m2', action: () => sfx.select() },
        { label: 'Library', value: () => `${GAMES.length} homebrew games`, action: () => sfx.select() },
        { label: 'Most played', value: () => { const top = GAMES.find((g) => formatPlaytime(g.id) !== 'Never played'); return top ? top.title : '—' }, action: () => sfx.select() },
      ],
    },
  ]

  const rows = sections[section].rows

  useEffect(() => {
    const glide = (d: number) => {
      setRow((r) => (r + d + rows.length) % rows.length)
      sfx.travel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        rep.current!.press(e.code, () => glide(-1))
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        rep.current!.press(e.code, () => glide(1))
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        setSection((s) => (s + sections.length - 1) % sections.length)
        setRow(0)
        sfx.travel()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        setSection((s) => (s + 1) % sections.length)
        setRow(0)
        sfx.travel()
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        rows[row].action()
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault()
        sfx.back()
        onBack()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => rep.current!.release(e.code)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      rep.current!.stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, row, settings, sections])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)' }}>
      <div className="glass flex w-[860px] max-w-[94vw] rounded-[28px] p-8 anim-fade-up" style={{ maxHeight: '84vh' }}>
        {/* Sections rail */}
        <div className="mr-8 flex w-[170px] shrink-0 flex-col gap-2">
          <h2 className="mb-3 px-2 text-3xl font-black tracking-tight">Settings</h2>
          {sections.map((s, i) => (
            <div
              key={s.name}
              className={`cursor-pointer rounded-2xl px-4 py-3 text-sm font-bold transition-all duration-300 ${
                section === i ? 'bg-white/12 text-white ring-2 ring-[var(--acc)]' : 'text-white/45 hover:text-white/75'
              }`}
              style={section === i ? { boxShadow: '0 0 26px -10px var(--acc)' } : undefined}
              onMouseEnter={() => { if (section !== i) { setSection(i); setRow(0); sfx.travel() } }}
              onClick={() => { setSection(i); setRow(0) }}
            >
              {s.name}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto no-scrollbar">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex cursor-pointer items-center justify-between rounded-2xl px-6 py-4 transition-all duration-300 ${
                row === i ? 'translate-x-1 bg-white/12 ring-2 ring-[var(--acc)]' : 'bg-white/5'
              }`}
              style={row === i ? { boxShadow: '0 0 30px -10px var(--acc)' } : undefined}
              onMouseEnter={() => { if (row !== i) { setRow(i); sfx.travel() } }}
              onClick={() => r.action()}
            >
              <span className="text-[15px] font-bold text-white/85">{r.label}</span>
              <span className="text-sm font-semibold text-[var(--acc)]">{r.value()}</span>
            </div>
          ))}
          <div className="pt-1 text-center text-xs text-white/35">↑↓ move · ←→ section · Enter change · Esc back</div>
        </div>
      </div>
    </div>
  )
}
