import { useEffect, useState } from 'react'

export default function Boot({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2200)
    const t2 = setTimeout(onDone, 2650)
    const skip = () => onDone()
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('keydown', skip)
    }
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-500"
      style={{ opacity: leaving ? 0 : 1 }}
    >
      <div className="relative flex items-center gap-5" style={{ animation: 'fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both' }}>
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full">
            <circle cx="40" cy="40" r="36" fill="none" stroke="var(--acc)" strokeWidth="2.5"
              strokeLinecap="round" strokeDasharray="440" style={{ animation: 'sweep 1.4s cubic-bezier(0.22,1,0.36,1) both' }} />
          </svg>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-2xl font-black shadow-[0_0_40px_-4px_var(--acc)]">
            M
          </div>
        </div>
        <span className="text-5xl font-black tracking-tight">
          MESH<span className="text-[var(--acc)]">play</span>
        </span>
      </div>
      <div className="mt-7 text-[11px] font-semibold uppercase tracking-[0.55em] text-white/35" style={{ animation: 'fade-in 0.8s ease 0.7s both' }}>
        A Gaming OS
      </div>
    </div>
  )
}
