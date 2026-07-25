/**
 * Cloud-backup bucket key.
 *
 * The `owner` column scopes every synced row. Historically every install shared
 * one public bucket (`LEGACY_OWNER`) whose name shipped in the bundle, so anyone
 * who found the app URL could read or overwrite the data. A private key fixes
 * that: the owner becomes `forge-<sha256(key)>`, a value that exists only on
 * devices holding the key.
 *
 * New installs now get a random private key on first run — the default is
 * private, not public. Installs that already have training history keep the
 * shared bucket until they opt in, because silently re-keying them would cut
 * them off from their own backup.
 */

const LEGACY_OWNER = 'forge-owner'
const STORAGE_KEY = 'forge-sync-key'
/** 'private' = key-scoped bucket; 'shared' = the old public one. */
const MODE_KEY = 'forge-sync-mode'

export type SyncMode = 'private' | 'shared'

/** Crockford-ish base32, minus the characters people misread when retyping. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable — sync falls back to the shared bucket.
  }
}

/** The key stored on this device, or null when using the shared default bucket. */
export function getSyncKey(): string | null {
  return read(STORAGE_KEY)
}

export function hasPrivateSyncKey(): boolean {
  return getSyncKey() !== null
}

export function syncMode(): SyncMode {
  return hasPrivateSyncKey() ? 'private' : 'shared'
}

/** True once this device has made a deliberate choice either way. */
export function syncModeDecided(): boolean {
  return read(MODE_KEY) !== null
}

/**
 * A fresh random key, formatted in readable groups so it can be typed into a
 * second device. 100 bits of entropy — not a password to remember, a secret to
 * copy across.
 */
export function generateSyncKey(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length])
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-')
}

/** Store (or clear, with null/empty) the private sync key. */
export function setSyncKey(key: string | null): void {
  const trimmed = key?.trim() ?? ''
  write(STORAGE_KEY, trimmed.length === 0 ? null : trimmed)
  write(MODE_KEY, trimmed.length === 0 ? 'shared' : 'private')
  ownerCache = null
}

/**
 * Settle this device's bucket on first run.
 *
 * A brand-new install (nothing decided, no local history) is given a random key,
 * so its backup is private from the very first sync and nothing ever lands in
 * the public bucket. An install that already has sessions predates this and is
 * left on the shared bucket — its data lives there, and re-keying it silently
 * would orphan that history. Those installs are offered the switch in Setup
 * instead, which re-uploads their data under the new key.
 *
 * Returns the mode now in force.
 */
export function initSyncMode(hasLocalHistory: boolean): SyncMode {
  if (hasPrivateSyncKey()) {
    if (!syncModeDecided()) write(MODE_KEY, 'private')
    return 'private'
  }
  if (syncModeDecided()) return 'shared'
  if (hasLocalHistory) {
    write(MODE_KEY, 'shared')
    return 'shared'
  }
  setSyncKey(generateSyncKey())
  return 'private'
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let ownerCache: { key: string | null; owner: string } | null = null

/**
 * The owner bucket for the current device: a key-derived value when a private
 * key is set, otherwise the shared legacy bucket. Cached so repeated syncs
 * don't re-hash.
 */
export async function ownerKey(): Promise<string> {
  const key = getSyncKey()
  if (ownerCache && ownerCache.key === key) return ownerCache.owner
  const owner = key === null ? LEGACY_OWNER : `forge-${await sha256Hex(key)}`
  ownerCache = { key, owner }
  return owner
}
