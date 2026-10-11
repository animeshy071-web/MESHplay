import { useEffect, useRef, useState, type ReactNode } from 'react'
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

  // unified banner skeleton — one card system, four content variations
  const banners: Array<{ id: string; title: string; sub?: string; badge?: string; icon: ReactNode; bg: string; onClick: () => void }> = [
    {
      id: 'browse',
      title: 'Browse your games',
      sub: 'Your library, one place',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
      bg: 'linear-gradient(120deg, #0d1a20, #102832)',
      onClick: () => { sfx.select(); onOpenFiles() },
    },
    {
      id: 'customize',
      title: 'Customize your Home',
      sub: 'Themes, layout & wallpaper',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-3.3-4-6-9-6z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="8.5" r="1" fill="currentColor" />
        </svg>
      ),
      bg: 'linear-gradient(120deg, #0c1620, #122c3b)',
      onClick: () => { sfx.select(); onOpenSettings() },
    },
    {
      id: 'featured',
      title: `${focusedGame.title} · Play`,
      sub: 'Jump straight back in',
      badge: 'FEATURED',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      ),
      bg: `linear-gradient(120deg, ${focusedGame.colors[0]}, ${focusedGame.colors[1]})`,
      onClick: () => { sfx.launch(); onLaunch(focusedGame) },
    },
    {
      id: 'pro',
      title: 'Play like a Pro',
      sub: 'Controls & Keypad Guide',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12h4m-2-2v4M15 11h.01M18 13h.01" />
          <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.05.47-.08.95-.1 1.41-.13 2.63.13 5.29.9 7.81.33 1.08 1.16 1.94 2.29 2.13 1.36.22 2.44-.56 3.53-1.79.52-.6 1.35-.6 1.87 0 1.09 1.23 2.17 2.01 3.53 1.79 1.13-.19 1.96-1.05 2.29-2.13.77-2.52 1.03-5.18.9-7.81-.02-.46-.05-.94-.1-1.41A4 4 0 0 0 17.32 5z" />
        </svg>
      ),
      bg: 'linear-gradient(120deg, #0a0a10, #131320)',
      onClick: () => { sfx.select(); onOpenDetails(focusedGame) },
    },
  ]


  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden px-14 pb-7 select-none anim-fade-in font-sans">

      {/* ─────────────────────────────────────────────────────────────
          HERO — the focused game owns the room (kills the dead zone)
          ───────────────────────────────────────────────────────────── */}
      <section aria-label="Featured Game" className="relative z-30 flex min-h-0 flex-1 items-center px-3">
        <div className="flex w-full items-end justify-between gap-10">
          <div key={focusedGame.id} className="anim-fade-up max-w-[600px]">
            <div className="t-micro mb-3">
              {(focusedGame.platform ?? 'Library').toUpperCase()} · FEATURED
            </div>
            <h1 className="t-display text-[56px] leading-[1.02] text-white drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)]">
              {focusedGame.title}
            </h1>
            {focusedGame.tagline && (
              <div className="mt-3 text-[13px] font-bold tracking-wide" style={{ color: focusedGame.colors[0] }}>
                {focusedGame.tagline.toUpperCase()}
              </div>
            )}
            {focusedGame.desc && (
              <p className="mt-2 line-clamp-2 max-w-[520px] text-[13.5px] leading-relaxed text-white/55">
                {focusedGame.desc}
              </p>
            )}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  sfx.launch()
                  onLaunch(focusedGame)
                }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                Play
              </button>
              <button
                type="button"
                className="btn-ghost px-7 py-3 text-[13px] font-bold"
                onClick={() => {
                  sfx.select()
                  onOpenDetails(focusedGame)
                }}
              >
                Details
              </button>
            </div>
          </div>

          {/* large art presence on the right — glows with its own color */}
          <div key={`art-${focusedGame.id}`} className="anim-fade-up relative hidden xl:block" style={{ transform: 'rotate(2deg)' }}>
            <div
              className="pointer-events-none absolute -inset-8 rounded-[36px] opacity-45 blur-2xl"
              style={{ background: `radial-gradient(60% 60% at 50% 45%, ${focusedGame.colors[0]}66, transparent)` }}
            />
            <div className="relative h-[230px] w-[230px] overflow-hidden rounded-[26px] ring-1 ring-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
              <TileArt colors={focusedGame.colors} title={focusedGame.title} id={focusedGame.id} className="h-full w-full" />
              <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-t from-black/45 via-transparent to-white/10" />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          ROW 1: Horizontal Game Squircle Tiles (1:1 Ratio)
          ───────────────────────────────────────────────────────────── */}
      <section className="relative z-30 mb-4" aria-label="Recent Games">
        <div
          ref={gamesScrollRef}
          className="dim-neighbors no-scrollbar flex items-center gap-4.5 overflow-x-auto py-5 px-3 scroll-smooth"
        >
          {games.map((g, i) => {
            const isFocused = focusRow === 'games' && i === sel

            return (
              <div
                key={g.id}
                ref={isFocused ? focusedGameRef : null}
                role="button"
                tabIndex={0}
                aria-label={`Play ${g.title}`}
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

      {/* ─────────────────────────────────────────────────────────────
          ROW 2: Featured Action Banners — one skeleton, four contents
          ───────────────────────────────────────────────────────────── */}
      <section className="relative z-30 mb-3" aria-label="Featured Actions">
        <div className="dim-neighbors grid grid-cols-4 gap-4.5">
          {banners.map((b, i) => {
            const focused = focusRow === 'banners' && bannerIdx === i
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                aria-label={b.title}
                data-focused={focused}
                onClick={() => {
                  setFocusRow('banners')
                  setBannerIdx(i)
                  b.onClick()
                }}
                className="reveal-card hover-lift group relative h-[116px] cursor-pointer overflow-hidden rounded-2xl border border-white/10"
                style={{
                  background: b.bg,
                  ...(focused
                    ? {
                        transform: 'scale(1.04) translateY(-6px)',
                        boxShadow:
                          '0 0 0 1.5px rgba(255,255,255,0.65), 0 0 30px -6px var(--game-acc, var(--acc)), 0 16px 40px -14px rgba(0,0,0,0.85)',
                        zIndex: 10,
                      }
                    : undefined),
                }}
              >
                {/* icon chip — same spot every card */}
                <div className="absolute right-3.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white/90 transition-transform duration-300 group-hover:scale-110">
                  {b.icon}
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-transparent" />
                <div className="absolute bottom-3.5 left-4 right-14">
                  {b.badge && (
                    <div className="t-micro mb-1.5 !text-[9px]" style={{ color: 'var(--lite)' }}>
                      {b.badge}
                    </div>
                  )}
                  <div className="truncate text-[12.5px] font-bold tracking-wide text-white">{b.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-white/50">{b.sub}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
