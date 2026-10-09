// Hold-to-glide: press fires once, holding auto-repeats at a moderate pace.
// Last press wins; releasing an older key doesn't cancel a newer hold.

export interface Repeater {
  press: (id: string, fire: () => void) => void
  release: (id: string) => void
  stopAll: () => void
}

export function createRepeater(initialMs = 420, intervalMs = 190): Repeater {
  let activeId: string | null = null
  let initialTimer: number | null = null
  let loopTimer: number | null = null

  const clearTimers = () => {
    if (initialTimer !== null) {
      clearTimeout(initialTimer)
      initialTimer = null
    }
    if (loopTimer !== null) {
      clearTimeout(loopTimer)
      loopTimer = null
    }
  }

  return {
    press(id, fire) {
      if (activeId === id) return // already gliding on this key
      clearTimers()
      activeId = id
      fire()
      initialTimer = window.setTimeout(() => {
        const step = () => {
          fire()
          loopTimer = window.setTimeout(step, intervalMs)
        }
        step()
      }, initialMs)
    },
    release(id) {
      if (activeId !== id) return
      activeId = null
      clearTimers()
    },
    stopAll() {
      activeId = null
      clearTimers()
    },
  }
}
