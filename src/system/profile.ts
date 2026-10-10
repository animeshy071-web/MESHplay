// Player profile: gamertag, avatar, bio, badges, total hours. All local.

import { getProfile, setProfile } from './db'
import { allPlaytime } from './db'

export interface Profile {
  gamertag: string
  avatar: number // procedural avatar index 0..7
  bio: string
  createdAt: number
}

const AVATAR_COLORS: Array<[string, string]> = [
  ['#7c3aed', '#c4b5fd'],
  ['#f97316', '#fdba74'],
  ['#0ea5e9', '#7dd3fc'],
  ['#10b981', '#6ee7b7'],
  ['#ec4899', '#f9a8d4'],
  ['#eab308', '#fde047'],
  ['#6366f1', '#a5b4fc'],
  ['#f43f5e', '#fda4af'],
]

export const AVATAR_COUNT = AVATAR_COLORS.length
export const AVATAR_PALETTES = AVATAR_COLORS

export async function loadProfile(): Promise<Profile> {
  const [tag, avatar, bio, createdAt] = await Promise.all([
    getProfile('gamertag'),
    getProfile('avatar'),
    getProfile('bio'),
    getProfile('createdAt'),
  ])
  return {
    gamertag: tag ?? 'Player 1',
    avatar: avatar ? parseInt(avatar, 10) || 0 : 0,
    bio: bio ?? 'Console gamer. Local-first.',
    createdAt: createdAt ? parseInt(createdAt, 10) || Date.now() : Date.now(),
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await Promise.all([
    setProfile('gamertag', p.gamertag),
    setProfile('avatar', String(p.avatar)),
    setProfile('bio', p.bio),
    setProfile('createdAt', String(p.createdAt)),
  ])
}

export interface Badge {
  id: string
  name: string
  desc: string
  earned: boolean
  progress?: number // 0..1
}

/** Badges computed from real playtime data (total hours milestones). */
export async function computeBadges(): Promise<{ hours: number; badges: Badge[] }> {
  const pt = await allPlaytime()
  const totalSeconds = Object.values(pt).reduce((a, b) => a + b, 0)
  const hours = totalSeconds / 3600
  const gamesPlayed = Object.keys(pt).length
  const mk = (id: string, name: string, desc: string, at: number): Badge => ({
    id, name, desc, earned: hours >= at, progress: Math.min(1, hours / at),
  })
  return {
    hours,
    badges: [
      mk('b1', 'First Boot', 'Play for 1 hour', 1),
      mk('b5', 'Getting Cozy', 'Play for 5 hours', 5),
      mk('b10', 'Night Owl', 'Play for 10 hours', 10),
      mk('b25', 'Dedicated', 'Play for 25 hours', 25),
      mk('b50', 'Legend', 'Play for 50 hours', 50),
      {
        id: 'g5', name: 'Sampler', desc: 'Play 5 different games',
        earned: gamesPlayed >= 5, progress: Math.min(1, gamesPlayed / 5),
      },
    ],
  }
}
