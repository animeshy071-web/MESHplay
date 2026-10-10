// Universal search across the whole library (built-in + custom + Steam + ROMs).
import { useState } from 'react'
import { getGames, type Game } from '../system/library'
import { sfx } from '../lib/sound'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelectGame: (index: number) => void
}

export default function SearchModal({ isOpen, onClose, onSelectGame }: Props) {
  const [query, setQuery] = useState('')

  if (!isOpen) return null

  const games = getGames()
  const filtered = games
    .map((g, i) => ({ ...g, originalIdx: i }))
    .filter(
      (g: Game & { originalIdx: number }) =>
        g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.tagline.toLowerCase().includes(query.toLowerCase()) ||
        (g.author ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (g.platform ?? '').toLowerCase().includes(query.toLowerCase()),
    )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/65 backdrop-blur-md anim-fade-in">
      <div className="relative w-[580px] rounded-3xl glass p-6 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.85)] border border-white/15 anim-fade-up">
        {/* Search input field */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 ring-1 ring-white/15 focus-within:ring-cyan-400 transition-all">
          <svg className="h-5 w-5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, creators, tags..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-white/40 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => {
              sfx.back()
              onClose()
            }}
            className="text-xs text-white/50 hover:text-white px-2 py-1 rounded bg-white/10 cursor-pointer"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div className="no-scrollbar mt-4 max-h-[50vh] overflow-y-auto space-y-1.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40">No games found for "{query}"</div>
          ) : (
            filtered.map((g) => (
              <div
                key={g.id}
                onClick={() => {
                  sfx.select()
                  onSelectGame(g.originalIdx)
                  onClose()
                }}
                className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/15 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black"
                    style={{ background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})` }}
                  >
                    {g.title.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                      {g.title}
                    </div>
                    <div className="text-xs text-white/40">{g.tagline}</div>
                  </div>
                </div>
                <span className="text-xs text-white/50">{g.year ?? g.platform ?? ''}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
