import type { GameDef } from '../lib/games'
import TileArt from './TileArt'

interface Props {
  game: GameDef
  onPlay: () => void
  onBack: () => void
}

export default function DetailView({ game, onPlay, onBack }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center gap-16 px-[8vw] anim-fade-up">
      <div className="relative w-[46vw] max-w-[760px] shrink-0">
        <TileArt colors={game.colors} title={game.title} className="aspect-video w-full rounded-[28px]" />
        <div
          className="absolute -inset-6 -z-10 rounded-[44px] opacity-60 blur-2xl"
          style={{ background: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
        />
        <div className="absolute inset-0 rounded-[28px] ring-1 ring-white/20" />
      </div>

      <div className="flex max-w-[520px] flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--acc)]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">
            CHIP-8
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">
            {game.year}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">
            {game.author}
          </span>
        </div>

        <h1 className="text-6xl font-black leading-none tracking-tight">{game.title}</h1>
        <div className="text-lg font-semibold text-[var(--acc)]">{game.tagline}</div>
        <p className="text-[15px] leading-relaxed text-white/65">{game.desc}</p>

        <div className="mt-1 rounded-2xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/45">
          <span className="font-bold text-white/70">Controls:</span> keypad 1 2 3 4 / Q W E R / A S D F / Z X C V · Esc pauses
        </div>

        <button
          onClick={onPlay}
          className="mt-2 flex w-fit items-center gap-3 rounded-full px-9 py-4 text-base font-extrabold text-white transition-transform duration-150 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})`,
            boxShadow: `0 0 40px -8px ${game.colors[0]}`,
          }}
        >
          <span className="text-xl leading-none">▶</span> PLAY
        </button>
      </div>

      <button onClick={onBack} className="sr-only" aria-label="Back" />
    </div>
  )
}
