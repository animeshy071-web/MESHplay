export interface HintItem {
  k: string
  label: string
}

export default function Hints({ items }: { items: HintItem[] }) {
  return (
    <div className="absolute inset-x-0 bottom-5 z-40 flex items-center justify-center gap-3">
      {items.map((h) => (
        <div key={h.label} className="glass flex items-center gap-2 rounded-full px-4 py-2">
          <span className="text-xs font-bold text-white/90">{h.k}</span>
          <span className="text-xs text-white/45">{h.label}</span>
        </div>
      ))}
    </div>
  )
}
