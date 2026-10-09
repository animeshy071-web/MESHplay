export type HomeMode = 'crescent' | 'row'

export interface Settings {
  theme: string
  defaultView: HomeMode
  fps: boolean
  sound: boolean
}

const KEY = 'meshplay.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'violet',
  defaultView: 'crescent',
  fps: true,
  sound: true,
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
