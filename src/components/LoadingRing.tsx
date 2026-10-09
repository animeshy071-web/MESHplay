interface Props {
  label: string
  initial: string
}

export default function LoadingRing({ label, initial }: Props) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-32 w-32" style={{ animation: 'breathe 2.2s ease-in-out infinite' }}>
        <svg viewBox="0 0 120 120" className="h-full w-full" style={{ animation: 'spin-ring 1.15s linear infinite' }}>
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--acc)" strokeWidth="6"
            strokeLinecap="round" strokeDasharray="90 240" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-3xl font-black text-white/80">{initial}</span>
      </div>
      <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/55">{label}</div>
    </div>
  )
}
