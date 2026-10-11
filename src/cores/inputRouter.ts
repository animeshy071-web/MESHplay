// 4-player core input router. Every input source lands on a core port:
//   P1 — keyboard (+ physical gamepad 1 merged)
//   P2–P4 — physical gamepads 2–4, and phone remotes by pairing slot
// Phone controller types all feed the same ports: full gamepad, arcade
// fight-stick, gyro wheel (→ analog steering) and trackpad (→ pointer/touch).
// The router is polled once per frame by PlayView and read synchronously by
// the libretro frontend's input_state callback.

import type { CoreButton, CoreTouch } from './types'
import { CORE_BUTTONS, DEFAULT_KEYS } from './types'

export interface PortState {
  buttons: Set<CoreButton>
  lx: number
  ly: number
  rx: number
  ry: number
  lt: number
  rt: number
  touch: CoreTouch
}

function blankPort(): PortState {
  return {
    buttons: new Set<CoreButton>(),
    lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0,
    touch: { active: false, x: 0.5, y: 0.5 },
  }
}

const ports: PortState[] = [blankPort(), blankPort(), blankPort(), blankPort()]
const phonePorts = new Map<number, Set<string>>() // slot -> active phone button codes

// ---------- keyboard (always P1) ----------

export function keyToButton(code: string, keys: Record<string, CoreButton>): CoreButton | null {
  return keys[code] ?? DEFAULT_KEYS[code] ?? null
}

export function setKeyboardButton(btn: CoreButton, down: boolean): void {
  if (down) ports[0].buttons.add(btn)
  else ports[0].buttons.delete(btn)
}

export function setKeyboardStick(btn: CoreButton, down: boolean): void {
  // arrows merge into the left stick so analog-only cores get directions too
  const x = (btn === 'right' ? 1 : btn === 'left' ? -1 : 0)
  const y = (btn === 'down' ? 1 : btn === 'up' ? -1 : 0)
  ports[0].lx = down ? x : 0
  ports[0].ly = down ? y : 0
}

// ---------- physical gamepads (P1–P4 in enumeration order) ----------

const GAMEPAD_BTN: Record<number, CoreButton> = {
  0: 'b', 1: 'a', 2: 'y', 3: 'x',
  4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2',
  8: 'select', 9: 'start', 10: 'l3', 11: 'r3',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
}

/** Fold physical gamepads into ports 1..4. Called once per frame. */
function pollGamepads(): void {
  const pads = navigator.getGamepads?.() ?? []
  let port = 0
  for (const pad of pads) {
    if (!pad || !pad.connected || port >= 4) continue
    const p = ports[port]
    if (port === 0) {
      // P1: merge on top of the keyboard state
    } else {
      p.buttons.clear()
      p.lx = p.ly = p.rx = p.ry = p.lt = p.rt = 0
    }
    for (let i = 0; i < pad.buttons.length; i++) {
      const btn = GAMEPAD_BTN[i]
      if (!btn) continue
      const down = pad.buttons[i]?.pressed
      if (down) p.buttons.add(btn)
      else if (port > 0) p.buttons.delete(btn)
      else if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
        // keep keyboard dpad→stick mapping honest for P1
        setKeyboardStick(btn, down)
      }
    }
    const ax = pad.axes
    if (ax.length > 1) { p.lx = dead(ax[0]); p.ly = dead(ax[1]) }
    if (ax.length > 3) { p.rx = dead(ax[2]); p.ry = dead(ax[3]) }
    if (pad.buttons[6]) p.lt = pad.buttons[6].value
    if (pad.buttons[7]) p.rt = pad.buttons[7].value
    port++
  }
}

function dead(v: number): number {
  return Math.abs(v) < 0.14 ? 0 : v
}

// ---------- phone remotes (pairing slot = port) ----------

const PHONE_CODE_TO_BTN: Record<string, CoreButton> = {
  A: 'a', B: 'b', X: 'x', Y: 'y',
  Up: 'up', Down: 'down', Left: 'left', Right: 'right',
  L1: 'l1', R1: 'r1', L2: 'l2', R2: 'r2',
  L3: 'l3', R3: 'r3', Select: 'select', Start: 'start',
}

/** Called from lib/remote.ts when a tagged phone button message arrives. */
export function setPhoneButton(player: number, code: string, down: boolean): void {
  const slot = Math.min(Math.max(player, 1), 4)
  const active = phonePorts.get(slot) ?? new Set<string>()
  if (down) active.add(code)
  else active.delete(code)
  phonePorts.set(slot, active)

  const p = ports[slot - 1]
  const btn = PHONE_CODE_TO_BTN[code]
  if (btn) {
    if (down) p.buttons.add(btn)
    else p.buttons.delete(btn)
    if (slot === 1 && (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right')) {
      setKeyboardStick(btn, down)
    }
  }
}

/** Phone analog sticks + triggers (gamepad mode) per player. */
export function setPhoneAxes(player: number, axes: number[]): void {
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  p.lx = axes[0] ?? 0; p.ly = axes[1] ?? 0
  p.rx = axes[2] ?? 0; p.ry = axes[3] ?? 0
  p.lt = axes[4] ?? 0; p.rt = axes[5] ?? 0
}

/** Wheel mode: gyro steering → analog left-stick X (racing cores). */
export function setPhoneWheelCore(player: number, gamma: number): void {
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  const s = Math.max(-1, Math.min(1, gamma / 45))
  p.lx = s
  p.rt = Math.abs(s) > 0.05 ? Math.abs(s) * 0.6 + 0.4 : 0 // gas follows steer
}

const pressState = new Map<number, boolean>()

/** Trackpad mode: relative movement accumulates into a normalized pointer. */
export function movePhonePointer(player: number, dx: number, dy: number): void {
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  const next = {
    active: pressState.get(player) ?? false,
    x: Math.min(1, Math.max(0, p.touch.x + dx / 420)),
    y: Math.min(1, Math.max(0, p.touch.y + dy / 420)),
  }
  p.touch = next
}

/** Trackpad tap/click: press state for pointer cores. */
export function setPhonePress(player: number, down: boolean): void {
  pressState.set(player, down)
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  p.touch = { ...p.touch, active: down }
}

/** Trackpad mode: absolute pointer for touch/pointer cores (NDS, light guns). */
export function setPhonePointer(player: number, nx: number, ny: number, down: boolean): void {
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  p.touch = { active: down, x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) }
}

// ---------- reads ----------

/** Button state for a core port (synchronous, used by libretro input_state). */
export function coreInputButton(player: number, btn: CoreButton): boolean {
  return ports[Math.min(Math.max(player, 1), 4) - 1].buttons.has(btn)
}

/** Analog axis for a core port, −1..1 (synchronous). */
export function coreInputAxis(player: number, axis: 'lx' | 'ly' | 'rx' | 'ry'): number {
  const p = ports[Math.min(Math.max(player, 1), 4) - 1]
  return p[axis]
}

/** One poll per frame before core.runFrame(). */
export function corePollInput(): void {
  pollGamepads()
}

/** Push the current port snapshot into a core (built-in adapters use this). */
export function applyPortsToCore(
  core: { setButton(player: number, btn: CoreButton, down: boolean): void; setAnalog(player: number, stick: 'lx' | 'ly' | 'rx' | 'ry', v: number): void; setTouch?(player: number, x: number, y: number, down: boolean): void },
): void {
  for (let i = 0; i < 4; i++) {
    const p = ports[i]
    for (const btn of CORE_BUTTONS) {
      core.setButton(i + 1, btn, p.buttons.has(btn))
    }
    core.setAnalog(i + 1, 'lx', p.lx)
    core.setAnalog(i + 1, 'ly', p.ly)
    core.setAnalog(i + 1, 'rx', p.rx)
    core.setAnalog(i + 1, 'ry', p.ry)
    core.setTouch?.(i + 1, p.touch.x, p.touch.y, p.touch.active)
  }
}

export function activePhonePlayers(): number[] {
  return [...phonePorts.keys()]
}

export function clearAllPorts(): void {
  for (let i = 0; i < 4; i++) ports[i] = blankPort()
  phonePorts.clear()
}
