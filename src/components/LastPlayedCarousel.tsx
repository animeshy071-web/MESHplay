import { useEffect, useRef } from 'react'
import type { Game } from '../system/library'
import TileArt from './TileArt'
import { sfx } from '../lib/sound'

interface Props {
  games: Game[]
  sel: number
  onSelect: (i: number) => void
  onLaunch?: (game: Game) => void
  className?: string
}

export default function LastPlayedCarousel({
  games,
  sel,
  onSelect,
  onLaunch,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLDivElement>(null)

  // Smoothly scroll container to keep active game visible in the 5-app window
  useEffect(() => {
    if (activeItemRef.current && containerRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [sel])

  return (
    <section className={`select-none ${className}`} aria-label="Recent Games">
      {/* Header */}
      <div className="mb-2 text-[11px] font-bold tracking-[0.25em] text-white/45 uppercase flex items-center gap-2">
        <span>Last Played</span>
        <span className="h-1 w-1 rounded-full bg-cyan-400/60" />
      </div>

      {/* Horizontal Carousel (Ample padding so rings/shadows are never cut, gradient mask for faded look) */}
      <div
        ref={containerRef}
        className="no-scrollbar flex items-end gap-4 overflow-x-auto pt-2 pb-4 px-2 scroll-smooth w-[480px] max-w-[480px]"
        style={{
          maskImage: 'linear-gradient(to right, black 0%, black 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 0%, black 82%, transparent 100%)',
        }}
      >
        {games.map((g, i) => {
          const isFocused = i === sel
          return (
            <div
              key={g.id}
              ref={isFocused ? activeItemRef : null}
              onClick={() => {
                if (isFocused && onLaunch) {
                  sfx.launch()
                  onLaunch(g)
                } else {
                  sfx.travel()
                  onSelect(i)
                }
              }}
              title={isFocused ? `Click to launch ${g.title}` : `Select ${g.title}`}
              className="flex shrink-0 flex-col items-center cursor-pointer transition-transform duration-300 active:scale-95 group"
            >
              {/* Circular Avatar Container with generous shadow clearance */}
              <div
                className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                  isFocused
                    ? 'h-14 w-14 ring-2 ring-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.8)] scale-105 z-10'
                    : 'h-11 w-11 opacity-45 hover:opacity-90 hover:scale-105 ring-1 ring-white/15'
                }`}
              >
                <TileArt
                  colors={g.colors}
                  title={g.title}
                  id={g.id}
                  isCircular={true}
                  className="h-full w-full"
                />

                {isFocused && (
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/40" />
                )}

                {/* Play indicator overlay on hover if focused */}
                {isFocused && (
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
                      <polygon points="6,3 20,12 6,21" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Title Underneath with no text clipping */}
              <span
                className={`mt-2 max-w-[68px] truncate text-center leading-tight transition-colors duration-200 ${
                  isFocused
                    ? 'text-[11px] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]'
                    : 'text-[10px] font-medium text-white/45'
                }`}
              >
                {g.title}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
