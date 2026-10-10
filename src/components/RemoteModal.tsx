import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useRemote, type RemoteState } from '../lib/remote'
import { sfx } from '../lib/sound'

interface Props {
  onClose: () => void
  enabled: boolean
  onToggleEnabled: (v: boolean) => void
}

const statusLabel: Record<RemoteState['status'], string> = {
  off: 'Remote off',
  connecting: 'Connecting…',
  online: 'Connected to MESHplay server',
  error: 'Server not running',
}

export default function RemoteModal({ onClose, enabled, onToggleEnabled }: Props) {
  const remote = useRemote(enabled)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    const url = remote.info?.url
    if (!url) {
      setQr(null)
      return
    }
    QRCode.toDataURL(url, { margin: 1, width: 460, color: { dark: '#0b0714', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [remote.info?.url])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        sfx.back()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
      <div className="glass w-[720px] max-w-[92vw] rounded-[28px] p-9 anim-fade-up">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-3xl font-black tracking-tight">Remote Play</h2>
          <button
            className="btn-pill glass rounded-full px-4 py-2 text-xs font-bold text-white/70"
            onClick={() => { sfx.back(); onClose() }}
          >
            Esc
          </button>
        </div>
        <p className="mb-6 text-sm text-white/50">Your phone becomes a wireless controller. Scan, connect, play.</p>

        <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            {qr ? (
              <div className="rounded-3xl bg-white p-4 shadow-[0_0_60px_-14px_var(--acc)]">
                <img src={qr} alt="Pairing QR" className="h-[210px] w-[210px]" draggable={false} />
              </div>
            ) : (
              <div className="flex h-[242px] w-[242px] items-center justify-center rounded-3xl border border-dashed border-white/15 text-center text-xs leading-relaxed text-white/40" style={{ width: 210, height: 242 }}>
                {enabled ? 'Starting server…' : 'Enable Remote Play to pair'}
              </div>
            )}
            {remote.info?.url && <div className="max-w-[260px] break-all text-center font-mono text-[11px] text-white/40">{remote.info.url}</div>}
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-3.5">
              <span className="text-sm font-bold text-white/85">Remote Play</span>
              <button
                className="rounded-full px-4 py-1.5 text-xs font-extrabold transition-all"
                style={{
                  background: enabled ? 'linear-gradient(135deg, var(--acc), var(--acc2))' : 'rgba(255,255,255,0.12)',
                  boxShadow: enabled ? '0 0 24px -6px var(--acc)' : 'none',
                }}
                onClick={() => { sfx.select(); onToggleEnabled(!enabled) }}
              >
                {enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="rounded-2xl bg-white/5 px-5 py-3.5">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: remote.status === 'online' ? '#34d399' : remote.status === 'connecting' ? '#fbbf24' : '#f43f5e',
                    boxShadow: remote.status === 'online' ? '0 0 10px #34d399' : 'none',
                  }}
                />
                <span className="text-sm font-bold text-white/85">{statusLabel[remote.status]}</span>
              </div>
              <div className="text-xs leading-relaxed text-white/45">
                Server runs with MESHplay (dev). Traffic stays on your home network — pairing works only through this QR.
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 px-5 py-3.5">
              <div className="mb-2 text-sm font-bold text-white/85">Connected phones</div>
              {remote.players.length === 0 ? (
                <div className="text-xs text-white/40">None yet — scan the code with up to 4 phones.</div>
              ) : (
                <div className="flex gap-2">
                  {remote.players.map((p) => (
                    <div key={p} className="flex items-center gap-2 rounded-full bg-[var(--acc)]/20 px-4 py-1.5 text-xs font-bold text-[var(--acc)]">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--acc)]" /> Player {p}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="self-start rounded-full bg-white/10 px-5 py-2.5 text-xs font-bold text-white/70 transition-transform active:scale-95"
              onClick={() => { sfx.select(); import('../lib/remote').then((m) => m.remoteHost.rumbleAll(500)) }}
            >
              Ring connected phones
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
