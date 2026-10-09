import { GAMES } from '../lib/games'
import { sfx } from '../lib/sound'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelectGame: (index: number) => void
}

export default function FileManagerModal({ isOpen, onClose, onSelectGame }: Props) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md anim-fade-in">
      <div className="relative w-[600px] max-h-[80vh] flex flex-col rounded-3xl glass p-7 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.85)] border border-white/15 anim-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
              📁
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">File Manager</h2>
              <p className="text-xs text-white/50">Storage: /public/roms/ · 12 Verified ROMs</p>
            </div>
          </div>
          <button
            onClick={() => {
              sfx.back()
              onClose()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* ROMs list */}
        <div className="no-scrollbar flex-1 overflow-y-auto py-3 space-y-2">
          {GAMES.map((g, idx) => (
            <div
              key={g.id}
              onClick={() => {
                sfx.select()
                onSelectGame(idx)
                onClose()
              }}
              className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black"
                  style={{ background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})` }}
                >
                  {g.title.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {g.rom}
                  </div>
                  <div className="text-[11px] text-white/40">
                    {g.title} · {g.author} ({g.year})
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  VERIFIED
                </span>
                <span className="text-xs text-white/40 font-mono">CH8</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex justify-between items-center text-xs text-white/40">
          <span>Total ROM size: ~9.2 KB</span>
          <span>Click any file to focus on shelf</span>
        </div>
      </div>
    </div>
  )
}
