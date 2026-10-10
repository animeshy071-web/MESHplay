// Anti-cheat safety layer. Games protected by kernel anti-cheat must never
// receive injected input — we detect them by executable path / folder
// signatures and label them in the UI. The remap layer refuses to engage for
// these titles (the plan's rule: mark unsupported, don't fight).

const SIGNATURES: Array<{ brand: string; match: RegExp }> = [
  { brand: 'Easy Anti-Cheat', match: /easyanticheat/i },
  { brand: 'BattlEye', match: /battleye|beservice|beservice_x64/i },
  { brand: 'Riot Vanguard', match: /vgc\.exe|vgtray\.exe|vanguard/i },
  { brand: 'FACEIT', match: /faceitclient|faceitclient\.exe/i },
  { brand: 'ESEA', match: /eseaclient|esea\.exe/i },
  { brand: 'Call of Duty Ricochet', match: /ricochet|cod\.exe/i },
  { brand: 'NetEase ACE', match: /ace-ant|sguard64|aceant/i },
  { brand: 'nProtect GameGuard', match: /gameguard|gg\.sys/i },
  { brand: 'PunkBuster', match: /pbsvc|punkbuster/i },
  { brand: 'XIGNCODE3', match: /xigncode|x3\.sdk/i },
]

export interface ProtectionInfo {
  protected: boolean
  brand: string | null
}

/** Check a game's executable path (and its install folder) for anti-cheat. */
export function detectProtection(game: { exePath?: string; title?: string; developer?: string }): ProtectionInfo {
  const haystack = [game.exePath, game.title, game.developer]
    .filter((s): s is string => !!s)
    .join(' ')
  for (const sig of SIGNATURES) {
    if (sig.match.test(haystack)) {
      return { protected: true, brand: sig.brand }
    }
  }
  return { protected: false, brand: null }
}
