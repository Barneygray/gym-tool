/**
 * Cloud-backup bucket key.
 *
 * By default every install shares one public bucket (`LEGACY_OWNER`) — the
 * zero-setup behaviour. Anyone who found the app URL could read or overwrite
 * that data. Setting a private sync key scopes your backup to a bucket derived
 * from a secret that never ships in the bundle: the owner column becomes
 * `forge-<sha256(passphrase)>`, so the key is needed to reach the data and two
 * devices only share history when they share the passphrase.
 */

const LEGACY_OWNER = 'forge-owner'
const STORAGE_KEY = 'forge-sync-key'

/** The passphrase stored on this device, or null for the shared default bucket. */
export function getSyncKey(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function hasPrivateSyncKey(): boolean {
  return getSyncKey() !== null
}

/** Store (or clear, with null/empty) the private sync passphrase. */
export function setSyncKey(passphrase: string | null): void {
  try {
    const trimmed = passphrase?.trim() ?? ''
    if (trimmed.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, trimmed)
  } catch {
    // Storage unavailable — sync falls back to the shared bucket.
  }
  ownerCache = null
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let ownerCache: { key: string | null; owner: string } | null = null

/**
 * The owner bucket for the current device: a passphrase-derived value when a
 * private key is set, otherwise the shared legacy bucket. Cached so repeated
 * syncs don't re-hash.
 */
export async function ownerKey(): Promise<string> {
  const key = getSyncKey()
  if (ownerCache && ownerCache.key === key) return ownerCache.owner
  const owner = key === null ? LEGACY_OWNER : `forge-${await sha256Hex(key)}`
  ownerCache = { key, owner }
  return owner
}
