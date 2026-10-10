// Power & system management: sleep timer, idle dimming, battery-saver mode,
// autostart-with-Windows. All local — nothing leaves the machine.

import { tryInvoke, isTauri } from './ipc'

type IdleListener = (idleMs: number) => void

const state = {
  lastActivity: Date.now(),
  idleListeners: new Set<IdleListener>(),
  installed: false,
}

export function lastActivityAt(): number {
  return state.lastActivity
}

export function idleMs(): number {
  return Date.now() - state.lastActivity
}

export function onIdle(fn: IdleListener): () => void {
  state.idleListeners.add(fn)
  return () => state.idleListeners.delete(fn)
}

/** Track user activity (input events) — drives idle dim + screensaver. */
export function installActivityWatcher(): void {
  if (state.installed) return
  state.installed = true
  const mark = () => {
    state.lastActivity = Date.now()
  }
  const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'gamepadconnected']
  for (const e of events) window.addEventListener(e, mark, { passive: true })
  // gamepad activity polled via the input layer calling markActive()
}

export function markActive(): void {
  state.lastActivity = Date.now()
}

/** Autostart with Windows (Tauri autostart plugin, user opt-in from Settings). */
export async function setStartWithWindows(enable: boolean): Promise<boolean> {
  if (!isTauri()) return false
  return (
    (await tryInvoke<boolean>(
      'plugin:autostart|' + (enable ? 'enable' : 'disable'),
      {},
    )) ?? false
  )
}

export async function isStartWithWindows(): Promise<boolean> {
  if (!isTauri()) return false
  return (await tryInvoke<boolean>('plugin:autostart|is_enabled', {})) ?? false
}

/** Battery-saver: returns true when the machine is on battery power. */
export async function isOnBattery(): Promise<boolean> {
  if (isTauri()) {
    const stats = await tryInvoke<{ charging: boolean | null }>('system_stats')
    if (stats?.charging != null) return !stats.charging
  }
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean }> }
    if (nav.getBattery) {
      const b = await nav.getBattery()
      return !b.charging
    }
  } catch {
    /* no battery */
  }
  return false
}

/** Real system sleep (standby) via the native backend. */
export async function sleepNow(): Promise<boolean> {
  if (isTauri()) {
    const r = await tryInvoke<{ ok: boolean }>('system_sleep')
    return r?.ok ?? false
  }
  return false
}

/** Real hibernate (S4). */
export async function hibernateNow(): Promise<boolean> {
  if (isTauri()) {
    const r = await tryInvoke<{ ok: boolean }>('system_hibernate')
    return r?.ok ?? false
  }
  return false
}

/** Open any URL / ms-settings page in the system browser (HDR, ViGEm guide…). */
export async function openUrl(url: string): Promise<boolean> {
  const r = await tryInvoke<{ ok: boolean }>('open_url', { url })
  return r?.ok ?? false
}

/**
 * Sleep timer: arms an idle watcher that puts the PC to standby after N
 * minutes without input. Returns a disposer. Native only.
 */
export function armSleepTimer(minutes: number, isNativeRunning: () => boolean): () => void {
  if (minutes <= 0) return () => undefined
  const check = window.setInterval(() => {
    if (isNativeRunning()) return
    if (Date.now() - state.lastActivity >= minutes * 60_000) {
      void sleepNow()
    }
  }, 15_000)
  return () => window.clearInterval(check)
}
