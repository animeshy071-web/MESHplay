export type HomeMode = 'crescent' | 'row'
export type Quality = 'high' | 'balanced' | 'eco'

export interface Settings {
  theme: string
  defaultView: HomeMode
  fps: boolean
  sound: boolean
  uiVolume: number // 0..100
  bootAnimation: boolean
  scanlines: boolean
  smoothScaling: boolean
  reduceMotion: boolean
  quality: Quality
  remoteEnabled: boolean
}

const KEY = 'meshplay.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'violet',
  defaultView: 'row',
  fps: true,
  sound: true,
  uiVolume: 60,
  bootAnimation: true,
  scanlines: true,
  smoothScaling: false,
  reduceMotion: false,
  quality: 'balanced',
  remoteEnabled: true,
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
