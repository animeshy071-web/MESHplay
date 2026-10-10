// Game Boy APU — the four channels synthesized live through WebAudio
// (zero audio files): 2 pulse with envelope + sweep, 4-bit wave, LFSR noise.
// The core pushes samples into a ring buffer; a ScriptProcessor drains it.

import { getChannelVolume, ctxOrNull } from '../system/mixer'

const SAMPLE_RATE = 44100
const RING_SIZE = 8192

export class Apu {
  private ringL = new Float32Array(RING_SIZE)
  private ringR = new Float32Array(RING_SIZE)
  private readPos = 0
  private writePos = 0

  // registers (NR10-NR52)
  nr10 = 0x80
  nr11 = 0xbf
  nr12 = 0xf3
  nr13 = 0
  nr14 = 0xbf
  nr21 = 0x3f
  nr22 = 0x00
  nr23 = 0
  nr24 = 0xbf
  nr30 = 0x7f
  nr31 = 0xff
  nr32 = 0x9f
  nr33 = 0
  nr34 = 0xbf
  waveRam = new Uint8Array(16)
  nr41 = 0xff
  nr42 = 0x00
  nr43 = 0
  nr44 = 0xbf
  nr50 = 0x77
  nr51 = 0xf3
  nr52 = 0xf1

  // channel state
  private ch1FreqTimer = 0
  private ch2FreqTimer = 0
  private ch3FreqTimer = 0
  private ch4FreqTimer = 0
  private ch1DutyPos = 0
  private ch2DutyPos = 0
  private ch3Pos = 0
  private ch4Lfsr = 0x7fff
  private ch1EnvTimer = 0
  private ch2EnvTimer = 0
  private ch4EnvTimer = 0
  private ch1EnvVol = 0
  private ch2EnvVol = 0
  private ch4EnvVol = 0
  private ch1SweepTimer = 0
  private ch1SweepFreq = 0
  private ch1Enable = false
  private ch2Enable = false
  private ch3Enable = false
  private ch4Enable = false
  private frameSequencer = 0
  private frameTimer = 0
  private cycleAcc = 0
  private node: ScriptProcessorNode | null = null

  private static readonly DUTY: Record<number, number[]> = {
    0: [0, 0, 0, 0, 0, 0, 0, 1],
    1: [1, 0, 0, 0, 0, 0, 0, 1],
    2: [1, 0, 0, 0, 0, 1, 1, 1],
    3: [0, 1, 1, 1, 1, 1, 1, 0],
  }

  read(addr: number): number {
    switch (addr) {
      case 0xff10: return this.nr10 | 0x80
      case 0xff11: return this.nr11 | 0x3f
      case 0xff12: return this.nr12
      case 0xff13: return 0xff
      case 0xff14: return this.nr14 | 0xbf
      case 0xff16: return this.nr21 | 0x3f
      case 0xff17: return this.nr22
      case 0xff19: return this.nr24 | 0xbf
      case 0xff1a: return this.nr30 | 0x7f
      case 0xff1e: return this.nr34 | 0xbf
      case 0xff20: return this.nr41 | 0xc0
      case 0xff21: return this.nr42
      case 0xff23: return this.nr44 | 0xbf
      case 0xff24: return this.nr50
      case 0xff25: return this.nr51
      case 0xff26: return this.nr52
      default:
        if (addr >= 0xff30 && addr < 0xff40) return this.waveRam[addr - 0xff30]
        return 0xff
    }
  }

  write(addr: number, v: number): void {
    if (addr >= 0xff30 && addr < 0xff40) {
      this.waveRam[addr - 0xff30] = v
      return
    }
    switch (addr) {
      case 0xff10: this.nr10 = v; break
      case 0xff11:
        this.nr11 = v
        if ((v & 0xc0) >> 6 === 0) this.ch1Enable = false
        break
      case 0xff12:
        this.nr12 = v
        if ((v & 0xf8) === 0) this.ch1Enable = false
        break
      case 0xff13: this.nr13 = v; break
      case 0xff14:
        this.nr14 = v
        if (v & 0x80) this.triggerCh1()
        break
      case 0xff16:
        this.nr21 = v
        if ((v & 0xc0) >> 6 === 0) this.ch2Enable = false
        break
      case 0xff17:
        this.nr22 = v
        if ((v & 0xf8) === 0) this.ch2Enable = false
        break
      case 0xff19:
        this.nr24 = v
        if (v & 0x80) this.triggerCh2()
        break
      case 0xff1a:
        this.nr30 = v
        this.ch3Enable = (v & 0x80) !== 0
        break
      case 0xff1e:
        this.nr34 = v
        if (v & 0x80) this.triggerCh3()
        break
      case 0xff21:
        this.nr42 = v
        if ((v & 0xf8) === 0) this.ch4Enable = false
        break
      case 0xff22: this.nr43 = v; break
      case 0xff23:
        this.nr44 = v
        if (v & 0x80) this.triggerCh4()
        break
      case 0xff24: this.nr50 = v; break
      case 0xff25: this.nr51 = v; break
      case 0xff26:
        this.nr52 = v
        if (!(v & 0x80)) {
          // power off: clear registers
          this.ch1Enable = this.ch2Enable = this.ch3Enable = this.ch4Enable = false
        }
        break
      default: break
    }
  }

  private freq1(): number {
    return 131072 / (2048 - (((this.nr14 & 7) << 8) | this.nr13))
  }
  private freq2(): number {
    return 131072 / (2048 - (((this.nr24 & 7) << 8) | this.nr23))
  }
  private freq3(): number {
    return 65536 / (2048 - (((this.nr34 & 7) << 8) | this.nr33))
  }

  private triggerCh1(): void {
    this.ch1Enable = this.nr12 !== 0
    this.ch1EnvVol = (this.nr12 >> 4) & 0x0f
    this.ch1EnvTimer = this.nr12 & 7
    this.ch1DutyPos = 0
    this.ch1FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq1()))
    this.ch1SweepTimer = (this.nr10 >> 4) & 7
    this.ch1SweepFreq = (((this.nr14 & 7) << 8) | this.nr13) & 0x7ff
  }
  private triggerCh2(): void {
    this.ch2Enable = this.nr22 !== 0
    this.ch2EnvVol = (this.nr22 >> 4) & 0x0f
    this.ch2EnvTimer = this.nr22 & 7
    this.ch2DutyPos = 0
    this.ch2FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq2()))
  }
  private triggerCh3(): void {
    this.ch3Enable = (this.nr30 & 0x80) !== 0
    this.ch3Pos = 0
    this.ch3FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq3()))
  }
  private triggerCh4(): void {
    this.ch4Enable = this.nr42 !== 0
    this.ch4EnvVol = (this.nr42 >> 4) & 0x0f
    this.ch4EnvTimer = this.nr42 & 7
    this.ch4Lfsr = 0x7fff
    const div = (this.nr43 & 0x07) as number
    const shift = (this.nr43 >> 4) as number
    this.ch4FreqTimer = Math.max(1, Math.round((SAMPLE_RATE * div) / 524288 / (1 << shift)))
  }

  private frameSeq(): void {
    this.frameSequencer = (this.frameSequencer + 1) & 7
    const step = this.frameSequencer
    // length clocks (256 Hz) + envelope (64 Hz) + sweep (128 Hz)
    if (step % 2 === 0) {
      if (this.nr14 & 0x40 && this.ch1Enable) {
        const len = 64 - (this.nr11 & 0x3f)
        if (len <= 0) this.ch1Enable = false
      }
      if (this.nr24 & 0x40 && this.ch2Enable) {
        const len = 64 - (this.nr21 & 0x3f)
        if (len <= 0) this.ch2Enable = false
      }
    }
    if (step % 2 === 1) {
      this.sweepCh1()
    }
    if (step === 7) {
      this.envelopeStep()
    }
  }

  private sweepCh1(): void {
    if (this.ch1SweepTimer > 0) this.ch1SweepTimer--
    if (this.ch1SweepTimer === 0) {
      this.ch1SweepTimer = (this.nr10 >> 4) & 7
      const period = this.nr10 & 7
      if (period > 0 && this.ch1SweepTimer > 0) {
        const delta = this.ch1SweepFreq >> period
        const next = this.nr10 & 0x08 ? this.ch1SweepFreq - delta : this.ch1SweepFreq + delta
        if (next > 2047) {
          this.ch1Enable = false
        } else if (next >= 0) {
          this.ch1SweepFreq = next
          this.nr13 = next & 0xff
          this.nr14 = (this.nr14 & 0xf8) | ((next >> 8) & 7)
        }
      }
    }
  }

  private envelopeStep(): void {
    for (const [which, nr] of [[1, this.nr12], [2, this.nr22], [4, this.nr42]] as Array<[number, number]>) {
      const addMode = (nr & 0x08) !== 0
      const period = nr & 7
      const volRef = which === 1 ? 'ch1EnvVol' : which === 2 ? 'ch2EnvVol' : 'ch4EnvVol'
      const timerRef = which === 1 ? 'ch1EnvTimer' : which === 2 ? 'ch2EnvTimer' : 'ch4EnvTimer'
      const cur = this[volRef as 'ch1EnvVol'] as number
      const t = this[timerRef as 'ch1EnvTimer'] as number
      if (period > 0) {
        if (t <= 1) {
          const next = addMode ? Math.min(15, cur + 1) : Math.max(0, cur - 1)
          this[volRef as 'ch1EnvVol'] = next
          this[timerRef as 'ch1EnvTimer'] = period
        } else {
          this[timerRef as 'ch1EnvTimer'] = t - 1
        }
      }
    }
  }

  /** Advance the APU by `cycles` T-cycles, pushing samples into the ring. */
  tick(cycles: number): void {
    if (!(this.nr52 & 0x80)) return
    this.cycleAcc += cycles
    // frame sequencer at 512 Hz (every 8192 T-cycles)
    this.frameTimer += cycles
    while (this.frameTimer >= 8192) {
      this.frameTimer -= 8192
      this.frameSeq()
    }
    while (this.cycleAcc >= 4) {
      this.cycleAcc -= 4
      this.pushSample()
    }
  }

  private pushSample(): void {
    // channel 1 + 2: pulse via duty LUT
    let ch1 = 0
    if (this.ch1Enable && this.ch1EnvVol > 0) {
      if (--this.ch1FreqTimer <= 0) {
        this.ch1FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq1()))
        this.ch1DutyPos = (this.ch1DutyPos + 1) & 7
      }
      const duty = Apu.DUTY[(this.nr11 >> 6) & 3] ?? Apu.DUTY[2]
      ch1 = duty[this.ch1DutyPos] ? this.ch1EnvVol / 15 : -this.ch1EnvVol / 15
    }
    let ch2 = 0
    if (this.ch2Enable && this.ch2EnvVol > 0) {
      if (--this.ch2FreqTimer <= 0) {
        this.ch2FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq2()))
        this.ch2DutyPos = (this.ch2DutyPos + 1) & 7
      }
      const duty = Apu.DUTY[(this.nr21 >> 6) & 3] ?? Apu.DUTY[2]
      ch2 = duty[this.ch2DutyPos] ? this.ch2EnvVol / 15 : -this.ch2EnvVol / 15
    }
    // channel 3: 4-bit wave RAM
    let ch3 = 0
    if (this.ch3Enable) {
      if (--this.ch3FreqTimer <= 0) {
        this.ch3FreqTimer = Math.max(1, Math.round(SAMPLE_RATE / this.freq3()))
        this.ch3Pos = (this.ch3Pos + 1) & 31
      }
      const byte = this.waveRam[this.ch3Pos >> 1]
      const nibble = this.ch3Pos & 1 ? byte & 0x0f : byte >> 4
      const volShift = ((this.nr32 >> 5) & 3) as number
      ch3 = (nibble / 15 - 0.5) * (volShift === 0 ? 0 : 1 / (1 << (volShift - 1)))
    }
    // channel 4: LFSR noise
    let ch4 = 0
    if (this.ch4Enable && this.ch4EnvVol > 0) {
      if (--this.ch4FreqTimer <= 0) {
        this.triggerCh4TimerOnly()
      }
      const bit = (this.ch4Lfsr ^ (this.ch4Lfsr >> 1)) & 1
      this.ch4Lfsr = (this.ch4Lfsr >> 1) | (bit << 14)
      if (this.nr43 & 0x08) {
        this.ch4Lfsr &= ~0x40
        this.ch4Lfsr |= bit << 6
      }
      ch4 = (this.ch4Lfsr & 1) ? -this.ch4EnvVol / 15 : this.ch4EnvVol / 15
    }

    // mix per NR50/NR51
    const vol = ((this.nr50 >> 4) & 7) / 7
    let l = 0
    let r = 0
    if (this.nr51 & 0x10) l += ch1
    if (this.nr51 & 0x20) l += ch2
    if (this.nr51 & 0x40) l += ch3
    if (this.nr51 & 0x80) l += ch4
    if (this.nr51 & 0x01) r += ch1
    if (this.nr51 & 0x02) r += ch2
    if (this.nr51 & 0x04) r += ch3
    if (this.nr51 & 0x08) r += ch4

    this.ringL[this.writePos] = (l / 4) * vol * 0.5
    this.ringR[this.writePos] = (r / 4) * vol * 0.5
    this.writePos = (this.writePos + 1) % RING_SIZE
  }

  private triggerCh4TimerOnly(): void {
    const div = this.nr43 & 0x07
    const shift = this.nr43 >> 4
    this.ch4FreqTimer = Math.max(1, Math.round((SAMPLE_RATE * (div + 1)) / 524288 / (1 << Math.max(0, shift - 4))))
  }

  /** Wire the ring buffer to WebAudio (call once after initMixer). */
  attachAudio(): void {
    const ctx = ctxOrNull()
    if (!ctx || this.node) return
    try {
      const node = ctx.createScriptProcessor(2048, 0, 2)
      const gameVol = () => getChannelVolume('game')
      node.onaudioprocess = (e) => {
        const outL = e.outputBuffer.getChannelData(0)
        const outR = e.outputBuffer.getChannelData(1)
        const vol = gameVol()
        for (let i = 0; i < outL.length; i++) {
          outL[i] = this.ringL[this.readPos] * vol
          outR[i] = this.ringR[this.readPos] * vol
          this.readPos = (this.readPos + 1) % RING_SIZE
        }
      }
      node.connect(ctx.destination)
      this.node = node
    } catch {
      this.node = null
    }
  }

  detachAudio(): void {
    if (this.node) {
      try {
        this.node.disconnect()
      } catch {
        /* ignore */
      }
      this.node.onaudioprocess = null
      this.node = null
    }
  }

  serialize(): Record<string, unknown> {
    return {
      nr10: this.nr10, nr11: this.nr11, nr12: this.nr12, nr13: this.nr13, nr14: this.nr14,
      nr21: this.nr21, nr22: this.nr22, nr23: this.nr23, nr24: this.nr24,
      nr30: this.nr30, nr31: this.nr31, nr32: this.nr32, nr33: this.nr33, nr34: this.nr34,
      nr41: this.nr41, nr42: this.nr42, nr43: this.nr43, nr44: this.nr44,
      nr50: this.nr50, nr51: this.nr51, nr52: this.nr52,
      wave: Array.from(this.waveRam),
      lfsr: this.ch4Lfsr,
    }
  }

  restore(s: Record<string, unknown>): void {
    this.nr10 = s.nr10 as number; this.nr11 = s.nr11 as number; this.nr12 = s.nr12 as number
    this.nr13 = s.nr13 as number; this.nr14 = s.nr14 as number
    this.nr21 = s.nr21 as number; this.nr22 = s.nr22 as number; this.nr23 = s.nr23 as number
    this.nr24 = s.nr24 as number
    this.nr30 = s.nr30 as number; this.nr31 = s.nr31 as number; this.nr32 = s.nr32 as number
    this.nr33 = s.nr33 as number; this.nr34 = s.nr34 as number
    this.nr41 = s.nr41 as number; this.nr42 = s.nr42 as number; this.nr43 = s.nr43 as number
    this.nr44 = s.nr44 as number
    this.nr50 = s.nr50 as number; this.nr51 = s.nr51 as number; this.nr52 = s.nr52 as number
    if (Array.isArray(s.wave)) {
      for (let i = 0; i < 16 && i < s.wave.length; i++) this.waveRam[i] = s.wave[i] as number
    }
    this.ch4Lfsr = s.lfsr as number
  }
}
