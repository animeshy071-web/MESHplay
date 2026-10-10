// Screensaver system: clock mode (PS3 gradient waves), music drift mode (now-
// playing art), and attract reels (game art + descriptions cycling). Activates
// after the idle timeout; any input exits. Fully offline.

import type { ScreensaverMode } from '../lib/settings'
import { idleMs, onIdle } from './power'

export interface ScreensaverState {
  active: boolean
  mode: ScreensaverMode
  at: number // when it activated
}

type Listener = (s: ScreensaverState) => void

const state: ScreensaverState = { active: false, mode: 'clock', at: 0 }
export { state as screensaverState }
const listeners = new Set<Listener>()
let mode: ScreensaverMode = 'clock'
let timeoutMin = 3
let installed = false
let checked = false

function emit(): void {
  for (const fn of listeners) fn(state)
}

export function configure(m: ScreensaverMode, timeoutMinutes: number): void {
  mode = m
  timeoutMin = timeoutMinutes
}

export function getMode(): ScreensaverMode {
  return mode
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function forceShow(m?: ScreensaverMode): void {
  if (mode === 'off' && !m) return
  state.active = true
  state.mode = m ?? (mode === 'off' ? 'clock' : mode)
  state.at = Date.now()
  emit()
}

export function dismiss(): void {
  if (!state.active) return
  state.active = false
  emit()
}

export function installScreensaverWatcher(): () => void {
  if (installed) return () => undefined
  installed = true
  const unIdle = onIdle(() => {
    if (checked) return
    checked = true
    window.setTimeout(() => {
      checked = false
      if (mode === 'off' || state.active) return
      if (idleMs() >= timeoutMin * 60_000) forceShow()
    }, 1000)
  })
  return unIdle
}

// ---------- attract mode content ----------

export interface AttractSlide {
  title: string
  tagline: string
  desc: string
}

/** Build attract reels from the live library. */
export function attractReels(games: Array<{ title: string; tagline: string; desc: string; seconds?: number }>): AttractSlide[] {
  return games.slice(0, 12).map((g) => ({
    title: g.title,
    tagline: g.tagline,
    desc: g.desc || 'Ready when you are.',
  }))
}
