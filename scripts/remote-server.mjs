// MESHplay Remote Play server — LAN WebSocket relay + phone controller page.
// Dev: started automatically by the Vite plugin. Tauri: swapped for the Rust
// implementation later. Phones pair via one-time token (QR); the host app
// connects from localhost and receives relayed input events.

import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'

let instance = null

export function getLanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address
    }
  }
  return '127.0.0.1'
}

export function startRemoteServer(port = 8765) {
  if (instance) return instance

  const token = crypto.randomBytes(4).toString('hex')
  const host = { ws: null }
  const phones = new Map() // ws -> player number
  const taken = [false, false, false, false]

  const json = (res, code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(obj))
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/info') {
        const ip = getLanIp()
        json(res, 200, { ok: true, token, ip, port, url: `http://${ip}:${port}/?t=${token}` })
        return
      }
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/remote') {
        const html = await readFile(path.join(process.cwd(), 'public', 'remote', 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(html)
        return
      }
      if (url.pathname === '/manifest.webmanifest') {
        const m = await readFile(path.join(process.cwd(), 'public', 'remote', 'manifest.webmanifest'))
        res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(m)
        return
      }
      if (url.pathname === '/sw.js') {
        const sw = await readFile(path.join(process.cwd(), 'public', 'remote', 'sw.js'))
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(sw)
        return
      }
      // PWA icons
      if (url.pathname.startsWith('/icons/')) {
        const file = path.join(process.cwd(), 'public', 'remote', url.pathname)
        const icon = await readFile(file).catch(() => null)
        if (icon) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' })
          res.end(icon)
          return
        }
      }
      json(res, 404, { ok: false })
    } catch {
      json(res, 500, { ok: false })
    }
  })

  const wss = new WebSocketServer({ server, path: '/ws' })

  const broadcastPlayers = () => {
    if (host.ws && host.ws.readyState === 1) {
      const list = [...phones.entries()].map(([ws, player]) => ({ player, id: ws._meshId })).filter(Boolean)
      host.ws.send(JSON.stringify({ type: 'players', players: list.map((p) => p.player) }))
    }
  }

  wss.on('connection', (ws, req) => {
    ws.on('error', () => {})
    const url = new URL(req.url ?? '/', 'http://localhost')
    const role = url.searchParams.get('role')
    const t = url.searchParams.get('t')
    const ra = req.socket.remoteAddress ?? ''
    const isLocal = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'

    if (role === 'host') {
      if (!isLocal) {
        ws.close(4003, 'host must connect from this PC')
        return
      }
      host.ws = ws
      ws.send(JSON.stringify({ type: 'welcome', role: 'host' }))
      broadcastPlayers()
      ws.on('close', () => {
        if (host.ws === ws) host.ws = null
        broadcastPlayers()
      })
      ws.on('message', (raw) => {
        // host -> phones (rumble/find-my-controller, later milestones)
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'rumble') {
            for (const phone of phones.keys()) {
              if (phone.readyState === 1) phone.send(JSON.stringify(msg))
            }
          }
        } catch {}
      })
      return
    }

    // phone role
    if (t !== token) {
      ws.close(4001, 'bad token')
      return
    }
    const slot = taken.findIndex((x) => !x)
    if (slot === -1) {
      ws.close(4002, 'all player slots taken')
      return
    }
    taken[slot] = true
    const player = slot + 1
    ws._meshId = player
    phones.set(ws, player)
    ws.send(JSON.stringify({ type: 'welcome', role: 'phone', player }))
    broadcastPlayers()
    ws.on('message', (raw) => {
      if (host.ws && host.ws.readyState === 1) host.ws.send(raw.toString())
    })
    ws.on('close', () => {
      taken[slot] = false
      phones.delete(ws)
      broadcastPlayers()
    })
  })

  server.listen(port)

  instance = { server, wss, token, port, stop: () => {
    for (const c of wss.clients) c.close()
    server.close()
    instance = null
  } }

  const ip = getLanIp()
  console.log(`\n[MESHplay Remote] pairing URL: http://${ip}:${port}/?t=${token}\n`)
  return instance
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  startRemoteServer()
}
