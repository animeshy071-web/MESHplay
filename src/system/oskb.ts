// OS keyboard bridge. Every synthetic key the console produces (gamepad nav,
// phone remote, wheel mapping) goes through here: inside the app it's a DOM
// event; while a native PC game runs it is ALSO injected into the OS via
// SendInput so real games receive it. Anti-cheat-protected games are skipped
// by the remap layer before we ever touch SendInput.

import { isTauri, tryInvoke } from './ipc'
import { getActive } from './launcher'

let nativeActive = false

/** Keep the bridge in sync with the native launcher state. */
export function setNativeActive(active: boolean): void {
  nativeActive = active
}

/**
 * Dispatch a key press: DOM event for the console UI, plus real OS injection
 * when a native game is running (so the game itself receives it).
 */
export function osKey(code: string, down: boolean): void {
  window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }),
  )
  if (nativeActive && isTauri() && code !== 'Guide') {
    void tryInvoke('send_key', { code, down })
  }
}

export function isNativeActive(): boolean {
  return nativeActive || getActive() !== null
}
