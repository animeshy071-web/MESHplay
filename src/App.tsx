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
import LibraryModal from './components/LibraryModal'
import SearchModal from './components/SearchModal'
import RemoteModal from './components/RemoteModal'
import GameBar from './components/GameBar'
import PinLock from './components/PinLock'
import ScreensaverView from './components/ScreensaverView'
import FindControllerModal from './components/FindControllerModal'
import CompanionOverlay from './components/CompanionOverlay'
import { getTheme, applyThemeVars } from './lib/themes'
import { loadSettings, saveSettings, QUALITY_BACKGROUND_SCALE, QUALITY_WAVES_DETAIL, type Settings, type HomeMode, type Quality } from './lib/settings'
import { sfx, initAudio, setEnabled, setChannelVolume, onWindowBlur, initMixer } from './system/mixer'
import { getRecents } from './lib/playtime'
import { remoteHost } from './lib/remote'
import { createRepeater, type Repeater } from './lib/repeat'
import { loadLibrary, getGames, type Game } from './system/library'
import { launcher, initLauncherListener } from './system/launcher'
import { perfSampler } from './system/stats'
import { startInputLayer, setDeadzones, setRumbleIntensity, setAutoSwitch } from './system/input'
import { installActivityWatcher, onIdle } from './system/power'
import { configure as configureScreensaver, installScreensaverWatcher, forceShow, subscribe as subscribeScreensaver } from './system/screensaver'
import { hasPin } from './system/pin'
import { isTauri, tryInvoke } from './system/ipc'

type View = 'boot' | 'home' | 'detail' | 'launching' | 'play' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('boot')
  const [sel, setSel] = useState(0)
  const [mode, setMode] = useState<HomeMode>('row')
  const [activeTab, setActiveTab] = useState<'games' | 'files' | 'spotify' | 'search'>('games')
  const [isSpotifyOpen, setIsSpotifyOpen] = useState(false)
  const [isFilesOpen, setIsFilesOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isRemoteOpen, setIsRemoteOpen] = useState(false)
  const [isFindOpen, setIsFindOpen] = useState(false)
  const [isGameBarOpen, setIsGameBarOpen] = useState(false)
  const [pinGate, setPinGate] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [screensaverActive, setScreensaverActive] = useState(false)
  const [dimmed, setDimmed] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [games, setGames] = useState<Game[]>(() => getGames())
  const [launchTarget, setLaunchTarget] = useState<Game | null>(null)
  const [filterMode, setFilterMode] = useState<Settings['filterMode']>(settings.filterMode)
  const [nativeRunning, setNativeRunning] = useState(false)

  const homeScrollRef = useRef<HTMLDivElement>(null)
  const bootDoneRef = useRef(false)
  const launchTimer = useRef<number | null>(null)
  const toastId = useRef(0)
  const navRepeat = useRef<Repeater | null>(null)
  if (!navRepeat.current) navRepeat.current = createRepeater(420, 190)

  // Dedicated recent games history for Last Played option bar — real play data
  const [recentGames, setRecentGames] = useState<Game[]>(() => {
    const ids = getRecents()
    const all = getGames()
    const real = ids.map((id) => all.find((g) => g.id === id)).filter((g): g is Game => !!g)
    if (real.length > 0) return real.slice(0, 6)
    return all.slice(0, 6)
  })
  const [recentSel, setRecentSel] = useState<number>(0)

  const theme = getTheme(settings.theme)
  const maxSel = games.length - 1
  const focusedGame = games[sel] ?? games[0]
  const activeGame = view === 'play' || view === 'launching' ? launchTarget : focusedGame
  const wallpaperColors: [string, string] | null =
    view === 'settings' ? null : activeGame ? activeGame.colors : null

  // ---------- library ----------
  useEffect(() => {
    void loadLibrary().then((g) => {
      setGames(g)
      const ids = getRecents()
      const real = ids.map((id) => g.find((x) => x.id === id)).filter((x): x is Game => !!x)
      if (real.length > 0) setRecentGames(real.slice(0, 6))
    })
  }, [])

  // ---------- settings effects ----------
  useEffect(() => {
    applyThemeVars(settings.theme)
    setEnabled(settings.sound)
    setChannelVolume('ui', settings.uiVolume / 100)
    setChannelVolume('game', settings.gameVolume / 100)
    setChannelVolume('music', settings.musicVolume / 100)
    setChannelVolume('voice', settings.voiceVolume / 100)
    initMixer()
    saveSettings(settings)
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
  }, [settings])

  // display mode (Tauri)
  useEffect(() => {
    if (!isTauri()) return
    void tryInvoke('set_display_mode', { mode: settings.displayMode, monitor: settings.monitor === 'auto' ? null : settings.monitor })
  }, [settings.displayMode, settings.monitor])

  // mute on window blur
  useEffect(() => {
    const onBlur = () => onWindowBlur(true)
    const onFocus = () => onWindowBlur(false)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Remote Play server lifecycle (LAN WebSocket relay)
  useEffect(() => {
    if (settings.remoteEnabled) remoteHost.start()
    else remoteHost.stop()
  }, [settings.remoteEnabled])

  // universal controller input layer
  useEffect(() => {
    const stop = startInputLayer()
    return stop
  }, [])
  useEffect(() => {
    setDeadzones(settings.deadzoneL, settings.deadzoneR)
    setRumbleIntensity(settings.rumbleIntensity)
    setAutoSwitch(settings.autoSwitchInput)
  }, [settings.deadzoneL, settings.deadzoneR, settings.rumbleIntensity, settings.autoSwitchInput])

  // native game launcher listener (playtime + companion)
  useEffect(() => initLauncherListener(), [])
  useEffect(() => {
    const unsub = launcher.subscribe((active) => setNativeRunning(!!active))
    return unsub
  }, [])

  // screensaver
  useEffect(() => {
    configureScreensaver(settings.screensaverMode, settings.screensaverTimeout)
    return installScreensaverWatcher()
  }, [settings.screensaverMode, settings.screensaverTimeout])
  useEffect(() => subscribeScreensaver((s) => setScreensaverActive(s.active)), [])
  useEffect(() => {
    const dismiss = () => setScreensaverActive(false)
    window.addEventListener('meshplay:screensaver-dismiss', dismiss)
    return () => window.removeEventListener('meshplay:screensaver-dismiss', dismiss)
  }, [])

  // idle dimming
  useEffect(() => {
    if (!settings.idleDim) {
      setDimmed(false)
      return
    }
    return onIdle(() => {
      setDimmed(true)
    })
  }, [settings.idleDim])
  useEffect(() => {
    const wake = () => setDimmed(false)
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel']
    for (const e of events) window.addEventListener(e, wake, { passive: true })
    return () => {
      for (const e of events) window.removeEventListener(e, wake)
    }
  }, [])

  // battery saver auto-mode: when unplugged, degrade the wallpaper
  useEffect(() => {
    if (!settings.batterySaver && settings.batterySaver !== false) return
    void import('./system/power').then(async ({ isOnBattery }) => {
      const onBattery = await isOnBattery()
      if (onBattery && settings.quality === 'high') {
        setSettings((s) => ({ ...s, quality: 'balanced' }))
        toast('Battery saver: quality balanced')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.batterySaver])

  // adaptive quality ladder (perf dips → degrade one step)
  useEffect(() => {
    if (!settings.adaptiveQuality) return
    perfSampler.onLowFps(() => {
      setSettings((s) => {
        const order: Quality[] = ['high', 'balanced', 'eco']
        const i = order.indexOf(s.quality)
        if (i < 2) {
          toast(`Adaptive quality: ${order[i + 1]}`)
          return { ...s, quality: order[i + 1] }
        }
        return s
      })
    })
  }, [settings.adaptiveQuality])

  // PIN gate check (after boot finishes)
  useEffect(() => {
    if (bootDoneRef.current && !unlocked) {
      void hasPin().then((has) => {
        if (has && settings.pinEnabled) setPinGate(true)
        else setUnlocked(true)
      })
    }
  }, [view, unlocked, settings.pinEnabled])

  // Sync mode with defaultView when changed from settings
  useEffect(() => {
    if (settings.defaultView) setMode(settings.defaultView)
  }, [settings.defaultView])

  useEffect(() => {
    const onGesture = () => {
      initAudio()
      initMixer()
      if (settings.sound) setChannelVolume('ui', settings.uiVolume / 100)
    }
    window.addEventListener('keydown', onGesture)
    window.addEventListener('pointerdown', onGesture)
    return () => {
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('pointerdown', onGesture)
    }
  }, [settings.sound, settings.uiVolume])

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
          n = (s + d + games.length) % games.length
        } else {
          n = Math.min(maxSel, Math.max(0, s + d))
        }
        if (n !== s) sfx.travel()
        return n
      })
    },
    [mode, maxSel, games.length],
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

  const startLaunch = useCallback((targetGame?: Game) => {
    const g = targetGame ?? games[sel] ?? games[0]
    if (!g) return
    // native PC games: real process + companion widget (no in-app play view)
    if (g.kind === 'native' && g.exePath) {
      sfx.launch()
      void launcher.launchNative(g).then((pid) => {
        if (pid) {
          toast(`▶ ${g.title} launched`)
          setView('home')
        } else {
          sfx.error()
          toast('Launch failed — check the game path')
        }
      })
      return
    }
    sfx.launch()
    setLaunchTarget(g)
    setView('launching')
    import('./lib/playtime').then(({ getRecents }) => {
      const ids = getRecents()
      const real = ids.map((id) => games.find((item) => item.id === id)).filter((item): item is Game => !!item)
      if (real.length > 0) setRecentGames(real.slice(0, 6))
    })
    setRecentSel(0)
    homeScrollRef.current?.scrollTo?.({ top: 0 })
    launchTimer.current = window.setTimeout(() => setView('play'), 1300)
  }, [sel, games, toast])

  const goHome = useCallback(() => {
    sfx.back()
    setView('home')
  }, [])

  // Keyboard routing — any open drawer/modal swallows nav keys (no leaks underneath)
  const overlayOpen = isSpotifyOpen || isFilesOpen || isSearchOpen || isRemoteOpen || isFindOpen || pinGate || screensaverActive
  useEffect(() => {
    if (view !== 'home' && view !== 'detail' && view !== 'launching') return
    if (overlayOpen) return
    const rep = navRepeat.current!
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      switch (view) {
        case 'home':
          if (e.code === 'Tab') {
            e.preventDefault()
            switchMode()
          } else if (mode === 'crescent') {
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
            } else if (e.code === 'KeyR') {
              e.preventDefault()
              sfx.select()
              setIsRemoteOpen(true)
            } else if (e.code === 'KeyF') {
              e.preventDefault()
              sfx.select()
              setIsFilesOpen(true)
            } else if (e.code === 'KeyM') {
              e.preventDefault()
              setIsSpotifyOpen(true)
            } else if (e.code === 'Slash') {
              e.preventDefault()
              setIsSearchOpen(true)
            } else if (e.code === 'KeyG') {
              // Shift+Tab / Win+G style: open Game Bar on the focused game
              e.preventDefault()
              sfx.pause()
              setIsGameBarOpen(true)
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
  }, [view, mode, overlayOpen, move, startLaunch, goHome, openSettings, switchMode])

  // FPS meter loop (the gamepad bridge lives in system/input now)
  const fpsElRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let frames = 0
    let fpsT = performance.now()
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      frames++
      if (now - fpsT > 500) {
        const v = Math.round((frames * 1000) / (now - fpsT))
        if (fpsElRef.current) fpsElRef.current.textContent = `${v} FPS`
        frames = 0
        fpsT = now
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
          { k: 'G', label: 'Game Bar' },
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
                { k: 'Esc / Guide', label: 'Game Bar' },
                { k: '1-4 QWER ASDF ZXCV', label: 'Controls' },
              ]
            : []

  // native launch fullscreen: apply once a native game starts
  useEffect(() => {
    if (nativeRunning && settings.launchFullscreen && isTauri()) {
      void tryInvoke('set_display_mode', { mode: 'fullscreen' })
    }
  }, [nativeRunning, settings.launchFullscreen])

  // locked behind PIN: render the gate only
  if (pinGate) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#050308]">
        <PinLock onUnlocked={() => { setPinGate(false); setUnlocked(true) }} />
      </div>
    )
  }

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
              detail={QUALITY_WAVES_DETAIL[settings.quality]}
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
        <LiveBackground
          theme={theme}
          gameColors={wallpaperColors}
          scale={QUALITY_BACKGROUND_SCALE[settings.quality]}
        />
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

      {/* Boot Screen (skippable in settings, and never replays when returning from a game) */}
      {view === 'boot' && (
        <Boot
          onDone={() => {
            bootDoneRef.current = true
            setView('home')
          }}
          skip={!settings.bootAnimation || bootDoneRef.current}
        />
      )}

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
          <Row
            games={games}
            sel={sel}
            accent={[theme.acc, theme.acc2]}
            onSelect={(i) => setSel(i)}
            onLaunch={(g) => startLaunch(g)}
            onOpenSettings={openSettings}
            onOpenFiles={() => setIsFilesOpen(true)}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenSpotify={() => setIsSpotifyOpen(true)}
            onOpenDetails={(g) => {
              const idx = games.findIndex((item) => item.id === g.id)
              if (idx !== -1) setSel(idx)
              setView('detail')
            }}
          />
        ) : (
          <div className="absolute inset-0 z-20 overflow-hidden select-none anim-fade-in">
            <OrbitalCrescent
              games={games}
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

      {/* Launching Loading Ring (emulator games only) */}
      {view === 'launching' && launchTarget && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 anim-fade-in"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <LoadingRing label={`Starting ${launchTarget.title}`} initial={launchTarget.title.charAt(0)} />
        </div>
      )}

      {/* Gameplay View (CHIP-8 + Game Boy cores, with floating Game Bar) */}
      {view === 'play' && launchTarget && (
        <PlayView
          game={launchTarget}
          onExit={goHome}
          filterMode={filterMode}
          onFilterChange={(m) => {
            setFilterMode(m)
            setSettings((s) => ({ ...s, filterMode: m }))
          }}
          smooth={settings.smoothScaling}
        />
      )}

      {/* Game Bar on home (focused game preview + controls) */}
      {isGameBarOpen && view !== 'play' && focusedGame && focusedGame.kind !== 'native' && (
        <GameBar
          game={focusedGame}
          api={{
            screenshot: () => Promise.resolve(null),
            saveReplay: () => Promise.resolve(null),
            saveState: () => Promise.resolve(null),
            loadState: () => Promise.resolve(false),
            listStates: () => Promise.resolve([]),
            rewind: () => false,
            rewindDepth: () => 0,
            softReset: () => undefined,
            exit: () => {
              setIsGameBarOpen(false)
              setView('home')
            },
          }}
          filterMode={filterMode}
          onFilterChange={(m) => {
            setFilterMode(m)
            setSettings((s) => ({ ...s, filterMode: m }))
          }}
          onClose={() => setIsGameBarOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {view === 'settings' && (
        <SettingsView
          settings={settings}
          onChange={setSettings}
          onBack={goHome}
          toast={toast}
          onOpenRemote={() => setIsRemoteOpen(true)}
          onOpenFindController={() => setIsFindOpen(true)}
        />
      )}

      {/* Console Drawers & Modals */}
      <SpotifyDrawer isOpen={isSpotifyOpen} onClose={() => setIsSpotifyOpen(false)} />
      <LibraryModal
        isOpen={isFilesOpen}
        onClose={() => setIsFilesOpen(false)}
        onSelectGame={(idx) => setSel(idx)}
      />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectGame={(idx) => setSel(idx)}
      />
      {isRemoteOpen && (
        <RemoteModal
          onClose={() => setIsRemoteOpen(false)}
          enabled={settings.remoteEnabled}
          onToggleEnabled={(v) => setSettings((s) => ({ ...s, remoteEnabled: v }))}
        />
      )}
      {isFindOpen && <FindControllerModal onClose={() => setIsFindOpen(false)} />}

      {/* Screensaver */}
      <ScreensaverView reels={games.map((g) => ({ title: g.title, tagline: g.tagline, desc: g.desc }))} />

      {/* Native game running: embedded companion widget (web dev mode) */}
      {nativeRunning && !isTauri() && (
        <div className="absolute right-6 top-20 z-[75] anim-fade-up">
          <CompanionOverlay embedded />
        </div>
      )}

      {/* Idle dim overlay */}
      {dimmed && !screensaverActive && (
        <div
          className="pointer-events-none absolute inset-0 z-[85] bg-black anim-fade-in"
          style={{ opacity: 0.75, transition: 'opacity 1.2s' }}
        />
      )}

      {/* Bottom Contextual Hints (shown in crescent mode or detail/play) */}
      {view !== 'boot' && mode === 'crescent' && !screensaverActive && <Hints items={hints} />}
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
