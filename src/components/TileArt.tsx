interface Props {
  colors: [string, string]
  title: string
  id?: string
  icon?: string
  className?: string
  isCircular?: boolean
  artPath?: string // custom art: data URL or native file path (loaded via read_art)
  artMime?: string
}

import { useEffect, useState } from 'react'
import { tryInvoke } from '../system/ipc'

// Procedural box art & game badge emblems — bespoke graphics for each title.
// Games with attached custom art render the real image instead.
export default function TileArt({ colors, title, id, icon, className = '', isCircular = false, artPath, artMime }: Props) {
  const normId = (id || title).toLowerCase().replace(/[^a-z0-9]/g, '')
  const initial = icon ?? title.charAt(0).toUpperCase()
  const [art, setArt] = useState<string | null>(
    artPath?.startsWith('data:') ? artPath : null,
  )

  useEffect(() => {
    let dead = false
    if (artPath?.startsWith('data:')) {
      setArt(artPath)
      return
    }
    if (artPath && !artPath.startsWith('http') && !artPath.startsWith('roms/')) {
      setArt(null)
      void (async () => {
        const res = await tryInvoke<{ dataUrl: string }>('read_art', { path: artPath })
        if (!dead && res) setArt(res.dataUrl)
      })()
    }
    return () => {
      dead = true
    }
  }, [artPath])

  if (art) {
    return (
      <img
        src={art}
        alt={title}
        className={`${className} ${isCircular ? 'rounded-full aspect-square object-cover' : 'object-cover'}`}
        draggable={false}
      />
    )
  }

  const renderGraphic = () => {
    if (icon) {
      return (
        <span className="text-3xl font-black drop-shadow-md text-white/90">
          {icon}
        </span>
      )
    }

    switch (normId) {
      case 'spaceinvaders':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="white">
            {/* 8-bit Space Invader Pixel Silhouette */}
            <path d="M12 8h6v4h-6zM30 8h6v4h-6zM15 12h18v4H15zM9 16h30v8H9zM6 24h36v8H6zM6 32h6v8H6zM15 32h6v4h-6zM27 32h6v4h-6zM36 32h6v8h-6zM12 20h6v4h-6zM30 20h6v4h-6z" fill="white" />
          </svg>
        )
      case 'brix':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(255,255,255,0.7)]" fill="none" stroke="white">
            <rect x="6" y="8" width="10" height="5" rx="1.5" fill="white" fillOpacity="0.9" />
            <rect x="19" y="8" width="10" height="5" rx="1.5" fill="white" fillOpacity="0.9" />
            <rect x="32" y="8" width="10" height="5" rx="1.5" fill="white" fillOpacity="0.9" />
            <rect x="12" y="16" width="10" height="5" rx="1.5" fill="white" fillOpacity="0.75" />
            <rect x="25" y="16" width="10" height="5" rx="1.5" fill="white" fillOpacity="0.75" />
            <circle cx="28" cy="27" r="3" fill="white" />
            <path d="M28 27 L18 36" stroke="white" strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.6" />
            <rect x="12" y="37" width="22" height="4" rx="2" fill="white" />
          </svg>
        )
      case 'tetris':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(255,255,255,0.7)]">
            {/* T-block */}
            <rect x="16" y="10" width="8" height="8" rx="1.5" fill="#f87171" stroke="#b91c1c" strokeWidth="0.8" />
            <rect x="24" y="10" width="8" height="8" rx="1.5" fill="#f87171" stroke="#b91c1c" strokeWidth="0.8" />
            <rect x="32" y="10" width="8" height="8" rx="1.5" fill="#f87171" stroke="#b91c1c" strokeWidth="0.8" />
            <rect x="24" y="18" width="8" height="8" rx="1.5" fill="#f87171" stroke="#b91c1c" strokeWidth="0.8" />
            {/* L-block */}
            <rect x="8" y="22" width="8" height="8" rx="1.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
            <rect x="8" y="30" width="8" height="8" rx="1.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
            <rect x="16" y="30" width="8" height="8" rx="1.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
            {/* Square */}
            <rect x="28" y="26" width="7" height="7" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
            <rect x="35" y="26" width="7" height="7" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
            <rect x="28" y="33" width="7" height="7" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
            <rect x="35" y="33" width="7" height="7" rx="1" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" />
          </svg>
        )
      case 'blinky':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="white">
            <path d="M12 24 C12 14, 36 14, 36 24 L36 38 L32 34 L28 38 L24 34 L20 38 L16 34 L12 38 Z" fill="white" />
            <circle cx="19" cy="22" r="3" fill="#1e1b4b" />
            <circle cx="20" cy="22" r="1.2" fill="white" />
            <circle cx="29" cy="22" r="3" fill="#1e1b4b" />
            <circle cx="30" cy="22" r="1.2" fill="white" />
          </svg>
        )
      case 'tank':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="none" stroke="white" strokeWidth="2">
            <rect x="8" y="25" width="32" height="12" rx="4" fill="white" fillOpacity="0.2" stroke="white" />
            <circle cx="14" cy="31" r="2.5" fill="white" />
            <circle cx="24" cy="31" r="2.5" fill="white" />
            <circle cx="34" cy="31" r="2.5" fill="white" />
            <path d="M16 25 C16 19, 30 19, 30 25 Z" fill="white" />
            <path d="M30 22 L42 20" stroke="white" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )
      case 'tron':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(56,189,248,0.9)]" fill="none">
            <path d="M4 36 L18 22 L34 22 L44 12" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
            <path d="M8 42 L24 26 L40 26" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
            <circle cx="44" cy="12" r="3" fill="#38bdf8" />
          </svg>
        )
      case 'missile':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="none" stroke="white" strokeWidth="2">
            <path d="M6 42 L24 16 L42 42" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
            <path d="M12 42 L24 24" stroke="white" strokeWidth="2.5" />
            <path d="M36 42 L24 24" stroke="white" strokeWidth="2.5" />
            <circle cx="24" cy="24" r="5" fill="#ef4444" stroke="white" strokeWidth="1.5" />
          </svg>
        )
      case 'ufo':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(34,211,238,0.8)]" fill="none">
            <ellipse cx="24" cy="22" rx="16" ry="6" fill="white" fillOpacity="0.8" stroke="white" strokeWidth="1.5" />
            <path d="M17 19 C17 13, 31 13, 31 19 Z" fill="#38bdf8" />
            <polygon points="18,27 30,27 36,42 12,42" fill="#38bdf8" fillOpacity="0.25" stroke="#38bdf8" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="16" cy="22" r="1.5" fill="#facc15" />
            <circle cx="24" cy="23" r="1.5" fill="#facc15" />
            <circle cx="32" cy="22" r="1.5" fill="#facc15" />
          </svg>
        )
      case 'syzygy':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(255,255,255,0.8)]" fill="none">
            <circle cx="24" cy="24" r="12" fill="white" />
            <circle cx="28" cy="22" r="10" fill="#090d16" />
            <ellipse cx="24" cy="24" rx="20" ry="7" stroke="white" strokeWidth="1.5" strokeDasharray="3 2" transform="rotate(-20 24 24)" />
          </svg>
        )
      case 'blitz':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="white">
            <rect x="6" y="24" width="7" height="18" rx="1" fill="white" fillOpacity="0.8" />
            <rect x="15" y="16" width="8" height="26" rx="1" fill="white" fillOpacity="0.9" />
            <rect x="25" y="20" width="7" height="22" rx="1" fill="white" fillOpacity="0.85" />
            <rect x="34" y="28" width="8" height="14" rx="1" fill="white" fillOpacity="0.75" />
            <path d="M10 8 L22 10 L16 13 Z" fill="white" />
          </svg>
        )
      case 'connect4':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" fill="none">
            <rect x="8" y="10" width="32" height="28" rx="4" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
            <circle cx="15" cy="18" r="3.5" fill="#f43f5e" />
            <circle cx="24" cy="18" r="3.5" fill="#facc15" />
            <circle cx="33" cy="18" r="3.5" fill="white" fillOpacity="0.3" />
            <circle cx="15" cy="28" r="3.5" fill="#facc15" />
            <circle cx="24" cy="28" r="3.5" fill="#f43f5e" />
            <circle cx="33" cy="28" r="3.5" fill="#f43f5e" />
          </svg>
        )
      case 'hidden':
        return (
          <svg viewBox="0 0 48 48" className="h-3/5 w-3/5 drop-shadow-[0_0_14px_rgba(255,255,255,0.8)]" fill="none" stroke="white" strokeWidth="2">
            <polygon points="24,6 40,15 40,33 24,42 8,33 8,15" stroke="white" strokeWidth="1.5" fill="white" fillOpacity="0.1" />
            <circle cx="24" cy="24" r="6" fill="white" fillOpacity="0.8" />
            <circle cx="24" cy="24" r="2" fill="#090d16" />
          </svg>
        )
      default:
        return (
          <span className="text-3xl font-black drop-shadow-md text-white/90">
            {initial}
          </span>
        )
    }
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
        isCircular ? 'rounded-full aspect-square' : ''
      } ${className}`}
      style={{
        background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
      }}
    >
      {/* Dynamic glossy specular highlights */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 100% at 20% 0%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 50%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(100% 80% at 80% 100%, rgba(0,0,0,0.45) 0%, transparent 60%)',
        }}
      />

      {/* Procedural Game Motif / Emblem */}
      <div className="relative z-10 flex h-full w-full items-center justify-center transition-transform duration-300 hover:scale-105">
        {renderGraphic()}
      </div>

      {/* Ghost initial watermark in bottom corner for cards */}
      {!isCircular && (
        <span className="pointer-events-none absolute -bottom-3 -right-1 text-[5.5rem] font-black leading-none text-white/10 select-none">
          {initial}
        </span>
      )}

      {/* Subtle rim border */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/20" />
    </div>
  )
}
