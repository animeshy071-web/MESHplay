// Find My Controller — pings lost wireless controllers with rumble bursts and
// PC sonar, with a radar UI naming each connected device and its player slot.

import { rumble } from './input'
import { sfx } from './mixer'
import { remoteHost } from '../lib/remote'

export interface FoundDevice {
  index: number
  kind: 'gamepad' | 'phone'
  name: string
  player: number
}

type Listener = (pinging: boolean) => void

let pinging = false
let interval: number | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const fn of listeners) fn(pinging)
}

/** Enumerate every connected input device: physical pads + paired phones. */
export function listDevices(): FoundDevice[] {
  const out: FoundDevice[] = []
  const pads = navigator.getGamepads?.() ?? []
  for (const gp of pads) {
    if (gp && gp.connected) {
      out.push({ index: gp.index, kind: 'gamepad', name: gp.id || 'Gamepad', player: gp.index + 1 })
    }
  }
  for (const p of remoteHost['state']?.players ?? []) {
    out.push({ index: p, kind: 'phone', name: `Phone (Player ${p})`, player: p })
  }
  return out
}

/** Start pinging: rumble bursts + sonar every 1.6s until stopped. */
export function startPinging(): void {
  if (pinging) return
  pinging = true
  emit()
  const burst = () => {
    sfx.sonar()
    rumble(500, true)
    remoteHost.rumbleAll(500)
  }
  burst()
  interval = window.setInterval(burst, 1600)
}

export function stopPinging(): void {
  if (interval !== null) {
    clearInterval(interval)
    interval = null
  }
  pinging = false
  emit()
}

export function isPinging(): boolean {
  return pinging
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
