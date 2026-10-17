// Boot ritual — three stages, frame-synced with the ignition swell:
//   ① particle ignition from black  ② logo assembles (ring draws, tile pops)
//   ③ wordmark letters stagger + theme pulse → dissolve into the wallpaper.
// Skippable with any key; never replays within a session (App gates it).

import { useEffect, useState } from 'react'

const WORD = ['M', 'E', 'S', 'H']

export default function Boot({ onDone, skip = false }: { onDone: () => void; skip?: boolean }) {
  const [leaving, setLeaving] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    if (skip) {
      onDone()
      return
    }
    void import('../system/mixer').then(({ sfx }) => sfx.boot())
    const t1 = setTimeout(() => setLeaving(true), 4600)
    const t2 = setTimeout(onDone, 5100)
    const skipFn = () => onDone()
    window.addEventListener('keydown', skipFn, { once: true })
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('keydown', skipFn)
    }
  }, [onDone, skip])

  if (skip) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-all duration-500"
      style={{ opacity: leaving ? 0 : 1, transform: leaving ? 'scale(1.035)' : 'scale(1)' }}
    >
      {/* the Blender-rendered boot film — falls back to the ritual below if missing */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={`${import.meta.env.BASE_URL}brand/boot.mp4`}
        autoPlay muted playsInline
        onEnded={() => setLeaving(true)}
        onError={(e) => { (e.currentTarget.style.display = 'none'); setVideoFailed(true) }}
      />
      {!videoFailed && (
        <button
          type="button"
          aria-label="Skip intro"
          className="absolute bottom-8 right-10 z-10 text-[11px] font-bold uppercase tracking-[0.3em] text-white/40 transition-colors hover:text-white"
          onClick={() => setLeaving(true)}
          style={{ animation: 'fade-in 0.6s ease 1.2s both' }}
        >
          Press any key to skip
        </button>
      )}

      {/* CSS ritual fallback (also behind the video while it loads) */}
      {videoFailed && (
        <>
          {/* ① particle ignition — soft embers bloom out from center */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="pointer-events-none absolute rounded-full"
              style={{
                width: '46vmin',
                height: '46vmin',
                background: 'radial-gradient(circle, var(--acc) 0%, transparent 62%)',
                opacity: 0.16,
                animation: `boot-particle 1.15s cubic-bezier(0.16, 1, 0.3, 1) ${0.12 + i * 0.22}s both`,
              }}
            />
          ))}

          {/* ② logo assembles */}
          <div className="relative flex items-center gap-5">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full">
                <circle
                  cx="40" cy="40" r="36" fill="none"
                  stroke="var(--acc)" strokeWidth="2.5"
                  strokeLinecap="round" strokeDasharray="252"
                  transform="rotate(-90 40 40)"
                  style={{ animation: 'boot-draw 1.1s cubic-bezier(0.22,1,0.36,1) 0.25s both' }}
                />
              </svg>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-2xl font-black shadow-[0_0_46px_-4px_var(--acc)]"
                style={{ animation: 'boot-pop 0.7s cubic-bezier(0.22,1,0.36,1) 0.55s both' }}
              >
                M
              </div>
            </div>

            {/* ③ wordmark letters stagger into place */}
            <span className="font-display text-5xl tracking-tight" style={{ fontWeight: 500 }}>
              {WORD.map((ch, i) => (
                <span
                  key={i}
                  className="inline-block text-white"
                  style={{ animation: `letter-up 0.5s cubic-bezier(0.22,1,0.36,1) ${0.85 + i * 0.055}s both` }}
                >
                  {ch}
                </span>
              ))}
              {['p', 'l', 'a', 'y'].map((ch, i) => (
                <span
                  key={`p${i}`}
                  className="inline-block text-[var(--acc)]"
                  style={{ animation: `letter-up 0.5s cubic-bezier(0.22,1,0.36,1) ${1.1 + i * 0.055}s both` }}
                >
                  {ch}
                </span>
              ))}
            </span>
          </div>

          <div
            className="t-micro mt-8"
            style={{ animation: 'fade-in 0.9s ease 1.5s both', letterSpacing: '0.55em' }}
          >
            A GAMING OS
          </div>

          {/* theme pulse right before handoff — home feels continuous, not cut to */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(42% 42% at 50% 50%, var(--acc) 0%, transparent 70%)',
              opacity: 0,
              animation: 'boot-pulse 0.9s ease-out 2.1s both',
            }}
          />
        </>
      )}
    </div>
  )
}
