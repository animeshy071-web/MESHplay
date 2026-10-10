// Mood Recommender — type a mood or tap chips → internet game database →
// recommendations. Two modes:
//   · "From your shelf" — picks a matching game you already own (offline)
//   · Online — RAWG (user key) search, showing box art + store links

import { useEffect, useState } from 'react'
import { getGames, type Game } from '../system/library'
import { sfx } from '../system/mixer'
import { getApiKeys } from '../system/scrape'
import { tryInvoke } from '../system/ipc'
import TileArt from './TileArt'

interface Props {
  isOpen: boolean
  onClose: () => void
  onLaunch: (game: Game) => void
  onFocus: (game: Game) => void
}

interface OnlinePick {
  name: string
  art: string | null
  released: string
  rating: number
  rawgId: number
}

const MOODS: Array<{ id: string; label: string; icon: string; words: string[]; rawgTags: string }> = [
  { id: 'chill', label: 'Chill', icon: '🌊', words: ['chill', 'cozy', 'relax', 'pac'], rawgTags: 'casual,puzzle' },
  { id: 'hype', label: 'Hype', icon: '⚡', words: ['hype', 'speed', 'race', 'action', 'arena'], rawgTags: 'action,racing' },
  { id: 'cozy', label: 'Cozy', icon: '🧸', words: ['cozy', 'farm', 'life', 'sim'], rawgTags: 'simulation,indie' },
  { id: 'retro', label: 'Retro', icon: '🕹️', words: ['retro', 'arcade', 'classic', 'invader'], rawgTags: 'arcade,platformer' },
  { id: 'hard', label: 'Painful', icon: '💀', words: ['hard', 'souls', 'brutal', 'rogue'], rawgTags: 'difficult,roguelike' },
  { id: 'weird', label: 'Weird', icon: '🌀', words: ['weird', 'strange', 'surreal', 'odd'], rawgTags: 'indie,experimental' },
]

export default function MoodModal({ isOpen, onClose, onLaunch, onFocus }: Props) {
  const [mood, setMood] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [shelfPick, setShelfPick] = useState<Game | null>(null)
  const [online, setOnline] = useState<OnlinePick[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const query = (text.trim() || mood || '').toLowerCase()

  useEffect(() => {
    if (!isOpen) {
      setMood(null)
      setText('')
      setShelfPick(null)
      setOnline([])
      setNote('')
    }
  }, [isOpen])

  useEffect(() => {
    if (!query) {
      setShelfPick(null)
      setOnline([])
      return
    }
    // shelf match: title/tagline/genre contains any mood word
    const games = getGames()
    const words = query.split(/\s+/).filter(Boolean)
    const scored = games
      .map((g) => {
        const hay = `${g.title} ${g.tagline} ${g.desc} ${g.tags ?? ''} ${g.platform ?? ''}`.toLowerCase()
        let score = 0
        for (const w of words) if (hay.includes(w)) score += w.length
        return { g, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    setShelfPick(scored[0]?.g ?? null)

    // online recommendations (RAWG, optional key)
    const keys = getApiKeys()
    if (keys.rawg) {
      setBusy(true)
      const tagParam = MOODS.find((m) => m.id === mood)?.rawgTags ?? ''
      void (async () => {
        try {
          const res = await fetch(
            `https://api.rawg.io/api/games?search=${encodeURIComponent(text.trim() || mood || 'games')}${tagParam ? `&tags=${tagParam}` : ''}&page_size=6&key=${keys.rawg}`,
          )
          if (res.ok) {
            const json = (await res.json()) as { results?: Array<{ id: number; name: string; background_image: string | null; released: string; rating: number }> }
            setOnline(
              (json.results ?? []).map((r) => ({
                name: r.name,
                art: r.background_image,
                released: r.released ?? '',
                rating: r.rating ?? 0,
                rawgId: r.id,
              })),
            )
          } else {
            setOnline([])
          }
        } catch {
          setOnline([])
        }
        setBusy(false)
      })()
    } else {
      setOnline([])
      if (mood || text.trim()) setNote('Add a RAWG key in the Add Game dialog → API keys for online picks')
    }
  }, [query, mood, text])

  if (!isOpen) return null

  const shelfPool = query ? [] : getGames()

  const surpriseMe = () => {
    const games = getGames()
    if (games.length === 0) return
    const pick = games[Math.floor(Math.random() * games.length)]
    sfx.launch()
    onLaunch(pick)
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
      <div className="glass w-[680px] max-w-[94vw] rounded-[28px] p-7 anim-fade-up" style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tight">Mood Mix</h2>
          <button className="btn-pill glass rounded-full px-4 py-2 text-xs font-bold text-white/70" onClick={() => { sfx.back(); onClose() }}>
            Esc
          </button>
        </div>
        <p className="mb-5 text-sm text-white/50">How do you want to feel right now?</p>

        {/* mood chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m.id}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition-all ${mood === m.id ? 'text-white' : 'bg-white/6 text-white/60 hover:bg-white/12'}`}
              style={mood === m.id ? { background: 'linear-gradient(135deg, var(--acc), var(--acc2))', boxShadow: '0 0 24px -8px var(--acc)' } : undefined}
              onClick={() => {
                sfx.select()
                setMood((cur) => (cur === m.id ? null : m.id))
                setText('')
              }}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <input
          className="input"
          placeholder="…or type a vibe: 'space shooter', 'cozy farming', 'speed'"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setMood(null)
          }}
        />

        {/* shelf match */}
        {shelfPick && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-white/40">From your shelf</div>
            <div
              className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white/6 p-3 transition hover:bg-white/12"
              onClick={() => {
                sfx.select()
                onFocus(shelfPick)
                onClose()
              }}
            >
              <TileArt colors={shelfPick.colors} title={shelfPick.title} className="h-16 w-16 rounded-xl" artPath={shelfPick.artPath} artMime={shelfPick.artMime} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white/90">{shelfPick.title}</div>
                <div className="truncate text-[11px] text-white/45">{shelfPick.tagline}</div>
              </div>
              <button
                className="rounded-full bg-[var(--acc)] px-4 py-2 text-xs font-black text-white"
                onClick={(e) => {
                  e.stopPropagation()
                  sfx.launch()
                  onLaunch(shelfPick)
                }}
              >
                ▶ Play
              </button>
            </div>
          </div>
        )}

        {/* surprise me — shelf roulette */}
        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 rounded-2xl bg-white/8 px-4 py-3 text-sm font-bold text-white/80 transition hover:bg-white/15"
            onClick={surpriseMe}
          >
            🎲 Surprise me — play one from your shelf
          </button>
        </div>

        {/* online picks */}
        {(online.length > 0 || busy) && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-white/40">From the internet (RAWG)</div>
            {busy ? (
              <div className="py-4 text-center text-xs text-white/40">Searching…</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {online.map((o) => (
                  <button
                    key={o.rawgId}
                    className="overflow-hidden rounded-2xl bg-white/5 text-left transition hover:bg-white/12"
                    onClick={() => {
                      sfx.select()
                      void tryInvoke('open_url', { url: `https://rawg.io/games/${o.rawgId}` })
                    }}
                  >
                    {o.art ? (
                      <img src={o.art} alt={o.name} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="aspect-video w-full bg-black/40" />
                    )}
                    <div className="p-2">
                      <div className="truncate text-xs font-bold text-white/85">{o.name}</div>
                      <div className="text-[10px] text-white/40">{o.released?.slice(0, 4)}{o.rating ? ` · ★ ${o.rating.toFixed(1)}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* empty shelf roulette */}
        {!query && shelfPool.length === 0 && (
          <div className="mt-5 rounded-2xl bg-white/5 p-4 text-center text-xs text-white/40">
            Your shelf is empty — add games in the Library manager first.
          </div>
        )}

        {note && <div className="mt-4 text-center text-[11px] text-white/35">{note}</div>}
      </div>
    </div>
  )
}
