// Universal controller layer. One rAF poll of every connected gamepad feeds:
// navigation (synthetic keys — same path the phone remote uses), analog axes
// for emulators, trigger pressure, deadzone-calibrated sticks, rumble with
// intensity, the Guide button (opens the Game Bar), L1+R1+Select combos, and
// gamepad/mouse auto-switching. Supports per-game remap profiles.

import { markActive } from './power'
import { emitLocal } from './ipc'

export interface ButtonMap {
  up: string
  down: string
  left: string
  right: string
  confirm: string
  back: string
  mode: string
  gamebar: string
}

export interface GamepadProfile {
  id: string
  name: string
  map: ButtonMap
  // standard gamepad button indices driving each action
  buttons: Record<keyof ButtonMap, number>
}

export const DEFAULT_PROFILE: GamepadProfile = {
  id: 'default',
  name: 'Standard Xbox',
  map: {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    confirm: 'Enter', back: 'Escape', mode: 'Tab', gamebar: 'Guide',
  },
  buttons: { up: 12, down: 13, left: 14, right: 15, confirm: 0, back: 1, mode: 3, gamebar: 17 },
}

type Listener = (s: InputState) => void

export interface InputState {
  lastSource: 'keyboard' | 'gamepad' | 'phone' | null
  gamepadConnected: boolean
  gamepadName: string
  axes: [number, number, number, number] // LX LY RX RY after deadzone
  triggers: [number, number] // LT RT
  buttons: boolean[] // raw pressed states
  guide: boolean
  lastRumble: number
}

const state: InputState = {
  lastSource: null,
  gamepadConnected: false,
  gamepadName: '',
  axes: [0, 0, 0, 0],
  triggers: [0, 0],
  buttons: [],
  guide: false,
  lastRumble: 0,
}

let profile: GamepadProfile = loadProfile()
let deadzoneL = 0.12
let deadzoneR = 0.12
let rumbleIntensity = 0.6
let autoSwitch = true
let running = false
let guidePrev = false
let comboPrev = false
let prevButtons: boolean[] = []
let repeatT: Record<string, number> = {}
let phoneAxes: [number, number, number, number] = [0, 0, 0, 0]

const listeners = new Set<Listener>()

function loadProfile(): GamepadProfile {
  try {
    const raw = localStorage.getItem('meshplay.profile.gamepad')
    if (raw) {
      const p = JSON.parse(raw) as GamepadProfile
      return { ...DEFAULT_PROFILE, ...p }
    }
  } catch {
    /* fallthrough */
  }
  return { ...DEFAULT_PROFILE }
}

export function getProfile(): GamepadProfile {
  return { ...profile }
}

export function saveProfile(p: GamepadProfile): void {
  profile = p
  try {
    localStorage.setItem('meshplay.profile.gamepad', JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function setDeadzones(l: number, r: number): void {
  deadzoneL = Math.min(0.4, Math.max(0, l / 100))
  deadzoneR = Math.min(0.4, Math.max(0, r / 100))
}

export function setRumbleIntensity(v: number): void {
  rumbleIntensity = Math.min(1, Math.max(0, v / 100))
}

export function setAutoSwitch(v: boolean): void {
  autoSwitch = v
}

export function getState(): InputState {
  return state
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function applyDeadzone(v: number, dz: number): number {
  const mag = Math.abs(v)
  if (mag < dz) return 0
  // rescale so the deadzone edge maps to 0 — no snap
  return Math.sign(v) * ((mag - dz) / (1 - dz))
}

/** Phone remote analog axes (from lib/remote) merge into the same state. */
export function setPhoneAxes(axes: [number, number, number, number]): void {
  phoneAxes = axes
  state.lastSource = 'phone'
  markActive()
}

function fireKey(code: string, down: boolean): void {
  window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }),
  )
}

function pushState(): void {
  for (const fn of listeners) fn(state)
}

const held = (idx: number, code: string, now: number, active: boolean): boolean => {
  const prev = prevButtons[idx] ?? false
  const key = `b${idx}`
  if (active && !prev) {
    fireKey(code, true)
    repeatT[key] = now + 420
  } else if (active && prev && now > (repeatT[key] ?? 0)) {
    fireKey(code, true)
    repeatT[key] = now + 190
  }
  return active
}

/** The main poll loop — install once in App. */
export function startInputLayer(): () => void {
  if (running) return () => undefined
  running = true

  const step = (now: number) => {
    if (!running) return
    requestAnimationFrame(step)
    const pads = navigator.getGamepads?.() ?? []
    let gp: Gamepad | null = null
    for (const p of pads) {
      if (p && p.connected) {
        gp = p
        break
      }
    }
    if (!gp) {
      if (state.gamepadConnected) {
        state.gamepadConnected = false
        state.axes = [0, 0, 0, 0]
        state.triggers = [0, 0]
        pushState()
      }
      // phone axes still drive the state
      if (phoneAxes.some((v) => Math.abs(v) > 0.08)) {
        state.axes = phoneAxes
        pushState()
      }
      return
    }

    state.gamepadConnected = true
    state.gamepadName = gp.id
    if (autoSwitch) state.lastSource = 'gamepad'

    const buttons = gp.buttons.map((b) => b.pressed)
    // axes with deadzone calibration (configurable in Settings → Controller)
    const lx = applyDeadzone(gp.axes[0] ?? 0, deadzoneL)
    const ly = applyDeadzone(gp.axes[1] ?? 0, deadzoneL)
    const rx = applyDeadzone(gp.axes[2] ?? 0, deadzoneR)
    const ry = applyDeadzone(gp.axes[3] ?? 0, deadzoneR)
    state.axes = [lx, ly, rx, ry]
    const lt = gp.buttons[6]?.value ?? 0
    const rt = gp.buttons[7]?.value ?? 0
    state.triggers = [lt, rt]
    state.buttons = buttons

    // --- navigation mapping (synthetic keys, repeatable) ---
    const dzNav = 0.55
    held(0, profile.map.confirm, now, buttons[profile.buttons.confirm] ?? false)
    held(1, profile.map.back, now, buttons[profile.buttons.back] ?? false)
    held(14, profile.map.left, now, buttons[profile.buttons.left] || (gp.axes[0] ?? 0) < -dzNav)
    held(15, profile.map.right, now, buttons[profile.buttons.right] || (gp.axes[0] ?? 0) > dzNav)
    held(12, profile.map.up, now, buttons[profile.buttons.up] || (gp.axes[1] ?? 0) < -dzNav)
    held(13, profile.map.down, now, buttons[profile.buttons.down] || (gp.axes[1] ?? 0) > dzNav)
    // shoulders: LB/RB
    held(4, 'ArrowLeft', now, buttons[4] ?? false)
    held(5, 'ArrowRight', now, buttons[5] ?? false)
    // Y toggles view mode
    held(3, profile.map.mode, now, buttons[3] ?? false)

    // --- Guide button (Xbox/PS home) → opens the Game Bar ---
    const guide = buttons[16] || buttons[17] || false
    if (guide && !guidePrev) {
      state.guide = true
      emitLocal('gamebar-toggle', { source: 'guide' })
      markActive()
    } else if (!guide && guidePrev) {
      state.guide = false
    }
    guidePrev = guide

    // --- combo: L1+R1+Select → Game Bar ---
    const combo = (buttons[4] && buttons[5] && (buttons[8] ?? false)) || false
    if (combo && !comboPrev) {
      emitLocal('gamebar-toggle', { source: 'combo' })
    }
    comboPrev = combo

    prevButtons = buttons
    markActive()
    pushState()
  }
  requestAnimationFrame(step)

  const onConnect = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad
    state.gamepadConnected = true
    state.gamepadName = gp.id
    emitLocal('gamepad-connected', { id: gp.id, index: gp.index })
    pushState()
  }
  const onDisconnect = (e: Event) => {
    const gp = (e as GamepadEvent).gamepad
    emitLocal('gamepad-disconnected', { id: gp.id, index: gp.index })
    state.gamepadConnected = false
    pushState()
  }
  window.addEventListener('gamepadconnected', onConnect)
  window.addEventListener('gamepaddisconnected', onDisconnect)

  return () => {
    running = false
    window.removeEventListener('gamepadconnected', onConnect)
    window.removeEventListener('gamepaddisconnected', onDisconnect)
  }
}

// ---------- rumble ----------

/** Physical controller rumble with the calibrated intensity. */
export function rumble(ms = 400, strong = true): void {
  const pads = navigator.getGamepads?.() ?? []
  for (const gp of pads) {
    if (!gp || !gp.connected) continue
    const act = (gp as Gamepad & { vibrationActuator?: { playEffect: (t: string, o: Record<string, number>) => Promise<unknown> } }).vibrationActuator
    if (act?.playEffect) {
      act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: ms,
        weakMagnitude: strong ? 0.4 * rumbleIntensity : 0.8 * rumbleIntensity,
        strongMagnitude: strong ? 0.9 * rumbleIntensity : 0.3 * rumbleIntensity,
      }).catch(() => {
        /* unsupported */
      })
    }
  }
  state.lastRumble = Date.now()
}

/** Expose current analog axes for the emulator cores (CHIP-8 mapping, GB). */
export function axesForEmulator(): { lx: number; ly: number; rx: number; ry: number; lt: number; rt: number } {
  const merged: [number, number, number, number] = state.gamepadConnected
    ? state.axes
    : phoneAxes.some((v) => Math.abs(v) > 0.08)
      ? phoneAxes
      : [0, 0, 0, 0]
  return { lx: merged[0], ly: merged[1], rx: merged[2], ry: merged[3], lt: state.triggers[0], rt: state.triggers[1] }
}

/** Remap-capture helper: returns a promise resolving with the next pressed button index. */
export function captureButton(timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? []
      for (const gp of pads) {
        if (!gp) continue
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            resolve(i)
            return
          }
        }
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null)
        return
      }
      requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
}
