// Find My Controller — radar UI with sonar sweep; pings lost wireless
// controllers with rumble bursts + phone vibration while open. Names each
// connected device and its player slot.

import { useEffect, useState } from 'react'
import { listDevices, startPinging, stopPinging, subscribe, isPinging, type FoundDevice } from '../system/findcontroller'
import { sfx } from '../system/mixer'

interface Props {
  onClose: () => void
}

export default function FindControllerModal({ onClose }: Props) {
  const [devices, setDevices] = useState<FoundDevice[]>([])
  const [pinging, setPinging] = useState(isPinging())
  const [sweep, setSweep] = useState(0)

  useEffect(() => {
    setDevices(listDevices())
    const refresh = window.setInterval(() => setDevices(listDevices()), 1000)
    const unsub = subscribe(setPinging)
    const sweepIv = window.setInterval(() => setSweep((s) => (s + 2) % 360), 30)
    // start pinging immediately — that's the whole point
    startPinging()
    return () => {
      clearInterval(refresh)
      clearInterval(sweepIv)
      unsub()
      stopPinging()
    }
  }, [])

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
    <div className="absolute inset-0 z-[80] flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)' }}>
      <div className="glass flex w-[560px] max-w-[94vw] items-center gap-8 rounded-[28px] p-8 anim-fade-up">
        {/* radar */}
        <div className="relative h-52 w-52 shrink-0">
          {[100, 66, 33].map((r) => (
            <div key={r} className="absolute rounded-full border border-[var(--acc)]/25" style={{ inset: `${(100 - r) / 2}%` }} />
          ))}
          {/* sweep */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from ${sweep}deg, rgba(168,85,247,0.5), transparent 60deg)`,
              maskImage: 'radial-gradient(circle, black 99%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(circle, black 99%, transparent 100%)',
            }}
          />
          {/* blips */}
          {devices.map((d, i) => (
            <div
              key={`${d.kind}${d.index}`}
              className="absolute h-3 w-3 rounded-full bg-[var(--acc)] anim-fade-in"
              style={{
                left: `${38 + i * 14}%`,
                top: `${30 + i * 18}%`,
                boxShadow: '0 0 14px var(--acc)',
                animation: `fade-in 0.4s, breathe 1.2s ${i * 0.3}s infinite`,
              }}
            />
          ))}
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight">Find My Controller</h2>
          <p className="mb-4 text-xs text-white/45">
            Pinging every connected device with rumble bursts + sonar. Listen and look.
          </p>
          <div className="flex flex-col gap-2">
            {devices.length === 0 && (
              <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/40">
                No controllers or phones connected. Pair a phone or plug in a controller.
              </div>
            )}
            {devices.map((d) => (
              <div key={`${d.kind}${d.index}`} className="flex items-center justify-between rounded-2xl bg-white/6 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-white/85">{d.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-white/35">{d.kind}</div>
                </div>
                <span className="rounded-full bg-[var(--acc)]/20 px-2.5 py-1 text-[10px] font-black text-[var(--acc)]">
                  P{d.player}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-widest ${pinging ? 'text-[var(--acc)]' : 'text-white/30'}`}>
              {pinging ? '● Pinging…' : 'Stopped'}
            </span>
            <button className="rounded-full px-5 py-2 text-sm font-bold text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => { sfx.back(); onClose() }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
