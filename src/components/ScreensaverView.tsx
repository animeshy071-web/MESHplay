// Screensaver: clock mode (PS3 gradient waves + big clock), music drift
// (now-playing art), and attract reels (game art cycling). Any input exits.

import { useEffect, useState } from 'react'
import { screensaverState, subscribe, type AttractSlide } from '../system/screensaver'
import GradientWaves from './GradientWaves'

interface Props {
  reels: AttractSlide[]
}

export default function ScreensaverView({ reels }: Props) {
  const [state, setState] = useState(screensaverState)
  const [clock, setClock] = useState('')
  const [slide, setSlide] = useState(0)
  useEffect(() => subscribe(setState), [])
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000)
    setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (state.mode !== 'attract') return
    const t = window.setInterval(() => setSlide((s) => (s + 1) % Math.max(1, reels.length)), 5000)
    return () => clearInterval(t)
  }, [state.mode, reels.length])

  if (!state.active) return null

  const dismiss = () => {
    window.dispatchEvent(new CustomEvent('meshplay:screensaver-dismiss'))
  }

  return (
    <div
      className="absolute inset-0 z-[90] anim-fade-in"
      onPointerDown={dismiss}
      onMouseMove={dismiss}
    >
      {state.mode === 'music' ? (
        <div className="flex h-full w-full items-center justify-center bg-black">
          <MusicDrift />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[#090314]">
          <GradientWaves
            horizonColor="#5227FF"
            waveColor="#FF9FFC"
            crestColor="#FFFFFF"
            speed={0.25}
            amplitude={2.2}
            waveScale={0.6}
            waveRatio={0.9}
            swell={30}
            turbulence={16}
            tilt={1.11}
            zoom={1.0}
            height={5.5}
            fogDepth={15}
            detail="medium"
            brightness={0.8}
            opacity={1.0}
            mouseInteraction={false}
            parallaxStrength={0}
            grain={true}
            grainIntensity={0.04}
          />
        </div>
      )}

      {state.mode === 'clock' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: '18vh' }}>
          <div className="text-[120px] font-black leading-none tracking-tighter text-white/95" style={{ textShadow: '0 10px 60px rgba(82,39,255,0.5)' }}>
            {clock}
          </div>
          <div className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-white/40">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      )}

      {state.mode === 'attract' && reels.length > 0 && (
        <div className="absolute inset-x-0 bottom-[16vh] flex flex-col items-center anim-fade-up" key={slide}>
          <div className="text-5xl font-black uppercase tracking-tight text-white/95" style={{ textShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            {reels[slide]?.title}
          </div>
          <div className="mt-2 text-sm font-bold text-[var(--acc)]">{reels[slide]?.tagline}</div>
          <div className="mt-1 max-w-[520px] text-center text-xs text-white/45">{reels[slide]?.desc}</div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">
        Move any input to wake
      </div>
    </div>
  )
}

function MusicDrift() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const iv = window.setInterval(() => setT((x) => x + 1), 40)
    return () => clearInterval(iv)
  }, [])
  // drifting art blobs — pure CSS, cheap
  return (
    <div className="relative h-72 w-72">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: `radial-gradient(circle, hsl(${(260 + i * 30 + t / 4) % 360} 80% 60%), transparent 70%)`,
            transform: `translate(${Math.sin(t / 30 + i * 2) * 60}px, ${Math.cos(t / 24 + i * 1.7) * 40}px) scale(${1.2 + Math.sin(t / 50 + i) * 0.3})`,
            filter: 'blur(30px)',
          }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-black/40 text-3xl">
          ♪
        </div>
      </div>
    </div>
  )
}
