import { useState, useRef } from 'react'
import type { Game } from '../system/library'
import TileArt from './TileArt'
import { sfx } from '../lib/sound'

interface Props {
  games: Game[]
  sel: number
  onSelect: (i: number) => void
  onLaunch: (game: Game) => void
  onPrev?: () => void
  onNext?: () => void
  onOpenSettings?: () => void
  onOpenSpotify?: () => void
  onOpenFiles?: () => void
  onOpenSearch?: () => void
}

export default function OrbitalCrescent({
  games,
  sel,
  onSelect,
  onLaunch,
  onPrev,
  onNext,
}: Props) {
  // Rotation controls for the circular profile icon on far left
  const [isRotating, setIsRotating] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const wheelThrottle = useRef<number>(0)

  // Geometric coordinates for concentric orbital HUD
  const CX = 30 // Origin X: over 57% of profile circle is on-screen
  const R_HERO = 150 // Radius of profile disc (diameter = 300px)
  const R_TRACK = 340 // Radius of game arc track
  const R_OUTER = 440 // Outer faint boundary curve

  const activeGame = games[sel] ?? games[0]

  const handlePrev = () => {
    sfx.travel()
    if (onPrev) {
      onPrev()
    } else {
      onSelect((sel - 1 + games.length) % games.length)
    }
  }

  const handleNext = () => {
    sfx.travel()
    if (onNext) {
      onNext()
    } else {
      onSelect((sel + 1) % games.length)
    }
  }

  // Mouse wheel scroll to cycle crescent smoothly
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 15) return
    const now = Date.now()
    if (now - wheelThrottle.current < 160) return
    wheelThrottle.current = now
    if (e.deltaY < 0) {
      handlePrev()
    } else {
      handleNext()
    }
  }

  // Calculate visible arc slots: -3, -2, -1, 0 (middle main), 1, 2, 3
  const visibleOffsets = games.length >= 7 ? [-3, -2, -1, 0, 1, 2, 3] : [-1, 0, 1]
  const visibleSlots = visibleOffsets.map((k) => {
    const gameIndex = ((sel + k) % games.length + games.length) % games.length
    return {
      k,
      gameIndex,
      game: games[gameIndex],
    }
  })

  return (
    <div
      onWheel={handleWheel}
      className="pointer-events-none fixed left-0 top-0 bottom-0 z-30 w-[520px] select-none overflow-visible"
    >
      {/* Container with origin at (CX, 50% viewport height) */}
      <div className="absolute top-1/2 -translate-y-1/2" style={{ left: CX }}>
        {/* SVG Concentric Orbital Rings */}
        <svg
          className="absolute -top-[520px] -left-[520px] h-[1040px] w-[1040px] pointer-events-none"
          viewBox="-520 -520 1040 1040"
        >
          {/* Outer Boundary Arc */}
          <circle
            cx="0"
            cy="0"
            r={R_OUTER}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1.2"
          />

          {/* Middle Game Track Arc */}
          <circle
            cx="0"
            cy="0"
            r={R_TRACK}
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="1.5"
          />

          {/* Track Dash Accent Arc */}
          <circle
            cx="0"
            cy="0"
            r={R_TRACK}
            fill="none"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth="2.5"
            strokeDasharray="3 24"
            className="opacity-35"
          />

          {/* Inner Boundary Arc */}
          <circle
            cx="0"
            cy="0"
            r={R_HERO + 18}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />
        </svg>

        {/* Profile / Hero Icon on Far Left */}
        {activeGame && (
          <div
            className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 select-none"
            style={{
              width: R_HERO * 2,
              height: R_HERO * 2,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => {
              sfx.select()
              setIsRotating((prev) => !prev)
            }}
            title={isRotating ? 'Click to pause rotation' : 'Click to start rotation'}
          >
            {/* Outer glowing halo ring */}
            <div className="absolute inset-0 rounded-full border border-white/35 shadow-[0_0_35px_rgba(255,255,255,0.2),inset_0_0_25px_rgba(0,0,0,0.85)] overflow-hidden transition-all duration-300 group-hover:border-white/65 group-hover:shadow-[0_0_45px_rgba(255,255,255,0.35)]">
              {/* Rotating inner artwork */}
              <div
                className="h-full w-full"
                style={{
                  animation: 'spin-slow 28s linear infinite',
                  animationPlayState: !isRotating || isHovered ? 'paused' : 'running',
                }}
              >
                <TileArt
                  colors={activeGame.colors}
                  title={activeGame.title}
                  id={activeGame.id}
                  isCircular={true}
                  className="h-full w-full scale-105"
                />
              </div>

              {/* Radial depth vignette */}
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 55% 50%, transparent 42%, rgba(0,0,0,0.7) 100%)',
                }}
              />
            </div>

            {/* Hover option badge */}
            <div className="pointer-events-none absolute left-[85%] top-1/2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
              <div className="glass-pill flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shadow-lg whitespace-nowrap border border-white/20">
                <span>{isRotating ? 'â¸' : 'â–¶'}</span>
                <span>{isRotating ? 'Click to Pause' : 'Click to Rotate'}</span>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            CRESCENT ARC ARROW CHEVRONS: Ultra-sleek Glass Controls
            â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

        {/* Up Arrow Button (Flanking Above Middle Selector) */}
        <button
          type="button"
          onClick={handlePrev}
          title="Previous Game (Arrow Up / Left)"
          aria-label="Previous Game"
          style={{ left: 330, top: -72 }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white/60 hover:text-white hover:border-white hover:bg-white/25 hover:scale-120 hover:shadow-[0_0_20px_rgba(255,255,255,0.85)] active:scale-90 transition-all duration-200 cursor-pointer z-40 group"
        >
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Down Arrow Button (Flanking Below Middle Selector) */}
        <button
          type="button"
          onClick={handleNext}
          title="Next Game (Arrow Down / Right)"
          aria-label="Next Game"
          style={{ left: 330, top: 72 }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white/60 hover:text-white hover:border-white hover:bg-white/25 hover:scale-120 hover:shadow-[0_0_20px_rgba(255,255,255,0.85)] active:scale-90 transition-all duration-200 cursor-pointer z-40 group"
        >
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-y-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Upper Arc Tip Arrow Button */}
        <button
          type="button"
          onClick={handlePrev}
          title="Scroll Up (Arrow Up)"
          aria-label="Scroll Up"
          style={{ left: 92, top: -326 }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white/40 hover:text-white hover:border-white/70 hover:bg-white/20 hover:scale-120 hover:shadow-[0_0_16px_rgba(255,255,255,0.75)] active:scale-90 transition-all duration-200 cursor-pointer z-30 group"
        >
          <svg
            className="w-3 h-3 transition-transform duration-200 group-hover:-translate-y-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Lower Arc Tip Arrow Button */}
        <button
          type="button"
          onClick={handleNext}
          title="Scroll Down (Arrow Down)"
          aria-label="Scroll Down"
          style={{ left: 92, top: 326 }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white/40 hover:text-white hover:border-white/70 hover:bg-white/20 hover:scale-120 hover:shadow-[0_0_16px_rgba(255,255,255,0.75)] active:scale-90 transition-all duration-200 cursor-pointer z-30 group"
        >
          <svg
            className="w-3 h-3 transition-transform duration-200 group-hover:translate-y-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            CRESCENT ARC GAMES: Side Icons Faded & Small, Middle Big & White
            â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {visibleSlots.map(({ k, game, gameIndex }) => {
          if (!game) return null
          const isMiddle = k === 0
          const ak = Math.abs(k)

          // Smooth curved angle distribution along orbital track
          const angleDeg =
            k === 0
              ? 0
              : k === 1
                ? 28
                : k === -1
                  ? -28
                  : k === 2
                    ? 48
                    : k === -2
                      ? -48
                      : k > 0
                        ? 68
                        : -68

          const rad = (angleDeg * Math.PI) / 180
          const x = R_TRACK * Math.cos(rad)
          const y = R_TRACK * Math.sin(rad)

          return (
            <div
              key={game.id}
              onClick={() => {
                if (isMiddle) {
                  sfx.launch()
                  onLaunch(game)
                } else {
                  sfx.travel()
                  onSelect(gameIndex)
                }
              }}
              style={{
                left: x,
                top: y,
                zIndex: isMiddle ? 35 : 20 - ak,
                transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer select-none ${
                isMiddle ? 'group/mid' : 'group/arc'
              }`}
            >
              {/* Game Badge Riding the Arc: Faded & small on sides, Big & Highlighted in Middle */}
              <div
                className={`relative flex items-center justify-center rounded-full transition-all duration-350 ease-out ${
                  isMiddle
                    ? 'h-20 w-20 ring-2 ring-white/70 shadow-[0_0_28px_rgba(255,255,255,0.4)] group-hover/mid:scale-135 group-hover/mid:ring-4 group-hover/mid:ring-white group-hover/mid:shadow-[0_0_75px_rgba(255,255,255,1),0_0_35px_rgba(255,255,255,0.95),inset_0_0_18px_rgba(255,255,255,0.7)]'
                    : ak === 1
                      ? 'h-9 w-9 opacity-35 grayscale-[35%] brightness-90 hover:opacity-85 hover:scale-115 hover:grayscale-0 hover:brightness-100 ring-1 ring-white/15'
                      : ak === 2
                        ? 'h-7.5 w-7.5 opacity-20 grayscale-[55%] brightness-75 hover:opacity-70 hover:scale-110 hover:grayscale-0 hover:brightness-100 ring-1 ring-white/10'
                        : 'h-6 w-6 opacity-12 grayscale-[70%] brightness-60 hover:opacity-50 hover:scale-105 ring-1 ring-white/5'
                }`}
              >
                <TileArt
                  colors={game.colors}
                  title={game.title}
                  id={game.id}
                  isCircular={true}
                  className="h-full w-full"
                />

                {/* Inner Specular Light Highlights on Middle Icon */}
                {isMiddle && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/50 group-hover/mid:ring-white/95 transition-all duration-300" />
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/10 to-white/35 opacity-40 group-hover/mid:opacity-80 transition-opacity duration-300" />
                  </>
                )}
              </div>

              {/* Middle Main Selection Badge on Hover â€” Open App */}
              {isMiddle && (
                <div className="pointer-events-none absolute left-full ml-4 opacity-0 group-hover/mid:opacity-100 transition-all duration-300 translate-x-3 group-hover/mid:translate-x-0 whitespace-nowrap z-50">
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white text-black font-black text-xs shadow-[0_0_35px_rgba(255,255,255,0.95)] border border-white">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white text-[10px]">
                      â–¶
                    </span>
                    <span className="tracking-wider uppercase">Open {game.title}</span>
                    <span className="text-[10px] font-bold text-black/60 bg-black/10 px-1.5 py-0.5 rounded">
                      Enter
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
