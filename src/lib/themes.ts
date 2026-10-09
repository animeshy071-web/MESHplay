export interface Theme {
  id: string
  name: string
  bg0: string
  bg1: string
  acc: string
  acc2: string
  lite: string
  waveA: string
  waveB: string
}

export const THEMES: Theme[] = [
  {
    id: 'violet', name: 'Violet Waves',
    bg0: '#0b0714', bg1: '#17102b',
    acc: '#a855f7', acc2: '#7c3aed', lite: '#ede9fe',
    waveA: '#7c3aed', waveB: '#c084fc',
  },
  {
    id: 'ember', name: 'Ember',
    bg0: '#150607', bg1: '#2b0d0e',
    acc: '#fb7185', acc2: '#f97316', lite: '#ffe4e6',
    waveA: '#f97316', waveB: '#f43f5e',
  },
  {
    id: 'ocean', name: 'Ocean',
    bg0: '#040c16', bg1: '#0b2036',
    acc: '#38bdf8', acc2: '#06b6d4', lite: '#e0f2fe',
    waveA: '#0ea5e9', waveB: '#22d3ee',
  },
  {
    id: 'emerald', name: 'Emerald',
    bg0: '#04120c', bg1: '#0a2417',
    acc: '#34d399', acc2: '#10b981', lite: '#d1fae5',
    waveA: '#059669', waveB: '#34d399',
  },
  {
    id: 'monolith', name: 'Monolith',
    bg0: '#050505', bg1: '#161616',
    acc: '#e5e5e5', acc2: '#a3a3a3', lite: '#fafafa',
    waveA: '#525252', waveB: '#a3a3a3',
  },
]

export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]

export function applyThemeVars(id: string): void {
  const t = getTheme(id)
  const r = document.documentElement.style
  r.setProperty('--bg0', t.bg0)
  r.setProperty('--bg1', t.bg1)
  r.setProperty('--acc', t.acc)
  r.setProperty('--acc2', t.acc2)
  r.setProperty('--lite', t.lite)
}
