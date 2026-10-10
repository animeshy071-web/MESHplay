import { useEffect, useState } from 'react'
import type { Game } from '../system/library'
import TileArt from './TileArt'
import { formatPlaytime } from '../lib/playtime'
import { detectProtection } from '../system/anticheat'
import { raProgressForGame, getRaCredentials, setRaCredentials, type RaProgress } from '../system/retro'
import { tryInvoke } from '../system/ipc'

interface Props {
  game: Game
  onPlay: () => void
  onBack: () => void
}

function controlsFor(game: Game): string {
  if (game.kind === 'chip8') return 'Keypad 1 2 3 4 / Q W E R / A S D F / Z X C V · Esc pauses'
  if (game.kind === 'gb') return 'Arrows · Z = B · X = A · Enter = Start · Shift = Select · Esc pauses'
  if (detectProtection(game).protected) return 'Standard controller · anti-cheat safe (no remap)'
  return 'Standard controller · remap layer optional in Settings'
}

export default function DetailView({ game, onPlay, onBack }: Props) {
  const platform = game.platform ?? (game.kind === 'gb' ? 'Game Boy' : game.kind === 'chip8' ? 'CHIP-8' : 'PC (Native)')
  const byline = game.developer || game.author
  const tags = (game.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const protection = game.kind === 'native' ? detectProtection(game) : null

  // RetroAchievements: hash the ROM and pull the player's progress (optional)
  const [ra, setRa] = useState<RaProgress | null>(null)
  const [raState, setRaState] = useState<'idle' | 'checking' | 'none' | 'error'>('idle')
  const [raUser, setRaUser] = useState('')
  const [raKey, setRaKey] = useState('')
  const [raConnecting, setRaConnecting] = useState(false)
  const emulated = game.kind === 'chip8' || game.kind === 'gb'

  useEffect(() => {
    if (!emulated || !getRaCredentials()) return
    setRaState('checking')
    let dead = false
    void (async () => {
      try {
        const bytes = await readRomBytes(game)
        const progress = bytes ? await raProgressForGame(async () => bytes) : null
        if (dead) return
        setRa(progress)
        setRaState(progress ? 'idle' : 'none')
      } catch {
        if (!dead) setRaState('error')
      }
    })()
    return () => {
      dead = true
    }
  }, [game.id, emulated, game.rom])

  const connectRa = async () => {
    if (!raUser.trim() || !raKey.trim()) return
    setRaConnecting(true)
    setRaCredentials(raUser, raKey)
    try {
      const bytes = await readRomBytes(game)
      const progress = bytes ? await raProgressForGame(async () => bytes) : null
      setRa(progress)
      setRaState(progress ? 'idle' : 'none')
    } catch {
      setRaState('error')
    }
    setRaConnecting(false)
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center gap-16 px-[8vw] anim-fade-up">
      <div className="relative w-[46vw] max-w-[760px] shrink-0">
        <TileArt
          colors={game.colors}
          title={game.title}
          className="aspect-video w-full rounded-[28px]"
          artPath={game.bannerPath ?? game.artPath}
          artMime={game.artMime}
        />
        <div
          className="absolute -inset-6 -z-10 rounded-[44px] opacity-60 blur-2xl"
          style={{ background: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
        />
        <div className="absolute inset-0 rounded-[28px] ring-1 ring-white/20" />
        {game.logoPath && (
          <img src={game.logoPath} alt="" className="absolute -bottom-8 left-6 h-16 max-w-[70%] object-contain drop-shadow-2xl" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        )}
      </div>

      <div className="flex max-w-[520px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--acc)]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">
            {platform}
          </span>
          {game.year && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">
              {game.year}
            </span>
          )}
          {byline && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">
              {byline}
            </span>
          )}
          {game.publisher && game.publisher !== byline && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/60">
              {game.publisher}
            </span>
          )}
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/45">
              {t}
            </span>
          ))}
          {protection?.protected && (
            <span
              className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300"
              title="Input remapping is disabled for this game"
            >
              🛡 {protection.brand}
            </span>
          )}
        </div>

        <h1 className="text-6xl font-black leading-none tracking-tight">{game.title}</h1>
        <div className="text-lg font-semibold text-[var(--acc)]">{game.tagline}</div>
        {game.desc && <p className="text-[15px] leading-relaxed text-white/65">{game.desc}</p>}

        <div className="flex items-center gap-4 text-xs text-white/40">
          <span>{formatPlaytime(game.id)}</span>
          {game.seconds != null && game.seconds > 0 && <span>{Math.floor(game.seconds / 3600) > 0 ? `${Math.floor(game.seconds / 3600)}h ${Math.floor((game.seconds % 3600) / 60)}m total` : `${Math.floor(game.seconds / 60)}m total`}</span>}
        </div>

        <div className="mt-1 rounded-2xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/45">
          <span className="font-bold text-white/70">Controls:</span> {controlsFor(game)}
        </div>

        {/* RetroAchievements (emulated games, optional) */}
        {emulated && (
          ra ? (
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-widest text-white/45">🏆 RetroAchievements</span>
                <span className="text-xs font-bold text-[var(--acc)]">{ra.earned}/{ra.total} · {ra.points} pts</span>
              </div>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--acc)] to-[var(--acc2)]" style={{ width: ra.total ? `${(ra.earned / ra.total) * 100}%` : '0%' }} />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {ra.achievements.slice(0, 12).map((a) => (
                  <div
                    key={a.title}
                    title={`${a.title} — ${a.description}`}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${a.earned ? 'ring-2 ring-[var(--acc)]' : 'opacity-30 grayscale'}`}
                  >
                    {a.badge ? <img src={a.badge} alt={a.title} className="h-full w-full object-cover" /> : '🏆'}
                  </div>
                ))}
              </div>
            </div>
          ) : raState === 'checking' ? (
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/40">Checking RetroAchievements…</div>
          ) : raState === 'none' ? (
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/35">This ROM isn't in the RetroAchievements database yet.</div>
          ) : !getRaCredentials() ? (
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-white/45">🏆 RetroAchievements</div>
              <div className="mb-3 text-xs text-white/45">Link your account to track achievements for this ROM.</div>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Username" value={raUser} onChange={(e) => setRaUser(e.target.value)} spellCheck={false} />
                <input className="input flex-1" placeholder="Web API key" type="password" value={raKey} onChange={(e) => setRaKey(e.target.value)} spellCheck={false} />
                <button
                  className="rounded-xl bg-[var(--acc)] px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                  disabled={raConnecting || !raUser.trim() || !raKey.trim()}
                  onClick={() => void connectRa()}
                >
                  {raConnecting ? '…' : 'Link'}
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-white/30">Key stays on this PC · generate one at retroachievements.org → Settings → Keys</div>
            </div>
          ) : null
        )}

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

/** Load ROM bytes for RA hashing: absolute path (Tauri) or bundled file. */
async function readRomBytes(game: Game): Promise<Uint8Array | null> {
  try {
    if (game.rom && (game.rom.includes('\\') || game.rom.includes('/'))) {
      const b64 = await tryInvoke<string>('read_rom_bytes', { path: game.rom })
      return b64 ? base64ToBytes(b64) : null
    }
    if (game.rom) {
      const r = await fetch(`${import.meta.env.BASE_URL}roms/${game.rom}`)
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    }
  } catch {
    /* unreadable */
  }
  return null
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
