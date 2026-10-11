// One line-icon set for the whole OS — single stroke width, 24px grid.
// Replaces emoji-as-icons everywhere (premium discipline).

import type { ReactNode } from 'react'

export type IconName =
  | 'perf' | 'mixer' | 'states' | 'rewind' | 'filters' | 'capture'
  | 'play' | 'pause' | 'close' | 'screenshot' | 'replay' | 'save'
  | 'load' | 'settings' | 'controller' | 'power' | 'restart' | 'search'
  | 'bell' | 'folder' | 'spotify' | 'games' | 'user' | 'chevron-down' | 'star'

const PATHS: Record<IconName, ReactNode> = {
  perf: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </>
  ),
  mixer: (
    <>
      <path d="M4 8v8M8 5v14M12 9v6M16 4v16M20 10v4" />
    </>
  ),
  states: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </>
  ),
  rewind: (
    <>
      <path d="M11 19L2 12l9-7v14zM22 19l-9-7 9-7v14z" />
    </>
  ),
  filters: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2.5" />
      <path d="M8 22h8M12 2v4" />
    </>
  ),
  capture: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  close: (
    <>
      <path d="M18 6L6 18M6 6l12 12" />
    </>
  ),
  screenshot: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  replay: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </>
  ),
  load: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  controller: (
    <>
      <path d="M6 12h4m-2-2v4M15 11h.01M18 13h.01" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.05.47-.08.95-.1 1.41-.13 2.63.13 5.29.9 7.81.33 1.08 1.16 1.94 2.29 2.13 1.36.22 2.44-.56 3.53-1.79.52-.6 1.35-.6 1.87 0 1.09 1.23 2.17 2.01 3.53 1.79 1.13-.19 1.96-1.05 2.29-2.13.77-2.52 1.03-5.18.9-7.81-.02-.46-.05-.94-.1-1.41A4 4 0 0 0 17.32 5z" />
    </>
  ),
  power: (
    <>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <path d="M12 2v10" />
    </>
  ),
  restart: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  folder: (
    <>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </>
  ),
  spotify: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 11c3-1 6-.5 8 1M8.5 14.5c2.2-.7 4.4-.4 6.2.8M9 8c3.5-.8 7 0 9 1.8" />
    </>
  ),
  games: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="6" />
      <path d="M6 12h4M8 10v4M15.5 13h.01M18 11h.01" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />,
}

export default function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
