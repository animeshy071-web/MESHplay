// Console Settings — the commercial-grade OS suite:
// General · Profile · Video · Audio · Power · Controller · Storage · Remote · About.
// Keyboard-first (arrows + Enter) with mouse support and slider rows.

import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../lib/themes'
import type { Settings, Quality, DisplayMode, FilterMode, ScreensaverMode } from '../lib/settings'
import { sfx } from '../system/mixer'
import { createRepeater, type Repeater } from '../lib/repeat'
import { computeBadges, loadProfile, saveProfile, AVATAR_COUNT, AVATAR_PALETTES, type Profile, type Badge } from '../system/profile'
import { setPin, clearPin } from '../system/pin'
import { isTauri, tryInvoke } from '../system/ipc'
import { captureButton, getProfile as getGamepadProfile, saveProfile as saveGamepadProfile, setDeadzones, setRumbleIntensity, rumble, type GamepadProfile } from '../system/input'
import { setStartWithWindows, isStartWithWindows } from '../system/power'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onBack: () => void
  toast: (msg: string) => void
  onOpenRemote: () => void
  onOpenFindController: () => void
}

interface RowDef {
  label: string
  value: () => string
  action: () => void
  kind?: 'row' | 'slider'
  slider?: { min: number; max: number; step: number; get: () => number; set: (v: number) => void }
  custom?: () => React.ReactNode
}

export default function SettingsView({ settings, onChange, onBack, toast, onOpenRemote, onOpenFindController }: Props) {
  const [section, setSection] = useState(0)
  const [row, setRow] = useState(0)
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [hours, setHours] = useState(0)
  const [pinMode, setPinMode] = useState<'idle' | 'enter-new'>('idle')
  const [pinBuffer, setPinBuffer] = useState('')
  const [storage, setStorage] = useState<Record<string, number> | null>(null)
  const [autostart, setAutostart] = useState(false)
  const [padProfile, setPadProfile] = useState<GamepadProfile>(getGamepadProfile())
  const [capturing, setCapturing] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [gamertagDraft, setGamertagDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const rep = useRef<Repeater | null>(null)
  if (!rep.current) rep.current = createRepeater(420, 200)

  useEffect(() => {
    void (async () => {
      setProfileState(await loadProfile())
      const b = await computeBadges()
      setBadges(b.badges)
      setHours(b.hours)
      setStorage(isTauri() ? ((await tryInvoke('storage_breakdown')) as Record<string, number>) : null)
      setAutostart(await isStartWithWindows())
    })()
  }, [])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value })
  }
  const cycle = <K extends keyof Settings>(key: K, values: Settings[K], name?: string) => {
    const valuesList = values as unknown as Settings[K][]
    void valuesList
    return () => undefined
  }

  const profileSectionRows: RowDef[] = [
    {
      label: 'Gamertag',
      value: () => profile?.gamertag ?? 'Player 1',
      action: () => {
        sfx.select()
        setGamertagDraft(profile?.gamertag ?? '')
        setEditingProfile(true)
      },
    },
    {
      label: 'Avatar',
      value: () => '▸ change',
      action: () => {
        sfx.select()
        if (profile) {
          const next = { ...profile, avatar: (profile.avatar + 1) % AVATAR_COUNT }
          setProfileState(next)
          void saveProfile(next)
        }
      },
      custom: () =>
        profile ? (
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full"
              style={{ background: `linear-gradient(135deg, ${AVATAR_PALETTES[profile.avatar][0]}, ${AVATAR_PALETTES[profile.avatar][1]})` }}
            />
          </div>
        ) : null,
    },
    {
      label: 'Player bio',
      value: () => (profile?.bio?.length ?? 0) > 26 ? `${profile?.bio.slice(0, 26)}…` : profile?.bio ?? '',
      action: () => {
        sfx.select()
        setBioDraft(profile?.bio ?? '')
        setEditingProfile(true)
      },
    },
    {
      label: 'Total playtime',
      value: () => `${hours.toFixed(1)}h`,
      action: () => sfx.select(),
    },
    {
      label: 'Badges',
      value: () => `${badges.filter((b) => b.earned).length}/${badges.length} earned`,
      action: () => sfx.select(),
      custom: () => (
        <div className="flex gap-1.5">
          {badges.slice(0, 6).map((b) => (
            <span key={b.id} title={`${b.name} — ${b.desc}`} className={`text-sm ${b.earned ? '' : 'opacity-25 grayscale'}`}>
              🏆
            </span>
          ))}
        </div>
      ),
    },
    {
      label: 'PIN lock',
      value: () => (settings.pinEnabled ? 'On' : 'Off'),
      action: () => {
        sfx.select()
        if (settings.pinEnabled) {
          void clearPin()
          set('pinEnabled', false)
          toast('PIN lock disabled')
        } else {
          setPinMode('enter-new')
          setPinBuffer('')
        }
      },
    },
  ]

  const sections: { name: string; rows: RowDef[] }[] = [
    {
      name: 'General',
      rows: [
        { label: 'Theme', value: () => THEMES.find((t) => t.id === settings.theme)?.name ?? '', action: () => { const ids = THEMES.map((t) => t.id); const i = (ids.indexOf(settings.theme) + 1) % ids.length; set('theme', ids[i]); sfx.theme(); toast(`Theme: ${THEMES[i].name}`) } },
        { label: 'Default view', value: () => (settings.defaultView === 'row' ? 'Xbox Dashboard' : 'Orbital Crescent'), action: () => { set('defaultView', settings.defaultView === 'row' ? 'crescent' : 'row'); sfx.select() } },
        { label: 'Boot animation', value: () => (settings.bootAnimation ? 'On' : 'Off'), action: () => { set('bootAnimation', !settings.bootAnimation); sfx.select() } },
        { label: 'Reduce motion', value: () => (settings.reduceMotion ? 'On' : 'Off'), action: () => { set('reduceMotion', !settings.reduceMotion); sfx.select() } },
        { label: 'Adaptive quality', value: () => (settings.adaptiveQuality ? 'On' : 'Off'), action: () => { set('adaptiveQuality', !settings.adaptiveQuality); sfx.select() } },
      ],
    },
    { name: 'Profile', rows: profileSectionRows },
    {
      name: 'Video',
      rows: [
        { label: 'Display mode', value: () => ({ fullscreen: 'Fullscreen', borderless: 'Borderless', windowed: 'Windowed' }[settings.displayMode]), action: () => { const modes: DisplayMode[] = ['windowed', 'borderless', 'fullscreen']; set('displayMode', modes[(modes.indexOf(settings.displayMode) + 1) % 3]); sfx.select(); void tryInvoke('set_display_mode', { mode: modes[(modes.indexOf(settings.displayMode) + 1) % 3] }) } },
        { label: 'FPS counter', value: () => (settings.fps ? 'On' : 'Off'), action: () => { set('fps', !settings.fps); sfx.select() } },
        { label: 'Target FPS', value: () => (settings.targetFps === 0 ? 'Uncapped' : `${settings.targetFps} FPS`), action: () => { const opts = [0, 30, 60, 120]; set('targetFps', opts[(opts.indexOf(settings.targetFps) + 1) % 4]); sfx.select() } },
        { label: 'V-Sync', value: () => (settings.vsync ? 'On' : 'Off'), action: () => { set('vsync', !settings.vsync); sfx.select() } },
        { label: 'HDR', value: () => (settings.hdr ? 'On' : 'Off'), action: () => { set('hdr', !settings.hdr); sfx.select(); toast(settings.hdr ? 'HDR off' : 'HDR on (display permitting)') } },
        { label: 'In-game filter', value: () => ({ off: 'Off', crt: 'CRT Scanlines', lcd: 'LCD Grid', sharp: 'Sharp Pixel', smooth: 'Smooth' }[settings.filterMode as FilterMode]), action: () => { const modes: FilterMode[] = ['off', 'crt', 'lcd', 'sharp', 'smooth']; set('filterMode', modes[(modes.indexOf(settings.filterMode) + 1) % 5]); sfx.select() } },
        { label: 'CRT scanlines (home)', value: () => (settings.scanlines ? 'On' : 'Off'), action: () => { set('scanlines', !settings.scanlines); sfx.select() } },
        { label: 'Smooth scaling', value: () => (settings.smoothScaling ? 'On' : 'Off'), action: () => { set('smoothScaling', !settings.smoothScaling); sfx.select() } },
        { label: 'Quality', value: () => settings.quality, action: () => { const q: Quality[] = ['high', 'balanced', 'eco']; set('quality', q[(q.indexOf(settings.quality) + 1) % 3]); sfx.select() } },
      ],
    },
    {
      name: 'Audio',
      rows: [
        { label: 'UI sounds', value: () => (settings.sound ? 'On' : 'Off'), action: () => { set('sound', !settings.sound); sfx.select() } },
        {
          label: 'Master volume', kind: 'slider',
          value: () => `${settings.uiVolume}%`,
          action: () => set('uiVolume', settings.uiVolume >= 100 ? 0 : Math.min(100, settings.uiVolume + 10)),
          slider: { min: 0, max: 100, step: 5, get: () => settings.uiVolume, set: (v) => set('uiVolume', v) },
        },
        {
          label: 'Game volume', kind: 'slider',
          value: () => `${settings.gameVolume}%`,
          action: () => set('gameVolume', settings.gameVolume >= 100 ? 0 : Math.min(100, settings.gameVolume + 10)),
          slider: { min: 0, max: 100, step: 5, get: () => settings.gameVolume, set: (v) => set('gameVolume', v) },
        },
        {
          label: 'Music volume', kind: 'slider',
          value: () => `${settings.musicVolume}%`,
          action: () => set('musicVolume', settings.musicVolume >= 100 ? 0 : Math.min(100, settings.musicVolume + 10)),
          slider: { min: 0, max: 100, step: 5, get: () => settings.musicVolume, set: (v) => set('musicVolume', v) },
        },
        {
          label: 'Voice volume', kind: 'slider',
          value: () => `${settings.voiceVolume}%`,
          action: () => set('voiceVolume', settings.voiceVolume >= 100 ? 0 : Math.min(100, settings.voiceVolume + 10)),
          slider: { min: 0, max: 100, step: 5, get: () => settings.voiceVolume, set: (v) => set('voiceVolume', v) },
        },
        { label: 'Spatial audio', value: () => (settings.spatialAudio ? 'On' : 'Off'), action: () => { set('spatialAudio', !settings.spatialAudio); sfx.select() } },
        { label: 'Mute on blur', value: () => (settings.muteOnBlur ? 'On' : 'Off'), action: () => { set('muteOnBlur', !settings.muteOnBlur); sfx.select() } },
        { label: 'Output device', value: () => (settings.audioOutput === 'default' ? 'System default' : 'Selected device'), action: () => { set('audioOutput', settings.audioOutput === 'default' ? 'headphones' : 'default'); sfx.select(); toast(`Output: ${settings.audioOutput === 'default' ? 'headphones' : 'system default'}`) } },
      ],
    },
    {
      name: 'Power',
      rows: [
        { label: 'Sleep timer', value: () => (settings.sleepTimer === 0 ? 'Never' : `${settings.sleepTimer} min`), action: () => { const opts = [0, 15, 30, 60]; set('sleepTimer', opts[(opts.indexOf(settings.sleepTimer) + 1) % 4]); sfx.select() } },
        { label: 'Screen dim on idle', value: () => (settings.idleDim ? 'On' : 'Off'), action: () => { set('idleDim', !settings.idleDim); sfx.select() } },
        { label: 'Start with Windows', value: () => (settings.startWithWindows ? 'On' : 'Off'), action: () => { const next = !settings.startWithWindows; set('startWithWindows', next); void setStartWithWindows(next); setAutostart(next); sfx.select(); toast(next ? 'Auto-start enabled' : 'Auto-start disabled') } },
        { label: 'Launch fullscreen', value: () => (settings.launchFullscreen ? 'On' : 'Off'), action: () => { set('launchFullscreen', !settings.launchFullscreen); sfx.select() } },
        { label: 'Battery saver', value: () => (settings.batterySaver ? 'On' : 'Auto'), action: () => { set('batterySaver', !settings.batterySaver); sfx.select() } },
        { label: 'Screensaver', value: () => ({ off: 'Off', clock: 'Clock', music: 'Music drift', attract: 'Attract reels' }[settings.screensaverMode as ScreensaverMode]), action: () => { const modes: ScreensaverMode[] = ['off', 'clock', 'music', 'attract']; set('screensaverMode', modes[(modes.indexOf(settings.screensaverMode) + 1) % 4]); sfx.select() } },
        { label: 'Screensaver timeout', value: () => `${settings.screensaverTimeout} min`, action: () => { const opts = [1, 3, 5, 10]; set('screensaverTimeout', opts[(opts.indexOf(settings.screensaverTimeout) + 1) % 4]); sfx.select() } },
      ],
    },
    {
      name: 'Controller',
      rows: [
        {
          label: 'Left stick deadzone', kind: 'slider',
          value: () => `${settings.deadzoneL}%`,
          action: () => set('deadzoneL', settings.deadzoneL >= 40 ? 0 : Math.min(40, settings.deadzoneL + 5)),
          slider: { min: 0, max: 40, step: 5, get: () => settings.deadzoneL, set: (v) => { set('deadzoneL', v); setDeadzones(v, settings.deadzoneR) } },
        },
        {
          label: 'Right stick deadzone', kind: 'slider',
          value: () => `${settings.deadzoneR}%`,
          action: () => set('deadzoneR', settings.deadzoneR >= 40 ? 0 : Math.min(40, settings.deadzoneR + 5)),
          slider: { min: 0, max: 40, step: 5, get: () => settings.deadzoneR, set: (v) => { set('deadzoneR', v); setDeadzones(settings.deadzoneL, v) } },
        },
        {
          label: 'Rumble intensity', kind: 'slider',
          value: () => `${settings.rumbleIntensity}%`,
          action: () => set('rumbleIntensity', settings.rumbleIntensity >= 100 ? 0 : Math.min(100, settings.rumbleIntensity + 10)),
          slider: { min: 0, max: 100, step: 10, get: () => settings.rumbleIntensity, set: (v) => { set('rumbleIntensity', v); setRumbleIntensity(v) } },
        },
        { label: 'Test rumble', value: () => 'buzz', action: () => { rumble(400, true); sfx.select() } },
        { label: 'Gamepad/mouse auto-switch', value: () => (settings.autoSwitchInput ? 'On' : 'Off'), action: () => { set('autoSwitchInput', !settings.autoSwitchInput); sfx.select() } },
        ...(['confirm', 'back', 'mode', 'gamebar'] as const).map((actionKey) => ({
          label: `${actionKey[0].toUpperCase()}${actionKey.slice(1)} button`,
          value: () => `Btn ${padProfile.buttons[actionKey]}`,
          action: () => {
            sfx.select()
            setCapturing(actionKey)
            void captureButton().then((btn) => {
              setCapturing(null)
              if (btn !== null) {
                const next = { ...padProfile, buttons: { ...padProfile.buttons, [actionKey]: btn } }
                setPadProfile(next)
                saveGamepadProfile(next)
                sfx.chime()
                toast(`${actionKey} → Button ${btn}`)
              }
            })
          },
        })),
        { label: 'Find My Controller', value: () => 'sonar', action: () => { sfx.select(); onOpenFindController() } },
      ],
    },
    {
      name: 'Storage',
      rows: [
        {
          label: 'Storage breakdown',
          value: () => (storage ? formatBytes(storage.total ?? 0) : '…'),
          action: () => sfx.select(),
          custom: () =>
            storage ? (
              <div className="flex flex-col gap-1">
                {(['database', 'saves', 'screenshots', 'clips', 'art', 'cache'] as const).map((k) => (
                  <div key={k} className="flex justify-between text-[11px] text-white/55">
                    <span className="capitalize">{k}</span>
                    <span className="font-mono">{formatBytes(storage[k] ?? 0)}</span>
                  </div>
                ))}
              </div>
            ) : null,
        },
        {
          label: 'Export saves + configs (.zip)',
          value: () => 'back up',
          action: async () => {
            sfx.launch()
            const dest = await tryInvoke<string>('pick_export_file')
            if (dest) {
              const r = await tryInvoke<{ count: number }>('export_saves', { dest })
              toast(r ? `Exported ${r.count} files ✓` : 'Export failed')
              sfx.chime()
            }
          },
        },
        {
          label: 'Import saves + configs',
          value: () => 'restore',
          action: async () => {
            sfx.launch()
            const src = await tryInvoke<string>('pick_import_file')
            if (src) {
              const r = await tryInvoke<{ files: number }>('import_saves', { src })
              toast(r ? `Restored ${r.files} files ✓` : 'Import failed')
            }
          },
        },
        {
          label: 'Clean cache',
          value: () => (storage ? formatBytes(storage.cache ?? 0) : ''),
          action: async () => {
            const freed = await tryInvoke<number>('clear_cache')
            toast(freed != null ? `Freed ${formatBytes(freed)} ✓` : 'Cache cleaned')
            sfx.chime()
            setStorage(isTauri() ? ((await tryInvoke('storage_breakdown')) as Record<string, number>) : null)
          },
        },
        { label: 'Delete routing', value: () => 'Recycle Bin', action: () => { sfx.select(); toast('Removals always go to the Recycle Bin') } },
      ],
    },
    {
      name: 'Remote',
      rows: [
        { label: 'Remote Play', value: () => (settings.remoteEnabled ? 'On' : 'Off'), action: () => { set('remoteEnabled', !settings.remoteEnabled); sfx.select() } },
        { label: 'Pair a phone', value: () => 'Open QR', action: () => { sfx.select(); onOpenRemote() } },
      ],
    },
    {
      name: 'About',
      rows: [
        { label: 'Version', value: () => 'MESHplay v0.3.0-m3', action: () => sfx.select() },
        { label: 'Library', value: () => 'see Library manager', action: () => sfx.select() },
        { label: 'Offline', value: () => '100% · no telemetry', action: () => sfx.select() },
        { label: 'Total playtime', value: () => `${hours.toFixed(1)}h`, action: () => sfx.select() },
      ],
    },
  ]

  const rows = sections[section].rows

  // PIN entry mode captures digits before the settings nav
  useEffect(() => {
    if (pinMode !== 'enter-new') return
    const onKey = (e: KeyboardEvent) => {
      if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
        e.preventDefault()
        e.stopPropagation()
        setPinBuffer((p) => {
          const next = p + e.code.slice(-1)
          if (next.length >= 4) {
            void setPin(next)
            set('pinEnabled', true)
            setPinMode('idle')
            toast('PIN set ✓')
            sfx.chime()
            return ''
          }
          return next
        })
      } else if (e.code === 'Escape') {
        setPinMode('idle')
        setPinBuffer('')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinMode])

  useEffect(() => {
    const rowsNow = sections[section].rows
    const glide = (d: number) => {
      setRow((r) => (r + d + rowsNow.length) % rowsNow.length)
      sfx.travel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const current = rowsNow[row]
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        rep.current!.press(e.code, () => glide(-1))
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        rep.current!.press(e.code, () => glide(1))
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        if (current?.kind === 'slider' && current.slider) {
          const v = Math.max(current.slider.min, current.slider.get() - current.slider.step)
          current.slider.set(v)
          sfx.travel()
        } else {
          setSection((s) => (s + sections.length - 1) % sections.length)
          setRow(0)
          sfx.travel()
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        if (current?.kind === 'slider' && current.slider) {
          const v = Math.min(current.slider.max, current.slider.get() + current.slider.step)
          current.slider.set(v)
          sfx.travel()
        } else {
          setSection((s) => (s + 1) % sections.length)
          setRow(0)
          sfx.travel()
        }
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        const r = rowsNow[row]
        if (r) {
          const result = r.action() as unknown
          void result
        }
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
  }, [section, row, settings, profile, storage, badges, padProfile])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)' }}>
      <div className="glass flex w-[920px] max-w-[96vw] rounded-[28px] p-7 anim-fade-up" style={{ maxHeight: '86vh' }}>
        {/* Sections rail */}
        <div className="mr-7 flex w-[168px] shrink-0 flex-col gap-1.5">
          <h2 className="mb-2 px-2 text-3xl font-black tracking-tight">Settings</h2>
          {sections.map((s, i) => (
            <div
              key={s.name}
              className={`cursor-pointer rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
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
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto no-scrollbar">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-3 transition-all duration-300 ${
                row === i ? 'translate-x-1 bg-white/12 ring-2 ring-[var(--acc)]' : 'bg-white/5'
              }`}
              style={row === i ? { boxShadow: '0 0 30px -10px var(--acc)' } : undefined}
              onMouseEnter={() => { if (row !== i) { setRow(i); sfx.travel() } }}
              onClick={() => r.action()}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-white/85">
                  {r.label}
                  {capturing === r.label.toLowerCase().split(' ')[0] && (
                    <span className="ml-2 animate-pulse text-[10px] font-black uppercase text-[var(--acc)]">press a button…</span>
                  )}
                </div>
                {r.custom?.()}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {r.kind === 'slider' && r.slider && (
                  <input
                    type="range"
                    min={r.slider.min}
                    max={r.slider.max}
                    step={r.slider.step}
                    value={r.slider.get()}
                    onChange={(e) => r.slider!.set(parseFloat(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="w-32 accent-[var(--acc)]"
                  />
                )}
                <span className="text-sm font-semibold text-[var(--acc)]">{r.value()}</span>
              </div>
            </div>
          ))}
          <div className="pt-1 text-center text-xs text-white/35">↑↓ move · ←→ adjust/section · Enter change · Esc back</div>
        </div>
      </div>

      {/* profile edit overlay */}
      {editingProfile && profile && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 anim-fade-in" style={{ backdropFilter: 'blur(10px)' }}>
          <div className="glass w-[440px] rounded-3xl p-6">
            <h3 className="mb-4 text-lg font-black">Edit profile</h3>
            <label className="mb-3 block text-[11px] font-black uppercase tracking-widest text-white/45">
              Gamertag
              <input className="input mt-1.5" value={gamertagDraft} onChange={(e) => setGamertagDraft(e.target.value)} maxLength={24} />
            </label>
            <label className="mb-5 block text-[11px] font-black uppercase tracking-widest text-white/45">
              Bio
              <textarea className="input mt-1.5 h-20 resize-none" value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} maxLength={140} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="rounded-full px-5 py-2 text-sm font-bold text-white/50 hover:bg-white/8" onClick={() => { setEditingProfile(false); sfx.back() }}>
                Cancel
              </button>
              <button
                className="rounded-full px-6 py-2 text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg, var(--acc), var(--acc2))' }}
                onClick={() => {
                  const next = { ...profile, gamertag: gamertagDraft.trim() || profile.gamertag, bio: bioDraft }
                  setProfileState(next)
                  void saveProfile(next)
                  setEditingProfile(false)
                  sfx.chime()
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN entry overlay */}
      {pinMode === 'enter-new' && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 anim-fade-in">
          <div className="mb-3 text-xs font-black uppercase tracking-[0.4em] text-white/50">Set a 4-digit PIN</div>
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-14 w-12 items-center justify-center rounded-2xl bg-white/8 text-2xl font-black" style={{ border: `1px solid ${pinBuffer.length > i ? 'var(--acc)' : 'rgba(255,255,255,0.1)'}` }}>
                {pinBuffer[i] ? '•' : ''}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-white/35">Type digits · Esc cancels</div>
        </div>
      )}
    </div>
  )
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}
