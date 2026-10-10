// The Library — real file manager: custom game import (PE-identified), Steam
// library scan, ROM folder scan with hash ID, per-game edit/remove, safe
// deletion (Recycle Bin + confirm). Replaces the static M3 placeholder.

import { useCallback, useEffect, useState } from 'react'
import { getGames, identifyFile, scanSteam, scanRomFolder, removeGame, saveGame, type Game, type RomScanResult, type SteamScanResult, type IdentifyResult } from '../system/library'
import { sfx } from '../system/mixer'
import { invoke, isTauri, tryInvoke } from '../system/ipc'
import { getPlaytime } from '../system/db'
import { fetchArt, type ScrapeResult } from '../system/scrape'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelectGame: (index: number) => void
}

type ScanState = { busy: boolean; msg: string }

export default function LibraryModal({ isOpen, onClose, onSelectGame }: Props) {
  const [games, setGames] = useState<Game[]>([])
  const [sel, setSel] = useState(0)
  const [scan, setScan] = useState<ScanState>({ busy: false, msg: '' })
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Game | null>(null)
  const [playtimes, setPlaytimes] = useState<Record<string, number>>({})

  const refresh = useCallback(async () => {
    const g = getGames()
    setGames(g)
    const pt: Record<string, number> = {}
    for (const game of g) pt[game.id] = await getPlaytime(game.id)
    setPlaytimes(pt)
  }, [])

  useEffect(() => {
    if (isOpen) void refresh()
  }, [isOpen, refresh])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (confirmRemove) return
      if (e.code === 'Escape') {
        e.preventDefault()
        sfx.back()
        onClose()
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => (s + games.length - 1) % Math.max(1, games.length))
        sfx.travel()
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => (s + 1) % Math.max(1, games.length))
        sfx.travel()
      } else if (e.code === 'Enter' && games[sel]) {
        e.preventDefault()
        sfx.select()
        onSelectGame(games.findIndex((g) => g.id === games[sel].id))
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, games, sel, onClose, onSelectGame, confirmRemove])

  const doSteamScan = async () => {
    setScan({ busy: true, msg: 'Scanning Steam libraries…' })
    sfx.launch()
    const res: SteamScanResult = (await scanSteam()) ?? { found: 0, added: 0, skipped: 0 }
    setScan({ busy: false, msg: `Steam: ${res.found} found · ${res.added} added${res.skipped ? ` · ${res.skipped} skipped` : ''}` })
    void refresh()
    sfx.chime()
  }

  const doRomScan = async () => {
    setScan({ busy: true, msg: 'Pick a ROM folder…' })
    const folder = isTauri() ? await tryInvoke<string>('pick_rom_folder') : null
    if (!folder) {
      setScan({ busy: false, msg: 'Scan cancelled' })
      return
    }
    setScan({ busy: true, msg: 'Scanning ROMs + hashing…' })
    sfx.launch()
    const res: RomScanResult = (await scanRomFolder(folder)) ?? { found: 0, added: 0, recognized: 0 }
    setScan({ busy: false, msg: `ROMs: ${res.found} found · ${res.recognized} identified · ${res.added} added` })
    void refresh()
    sfx.chime()
  }

  const doAddGame = async () => {
    setAdding(true)
    setScan({ busy: true, msg: 'Pick a game file…' })
    const picked = isTauri() ? await tryInvoke<string>('pick_game_file', { mode: 'file' }) : null
    if (!picked) {
      setAdding(false)
      setScan({ busy: false, msg: 'Import cancelled' })
      return
    }
    setScan({ busy: true, msg: 'Identifying executable…' })
    const res: IdentifyResult | null = await identifyFile(picked)
    if (res) {
      const { saveGame } = await import('../system/library')
      await saveGame(res.game)
      setScan({ busy: false, msg: res.identified ? res.detail : res.detail })
      sfx.chime()
      void refresh()
    } else {
      setScan({ busy: false, msg: 'Could not identify that file' })
      sfx.error()
    }
    setAdding(false)
  }

  const doRemove = async (game: Game, deleteFiles: boolean) => {
    await removeGame(game.id, deleteFiles)
    setConfirmRemove(null)
    void refresh()
    sfx.back()
  }

  const doFetchArt = async (game: Game) => {
    setScan({ busy: true, msg: `Fetching art for ${game.title}…` })
    const res = (await fetchArt(game.title)) as ScrapeResult | { error: string }
    if ('error' in res) {
      setScan({ busy: false, msg: res.error })
      sfx.error()
      return
    }
    await saveGame({
      id: game.id,
      artPath: res.art ?? game.artPath,
      bannerPath: res.banner ?? game.bannerPath,
      logoPath: res.logo ?? game.logoPath,
      colors: game.colors,
    })
    setScan({ busy: false, msg: `Art updated via ${res.source} ✓` })
    sfx.chime()
    void refresh()
  }

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)' }}>
      <div className="glass flex w-[900px] max-w-[95vw] flex-col rounded-[28px] p-6 anim-fade-up" style={{ maxHeight: '86vh' }}>
        <div className="mb-4 flex items-center justify-between px-2">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Library</h2>
            <div className="text-xs text-white/40">{games.length} games · local database · 100% offline</div>
          </div>
          <button className="rounded-full px-3 py-1 text-xs font-bold text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => { sfx.back(); onClose() }}>
            ✕
          </button>
        </div>

        {/* actions */}
        <div className="mb-3 grid grid-cols-3 gap-2 px-2">
          <button
            className="rounded-2xl bg-white/8 px-3 py-3 text-xs font-bold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            disabled={scan.busy}
            onClick={() => void doAddGame()}
          >
            ➕ Add PC Game
          </button>
          <button
            className="rounded-2xl bg-white/8 px-3 py-3 text-xs font-bold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            disabled={scan.busy}
            onClick={() => void doSteamScan()}
          >
            🎮 Scan Steam
          </button>
          <button
            className="rounded-2xl bg-white/8 px-3 py-3 text-xs font-bold text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            disabled={scan.busy}
            onClick={() => void doRomScan()}
          >
            📀 Scan ROM Folder
          </button>
        </div>
        {scan.msg && (
          <div className="mx-2 mb-3 rounded-2xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/60">
            {scan.busy && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--acc)]" />}
            {scan.msg}
          </div>
        )}

        {/* game list */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-2">
          {games.map((g, i) => (
            <div
              key={g.id}
              className={`group mb-2 flex cursor-pointer items-center gap-4 rounded-2xl px-4 py-3 transition-all duration-200 ${
                sel === i ? 'bg-white/12 ring-1 ring-[var(--acc)]' : 'bg-white/4 hover:bg-white/8'
              }`}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                sfx.select()
                onSelectGame(games.findIndex((x) => x.id === g.id))
                onClose()
              }}
            >
              <GameArt game={g} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white/90">{g.title}</div>
                <div className="truncate text-[11px] text-white/40">
                  {[g.platform, g.publisher].filter(Boolean).join(' · ') || g.tagline}
                </div>
              </div>
              <div className="text-right text-[11px] text-white/45">
                <div>{formatSecs(playtimes[g.id] ?? 0)}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/30">{g.source}</div>
              </div>
              <button
                className="rounded-full px-2 py-1 text-xs text-white/30 opacity-0 transition hover:bg-white/10 hover:text-emerald-300 group-hover:opacity-100"
                title="Fetch box art / banner online (Steam keyless, optional keys)"
                onClick={(e) => {
                  e.stopPropagation()
                  void doFetchArt(g)
                }}
              >
                🌐
              </button>
              <button
                className="rounded-full px-2 py-1 text-xs text-white/30 opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                title="Remove (Recycle Bin, with confirm)"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmRemove(g)
                }}
              >
                🗑
              </button>
            </div>
          ))}
          {games.length === 0 && (
            <div className="py-10 text-center text-sm text-white/40">
              Library is empty — add a PC game or scan a folder above
            </div>
          )}
        </div>

        <div className="pt-2 text-center text-[11px] text-white/30">↑↓ move · Enter focus on shelf · Esc close</div>
      </div>

      {/* remove confirmation — never deletes silently */}
      {confirmRemove && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 anim-fade-in" style={{ backdropFilter: 'blur(8px)' }}>
          <div className="glass w-[420px] rounded-3xl p-6">
            <div className="mb-2 text-lg font-black">Remove "{confirmRemove.title}"?</div>
            <div className="mb-5 text-xs text-white/50">
              {confirmRemove.exePath
                ? 'Game files can be sent to the Recycle Bin (recoverable).'
                : 'The library entry is removed. Files stay untouched.'}
            </div>
            <div className="flex flex-col gap-2">
              {confirmRemove.exePath && (
                <button className="rounded-2xl bg-red-500/20 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/35" onClick={() => void doRemove(confirmRemove, true)}>
                  Remove + Recycle Bin files
                </button>
              )}
              <button className="rounded-2xl bg-white/8 px-4 py-3 text-sm font-bold text-white/80 transition hover:bg-white/15" onClick={() => void doRemove(confirmRemove, false)}>
                Remove entry only
              </button>
              <button className="rounded-2xl px-4 py-3 text-sm font-bold text-white/50 transition hover:bg-white/8" onClick={() => { setConfirmRemove(null); sfx.back() }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GameArt({ game }: { game: Game }) {
  const [art, setArt] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    if (game.artPath) {
      if (game.artPath.startsWith('data:')) {
        setArt(game.artPath)
      } else if (isTauri()) {
        void invoke<{ dataUrl: string }>('read_art', { path: game.artPath }).then((r) => {
          if (!dead && r) setArt(r.dataUrl)
        }).catch(() => undefined)
      }
    }
    return () => {
      dead = true
    }
  }, [game.artPath])
  if (art) {
    return <img src={art} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" style={{ boxShadow: `0 0 18px -6px ${game.colors[0]}` }} />
  }
  // procedural fallback: initial + gradient
  const initial = game.title.charAt(0).toUpperCase()
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white/90"
      style={{ background: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})`, boxShadow: `0 0 18px -6px ${game.colors[0]}` }}
    >
      {initial}
    </div>
  )
}

function formatSecs(s: number): string {
  if (!s) return 'Never'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
