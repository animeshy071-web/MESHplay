export interface Toast {
  id: number
  msg: string
}

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass rounded-full px-5 py-2.5 text-sm font-medium" style={{ animation: 'toast-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
