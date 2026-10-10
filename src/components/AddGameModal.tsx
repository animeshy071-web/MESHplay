// Add/Edit Game dialog — the custom game addition dialog: edit title,
// developer, publisher, genre tags, attach custom box art / banner / logo,
// set launch arguments and working directory, pair emulator cores.

import { useEffect, useState } from 'react'
import { saveGame, removeGame, type Game } from '../system/library'
import { sfx } from '../system/mixer'
import { isTauri, tryInvoke } from '../system/ipc'
import { fetchArt, getApiKeys, setApiKeys, type ScrapeResult } from '../system/scrape'

interface Props {
  game: Game | null // null = create new (from picked file)
  onSaved: () => void
  onClose: () => void
}

interface ArtPreview {
  artPath?: string
  bannerPath?: string
  logoPath?: string
}

export default function AddGameModal({ game, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(game?.title ?? '')
  const [tagline, setTagline] = useState(game?.tagline ?? '')
  const [desc, setDesc] = useState(game?.desc ?? '')
  const [developer, setDeveloper] = useState(game?.developer ?? '')
  const [publisher, setPublisher] = useState(game?.publisher ?? '')
  const [year, setYear] = useState(game?.year?.toString() ?? '')
  const [args, setArgs] = useState(game?.args ?? '')
  const [workDir, setWorkDir] = useState(game?.workDir ?? '')
  const [exePath, setExePath] = useState(game?.exePath ?? '')
  const [kind, setKind] = useState(game?.kind ?? 'native')
  const [tags, setTags] = useState(game?.tags ?? '')
  const [art, setArt] = useState<ArtPreview>({})
  const [busy, setBusy] = useState(false)
  const [fetchingArt, setFetchingArt] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [keysOpen, setKeysOpen] = useState(false)
  const [keys, setKeys] = useState(getApiKeys())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        sfx.back()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pickArt = async (which: 'artPath' | 'bannerPath' | 'logoPath') => {
    if (!isTauri()) return
    const picked = await tryInvoke<string>('pick_image_file')
    if (picked) {
      setArt((a) => ({ ...a, [which]: picked }))
      if (which === 'artPath') sfx.select()
    }
  }

  const pickExe = async () => {
    if (!isTauri()) return
    const picked = await tryInvoke<string>('pick_game_file', { mode: 'file' })
    if (picked) {
      setExePath(picked)
      sfx.select()
    }
  }
  const pickDir = async () => {
    if (!isTauri()) return
    const picked = await tryInvoke<string>('pick_game_file', { mode: 'folder' })
    if (picked) setWorkDir(picked)
  }

  const save = async () => {
    setBusy(true)
    await saveGame({
      id: game?.id ?? `custom-${Date.now().toString(36)}`,
      title: title.trim() || 'Untitled Game',
      tagline: tagline.trim() || publisher.trim() || 'PC Game',
      desc: desc.trim(),
      kind,
      colors: game?.colors ?? ['#7c3aed', '#c4b5fd'],
      exePath: exePath.trim() || game?.exePath || undefined,
      args: args.trim() || undefined,
      workDir: workDir.trim() || undefined,
      developer: developer.trim(),
      publisher: publisher.trim(),
      year: year ? parseInt(year, 10) : undefined,
      platform: kind === 'native' ? 'PC (Native)' : 'Emulated',
      artPath: art.artPath ?? game?.artPath,
      artMime: art.artPath ? 'image/*' : game?.artMime,
      bannerPath: art.bannerPath ?? game?.bannerPath,
      logoPath: art.logoPath ?? game?.logoPath,
      tags: tags.trim() || undefined,
      source: game?.source ?? 'custom',
    })
    sfx.chime()
    setBusy(false)
    onSaved()
    onClose()
  }

  /** Online art fetch — Steam (keyless) + optional SteamGridDB/RAWG/IGDB keys. */
  const autoFetchArt = async () => {
    if (!title.trim()) return
    setFetchingArt(true)
    setFetchMsg('Searching providers…')
    const res = (await fetchArt(title.trim())) as ScrapeResult | { error: string }
    setFetchingArt(false)
    if ('error' in res) {
      setFetchMsg(res.error)
      sfx.error()
      return
    }
    setArt((a) => ({
      ...a,
      artPath: res.art ?? a.artPath,
      bannerPath: res.banner ?? a.bannerPath,
      logoPath: res.logo ?? a.logoPath,
    }))
    setFetchMsg(`Art fetched via ${res.source} ✓`)
    sfx.chime()
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center anim-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
      <div className="glass w-[640px] max-w-[94vw] rounded-[28px] p-6 anim-fade-up" style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <h2 className="mb-1 text-xl font-black tracking-tight">{game ? 'Edit Game' : 'Add PC Game'}</h2>
        <p className="mb-5 text-xs text-white/40">Real metadata + custom art + launch arguments — all stored locally</p>

        {/* fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title *"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Tagline"><input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} /></Field>
          <Field label="Developer"><input className="input" value={developer} onChange={(e) => setDeveloper(e.target.value)} /></Field>
          <Field label="Publisher"><input className="input" value={publisher} onChange={(e) => setPublisher(e.target.value)} /></Field>
          <Field label="Year"><input className="input" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Launch type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Game['kind'])}>
              <option value="native">Windows process</option>
              <option value="chip8">CHIP-8 core</option>
              <option value="gb">Game Boy core</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Executable">
              <div className="flex gap-2">
                <input className="input flex-1" value={exePath} onChange={(e) => setExePath(e.target.value)} placeholder="C:\Games\game.exe" />
                <button className="btn-sm" onClick={() => void pickExe()}>Browse…</button>
              </div>
            </Field>
          </div>
          <Field label="Launch arguments">
            <input className="input" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-novid -fullscreen" />
          </Field>
          <Field label="Working directory">
            <div className="flex gap-2">
              <input className="input flex-1" value={workDir} onChange={(e) => setWorkDir(e.target.value)} />
              <button className="btn-sm" onClick={() => void pickDir()}>…</button>
            </div>
          </Field>
          <div className="col-span-2">
            <Field label="Description">
              <textarea className="input h-20 resize-none" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Genre tags (comma separated)">
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Racing, Arcade, Co-op" />
            </Field>
          </div>
        </div>

        {/* art */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <ArtSlot label="Box art" path={art.artPath ?? game?.artPath} onPick={() => void pickArt('artPath')} />
          <ArtSlot label="Banner" path={art.bannerPath ?? game?.bannerPath} onPick={() => void pickArt('bannerPath')} />
          <ArtSlot label="Logo" path={art.logoPath ?? game?.logoPath} onPick={() => void pickArt('logoPath')} />
        </div>

        {/* online art fetch */}
        <div className="mt-3 flex items-center gap-2">
          <button
            className="rounded-full bg-white/8 px-4 py-2 text-xs font-bold text-white/70 transition hover:bg-white/15 disabled:opacity-40"
            disabled={fetchingArt || !title.trim()}
            onClick={() => void autoFetchArt()}
          >
            {fetchingArt ? 'Fetching art…' : '🌐 Auto-fetch art (online)'}
          </button>
          <button
            className="rounded-full px-3 py-2 text-xs font-semibold text-white/40 transition hover:text-white/80"
            onClick={() => setKeysOpen((v) => !v)}
          >
            API keys…
          </button>
          {fetchMsg && <span className="text-xs text-white/50">{fetchMsg}</span>}
        </div>
        {keysOpen && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-4">
            <KeyField label="SteamGridDB key" value={keys.steamgriddb ?? ''} onChange={(v) => { const next = { ...keys, steamgriddb: v || undefined }; setKeys(next); setApiKeys(next) }} />
            <KeyField label="RAWG key" value={keys.rawg ?? ''} onChange={(v) => { const next = { ...keys, rawg: v || undefined }; setKeys(next); setApiKeys(next) }} />
            <KeyField label="IGDB (Twitch) client id" value={keys.igdbId ?? ''} onChange={(v) => { const next = { ...keys, igdbId: v || undefined }; setKeys(next); setApiKeys(next) }} />
            <KeyField label="IGDB (Twitch) secret" value={keys.igdbSecret ?? ''} onChange={(v) => { const next = { ...keys, igdbSecret: v || undefined }; setKeys(next); setApiKeys(next) }} />
            <p className="col-span-2 text-[10px] leading-relaxed text-white/35">
              All optional — Steam box art works keyless. Keys are stored on this PC only.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          {game && game.source !== 'builtin' ? (
            <button
              className="rounded-full bg-red-500/15 px-4 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/30"
              onClick={async () => {
                await removeGame(game.id, false)
                onClose()
                onSaved()
              }}
            >
              🗑 Remove game
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="rounded-full px-5 py-2.5 text-sm font-bold text-white/50 transition hover:bg-white/8" onClick={() => { sfx.back(); onClose() }}>
              Cancel
            </button>
            <button
              className="rounded-full px-6 py-2.5 text-sm font-black text-white transition disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--acc), var(--acc2))' }}
              disabled={busy || !title.trim()}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save Game'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-widest text-white/45">{label}</span>
      {children}
    </label>
  )
}

function ArtSlot({ label, path, onPick }: { label: string; path?: string; onPick: () => void }) {
  const [loaded, setLoaded] = useState<string | null>(path?.startsWith('data:') ? path : null)
  useEffect(() => {
    let dead = false
    if (path?.startsWith('data:')) {
      setLoaded(path)
      return
    }
    if (path && isTauri() && !path.startsWith('http')) {
      void tryInvoke<{ dataUrl: string }>('read_art', { path }).then((r) => {
        if (!dead && r) setLoaded(r.dataUrl)
      })
    } else if (!path) {
      setLoaded(null)
    }
    return () => {
      dead = true
    }
  }, [path])
  return (
    <button
      className="group flex flex-col items-center gap-2 rounded-3xl bg-white/5 px-3 py-4 transition hover:bg-white/10"
      onClick={onPick}
    >
      <div className="flex h-20 w-16 items-center justify-center overflow-hidden rounded-xl bg-black/30">
        {loaded ? (
          <img src={loaded} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl opacity-40 transition group-hover:opacity-80">{label === 'Box art' ? '🖼' : label === 'Banner' ? '🎞' : '🏷'}</span>
        )}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-[9px] text-white/25">{path ? 'Attached ✓' : 'Click to attach'}</span>
    </button>
  )
}

function KeyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</span>
      <input className="input" type="password" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
    </label>
  )
}
