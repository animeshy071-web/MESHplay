import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../lib/themes'
import type { Settings } from '../lib/settings'
import { sfx } from '../lib/sound'
import { createRepeater, type Repeater } from '../lib/repeat'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onBack: () => void
  toast: (msg: string) => void
}

export default function SettingsView({ settings, onChange, onBack, toast }: Props) {
  const [row, setRow] = useState(0)
  const rep = useRef<Repeater | null>(null)
  if (!rep.current) rep.current = createRepeater(420, 200)

  const rows = [
    { label: 'Theme', value: THEMES.find((t) => t.id === settings.theme)?.name ?? '', action: cycleTheme },
    { label: 'Default view', value: settings.defaultView, action: cycleView },
    { label: 'FPS counter', value: settings.fps ? 'On' : 'Off', action: cycleFps },
    { label: 'UI sounds', value: settings.sound ? 'On' : 'Off', action: cycleSound },
    { label: 'About', value: 'MESHplay v0.1.0-m1', action: () => {} },
  ]

  function cycleTheme() {
    const idx = THEMES.findIndex((t) => t.id === settings.theme)
    const next = THEMES[(idx + 1) % THEMES.length]
    onChange({ ...settings, theme: next.id })
    sfx.theme()
    toast(`Theme: ${next.name}`)
  }
  function cycleView() {
    const next = settings.defaultView === 'crescent' ? 'row' : 'crescent'
    onChange({ ...settings, defaultView: next })
    sfx.select()
    toast(`Default view: ${next}`)
  }
  function cycleFps() {
    onChange({ ...settings, fps: !settings.fps })
    sfx.select()
  }
  function cycleSound() {
    onChange({ ...settings, sound: !settings.sound })
  }

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
  }, [row, settings])

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center anim-fade-up">
      <div className="flex w-[560px] flex-col gap-3">
        <h1 className="mb-3 text-4xl font-black tracking-tight">Settings</h1>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`glass flex cursor-pointer items-center justify-between rounded-2xl px-6 py-4 transition-all duration-300 ${
              row === i ? 'translate-x-2 ring-2 ring-[var(--acc)]' : ''
            }`}
            style={row === i ? { boxShadow: '0 0 30px -8px var(--acc)' } : undefined}
            onMouseEnter={() => setRow(i)}
            onClick={() => r.action()}
          >
            <span className="text-[15px] font-bold text-white/85">{r.label}</span>
            <span className="text-sm font-semibold text-[var(--acc)]">{r.value}</span>
          </div>
        ))}
        <div className="mt-2 text-center text-xs text-white/35">Enter changes a setting · Esc goes back</div>
      </div>
    </div>
  )
}
