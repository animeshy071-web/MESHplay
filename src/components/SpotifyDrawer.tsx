import { useState } from 'react'
import { sfx } from '../lib/sound'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function SpotifyDrawer({ isOpen, onClose }: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(38)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md anim-fade-in">
      <div className="relative w-[440px] rounded-3xl glass p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] border border-white/15 anim-fade-up">
        {/* Close Button */}
        <button
          onClick={() => {
            sfx.back()
            onClose()
          }}
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6 text-emerald-400">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm4.586 14.424c-.18.295-.563.387-.857.208-2.348-1.435-5.304-1.76-8.785-.964-.333.076-.665-.132-.741-.465-.076-.333.132-.665.465-.741 3.809-.87 7.076-.502 9.71 1.105.294.18.387.563.208.857Zm1.225-2.724c-.226.368-.71.483-1.077.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.125-.851-.11-.976-.523-.125-.413.11-.851.523-.976 3.633-1.103 8.147-.57 11.238 1.33.367.227.483.711.257 1.078Zm.105-2.835C14.692 8.92 9.38 8.744 6.297 9.68c-.494.15-1.02-.128-1.17-.622-.15-.494.128-1.02.622-1.17 3.553-1.079 9.426-.874 13.143 1.332.444.263.59.837.327 1.28-.263.445-.838.59-1.281.328l-.022-.013Z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Spotify · Console Connect
          </span>
        </div>

        {/* Album Art & Vinyl Disc */}
        <div className="relative flex items-center justify-center my-4">
          <div
            className={`h-40 w-40 rounded-full bg-gradient-to-tr from-purple-900 to-indigo-600 shadow-[0_0_35px_rgba(168,85,247,0.4)] flex items-center justify-center border-4 border-black/40 ${
              isPlaying ? 'animate-[spin_6s_linear_infinite]' : ''
            }`}
          >
            <div className="h-14 w-14 rounded-full bg-[#0a0712] border-2 border-white/20 flex items-center justify-center">
              <span className="text-xs font-black text-white/60">MESH</span>
            </div>
          </div>
        </div>

        {/* Track Title */}
        <div className="text-center mt-5 mb-2">
          <div className="text-lg font-bold text-white tracking-tight">Cyber City Odyssey</div>
          <div className="text-xs text-white/50">Synthwave Chiptune Collective</div>
        </div>

        {/* Progress Bar */}
        <div className="w-full mt-5">
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100)
              setProgress(pct)
            }}
            className="h-1.5 w-full rounded-full bg-white/10 cursor-pointer overflow-hidden relative"
          >
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-white/40 mt-1.5 font-mono">
            <span>1:24</span>
            <span>3:42</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-6 mt-4">
          <button
            onClick={() => sfx.travel()}
            className="text-white/60 hover:text-white transition-all text-xl cursor-pointer"
          >
            ⏮
          </button>
          <button
            onClick={() => {
              sfx.select()
              setIsPlaying(!isPlaying)
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-black font-black text-lg shadow-[0_0_20px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => sfx.travel()}
            className="text-white/60 hover:text-white transition-all text-xl cursor-pointer"
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
