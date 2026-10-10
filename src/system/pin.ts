// Local PIN lock — kiosk / family security gate. The PIN never persists in
// plaintext: SHA-256 hashed (SubtleCrypto, offline) into the settings table.

import { getSetting, setSetting } from './db'

const PIN_KEY = 'security.pinHash'

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setPin(pin: string): Promise<void> {
  await setSetting(PIN_KEY, await sha256(`meshplay:${pin}`))
}

export async function clearPin(): Promise<void> {
  await setSetting(PIN_KEY, '')
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = (await getSetting(PIN_KEY)) ?? ''
  if (!stored) return true
  return (await sha256(`meshplay:${pin}`)) === stored
}

export async function hasPin(): Promise<boolean> {
  const stored = (await getSetting(PIN_KEY)) ?? ''
  return stored.length > 0
}
