export type HomeMode = 'crescent' | 'row'
export type Quality = 'high' | 'balanced' | 'eco'
export type DisplayMode = 'fullscreen' | 'borderless' | 'windowed'
export type FilterMode = 'off' | 'crt' | 'lcd' | 'sharp' | 'smooth'
export type ScreensaverMode = 'off' | 'clock' | 'music' | 'attract'

export interface Settings {
  // general
  theme: string
  defaultView: HomeMode
  fps: boolean
  bootAnimation: boolean
  reduceMotion: boolean
  quality: Quality
  adaptiveQuality: boolean
  // audio
  sound: boolean
  uiVolume: number // 0..100
  gameVolume: number
  musicVolume: number
  voiceVolume: number
  audioOutput: string // device id or 'default'
  spatialAudio: boolean
  muteOnBlur: boolean
  // display
  displayMode: DisplayMode
  monitor: string // 'auto' or monitor name
  resolution: string // 'auto' or 'WxH'
  targetFps: number // 30 | 60 | 120 | 0 (uncapped)
  vsync: boolean
  hdr: boolean
  scanlines: boolean
  smoothScaling: boolean
  filterMode: FilterMode // in-game display filter default
  // power
  sleepTimer: number // minutes: 0 = never, 15, 30, 60
  idleDim: boolean
  startWithWindows: boolean
  launchFullscreen: boolean
  batterySaver: boolean
  // controller
  deadzoneL: number // 0..40 (percent)
  deadzoneR: number
  rumbleIntensity: number // 0..100
  autoSwitchInput: boolean
  remapEnabled: boolean // gamepad → keyboard/mouse for native games (M5)
  wheelSteering: boolean // phone wheel gyro → A/D steering (M5)
  // remote & system
  remoteEnabled: boolean
  screensaverMode: ScreensaverMode
  screensaverTimeout: number // minutes idle before screensaver
  pinEnabled: boolean
}

const KEY = 'meshplay.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'violet',
  defaultView: 'row',
  fps: true,
  bootAnimation: true,
  reduceMotion: false,
  quality: 'balanced',
  adaptiveQuality: true,

  sound: true,
  uiVolume: 60,
  gameVolume: 80,
  musicVolume: 50,
  voiceVolume: 70,
  audioOutput: 'default',
  spatialAudio: false,
  muteOnBlur: false,

  displayMode: 'windowed',
  monitor: 'auto',
  resolution: 'auto',
  targetFps: 0,
  vsync: true,
  hdr: false,
  scanlines: true,
  smoothScaling: false,
  filterMode: 'crt',

  sleepTimer: 0,
  idleDim: true,
  startWithWindows: false,
  launchFullscreen: true,
  batterySaver: false,

  deadzoneL: 12,
  deadzoneR: 12,
  rumbleIntensity: 60,
  autoSwitchInput: true,
  remapEnabled: true,
  wheelSteering: true,

  remoteEnabled: true,
  screensaverMode: 'clock',
  screensaverTimeout: 3,
  pinEnabled: false,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable — settings stay in memory */
  }
}

export const QUALITY_BACKGROUND_SCALE: Record<Quality, number> = {
  high: 0.75,
  balanced: 0.5,
  eco: 0.35,
}

export const QUALITY_WAVES_DETAIL: Record<Quality, 'low' | 'medium' | 'high'> = {
  high: 'high',
  balanced: 'medium',
  eco: 'low',
}
