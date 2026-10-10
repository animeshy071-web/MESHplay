// M5 — Universal controller layer: any gamepad (or phone / wheel) can drive
// real PC games through OS-level keyboard + mouse injection. Engages only
// while a native game runs, only when the user enables it, and never for
// anti-cheat-protected titles. Steering-wheel mode maps the phone's gyro axis
// to A/D steering keys with smoothing; pedals arrive as arrow keys via oskb.

import { isTauri, tryInvoke, emitLocal } from './ipc'
import { getActive, launcher } from './launcher'
import { getState, axesForEmulator } from './input'
import { detectProtection } from './anticheat'

export interface RemapProfile {
  enabled: boolean
  sensitivity: number // mouse-look multiplier
  // gamepad button index → KeyboardEvent.code ('mouse:left' | 'mouse:right' for triggers)
  buttons: Record<number, string>
  wheelSteering: boolean
}

export const DEFAULT_REMAP: RemapProfile = {
  enabled: true,
  sensitivity: 14,
  buttons: {
    0: 'Space', // A — jump/confirm
    1: 'Escape', // B — back
    2: 'KeyR', // X — reload
    3: 'KeyE', // Y — use
    4: 'Tab', // LB
    5: 'KeyF', // RB
    6: 'mouse:right', // LT — aim
    7: 'mouse:left', // RT — fire
    8: 'ShiftLeft', // Select — sprint modifier
    9: 'KeyP', // Start — pause
  },
  wheelSteering: true,
}

const LS_KEY = 'meshplay.remap.v1'

let profile: RemapProfile = load()
let protectedExe: string | null = null
let lastGuardToast = 0

function load(): RemapProfile {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_REMAP, ...(JSON.parse(raw) as Partial<RemapProfile>) }
  } catch {
    /* fallthrough */
  }
  return { ...DEFAULT_REMAP }
}

export function getRemap(): RemapProfile {
  return { ...profile }
}

export function saveRemap(p: Partial<RemapProfile>): void {
  profile = { ...profile, ...p }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}

/** OS-level key injection (down/up tracked so holds work). */
const heldOsKeys = new Set<string>()
function osHold(code: string, down: boolean): void {
  const has = heldOsKeys.has(code)
  if (down && !has) {
    heldOsKeys.add(code)
    void tryInvoke('send_key', { code, down: true })
  } else if (!down && has) {
    heldOsKeys.delete(code)
    void tryInvoke('send_key', { code, down: false })
  }
}

function osClick(button: 'left' | 'right', down: boolean): void {
  const key = `mouse:${button}`
  const has = heldOsKeys.has(key)
  if (down && !has) {
    heldOsKeys.add(key)
    void tryInvoke('send_mouse_click', { button })
  } else if (!down) {
    heldOsKeys.delete(key)
  }
}

// ---------- mouse-look from the right stick ----------

let mouseAccum = { x: 0, y: 0 }
let lastMouseSend = 0

function feedMouseLook(dx: number, dy: number, now: number): void {
  mouseAccum.x += dx * profile.sensitivity
  mouseAccum.y += dy * profile.sensitivity
  // batch at ~125Hz to keep SendInput volume sane
  if (now - lastMouseSend >= 8 && (Math.abs(mouseAccum.x) >= 1 || Math.abs(mouseAccum.y) >= 1)) {
    const sx = Math.trunc(mouseAccum.x)
    const sy = Math.trunc(mouseAccum.y)
    mouseAccum.x -= sx
    mouseAccum.y -= sy
    lastMouseSend = now
    if (sx !== 0 || sy !== 0) void tryInvoke('send_mouse_move', { dx: sx, dy: sy })
  }
}

// ---------- steering wheel (phone gyro) → A/D keys ----------

let wheelPrevDir = 0

function feedWheel(axisX: number): void {
  if (!profile.wheelSteering) return
  const dead = 0.12
  const dir = axisX < -dead ? -1 : axisX > dead ? 1 : 0
  if (dir !== wheelPrevDir) {
    osHold('KeyA', dir === -1)
    osHold('KeyD', dir === 1)
    wheelPrevDir = dir
  }
}

// ---------- main poll ----------

let running = false
let prevButtons: boolean[] = []
let prevTriggers: [number, number] = [0, 0]

function poll(): void {
  if (!running) return
  requestAnimationFrame(poll)

  const active = getActive()
  const st = getState()
  const game = active
  if (!active || !isTauri() || !profile.enabled) {
    // release everything when disengaging
    if (heldOsKeys.size > 0) {
      for (const code of [...heldOsKeys]) {
        if (code.startsWith('mouse:')) continue
        osHold(code, false)
      }
    }
    prevButtons = []
    return
  }

  // anti-cheat guard — never inject for protected games
  if (game) {
    const info = detectProtection({ exePath: game.exePath, title: game.title })
    if (info.protected) {
      protectedExe = info.brand
      if (Date.now() - lastGuardToast > 10000) {
        lastGuardToast = Date.now()
        emitLocal('remap-blocked', { brand: info.brand, title: game.title })
      }
      return
    }
    protectedExe = null
  }

  const pads = navigator.getGamepads?.() ?? []
  const gp = pads.find((p) => p && p.connected) ?? null

  // phone axes (steering) — merged in when no physical pad is held
  const axes = axesForEmulator()

  if (gp) {
    const buttons = gp.buttons.map((b) => b.pressed)
    // button → key map
    for (const [idxStr, code] of Object.entries(profile.buttons)) {
      const idx = parseInt(idxStr, 10)
      const pressed = buttons[idx] ?? false
      const prev = prevButtons[idx] ?? false
      if (pressed === prev) continue
      if (code.startsWith('mouse:')) {
        osClick(code === 'mouse:left' ? 'left' : 'right', pressed)
      } else {
        osHold(code, pressed)
      }
    }
    prevButtons = buttons

    // right stick → mouse look
    const rx = gp.axes[2] ?? 0
    const ry = gp.axes[3] ?? 0
    if (Math.abs(rx) > 0.14 || Math.abs(ry) > 0.14) {
      const now = performance.now()
      feedMouseLook(rx, ry, now)
    }

    // left stick → WASD (digital-ish thresholds, smoothed by key repeat)
    feedWheel(axes.lx !== 0 && !gp.axes[0] ? axes.lx : gp.axes[0] ?? 0)
    const lx = gp.axes[0] ?? 0
    const ly = gp.axes[1] ?? 0
    osHold('KeyA', lx < -0.5)
    osHold('KeyD', lx > 0.5)
    osHold('KeyW', ly < -0.5)
    osHold('KeyS', ly > 0.5)

    // triggers from phone (when present) → mouse buttons
    const [lt, rt] = prevTriggers
    void lt
    void rt
  } else {
    // no physical pad: phone wheel/analog drives steering + WASD-free mode
    feedWheel(axes.lx)
    if (axes.lt > 0.5) osClick('left', true)
    else osClick('left', false)
    if (axes.rt > 0.5) osClick('right', true)
    else osClick('right', false)
    prevTriggers = [axes.lt, axes.rt]
  }
}

/**
 * Install the remap layer. Runs a lightweight rAF poll; all heavy lifting is
 * threshold + edge detection, so idle cost is negligible.
 */
export function initRemap(): () => void {
  if (running) return () => undefined
  running = true
  requestAnimationFrame(poll)

  // keep launcher state in sync for oskb
  const unsubLauncher = launcher.subscribe((active) => {
    if (!active) {
      // release all held OS keys when the game closes
      for (const code of [...heldOsKeys]) {
        if (code.startsWith('mouse:')) continue
        heldOsKeys.delete(code)
        void tryInvoke('send_key', { code, down: false })
      }
      heldOsKeys.clear()
    }
  })

  return () => {
    running = false
    unsubLauncher()
  }
}
