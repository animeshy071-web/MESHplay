import { useEffect, useState } from 'react'
import { sfx } from '../lib/sound'

interface Props {
  activeTab?: string
  onSelectTab?: (tab: string) => void
  onOpenSettings?: () => void
  onOpenSpotify?: () => void
  onOpenFiles?: () => void
  onOpenSearch?: () => void
}

interface NavItem {
  id: string
  label: string
  icon: (active: boolean) => JSX.Element
  action: () => void
}

export default function TopBar({
  activeTab = 'games',
  onSelectTab,
  onOpenSettings,
  onOpenSpotify,
  onOpenFiles,
  onOpenSearch,
}: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  const navItems: NavItem[] = [
    {
      id: 'games',
      label: 'Games',
      action: () => onSelectTab?.('games'),
      icon: (active: boolean) => (
        <svg
          className={`h-4.5 w-4.5 transition-colors duration-200 ${
            active ? 'text-white' : 'text-white/70 group-hover:text-white'
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="6" y1="12" x2="10" y2="12" />
          <line x1="8" y1="10" x2="8" y2="14" />
          <line x1="15" y1="13" x2="15.01" y2="13" strokeWidth="3" />
          <line x1="18" y1="11" x2="18.01" y2="11" strokeWidth="3" />
          <rect x="2" y="6" width="20" height="12" rx="6" />
        </svg>
      ),
    },
    {
      id: 'files',
      label: 'File Manager',
      action: () => onOpenFiles?.(),
      icon: () => (
        <svg
          className="h-4.5 w-4.5 text-white/70 transition-colors duration-200 group-hover:text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
      ),
    },
    {
      id: 'spotify',
      label: 'Spotify',
      action: () => onOpenSpotify?.(),
      icon: () => (
        <svg
          className="h-4.5 w-4.5 text-white/70 transition-colors duration-200 group-hover:text-emerald-400"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm4.586 14.424c-.18.295-.563.387-.857.208-2.348-1.435-5.304-1.76-8.785-.964-.333.076-.665-.132-.741-.465-.076-.333.132-.665.465-.741 3.809-.87 7.076-.502 9.71 1.105.294.18.387.563.208.857Zm1.225-2.724c-.226.368-.71.483-1.077.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.125-.851-.11-.976-.523-.125-.413.11-.851.523-.976 3.633-1.103 8.147-.57 11.238 1.33.367.227.483.711.257 1.078Zm.105-2.835C14.692 8.92 9.38 8.744 6.297 9.68c-.494.15-1.02-.128-1.17-.622-.15-.494.128-1.02.622-1.17 3.553-1.079 9.426-.874 13.143 1.332.444.263.59.837.327 1.28-.263.445-.838.59-1.281.328l-.022-.013Z" />
        </svg>
      ),
    },
    {
      id: 'search',
      label: 'Search',
      action: () => onOpenSearch?.(),
      icon: () => (
        <svg
          className="h-4.5 w-4.5 text-white/70 transition-colors duration-200 group-hover:text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
  ]

  const handleItemClick = (item: NavItem) => {
    sfx.travel()
    item.action()
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 select-none">
      {/* Centre-Aligned Floating Navigation Bar */}
      <nav
        className="pointer-events-auto absolute left-1/2 top-5 -translate-x-1/2 flex items-center gap-1.5 rounded-full glass-pill p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-white/12"
        aria-label="Main Navigation"
      >
        {navItems.map((item) => {
          const isActive = item.id === activeTab
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              title={item.label}
              className={`group flex items-center rounded-full px-3.5 py-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                isActive
                  ? 'bg-white/15 text-white ring-1 ring-white/25 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {/* Logo / Icon (Always visible) */}
              <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">
                {item.icon(isActive)}
              </span>

              {/* Name (Appears smoothly only when hovered) */}
              <span className="max-w-0 opacity-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out group-hover:max-w-[120px] group-hover:opacity-100 group-hover:ml-2 text-xs font-semibold tracking-wide text-white">
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Right Utilities Cluster */}
      <div className="pointer-events-auto absolute right-10 top-5 flex items-center gap-4">
        {/* Notifications Icon Button (badge appears only for real notifications) */}
        <button
          onClick={() => sfx.select()}
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/75 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          title="Notifications"
          aria-label="Notifications"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </button>

        {/* Settings Icon Button */}
        <button
          onClick={() => {
            sfx.select()
            onOpenSettings?.()
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/75 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Profile Avatar Circle */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 text-white/90 shadow-md cursor-pointer hover:ring-white/40 transition-all"
          title="Player 1"
        >
          <svg className="h-5 w-5 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        {/* Digital Clock */}
        <div className="pl-1 font-semibold text-sm tracking-wide text-white/90 select-none">
          {time}
        </div>
      </div>
    </header>
  )
}
