// Native PC game launcher + supervision. Launches real Windows processes with
// custom arguments and working directories, tracks playtime end-to-end, and
// shows a companion floating widget while the game runs.

import { tryInvoke, emitLocal, listen } from './ipc'
import { addPlaytime } from './db'

export interface NativeLaunch {
  pid: number
  title: string
  startedAt: number
  exePath: string
}

type Listener = (active: NativeLaunch | null) => void

const state: { active: NativeLaunch | null } = { active: null }
const listeners = new Set<Listener>()

function emit(): void {
  for (const fn of listeners) fn(state.active)
}

export function getActive(): NativeLaunch | null {
  return state.active
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  fn(state.active)
  return () => listeners.delete(fn)
}

/** Launch a native game. Returns the pid; playtime ends when the process exits. */
export async function launchNative(game: { id: string; title: string; exePath?: string; args?: string; workDir?: string }): Promise<number | null> {
  if (!game.exePath) return null
  const pid = await tryInvoke<number>('launch_native', {
    path: game.exePath,
    args: game.args ?? null,
    workDir: game.workDir ?? null,
  })
  if (!pid) return null
  state.active = { pid, title: game.title, startedAt: Date.now(), exePath: game.exePath }
  emit()
  // floating always-on-top companion widget (Tauri second window)
  void tryInvoke('open_companion', { title: game.title })
  return pid
}

/** Hard stop the running native game (with UI confirmation upstream). */
export async function killActive(): Promise<boolean> {
  const active = state.active
  if (!active) return false
  const ok = await tryInvoke<boolean>('kill_native', { pid: active.pid })
  if (ok) {
    endNativeSession()
  }
  return ok ?? false
}

function endNativeSession(): void {
  const active = state.active
  if (!active) return
  const seconds = Math.round((Date.now() - active.startedAt) / 1000)
  if (seconds > 5) {
    void addPlaytime(`native:${active.title}`, seconds)
    emitLocal('native-playtime', { title: active.title, seconds })
  }
  state.active = null
  emit()
  void tryInvoke('close_companion')
}

export const launcher = {
  launchNative,
  killActive,
  getActive,
  subscribe,
}

/** Listen for process exit (emitted by the Rust supervisor thread). */
export function initLauncherListener(): () => void {
  void listen('native-exited', (payload) => {
    const p = payload as { pid: number; code: number | null }
    if (state.active && state.active.pid === p.pid) {
      endNativeSession()
    }
  })
  return () => undefined
}
