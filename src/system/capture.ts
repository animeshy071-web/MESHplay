// Media capture: one-tap screenshots and a rolling 30-second replay buffer.
// Works fully offline — frames captured from the game canvas; screenshots go
// to disk (native) or downloads (web); replay clips assemble the last 30s of
// recorded canvas into a .webm.

import { invoke, tryInvoke, isTauri } from './ipc'
import { addScreenshot } from './db'

// ---------- screenshots ----------

export async function captureScreenshot(canvas: HTMLCanvasElement, gameId: string): Promise<string | null> {
  try {
    const dataUrl = canvas.toDataURL('image/png')
    if (isTauri()) {
      const paths = await tryInvoke<{ screenshots: string }>('app_paths')
      const dir = paths?.screenshots
      if (dir) {
        const name = `${gameId}-${Date.now()}.png`
        const b64 = dataUrl.split(',')[1] ?? ''
        const res = await tryInvoke<{ ok: boolean }>('write_screenshot', { dir, name, b64 })
        if (res) {
          await addScreenshot(gameId, `${dir}\\${name}`)
          return `${dir}\\${name}`
        }
      }
    }
    // web fallback: download
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `meshplay-${gameId}-${Date.now()}.png`
    a.click()
    await addScreenshot(gameId, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

// ---------- rolling replay (MediaRecorder ring buffer) ----------

interface Chunk {
  t: number
  blob: Blob
}

export class ReplayBuffer {
  private recorder: MediaRecorder | null = null
  private chunks: Chunk[] = []
  private running = false
  readonly spanMs = 30_000

  /** Start recording the canvas continuously (rolling). */
  start(canvas: HTMLCanvasElement): void {
    if (this.running) return
    try {
      const stream = canvas.captureStream(30)
      const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined)
      this.chunks = []
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const now = Date.now()
          this.chunks.push({ t: now, blob: e.data })
          // trim to the last 30s
          while (this.chunks.length > 1 && now - this.chunks[0].t > this.spanMs) this.chunks.shift()
        }
      }
      this.recorder.start(1000) // 1s chunks — keeps the ring accurate
      this.running = true
    } catch {
      this.recorder = null
      this.running = false
    }
  }

  stop(): void {
    try {
      this.recorder?.stop()
    } catch {
      /* ignore */
    }
    this.recorder = null
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  /** Save the last 30 seconds as a .webm — native disk or web download. */
  async save(gameId: string): Promise<string | null> {
    if (this.chunks.length < 2) return null
    const blob = new Blob(this.chunks.map((c) => c.blob), { type: this.chunks[0].blob.type || 'video/webm' })
    const name = `meshplay-replay-${gameId}-${Date.now()}.webm`
    if (isTauri()) {
      const paths = await tryInvoke<{ clips: string }>('app_paths')
      if (paths?.clips) {
        const buf = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < buf.length; i += 0x8000) {
          binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        }
        const ok = await tryInvoke<{ ok: boolean }>('write_clip', { dir: paths.clips, name, b64: btoa(binary) })
        if (ok) return `${paths.clips}\\${name}`
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return name
  }
}
