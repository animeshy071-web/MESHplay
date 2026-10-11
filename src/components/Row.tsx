import { useEffect, useRef, useState } from 'react'
import type { Game } from '../system/library'
import TileArt from './TileArt'
import { sfx } from '../lib/sound'

interface Props {
  games: Game[]
  sel: number
  accent: [string, string]
  onSelect: (i: number) => void
  onLaunch: (game: Game) => void
  onOpenSettings: () => void
  onOpenFiles: () => void
  onOpenSearch: () => void
  onOpenSpotify: () => void
  onOpenDetails: (game: Game) => void
}

type FocusRow = 'games' | 'banners'

export default function Row({
  games,
  sel,
  accent,
  onSelect,
  onLaunch,
  onOpenSettings,
  onOpenFiles,
  onOpenSearch,
  onOpenSpotify,
  onOpenDetails,
}: Props) {
  const [focusRow, setFocusRow] = useState<FocusRow>('games')
  const [bannerIdx, setBannerIdx] = useState(0)

  const gamesScrollRef = useRef<HTMLDivElement>(null)
  const focusedGameRef = useRef<HTMLDivElement>(null)

  // Auto-scroll games row when sel changes
  useEffect(() => {
    if (focusedGameRef.current && gamesScrollRef.current) {
      focusedGameRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [sel])

  // Keyboard navigation within the horizontal dashboard grid
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.code)) {
        e.preventDefault()
      }

      if (e.code === 'ArrowDown') {
        if (focusRow === 'games') {
          sfx.travel()
          setFocusRow('banners')
        }
      } else if (e.code === 'ArrowUp') {
        if (focusRow === 'banners') {
          sfx.travel()
          setFocusRow('games')
        }
      } else if (e.code === 'ArrowLeft') {
        if (focusRow === 'games') {
          if (sel > 0) {
            sfx.travel()
            onSelect(sel - 1)
          }
        } else if (focusRow === 'banners') {
          if (bannerIdx > 0) {
            sfx.travel()
            setBannerIdx(bannerIdx - 1)
          }
        }
      } else if (e.code === 'ArrowRight') {
        if (focusRow === 'games') {
          if (sel < games.length - 1) {
            sfx.travel()
            onSelect(sel + 1)
          }
        } else if (focusRow === 'banners') {
          if (bannerIdx < 3) {
            sfx.travel()
            setBannerIdx(bannerIdx + 1)
          }
        }
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (focusRow === 'games') {
          sfx.launch()
          onLaunch(games[sel])
        } else if (focusRow === 'banners') {
          sfx.select()
          if (bannerIdx === 0) onOpenFiles()
          else if (bannerIdx === 1) onOpenSettings()
          else if (bannerIdx === 2) onLaunch(games[sel])
          else if (bannerIdx === 3) onOpenDetails(games[sel])
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusRow, sel, bannerIdx, games, onSelect, onLaunch, onOpenFiles, onOpenSettings, onOpenSearch, onOpenDetails])

  const focusedGame = games[sel] ?? games[0]

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end overflow-hidden px-14 pb-7 select-none anim-fade-in font-sans">

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          ROW 1: Horizontal Game Squircle Tiles (1:1 Ratio)
          â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative z-30 mb-4" aria-label="Recent Games">
        <div
          ref={gamesScrollRef}
          className="no-scrollbar flex items-center gap-4.5 overflow-x-auto py-5 px-3 scroll-smooth"
        >
          {games.map((g, i) => {
            const isFocused = focusRow === 'games' && i === sel

            return (
              <div
                key={g.id}
                ref={isFocused ? focusedGameRef : null}
                onClick={() => {
                  sfx.travel()
                  setFocusRow('games')
                  onSelect(i)
                }}
                onDoubleClick={() => {
                  sfx.launch()
                  onLaunch(g)
                }}
                className={`group relative flex shrink-0 cursor-pointer flex-col transition-all duration-300 ${
                  isFocused ? 'scale-108 -translate-y-2.5 z-20' : 'hover:scale-102 opacity-85 hover:opacity-100'
                }`}
              >
                {/* 1:1 Aspect Ratio Squircle Tile */}
                <div
                  className={`relative h-[138px] w-[138px] overflow-hidden rounded-[22px] transition-all duration-300 ${
                    isFocused
                      ? 'ring-2 ring-white/60'
                      : 'border border-white/12 shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                  }`}
                  style={
                    isFocused
                      ? {
                          // soft ambient glow tinted by the game's own art color — blends, never boxes
                          boxShadow: `0 0 0 2px rgba(255,255,255,0.55), 0 0 28px -4px ${g.colors[0]}B3, 0 0 80px -12px ${g.colors[0]}80, 0 14px 44px rgba(0,0,0,0.8)`,
                        }
                      : undefined
                  }
                >
                  <TileArt
                    colors={g.colors}
                    title={g.title}
                    id={g.id}
                    className="h-full w-full"
                  />

                  {/* Dark gradient overlay on bottom of card */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
                  />

                  {/* Game Title on the card */}
                  <div className="absolute inset-x-0 bottom-2.5 px-2.5 text-center">
                    <span className="block truncate text-xs font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      {g.title}
                    </span>
                  </div>

                  {/* Focused ambient ring */}
                  {isFocused && (
                    <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/50" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          ROW 2: Featured Action Banners (Wide 16:9 Cards)
          â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative z-30 mb-3" aria-label="Featured Actions">
        <div className="grid grid-cols-4 gap-4.5">
          {/* Banner 1: Browse your games */}
          <div
            onClick={() => {
              sfx.select()
              setFocusRow('banners')
              setBannerIdx(0)
              onOpenFiles()
            }}
            className={`group relative h-[116px] cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ${
              focusRow === 'banners' && bannerIdx === 0
                ? 'scale-104 -translate-y-1.5 ring-2 ring-white/60 z-10'
                : 'border border-white/10 hover:border-white/30 bg-[#0d161a]/85'
            }`}
          >
            {/* Collage Artwork background */}
            <div className="absolute inset-0 flex opacity-75">
              <div className="w-1/4 bg-gradient-to-b from-emerald-800 to-green-950 flex items-center justify-center text-xs">👾</div>
              <div className="w-1/4 bg-gradient-to-b from-blue-800 to-indigo-950 flex items-center justify-center text-xs">🧱</div>
              <div className="w-1/4 bg-gradient-to-b from-purple-800 to-fuchsia-950 flex items-center justify-center text-xs">🚀</div>
              <div className="w-1/4 bg-gradient-to-b from-amber-800 to-orange-950 flex items-center justify-center text-xs">🏎️</div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              <span className="text-lg">🏎️®</span>
              <span className="text-xs font-bold text-white tracking-wide">Browse your games</span>
            </div>
          </div>

          {/* Banner 2: Customize your Home */}
          <div
            onClick={() => {
              sfx.select()
              setFocusRow('banners')
              setBannerIdx(1)
              onOpenSettings()
            }}
            className={`group relative h-[116px] cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ${
              focusRow === 'banners' && bannerIdx === 1
                ? 'scale-104 -translate-y-1.5 ring-2 ring-white/60 z-10'
                : 'border border-white/10 hover:border-white/30 bg-[#0c1820]/85'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-[#0a1822] to-[#122c3b] flex items-center justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-2xl">
                🏎️¨
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">Customize your Home</span>
            </div>
          </div>

          {/* Banner 3: Featured Active Game */}
          <div
            onClick={() => {
              sfx.launch()
              setFocusRow('banners')
              setBannerIdx(2)
              onLaunch(focusedGame)
            }}
            className={`group relative h-[116px] cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ${
              focusRow === 'banners' && bannerIdx === 2
                ? 'scale-104 -translate-y-1.5 ring-2 ring-white/60 z-10'
                : 'border border-white/10 hover:border-white/30 bg-[#141822]/85'
            }`}
          >
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${focusedGame.colors[0]}, ${focusedGame.colors[1]})` }}
            />
            <div className="absolute top-2.5 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--lite)] border border-white/15">
              <span>FEATURED</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
              <span className="truncate text-xs font-extrabold text-white tracking-wide">
                {focusedGame.title} · Play
              </span>
              <span className="text-xs text-[var(--lite)] font-black">▶</span>
            </div>
          </div>

          {/* Banner 4: Play like a Pro */}
          <div
            onClick={() => {
              sfx.select()
              setFocusRow('banners')
              setBannerIdx(3)
              onOpenDetails(focusedGame)
            }}
            className={`group relative h-[116px] cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ${
              focusRow === 'banners' && bannerIdx === 3
                ? 'scale-104 -translate-y-1.5 ring-2 ring-white/60 z-10'
                : 'border border-white/10 hover:border-white/30 bg-black/85'
            }`}
          >
            <div className="absolute inset-0 bg-[#050508] flex items-center justify-end pr-4">
              <div className="text-3xl opacity-50 transition-transform duration-300 group-hover:scale-110">
                🕹️
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
            <div className="absolute bottom-3 left-4">
              <div className="text-xs font-bold text-white tracking-wide">Play like a Pro</div>
              <div className="text-[10px] text-white/50">Controls & Keypad Guide</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
