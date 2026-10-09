import type { GameDef } from '../lib/games'
import TileArt from './TileArt'

// Radial fan: circle icons ride the arc; the focused one blooms into a
// vertical portrait card. Compact — the fan tucks into the left third.

const HUB_X = 44
const R = 470
const STEP = 26 // degrees between slots
const BOX_W = 210 // fixed wrapper: no layout jumps, only inner morphs
const BOX_H = 286
const CIRC = 112 // neighbor circle diameter
const CARD_W = 196 // focused portrait card
const CARD_H = 272

interface Props {
  games: GameDef[]
  sel: number
  accent: [string, string]
  onSelect: (i: number) => void
}

export default function Crescent({ games, sel, accent, onSelect }: Props) {
  const items = [...games, null] // null = Settings tile

  return (
    <div className="absolute inset-0 z-20">
      {items.map((g, i) => {
        const k = i - sel
        const ak = Math.abs(k)
        if (ak > 4) return null
        const phi = (k * STEP * Math.PI) / 180
        const x = HUB_X + R * Math.cos(phi)
        const y = -R * Math.sin(phi)
        const rot = -k * STEP * 0.8
        const focused = k === 0
        const colors: [string, string] = g ? g.colors : accent

        const innerW = focused ? CARD_W : CIRC * Math.pow(0.93, ak)
        const innerH = focused ? CARD_H : innerW
        const radius = focused ? 26 : '50%'
        const opacity = focused ? 1 : Math.max(0.35, 0.95 - ak * 0.16)

        return (
          <div
            key={g ? g.id : 'settings'}
            className="absolute left-0 top-1/2 cursor-pointer"
            style={{
              width: BOX_W,
              height: BOX_H,
              transform: `translate(${x - BOX_W / 2}px, ${y - BOX_H / 2}px) rotate(${rot}deg)`,
              opacity,
              zIndex: 100 - ak,
              willChange: 'transform, opacity',
              transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease',
            }}
            onClick={() => onSelect(i)}
          >
            <div className="relative h-full w-full">
              {/* morphing shape: circle <-> portrait card */}
              <div
                className="absolute left-1/2 top-1/2 overflow-hidden"
                style={{
                  width: innerW,
                  height: innerH,
                  borderRadius: radius,
                  transform: 'translate(-50%, -50%)',
                  transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1), height 0.5s cubic-bezier(0.22,1,0.36,1), border-radius 0.5s ease',
                  boxShadow: focused
                    ? `0 0 52px -8px ${colors[0]}, 0 24px 60px -16px rgba(0,0,0,0.65)`
                    : '0 8px 22px -12px rgba(0,0,0,0.55)',
                }}
              >
                <TileArt
                  colors={colors}
                  title={g ? g.title : 'Settings'}
                  icon={g ? undefined : '⚙'}
                  className="h-full w-full"
                />
                {!focused && <div className="absolute inset-0 rounded-[50%]" style={{ background: 'rgba(0,0,0,0.16)' }} />}
              </div>

              {focused && (
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-b-[26px] px-4 pb-4 pt-12"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), transparent)' }}
                  />
                  <div className="relative w-full px-4 pb-4 text-center">
                    <div className="truncate text-lg font-extrabold leading-tight">{g ? g.title : 'Settings'}</div>
                    <div className="truncate text-xs text-white/60">{g ? g.tagline : 'Themes · General'}</div>
                  </div>
                </div>
              )}

              {focused && (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[30px] ring-2 ring-white/70"
                  style={{ width: CARD_W + 8, height: CARD_H + 8 }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
