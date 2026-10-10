// Continuous rewind — an emulator-agnostic ring buffer of state snapshots.
// Captures every ~250ms while playing, up to 60 seconds (240 slots). The Game
// Bar rewind slider scrubs backwards seamlessly; instant resume rides it too.

export interface RewindSlot {
  t: number // ms timestamp of capture
  data: string // serialized state
}

export interface Rewind {
  tick: () => void
  seek: (secondsBack: number) => boolean
  depth: () => number // seconds available
  span: () => number // oldest captured second
  clear: () => void
  latest: () => RewindSlot | null
}

export function createRewind(
  snapshot: () => string,
  restore: (data: string) => boolean,
  opts?: { intervalMs?: number; capacity?: number },
): Rewind {
  const intervalMs = opts?.intervalMs ?? 250
  const capacity = opts?.capacity ?? 240 // 60s at 250ms
  let buf: RewindSlot[] = []
  let lastTick = 0

  return {
    tick: () => {
      const now = performance.now()
      if (now - lastTick < intervalMs) return
      lastTick = now
      buf.push({ t: now, data: snapshot() })
      if (buf.length > capacity) buf.shift()
    },
    seek: (secondsBack: number) => {
      if (buf.length === 0) return false
      const target = performance.now() - secondsBack * 1000
      // nearest snapshot at-or-before the target
      let best: RewindSlot | null = null
      for (const s of buf) {
        if (s.t <= target) best = s
        else break
      }
      if (!best) best = buf[0]
      return restore(best.data)
    },
    depth: () => (buf.length < 2 ? 0 : (buf[buf.length - 1].t - buf[0].t) / 1000),
    span: () => (buf.length === 0 ? 0 : (performance.now() - buf[0].t) / 1000),
    clear: () => {
      buf = []
    },
    latest: () => (buf.length ? buf[buf.length - 1] : null),
  }
}
