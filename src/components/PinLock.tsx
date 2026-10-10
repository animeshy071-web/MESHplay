// PIN lock gate — shown at boot when a PIN is set (kiosk / family security).
// 4+ digit entry pad, controller + keyboard navigation, SHA-256 verified.

import { useEffect, useRef, useState } from 'react'
import { verifyPin } from '../system/pin'
import { sfx } from '../system/mixer'

interface Props {
  onUnlocked: () => void
}

export default function PinLock({ onUnlocked }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const lastKey = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastKey.current < 60) return // debounce
      lastKey.current = now
      if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
        e.preventDefault()
        push(e.code.slice(-1))
      } else if (e.code === 'Backspace') {
        e.preventDefault()
        setPin((p) => p.slice(0, -1))
        sfx.travel()
      } else if (e.code === 'Escape') {
        e.preventDefault()
        setPin('')
        sfx.back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (pin.length >= 4 && !checking) {
      setChecking(true)
      void (async () => {
        const ok = await verifyPin(pin)
        if (ok) {
          sfx.boot()
          onUnlocked()
        } else {
          sfx.error()
          setError(true)
          setTimeout(() => {
            setPin('')
            setError(false)
            setChecking(false)
          }, 500)
        }
      })()
    }
  }, [pin, checking, onUnlocked])

  const push = (d: string) => {
    if (pin.length >= 8) return
    sfx.travel()
    setPin((p) => p + d)
  }

  return (
    <div className="absolute inset-0 z-[95] flex flex-col items-center justify-center bg-black anim-fade-in">
      <div className="mb-2 text-xs font-black uppercase tracking-[0.4em] text-white/40">Enter PIN</div>
      <div className={`mb-8 flex gap-3 ${error ? 'anim-fade-in' : ''}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex h-14 w-12 items-center justify-center rounded-2xl text-2xl font-black transition-all duration-200"
            style={{
              background: error ? 'rgba(239,68,68,0.2)' : pin.length > i ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : pin.length > i ? 'var(--acc)' : 'rgba(255,255,255,0.08)'}`,
              color: pin.length > i ? '#fff' : 'transparent',
              boxShadow: pin.length > i ? '0 0 20px -6px var(--acc)' : 'none',
            }}
          >
            •
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            className="h-14 w-14 rounded-2xl bg-white/6 text-lg font-bold text-white/85 transition hover:bg-white/14 active:scale-95"
            onClick={() => push(d)}
          >
            {d}
          </button>
        ))}
        <span />
        <button className="h-14 w-14 rounded-2xl bg-white/6 text-lg font-bold text-white/85 transition hover:bg-white/14 active:scale-95" onClick={() => push('0')}>
          0
        </button>
        <button className="h-14 w-14 rounded-2xl bg-white/6 text-lg font-bold text-white/60 transition hover:bg-white/14 active:scale-95" onClick={() => { setPin((p) => p.slice(0, -1)); sfx.travel() }}>
          ⌫
        </button>
      </div>
      {error && <div className="mt-5 text-xs font-bold text-red-400">Wrong PIN — try again</div>}
    </div>
  )
}
