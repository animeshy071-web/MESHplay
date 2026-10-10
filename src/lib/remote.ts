// Host-side Remote Play client. Connects to the local MESHplay server and
// relays phone input into the app as keyboard events — the same path the
// physical gamepad bridge uses — so the phone drives the whole OS.

export type RemoteStatus = 'off' | 'connecting' | 'online' | 'error'

export interface RemoteInfo {
  ok: boolean
  url?: string
  token?: string
  ip?: string
  port?: number
}

export interface RemoteState {
  status: RemoteStatus
  players: number[]
  info: RemoteInfo | null
}

type Listener = (s: RemoteState) => void

class RemoteHost {
  private ws: WebSocket | null = null
  private retry: number | null = null
  private desired = false
  private state: RemoteState = { status: 'off', players: [], info: null }
  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private emit(patch: Partial<RemoteState>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn(this.state)
  }

  start(): void {
    this.desired = true
    void this.fetchInfo()
    this.connect()
  }

  stop(): void {
    this.desired = false
    if (this.retry !== null) {
      clearTimeout(this.retry)
      this.retry = null
    }
    if (this.ws) {
      try {
        this.ws.close(1000)
      } catch {
        /* already closed */
      }
      this.ws = null
    }
    this.emit({ status: 'off', players: [] })
  }

  private async fetchInfo(): Promise<void> {
    try {
      const res = await fetch('http://127.0.0.1:8765/info', { cache: 'no-store' })
      const info = (await res.json()) as RemoteInfo
      this.emit({ info })
    } catch {
      this.emit({ info: { ok: false } })
    }
  }

  private connect(): void {
    if (!this.desired) return
    this.emit({ status: 'connecting' })
    let ws: WebSocket
    try {
      ws = new WebSocket('ws://127.0.0.1:8765/ws?role=host')
    } catch {
      this.emit({ status: 'error' })
      this.scheduleRetry()
      return
    }
    this.ws = ws

    ws.onopen = () => this.emit({ status: 'online' })
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(ev.data as string))
      } catch {
        /* malformed message — ignore */
      }
    }
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null
        this.emit({ status: 'error', players: [] })
        this.scheduleRetry()
      }
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleRetry(): void {
    if (!this.desired || this.retry !== null) return
    this.retry = window.setTimeout(() => {
      this.retry = null
      this.connect()
    }, 2000)
  }

  private handle(msg: { type: string; players?: number[]; action?: string; code?: string }): void {
    if (msg.type === 'players' && Array.isArray(msg.players)) {
      this.emit({ players: msg.players })
      return
    }
    if (msg.type === 'input' && msg.code && (msg.action === 'down' || msg.action === 'up')) {
      const down = msg.action === 'down'
      window.dispatchEvent(
        new KeyboardEvent(down ? 'keydown' : 'keyup', { code: msg.code, key: msg.code, bubbles: true, cancelable: true }),
      )
    }
  }

  rumbleAll(ms = 400): void {
    this.ws?.send(JSON.stringify({ type: 'rumble', ms }))
  }
}

export const remoteHost = new RemoteHost()

import { useEffect, useState } from 'react'

export function useRemote(enabled: boolean): RemoteState {
  const [state, setState] = useState<RemoteState>(remoteHost['state'])
  useEffect(() => {
    const unsub = remoteHost.subscribe(setState)
    if (enabled) remoteHost.start()
    else remoteHost.stop()
    return unsub
  }, [enabled])
  return state
}
