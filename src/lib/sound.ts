// Re-export shim — the sound system moved to system/mixer.ts (multi-channel
// mixer). Kept so existing imports keep working.
import { initMixer, setEnabled, setChannelVolume, sfx as mixerSfx } from '../system/mixer'

export const initAudio = initMixer
export function setSoundEnabled(v: boolean): void {
  setEnabled(v)
}
export function setVolume(v01: number): void {
  setChannelVolume('ui', v01)
}
export const sfx = mixerSfx
