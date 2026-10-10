// Spotify Connect — real integration. One-time setup with the user's own
// Client ID (PKCE auth in the system browser), then live now-playing with
// working play/pause/next/prev/volume/seek. Premium required for control —
// free accounts see playback info only. Keys live on the local disk only.

import { useCallback, useEffect, useRef, useState } from 'react'
import { sfx } from '../lib/sound'
import { spotify, getClientId, setClientId, isConnected, openSpotifyDashboard, CALLBACK_HINT, type SpotifyTrack } from '../system/spotify'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function SpotifyDrawer({ isOpen, onClose }: Props) {
  const [connected, setConnected] = useState(isConnected())
  const [clientId, setClientIdState] = useState(getClientId())
  const [clientIdDraft, setClientIdDraft] = useState(getClientId())
  const [track, setTrack] = useState<SpotifyTrack | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [volume, setVolume] = useState(70)
  const pollRef = useRef<number | null>(null)

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 3200)
  }, [])

  // live now-playing poll
  useEffect(() => {
    if (!isOpen || !connected) return
    let dead = false
    const tick = async () => {
      const t = await spotify.nowPlaying()
      if (!dead) {
        setTrack(t)
        if (t) setProgress(t.progressMs)
      }
    }
    void tick()
    pollRef.current = window.setInterval(tick, 4000)
    const anim = window.setInterval(() => {
      setTrack((cur) => {
        if (cur?.isPlaying) {
          setProgress((p) => Math.min(cur.durationMs, p + 500))
        }
        return cur
      })
    }, 500)
    return () => {
      dead = true
      if (pollRef.current) window.clearInterval(pollRef.current)
      window.clearInterval(anim)
    }
  }, [isOpen, connected])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        sfx.back()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const connect = async () => {
    if (!clientIdDraft.trim()) {
      flash('Paste a Spotify Client ID first (free at developer.spotify.com/dashboard)')
      return
    }
    setClientId(clientIdDraft)
    setClientIdState(clientIdDraft)
    setBusy(true)
    flash('Opening Spotify in your browser… approve access there.')
    const res = await spotify.beginAuth()
    setBusy(false)
    if (res.ok) {
      setConnected(true)
      sfx.chime()
      flash('Spotify connected ✓')
    } else {
      sfx.error()
      flash(res.error ?? 'Connection failed')
    }
  }

  const act = async (fn: () => Promise<string | null>) => {
    sfx.select()
    const err = await fn()
    if (err) flash(err)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md anim-fade-in">
      <div className="relative w-[460px] rounded-3xl glass p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] border border-white/15 anim-fade-up">
        <button
          onClick={() => {
            sfx.back()
            onClose()
          }}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6 text-emerald-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm4.586 14.424c-.18.295-.563.387-.857.208-2.348-1.435-5.304-1.76-8.785-.964-.333.076-.665-.132-.741-.465-.076-.333.132-.665.465-.741 3.809-.87 7.076-.502 9.71 1.105.294.18.387.563.208.857Zm1.225-2.724c-.226.368-.71.483-1.077.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.125-.851-.11-.976-.523-.125-.413.11-.851.523-.976 3.633-1.103 8.147-.57 11.238 1.33.367.227.483.711.257 1.078Zm.105-2.835C14.692 8.92 9.38 8.744 6.297 9.68c-.494.15-1.02-.128-1.17-.622-.15-.494.128-1.02.622-1.17 3.553-1.079 9.426-.874 13.143 1.332.444.263.59.837.327 1.28-.263.445-.838.59-1.281.328l-.022-.013Z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Spotify · {connected ? 'Connected' : 'Console Connect'}
          </span>
        </div>

        {!connected ? (
          /* ---------- setup flow ---------- */
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-white/5 p-4 text-xs leading-relaxed text-white/55">
              <p className="mb-2 font-bold text-white/80">One-time setup</p>
              <p>
                1. Create a free app at <button className="text-emerald-400 underline" onClick={() => { sfx.select(); openSpotifyDashboard() }}>developer.spotify.com/dashboard</button>
              </p>
              <p className="mt-1">2. Add redirect URI: <code className="rounded bg-black/40 px-1.5 py-0.5 text-emerald-300">{CALLBACK_HINT}</code></p>
              <p className="mt-1">3. Paste the Client ID below and connect.</p>
              <p className="mt-2 text-white/40">Keys stay on this PC. Nothing is sent anywhere else.</p>
            </div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-white/45">
              Spotify Client ID
              <input
                className="input mt-1.5"
                value={clientIdDraft}
                onChange={(e) => setClientIdDraft(e.target.value)}
                placeholder="32-character client id"
                spellCheck={false}
              />
            </label>
            <button
              disabled={busy}
              onClick={() => void connect()}
              className="rounded-full bg-emerald-500 py-3 text-sm font-black text-black transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Waiting for Spotify…' : 'Connect Spotify'}
            </button>
          </div>
        ) : (
          /* ---------- connected player ---------- */
          <>
            {/* Album Art */}
            <div className="relative flex items-center justify-center my-4">
              {track?.albumArt ? (
                <img
                  src={track.albumArt}
                  alt=""
                  className={`h-40 w-40 rounded-full object-cover shadow-[0_0_35px_rgba(16,185,129,0.35)] border-4 border-black/40 ${track.isPlaying ? 'animate-[spin_14s_linear_infinite]' : ''}`}
                />
              ) : (
                <div
                  className={`h-40 w-40 rounded-full bg-gradient-to-tr from-purple-900 to-indigo-600 shadow-[0_0_35px_rgba(168,85,247,0.4)] flex items-center justify-center border-4 border-black/40 ${track?.isPlaying ? 'animate-[spin_6s_linear_infinite]' : ''}`}
                >
                  <div className="h-14 w-14 rounded-full bg-[#0a0712] border-2 border-white/20 flex items-center justify-center">
                    <span className="text-xs font-black text-white/60">MESH</span>
                  </div>
                </div>
              )}
            </div>

            {/* Track Title */}
            <div className="text-center mt-5 mb-2">
              <div className="text-lg font-bold text-white tracking-tight truncate">{track ? track.name : 'Nothing playing'}</div>
              <div className="text-xs text-white/50 truncate">{track ? `${track.artists}${track.deviceName ? ` · ${track.deviceName}` : ''}` : 'Start something on any Spotify device'}</div>
            </div>

            {/* Progress Bar */}
            <div
              className="w-full mt-5 cursor-pointer"
              onClick={(e) => {
                if (!track) return
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                void act(() => spotify.seek(pct * track.durationMs))
              }}
            >
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden relative">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all"
                  style={{ width: track ? `${Math.min(100, (progress / track.durationMs) * 100)}%` : '0%' }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/40 mt-1.5 font-mono">
                <span>{fmt(progress)}</span>
                <span>{track ? fmt(track.durationMs) : '0:00'}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <button onClick={() => void act(() => spotify.previous())} className="text-white/60 hover:text-white transition-all text-xl cursor-pointer">
                ⏮
              </button>
              <button
                onClick={() => {
                  sfx.select()
                  const wasPlaying = track?.isPlaying
                  void act(wasPlaying ? () => spotify.pause() : () => spotify.play())
                  setTrack((t) => (t ? { ...t, isPlaying: !wasPlaying } : t))
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-black font-black text-lg shadow-[0_0_20px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                {track?.isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => void act(() => spotify.next())} className="text-white/60 hover:text-white transition-all text-xl cursor-pointer">
                ⏭
              </button>
            </div>

            {/* Volume */}
            <div className="mt-5 flex items-center gap-3">
              <span className="text-xs text-white/40">🔈</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                onMouseUp={() => void act(() => spotify.volume(volume))}
                onTouchEnd={() => void act(() => spotify.volume(volume))}
                className="flex-1 accent-emerald-400"
              />
              <span className="w-9 text-right font-mono text-xs text-white/50">{volume}%</span>
            </div>

            <button
              onClick={() => {
                sfx.back()
                spotify.disconnect()
                setConnected(false)
                setTrack(null)
                flash('Spotify disconnected')
              }}
              className="mt-5 w-full rounded-full bg-white/8 py-2.5 text-xs font-bold text-white/55 transition hover:bg-white/15 hover:text-white cursor-pointer"
            >
              Disconnect account
            </button>
          </>
        )}

        {notice && (
          <div className="mt-4 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-center text-xs font-semibold text-emerald-300 anim-fade-in">
            {notice}
          </div>
        )}
      </div>
    </div>
  )
}
