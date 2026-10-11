// Multi-channel audio mixer — all synthesized, zero audio files.
// Channels: master → ui / game / music / voice, each with its own gain node so
// the Game Bar sliders and Settings suite control them independently.
// Also: mute-on-window-blur, spatial (stereo panner) toggle, output device pick.

type Channel = 'ui' | 'game' | 'music' | 'voice'

interface ChannelState {
  gain: GainNode | null
  panner: StereoPannerNode | null
  volume: number // 0..1
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
const channels: Record<Channel, ChannelState> = {
  ui: { gain: null, panner: null, volume: 0.6 },
  game: { gain: null, panner: null, volume: 0.8 },
  music: { gain: null, panner: null, volume: 0.5 },
  voice: { gain: null, panner: null, volume: 0.7 },
}
let enabled = true
let mutedByBlur = false
let spatial = false

/** Create the mixer graph (idempotent, call on first user gesture). */
export function initMixer(): void {
  if (ctx) return
  try {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = enabled ? 1 : 0
    master.connect(ctx.destination)
    for (const key of Object.keys(channels) as Channel[]) {
      const ch = channels[key]
      ch.gain = ctx.createGain()
      ch.gain.gain.value = ch.volume
      ch.panner = ctx.createStereoPanner()
      ch.gain.connect(ch.panner)
      ch.panner.connect(master)
    }
  } catch {
    ctx = null
  }
}

export function ctxOrNull(): AudioContext | null {
  return ctx
}

export function setEnabled(v: boolean): void {
  enabled = v
  applyMaster()
}

export function setChannelVolume(ch: Channel, v01: number): void {
  channels[ch].volume = Math.min(1, Math.max(0, v01))
  if (channels[ch].gain) channels[ch].gain!.gain.value = channels[ch].volume
}

export function getChannelVolume(ch: Channel): number {
  return channels[ch].volume
}

export function setSpatial(v: boolean): void {
  spatial = v
  // Real widening: game + music channels get opposite stereo spread, with a
  // touch more on music (console "surround" feel). UI + voice stay centered
  // for clarity.
  if (!ctx) return
  for (const key of Object.keys(channels) as Channel[]) {
    const ch = channels[key]
    if (!ch.panner) continue
    const target = !spatial
      ? 0
      : key === 'game'
        ? 0.16
        : key === 'music'
          ? -0.24
          : 0
    ch.panner.pan.setTargetAtTime(target, ctx.currentTime, 0.12)
  }
}

export function setOutputDevice(deviceId: string): void {
  if (!ctx) return
  // setSinkId is available on AudioContext in Chromium/WebView2
  type SetSink = (id: string) => Promise<void>
  const c = ctx as unknown as { setSinkId?: SetSink }
  if (typeof c.setSinkId === 'function') {
    c.setSinkId(deviceId === 'default' ? '' : deviceId).catch(() => {
      /* device unavailable — keep current output */
    })
  }
}

export async function listOutputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audiooutput')
  } catch {
    return []
  }
}

let blurMuteEnabled = false

export function setMuteOnBlur(v: boolean): void {
  blurMuteEnabled = v
  if (!v && mutedByBlur) {
    mutedByBlur = false
    applyMaster()
  }
}

export function onWindowBlur(blurred: boolean): void {
  if (!blurMuteEnabled) {
    mutedByBlur = false
    applyMaster()
    return
  }
  if (!mutedByBlur && blurred) {
    mutedByBlur = true
    applyMaster()
  } else if (mutedByBlur && !blurred) {
    mutedByBlur = false
    applyMaster()
  }
}

function applyMaster(): void {
  if (!master) return
  master.gain.value = enabled && !mutedByBlur ? 1 : 0
}

// ---------- tone synthesis routed through the ui channel ----------

// N5: premium chain — a synthesized convolution reverb every tone can send to
let reverbNode: ConvolverNode | null = null
function reverbSend(): ConvolverNode | null {
  if (!ctx) return null
  if (reverbNode) return reverbNode
  try {
    const len = Math.floor(ctx.sampleRate * 1.4)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5
      }
    }
    reverbNode = ctx.createConvolver()
    reverbNode.buffer = ir
    const wet = ctx.createGain()
    wet.gain.value = 0.15
    reverbNode.connect(wet)
    if (channels.ui.gain) wet.connect(channels.ui.gain)
    return reverbNode
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
  if (!ctx || !enabled || mutedByBlur) return
  if (ctx.state === 'suspended') void ctx.resume()
  const ch = channels.ui
  if (!ch.gain) return
  const t0 = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  // N5: layered partial — a faint detuned octave adds warmth without volume
  let partial: OscillatorNode | null = null
  if (type === 'sine' && dur >= 0.05) {
    partial = ctx.createOscillator()
    partial.type = 'sine'
    partial.frequency.setValueAtTime(freq * 2.004, t0)
    if (slideTo) partial.frequency.exponentialRampToValueAtTime(slideTo * 2.004, t0 + dur)
  }
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(ch.gain)
  if (partial) {
    const pg = ctx.createGain()
    pg.gain.value = 0.22
    partial.connect(pg)
    pg.connect(g)
    partial.start(t0)
    partial.stop(t0 + dur + 0.05)
  }
  const rv = reverbSend()
  if (rv) g.connect(rv)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

export const sfx = {
  travel: () => {
    // console tick: short, hushed, frame-synced feel
    tone(660, 0.05, 'sine', 0.1, 0, 520)
    tone(1568, 0.022, 'sine', 0.045)
  },
  select: () => {
    tone(587, 0.08, 'sine', 0.14)
    tone(880, 0.13, 'sine', 0.14, 0.06)
  },
  back: () => tone(440, 0.11, 'sine', 0.12, 0, 330),
  error: () => tone(150, 0.16, 'square', 0.08),
  boot: () => {
    // ignition: rising warm chord with air
    tone(262, 0.7, 'sine', 0.09)
    tone(392, 0.8, 'sine', 0.08, 0.16)
    tone(523, 1.1, 'sine', 0.08, 0.32)
    tone(1046, 0.9, 'sine', 0.04, 0.5)
  },
  launch: () => {
    tone(160, 0.7, 'sawtooth', 0.04, 0, 760)
    tone(80, 0.85, 'sine', 0.1)
    tone(1280, 0.3, 'sine', 0.045, 0.38)
  },
  pause: () => tone(500, 0.12, 'triangle', 0.13, 0, 380),
  theme: () => {
    tone(523, 0.1, 'sine', 0.13)
    tone(659, 0.1, 'sine', 0.13, 0.08)
    tone(784, 0.18, 'sine', 0.13, 0.16)
  },
  achievement: () => {
    // sting: bright rising triad with shimmer
    tone(523, 0.12, 'triangle', 0.13)
    tone(659, 0.12, 'triangle', 0.13, 0.09)
    tone(784, 0.14, 'triangle', 0.14, 0.18)
    tone(1047, 0.35, 'sine', 0.11, 0.27)
    tone(1319, 0.4, 'sine', 0.06, 0.32)
  },
  sonar: () => {
    // find-my-controller ping: descending ping with echo
    tone(1200, 0.18, 'sine', 0.15, 0, 600)
    tone(1200, 0.22, 'sine', 0.07, 0.25, 600)
    tone(1200, 0.26, 'sine', 0.035, 0.5, 600)
  },
  chime: () => {
    // notification chime
    tone(880, 0.1, 'sine', 0.11)
    tone(1174, 0.22, 'sine', 0.11, 0.1)
  },
  whoosh: () => {
    tone(180, 0.5, 'sawtooth', 0.035, 0, 720)
    tone(90, 0.6, 'triangle', 0.07)
  },
  thud: () => {
    tone(120, 0.2, 'sine', 0.13, 0, 55)
  },
}

/** initAudio alias for the legacy import path. */
export const initAudio = initMixer
