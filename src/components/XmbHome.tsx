// XMB Home — the PSP × Xbox fusion. The cross-media bar rides over a real
// 3D wave ocean (rendered in Blender, public/brand/waves.mp4), while the
// focused item owns a hero zone on the right (Xbox-style poster + actions).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '../system/library'
import { sfx } from '../lib/sound'
import TileArt from './TileArt'
import Icon, { type IconName } from './Icon'

interface XmbItem {
  id: string
  label: string
  sub?: string
  icon?: IconName
  game?: Game
  action: () => void
}

interface XmbCategory {
  id: string
  label: string
  icon: IconName
  items: XmbItem[]
}

interface Props {
  games: Game[]
  onLaunch: (g: Game) => void
  onOpenDetails: (g: Game) => void
  onOpenSettings: () => void
  onOpenFiles: () => void
  onOpenSpotify: () => void
  onOpenLibrary: () => void
}

const ROW_H = 52
const VISIBLE_ITEMS = 7

export default function XmbHome({
  games, onLaunch, onOpenDetails, onOpenSettings, onOpenFiles, onOpenSpotify, onOpenLibrary,
}: Props) {
  const [catIdx, setCatIdx] = useState(0)
  const [itemIdx, setItemIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const focusedGame = games[Math.min(Math.max(itemIdx, 0), Math.max(games.length - 1, 0))] ?? games[0]

  const categories: XmbCategory[] = useMemo(() => [
    {
      id: 'games',
      label: 'Games',
      icon: 'games',
      items: [
        ...games.map((g): XmbItem => ({
          id: `play-${g.id}`,
          label: g.title,
          sub: g.tagline || g.platform,
          game: g,
          action: () => { sfx.launch(); onLaunch(g) },
        })),
        {
          id: 'details',
          label: 'Game Details',
          sub: focusedGame ? `About ${focusedGame.title}` : 'Select a game',
          icon: 'star',
          action: () => { sfx.select(); if (focusedGame) onOpenDetails(focusedGame) },
        },
      ],
    },
    {
      id: 'library',
      label: 'Library',
      icon: 'folder',
      items: [
        { id: 'lib-open', label: 'Open Library', sub: 'All games & emulators', icon: 'games', action: () => { sfx.select(); onOpenLibrary() } },
        { id: 'lib-add', label: 'Add a Game', sub: 'Import PC games & ROMs', icon: 'folder', action: () => { sfx.select(); onOpenFiles() } },
      ],
    },
    {
      id: 'spotify',
      label: 'Music',
      icon: 'spotify',
      items: [
        { id: 'sp-open', label: 'Spotify', sub: 'Now playing & in-game mixer', icon: 'spotify', action: () => { sfx.select(); onOpenSpotify() } },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      items: [
        { id: 'set-open', label: 'Open Settings', sub: 'Themes, display, audio, power', icon: 'settings', action: () => { sfx.select(); onOpenSettings() } },
      ],
    },
  ], [games, focusedGame, onLaunch, onOpenDetails, onOpenLibrary, onOpenFiles, onOpenSpotify, onOpenSettings])

  const cat = categories[catIdx]

  // keep the item list windowed around the selection
  useEffect(() => {
    if (listRef.current) {
      const offset = Math.max(0, itemIdx - 2) * ROW_H
      listRef.current.style.transform = `translateY(${-offset}px)`
    }
  }, [itemIdx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const items = cat.items
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.code)) e.preventDefault()
      if (e.code === 'ArrowLeft') {
        if (catIdx > 0) { sfx.travel(); setCatIdx(catIdx - 1); setItemIdx(0) }
      } else if (e.code === 'ArrowRight') {
        if (catIdx < categories.length - 1) { sfx.travel(); setCatIdx(catIdx + 1); setItemIdx(0) }
      } else if (e.code === 'ArrowUp') {
        if (itemIdx > 0) { sfx.travel(); setItemIdx(itemIdx - 1) }
      } else if (e.code === 'ArrowDown') {
        if (itemIdx < items.length - 1) { sfx.travel(); setItemIdx(itemIdx + 1) }
      } else if (e.code === 'Enter' || e.code === 'Space') {
        items[Math.min(itemIdx, items.length - 1)]?.action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [catIdx, itemIdx, cat, categories.length])

  return (
    <div className="absolute inset-0 z-20 select-none overflow-hidden anim-fade-in">
      {/* the Blender-rendered wave ocean */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={`${import.meta.env.BASE_URL}brand/waves.mp4`}
        poster={`${import.meta.env.BASE_URL}brand/boot-logo.png`}
        autoPlay muted loop playsInline
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to right, rgba(5,2,12,0.55) 0%, rgba(5,2,12,0.25) 45%, rgba(5,2,12,0.6) 100%), linear-gradient(to top, rgba(5,2,12,0.85) 0%, transparent 30%, transparent 80%, rgba(5,2,12,0.5) 100%)' }}
      />

      {/* ── cross-media bar (left) ── */}
      <div className="absolute left-14 top-[30%] -translate-y-1/2">
        {/* category icons */}
        <div className="mb-5 flex items-center gap-7 pl-1">
          {categories.map((c, i) => {
            const active = i === catIdx
            return (
              <button
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={c.label}
                onClick={() => { sfx.travel(); setCatIdx(i); setItemIdx(0) }}
                className={`group relative flex items-center gap-3 transition-all duration-200 ${active ? 'scale-110' : 'scale-100 opacity-45 hover:opacity-80'}`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 ${
                    active
                      ? 'border-white/40 bg-white/12 text-white'
                      : 'border-white/10 bg-white/5 text-white/70'
                  }`}
                  style={active ? { boxShadow: '0 0 26px -6px var(--game-acc, var(--acc))' } : undefined}
                >
                  <Icon name={c.icon} className="h-5 w-5" />
                </span>
                {active && (
                  <span className="font-display text-lg font-medium tracking-wide text-white">{c.label}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* item list dropping from the active category */}
        <div className="relative h-[364px] w-[430px] overflow-hidden">
          <div ref={listRef} className="absolute left-0 top-0 w-full transition-transform duration-300 ease-out">
            {cat.items.map((item, i) => {
              const active = i === itemIdx
              return (
                <button
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-label={item.label}
                  onClick={() => { if (active) item.action(); else { sfx.travel(); setItemIdx(i) } }}
                  className="flex w-full items-center gap-3.5 px-4 text-left transition-all duration-150"
                  style={{ height: ROW_H }}
                >
                  {/* thumb / icon */}
                  {item.game ? (
                    <span
                      className={`h-10 w-10 shrink-0 overflow-hidden rounded-xl transition-all duration-150 ${
                        active ? 'ring-2 ring-white/70' : 'opacity-60 ring-1 ring-white/15'
                      }`}
                    >
                      <TileArt colors={item.game.colors} title={item.game.title} id={item.game.id} className="h-full w-full" />
                    </span>
                  ) : (
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 ${
                        active ? 'border-white/40 bg-white/12 text-white' : 'border-white/10 bg-white/5 text-white/60'
                      }`}
                    >
                      <Icon name={item.icon ?? 'star'} className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[14px] font-bold transition-colors duration-150 ${
                        active ? 'text-white' : 'text-white/55'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.sub && (
                      <span className={`block truncate text-[11px] transition-colors duration-150 ${active ? 'text-white/60' : 'text-white/30'}`}>
                        {item.sub}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#0a0514]/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0a0514]/80 to-transparent" />
        </div>
      </div>

      {/* ── Xbox-style hero zone (right) ── */}
      {focusedGame && cat.id === 'games' && (
        <div key={focusedGame.id} className="anim-fade-up absolute right-14 top-1/2 w-[340px] -translate-y-1/2">
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-6 rounded-[32px] opacity-50 blur-2xl"
              style={{ background: `radial-gradient(60% 60% at 50% 45%, ${focusedGame.colors[0]}66, transparent)` }}
            />
            <div className="relative aspect-[3/4] overflow-hidden rounded-[24px] ring-1 ring-white/20 shadow-[0_36px_90px_-24px_rgba(0,0,0,0.95)]">
              <TileArt colors={focusedGame.colors} title={focusedGame.title} id={focusedGame.id} className="h-full w-full" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-white/5" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="t-micro mb-1.5">{(focusedGame.platform ?? 'Game').toUpperCase()}</div>
                <div className="truncate text-[18px] font-bold text-white">{focusedGame.title}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2.5">
              <button
                type="button"
                className="btn-primary flex-1 justify-center !py-3"
                onClick={() => { sfx.launch(); onLaunch(focusedGame) }}
              >
                <Icon name="play" className="h-4 w-4" /> Play
              </button>
              <button
                type="button"
                className="btn-ghost h-[46px] w-[46px]"
                aria-label="Details"
                onClick={() => { sfx.select(); onOpenDetails(focusedGame) }}
              >
                <Icon name="star" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* bottom hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="glass-pill flex items-center gap-4 rounded-full px-5 py-2 text-[11px] font-semibold text-white/55">
          <span><b className="text-white/85">←→</b> categories</span>
          <span><b className="text-white/85">↑↓</b> items</span>
          <span><b className="text-white/85">Enter</b> select</span>
        </div>
      </div>
    </div>
  )
}
