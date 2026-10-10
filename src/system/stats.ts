// Game Bar performance sampler: live FPS + frame-time ring from rAF, plus
// system stats (CPU/GPU/RAM/battery) from the native backend (web fallback:
// FPS only). One sampler drives every Game Bar widget.

import { tryInvoke, isTauri } from './ipc'

export interface SystemStats {
  cpu_percent: number
  ram_used_gb: number
  ram_total_gb: number
  battery_percent: number | null
  charging: boolean | null
  gpu_name: string | null
  gpu_percent: number | null
}

export interface PerfSnapshot {
  fps: number
  frametime: number // ms, smoothed
  frameRing: number[] // last 120 frametimes
  stats: SystemStats | null
  controllers: Array<{ index: number; level: string; percent: number }>
}

type Listener = (s: PerfSnapshot) => void

const EMPTY_STATS: SystemStats = {
  cpu_percent: 0, ram_used_gb: 0, ram_total_gb: 0,
  battery_percent: null, charging: null, gpu_name: null, gpu_percent: null,
}

class PerfSampler {
  private listeners = new Set<Listener>()
  private raf = 0
  private frames = 0
  private fpsT = performance.now()
  private lastT = performance.now()
  private fps = 60
  private frametime = 16.7
  private ring: number[] = []
  private stats: SystemStats | null = null
  private controllers: Array<{ index: number; level: string; percent: number }> = []
  private running = false
  private lowFpsSince: number | null = null

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  start(): void {
    if (this.running) return
    this.running = true
    const step = (now: number) => {
      if (!this.running) return
      this.raf = requestAnimationFrame(step)
      const dt = now - this.lastT
      this.lastT = now
      if (dt > 0 && dt < 250) {
        this.frametime = this.frametime * 0.9 + dt * 0.1
        this.ring.push(dt)
        if (this.ring.length > 120) this.ring.shift()
      }
      this.frames++
      if (now - this.fpsT > 500) {
        this.fps = Math.round((this.frames * 1000) / (now - this.fpsT))
        this.frames = 0
        this.fpsT = now
        this.push()
      }
      this.watchAdaptive(now)
    }
    this.raf = requestAnimationFrame(step)

    // system stats every 1.2s (native), controllers every 5s
    const statsTimer = window.setInterval(async () => {
      if (!isTauri()) return
      const s = await tryInvoke<SystemStats>('system_stats')
      if (s) this.stats = s
    }, 1200)
    const ctrlTimer = window.setInterval(async () => {
      if (!isTauri()) return
      const c = await tryInvoke<Array<{ index: number; level: string; percent: number }>>('controller_battery')
      if (c) this.controllers = c
    }, 5000)
    void statsTimer
    void ctrlTimer
    // keep timers referenced for stop
    this.timers.push(statsTimer, ctrlTimer)
  }

  private timers: number[] = []

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  /** Adaptive-quality ladder hook: fires when fps dips below 45 for 3s. */
  private lowFpsCb: (() => void) | null = null
  onLowFps(cb: () => void): void {
    this.lowFpsCb = cb
  }

  private watchAdaptive(now: number): void {
    if (this.fps < 45) {
      if (this.lowFpsSince === null) this.lowFpsSince = now
      else if (now - this.lowFpsSince > 3000) {
        this.lowFpsSince = now
        this.lowFpsCb?.()
      }
    } else {
      this.lowFpsSince = null
    }
  }

  private push(): void {
    const snap: PerfSnapshot = {
      fps: this.fps,
      frametime: this.frametime,
      frameRing: this.ring,
      stats: this.stats ?? (isTauri() ? EMPTY_STATS : null),
      controllers: this.controllers,
    }
    for (const fn of this.listeners) fn(snap)
  }
}

export const perfSampler = new PerfSampler()
