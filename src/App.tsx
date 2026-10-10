import { useCallback, useEffect, useRef, useState } from 'react'
import LiveBackground from './components/LiveBackground'
import GradientWaves from './components/GradientWaves'
import TopBar from './components/TopBar'
import Hints, { type HintItem } from './components/Hints'
import Toasts, { type Toast } from './components/Toasts'
import Boot from './components/Boot'
import OrbitalCrescent from './components/OrbitalCrescent'
import HeroGame from './components/HeroGame'
import LastPlayedCarousel from './components/LastPlayedCarousel'
import Row from './components/Row'
import DetailView from './components/DetailView'
import SettingsView from './components/SettingsView'
import PlayView from './components/PlayView'
import LoadingRing from './components/LoadingRing'
import SpotifyDrawer from './components/SpotifyDrawer'
import FileManagerModal from './components/FileManagerModal'
import SearchModal from './components/SearchModal'
import { GAMES, type GameDef } from './lib/games'
import { getTheme, applyThemeVars } from './lib/themes'
import { loadSettings, saveSettings, type Settings, type HomeMode } from './lib/settings'
import { sfx, initAudio, setSoundEnabled } from './lib/sound'
import { createRepeater, type Repeater } from './lib/repeat'

type View = 'boot' | 'home' | 'detail' | 'launching' | 'play' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('boot')
  const [sel, setSel] = useState(0)
  const [mode, setMode] = useState<HomeMode>('row') // Defaults to the new Horizontal Dashboard!
  const [activeTab, setActiveTab] = useState<'games' | 'files' | 'spotify' | 'search'>('games')
  const [isSpotifyOpen, setIsSpotifyOpen] = useState(false)
  const [isFilesOpen, setIsFilesOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [launchTarget, setLaunchTarget] = useState<typeof GAMES[number] | null>(null)

  const homeScrollRef = useRef<HTMLDivElement>(null)
  const launchTimer = useRef<number | null>(null)
  const toastId = useRef(0)
  const gamepadPrev = useRef<{ ax: boolean[]; btn: boolean[] }>({ ax: [], btn: [] })
  const navRepeat = useRef<Repeater | null>(null)
  if (!navRepeat.current) navRepeat.current = createRepeater(420, 190)

  // Dedicated recent games history for Last Played option bar (independent from Crescent)
  const [recentGames, setRecentGames] = useState<GameDef[]>(() => [
    GAMES[0], // Space Invaders
    GAMES[2], // Tetris
    GAMES[1], // Brix
    GAMES[4], // Blinky
    GAMES[8], // Tron
    GAMES[5], // Tank
  ])
  const [recentSel, setRecentSel] = useState<number>(0)

  const theme = getTheme(settings.theme)
  const maxSel = GAMES.length - 1
  const focusedGame = GAMES[sel] ?? GAMES[0]
  const activeGame = view === 'play' || view === 'launching' ? launchTarget : focusedGame
  const wallpaperColors: [string, string] | null =
    view === 'settings' ? null : activeGame ? activeGame.colors : null

  useEffect(() => {
    applyThemeVars(settings.theme)
    setSoundEnabled(settings.sound)
    saveSettings(settings)
  }, [settings])

  // Sync mode with defaultView when changed from settings
  useEffect(() => {
    if (settings.defaultView) setMode(settings.defaultView)
  }, [settings.defaultView])

  useEffect(() => {
    const onGesture = () => initAudio()
    window.addEventListener('keydown', onGesture)
    window.addEventListener('pointerdown', onGesture)
    return () => {
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('pointerdown', onGesture)
    }
  }, [])

  const toast = useCallback((msg: string) => {
    const id = ++toastId.current
    setToasts((ts) => [...ts.slice(-2), { id, msg }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2600)
  }, [])

  const move = useCallback(
    (d: number) => {
      setSel((s) => {
        let n: number
        if (mode === 'crescent') {
          n = (s + d + GAMES.length) % GAMES.length
        } else {
          n = Math.min(maxSel, Math.max(0, s + d))
        }
        if (n !== s) sfx.travel()
        return n
      })
    },
    [mode, maxSel],
  )

  const switchMode = useCallback(() => {
    setMode((m) => {
      const next = m === 'crescent' ? 'row' : 'crescent'
      sfx.travel()
      toast(next === 'row' ? 'View: Horizontal Dashboard (Xbox)' : 'View: Orbital Crescent')
      return next
    })
  }, [toast])

  const openSettings = useCallback(() => {
    sfx.select()
    setView('settings')
  }, [])

  const startLaunch = useCallback((targetGame?: typeof GAMES[number]) => {
    const g = targetGame ?? GAMES[sel] ?? GAMES[0]
    if (!g) return
    sfx.launch()
    setLaunchTarget(g)
    setView('launching')
    setRecentGames((prev) => [g, ...prev.filter((item) => item.id !== g.id)].slice(0, 6))
    setRecentSel(0)
    launchTimer.current = window.setTimeout(() => setView('play'), 1300)
  }, [sel])

  const goHome = useCallback(() => {
    sfx.back()
    setView('home')
  }, [])

  // Keyboard routing
  useEffect(() => {
    if (view !== 'home' && view !== 'detail' && view !== 'launching') return
    const rep = navRepeat.current!
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      switch (view) {
        case 'home':
          if (e.code === 'Tab') {
            e.preventDefault()
            switchMode()
          } else if (mode === 'crescent') {
            // Crescent mode keyboard bindings: Arrow keys rotate games along the orbital arc!
            if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
              e.preventDefault()
              rep.press(e.code, () => move(-1))
            } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
              e.preventDefault()
              rep.press(e.code, () => move(1))
            } else if (e.code === 'Enter' || e.code === 'Space') {
              e.preventDefault()
              startLaunch()
            } else if (e.code === 'KeyD') {
              e.preventDefault()
              sfx.select()
              setView('detail')
            } else if (e.code === 'KeyS') {
              e.preventDefault()
              openSettings()
            } else if (e.code === 'KeyF') {
              e.preventDefault()
              setIsFilesOpen(true)
            } else if (e.code === 'KeyM') {
              e.preventDefault()
              setIsSpotifyOpen(true)
            } else if (e.code === 'Slash') {
              e.preventDefault()
              setIsSearchOpen(true)
            }
          }
          break
        case 'detail':
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault()
            startLaunch()
          } else if (e.code === 'Escape' || e.code === 'Backspace') {
            e.preventDefault()
            goHome()
          }
          break
        case 'launching':
          if (e.code === 'Escape') {
            e.preventDefault()
            if (launchTimer.current) clearTimeout(launchTimer.current)
            goHome()
          }
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => rep.release(e.code)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      rep.stopAll()
    }
  }, [view, mode, move, startLaunch, goHome, openSettings, switchMode])

  // Gamepad bridge + FPS meter loop
  const fpsElRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let frames = 0
    let fpsT = performance.now()
    const repeatT: Record<string, number> = {}

    const fire = (code: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
    }
    const held = (gp: Gamepad, kind: 'ax' | 'btn', idx: number, code: string, now: number) => {
      const active = kind === 'ax' ? Math.abs(gp.axes[idx] ?? 0) > 0.55 : !!gp.buttons[idx]?.pressed
      const prev = gamepadPrev.current[kind][idx] ?? false
      const key = `${kind}${idx}`
      if (active && !prev) {
        fire(code)
        repeatT[key] = now + 420
      } else if (active && prev && now > (repeatT[key] ?? 0)) {
        fire(code)
        repeatT[key] = now + 190
      }
      return active
    }

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      frames++
      if (now - fpsT > 500) {
        const v = Math.round((frames * 1000) / (now - fpsT))
        if (fpsElRef.current) fpsElRef.current.textContent = `${v} FPS`
        frames = 0
        fpsT = now
      }
      const gp = navigator.getGamepads?.()[0] ?? navigator.getGamepads?.()[1] ?? null
      if (!gp) return
      held(gp, 'ax', 0, gp.axes[0] < 0 ? 'ArrowLeft' : 'ArrowRight', now)
      held(gp, 'ax', 1, gp.axes[1] < 0 ? 'ArrowUp' : 'ArrowDown', now)
      held(gp, 'btn', 0, 'Enter', now)
      held(gp, 'btn', 1, 'Escape', now)
      held(gp, 'btn', 4, 'ArrowLeft', now)
      held(gp, 'btn', 5, 'ArrowRight', now)
      // Y button toggles mode
      const yActive = !!gp.buttons[3]?.pressed
      const yPrev = gamepadPrev.current.btn[3] ?? false
      if (yActive && !yPrev) fire('Tab')
      held(gp, 'btn', 9, 'Escape', now)
      gamepadPrev.current = {
        ax: [Math.abs(gp.axes[0] ?? 0) > 0.55, Math.abs(gp.axes[1] ?? 0) > 0.55],
        btn: gp.buttons.map((b) => b.pressed),
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const hints: HintItem[] =
    view === 'home'
      ? [
          { k: 'Tab / (Y)', label: mode === 'row' ? 'Orbital Crescent' : 'Xbox Dashboard' },
          { k: '↑↓←→', label: 'Navigate' },
          { k: 'Enter / (A)', label: 'Play' },
          { k: 'S', label: 'Settings' },
        ]
      : view === 'detail'
        ? [
            { k: 'Enter', label: 'Play' },
            { k: 'Esc', label: 'Back' },
          ]
        : view === 'settings'
          ? [
              { k: '↑↓', label: 'Move' },
              { k: 'Enter', label: 'Change' },
              { k: 'Esc', label: 'Back' },
            ]
          : view === 'play'
            ? [
                { k: 'Esc', label: 'Pause' },
                { k: '1-4 QWER ASDF ZXCV', label: 'Controls' },
              ]
            : []

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050308]">
      {/* Background: In horizontal mode, use stable PS3 lightest brightest purple GradientWaves; in crescent mode, use adaptive LiveBackground */}
      {mode === 'row' && view === 'home' ? (
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#090314]">
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <GradientWaves
              horizonColor="#5227FF"
              waveColor="#FF9FFC"
              crestColor="#FFFFFF"
              speed={0.4}
              amplitude={2.5}
              waveScale={0.6}
              waveRatio={0.9}
              swell={35}
              turbulence={20}
              tilt={1.11}
              zoom={1.0}
              height={5.5}
              fogDepth={15}
              detail="medium"
              brightness={1.0}
              opacity={1.0}
              mouseInteraction={true}
              parallaxStrength={0.5}
              grain={true}
              grainIntensity={0.05}
            />
          </div>
        </div>
      ) : (
        <LiveBackground theme={theme} gameColors={wallpaperColors} />
      )}

      {/* Cinematic Dark Vignette Overlay matching the reference UI */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            mode === 'row'
              ? 'linear-gradient(to top, rgba(9,3,20,0.92) 0%, rgba(9,3,20,0.42) 38%, transparent 70%)'
              : 'radial-gradient(130% 110% at 20% 45%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%), linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 32%, transparent 65%)',
        }}
      />

      {/* Boot Screen */}
      {view === 'boot' && <Boot onDone={() => setView('home')} />}

      {/* Top Bar (Universal across both modes) */}
      {view !== 'boot' && view !== 'play' && view !== 'launching' && (
        <TopBar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab as any)}
          onOpenSettings={openSettings}
          onOpenSpotify={() => setIsSpotifyOpen(true)}
          onOpenFiles={() => setIsFilesOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      )}

      {/* Home View: Switchable between Xbox Horizontal Dashboard and Orbital Crescent */}
      {view === 'home' && (
        mode === 'row' ? (
          /* Xbox Series X Horizontal Dashboard */
          <Row
            games={GAMES}
            sel={sel}
            accent={[theme.acc, theme.acc2]}
            onSelect={(i) => setSel(i)}
            onLaunch={(g) => startLaunch(g)}
            onOpenSettings={openSettings}
            onOpenFiles={() => setIsFilesOpen(true)}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenSpotify={() => setIsSpotifyOpen(true)}
            onOpenDetails={(g) => {
              const idx = GAMES.findIndex((item) => item.id === g.id)
              if (idx !== -1) setSel(idx)
              setView('detail')
            }}
          />
        ) : (
          /* Orbital Crescent View with independent Last Played option bar */
          <div className="absolute inset-0 z-20 overflow-hidden select-none anim-fade-in">
            {/* Fixed Left Orbital Crescent HUD Arc with rotatable profile portal */}
            <OrbitalCrescent
              games={GAMES}
              sel={sel}
              onSelect={(i) => setSel(i)}
              onLaunch={(g) => startLaunch(g)}
              onPrev={() => move(-1)}
              onNext={() => move(1)}
              onOpenSettings={openSettings}
              onOpenSpotify={() => setIsSpotifyOpen(true)}
              onOpenFiles={() => setIsFilesOpen(true)}
              onOpenSearch={() => setIsSearchOpen(true)}
            />

            {/* Section: Hero Game Showcase (Centered & aligned, comfortable breathing room from crescent) */}
            {focusedGame && (
              <HeroGame
                game={focusedGame}
                onPlay={() => startLaunch()}
                onOptions={() => {
                  sfx.select()
                  setView('detail')
                }}
              />
            )}

            {/* Separate Option Bar: Last Played (Completely independent from Crescent) */}
            <LastPlayedCarousel
              games={recentGames}
              sel={recentSel}
              onSelect={(i) => {
                sfx.travel()
                setRecentSel(i)
              }}
              onLaunch={(g) => startLaunch(g)}
              className="absolute bottom-6 left-[42vw] lg:left-[43vw] z-20"
            />
          </div>
        )
      )}

      {/* Detail View */}
      {view === 'detail' && focusedGame && (
        <DetailView game={focusedGame} onPlay={() => startLaunch()} onBack={goHome} />
      )}

      {/* Launching Loading Ring */}
      {view === 'launching' && launchTarget && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 anim-fade-in"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <LoadingRing label={`Starting ${launchTarget.title}`} initial={launchTarget.title.charAt(0)} />
        </div>
      )}

      {/* Gameplay View */}
      {view === 'play' && launchTarget && <PlayView game={launchTarget} onExit={goHome} />}

      {/* Settings Modal */}
      {view === 'settings' && (
        <SettingsView
          settings={settings}
          onChange={setSettings}
          onBack={goHome}
          toast={toast}
        />
      )}

      {/* Console Drawers & Modals */}
      <SpotifyDrawer isOpen={isSpotifyOpen} onClose={() => setIsSpotifyOpen(false)} />
      <FileManagerModal
        isOpen={isFilesOpen}
        onClose={() => setIsFilesOpen(false)}
        onSelectGame={(idx) => setSel(idx)}
      />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectGame={(idx) => setSel(idx)}
      />

      {/* Bottom Contextual Hints (shown in crescent mode or detail/play) */}
      {view !== 'boot' && mode === 'crescent' && <Hints items={hints} />}
      <Toasts toasts={toasts} />

      {/* FPS Counter */}
      {settings.fps && view !== 'boot' && (
        <span
          ref={fpsElRef}
          className="pointer-events-none absolute right-8 top-[84px] z-40 font-mono text-xs text-white/35"
        />
      )}
    </div>
  )
}
