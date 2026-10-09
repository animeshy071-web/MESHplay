import { useEffect, useState } from 'react'
import Grainient from './Grainient'
import WaveWallpaper from './WaveWallpaper'
import type { Theme } from '../lib/themes'

interface Props {
  theme: Theme
  gameColors: [string, string] | null
}

// The living wallpaper: Grainient (WebGL) driven by theme + focused-game
// colors, with the 2D wave canvas as fallback if WebGL is unavailable.

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

export default function LiveBackground({ theme, gameColors }: Props) {
  const [webgl, setWebgl] = useState<boolean | null>(null)
  useEffect(() => setWebgl(hasWebGL()), [])

  if (webgl === null) return <div className="absolute inset-0" style={{ background: theme.bg0 }} />

  if (!webgl) return <WaveWallpaper theme={theme} gameColors={gameColors} />

  const c1 = gameColors ? gameColors[0] : theme.waveB
  const c2 = gameColors ? gameColors[1] : theme.waveA
  return (
    <div className="absolute inset-0" style={{ background: theme.bg0 }}>
      <Grainient
        color1={c1}
        color2={c2}
        color3={theme.bg1}
        timeSpeed={0.25}
        warpStrength={1.0}
        warpFrequency={5.0}
        warpSpeed={2.0}
        warpAmplitude={50.0}
        blendSoftness={0.05}
        rotationAmount={500.0}
        noiseScale={2.0}
        grainAmount={0.1}
        grainScale={2.0}
        contrast={1.4}
        zoom={0.9}
      />
    </div>
  )
}
