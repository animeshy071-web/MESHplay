// All MESHplay UI sounds are synthesized live — no audio files.
// AudioContext starts on the first user gesture (browser autoplay policy).

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let volume = 0.5

export function initAudio(): void {
  if (ctx) return
  try {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = enabled ? volume : 0
    master.connect(ctx.destination)
  } catch {
    ctx = null
  }
}

export function setSoundEnabled(v: boolean): void {
  enabled = v
  if (master) master.gain.value = v ? volume : 0
}

export function setVolume(v01: number): void {
  volume = Math.min(1, Math.max(0, v01))
  if (master) master.gain.value = enabled ? volume : 0
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
  if (!ctx || !master || !enabled) return
  if (ctx.state === 'suspended') void ctx.resume()
  const t0 = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(master)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

export const sfx = {
  travel: () => tone(540, 0.07, 'sine', 0.15, 0, 470),
  select: () => {
    tone(620, 0.09, 'sine', 0.18)
    tone(930, 0.13, 'sine', 0.18, 0.07)
  },
  back: () => tone(470, 0.11, 'sine', 0.14, 0, 320),
  error: () => tone(150, 0.16, 'square', 0.1),
  boot: () => {
    tone(330, 0.5, 'sine', 0.1)
    tone(495, 0.6, 'sine', 0.09, 0.18)
    tone(660, 0.9, 'sine', 0.09, 0.36)
  },
  launch: () => {
    tone(220, 0.65, 'sawtooth', 0.05, 0, 880)
    tone(110, 0.75, 'sine', 0.11)
  },
  pause: () => tone(500, 0.12, 'triangle', 0.14, 0, 380),
  theme: () => {
    tone(523, 0.1, 'sine', 0.14)
    tone(659, 0.1, 'sine', 0.14, 0.08)
    tone(784, 0.18, 'sine', 0.14, 0.16)
  },
}
