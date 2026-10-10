import type { Game } from '../system/library'
import { sfx } from '../lib/sound'

interface Props {
  game: Game
  onPlay: () => void
  onOptions?: () => void
  className?: string
}

export default function HeroGame({ game, onPlay, onOptions, className = '' }: Props) {
  return (
    <section
      className={`pointer-events-none absolute left-[42vw] lg:left-[43vw] top-[42%] -translate-y-1/2 z-20 max-w-lg lg:max-w-xl select-none anim-fade-in ${className}`}
      aria-label="Selected Game Details"
    >
      {/* Category / Eyebrow Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[11px] font-bold tracking-[0.35em] uppercase text-white/55">
          {game.title}
        </span>
        <span className="h-1 w-1 rounded-full bg-white/30" />
        <span className="text-[11px] font-semibold tracking-wider text-[var(--acc)] uppercase">
          CHIP-8 CLASSIC
        </span>
      </div>

      {/* Hero Game Title */}
      <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none text-white uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] mb-3">
        {game.title}
      </h1>

      {/* Subtitle / Tagline */}
      <div className="text-xs md:text-sm font-bold tracking-wide text-cyan-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] mb-3.5 uppercase">
        {game.tagline}
      </div>

      {/* Description */}
      <p className="text-xs md:text-sm text-white/70 max-w-md lg:max-w-lg leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] mb-6">
        {game.desc}
      </p>

      {/* Action Buttons: Play Pill + 3-Dots Circle */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Play Button */}
        <button
          onClick={() => {
            sfx.launch()
            onPlay()
          }}
          className="group flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-sm font-black text-black shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:bg-white/95 hover:shadow-[0_0_40px_rgba(255,255,255,0.45)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <svg
            className="h-3.5 w-3.5 fill-black transition-transform duration-200 group-hover:scale-110"
            viewBox="0 0 24 24"
          >
            <polygon points="6,3 20,12 6,21" />
          </svg>
          <span className="tracking-wide">Play</span>
        </button>

        {/* Secondary Options Button (3 dots) */}
        <button
          onClick={() => {
            sfx.select()
            onOptions?.()
          }}
          title="Game Options"
          aria-label="Game Options"
          className="flex h-11 w-11 items-center justify-center rounded-full glass border border-white/20 text-white/75 hover:text-white hover:border-white/50 hover:bg-white/15 hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>
    </section>
  )
}
