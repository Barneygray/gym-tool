import { beforeEach, describe, expect, it } from 'vitest'
import { OWNER_HEADER, clientOptions } from './supabaseClient'
import { generateSyncKey, ownerKey, setSyncKey } from './syncKey'

/**
 * The bucket used to be enforced only by the filter the client chose to send.
 * These cover the two halves of moving that enforcement to the server: the
 * bucket a device resolves to, and the header every request has to carry for
 * Row Level Security to match it (see `supabase-schema.sql`).
 */

// syncKey reads localStorage through try/catch, so the node environment would
// otherwise pin every test to the legacy shared bucket.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  setSyncKey(null)
})

describe('the bucket a device addresses', () => {
  it('falls back to the shared bucket with no key set', async () => {
    expect(await ownerKey()).toBe('forge-owner')
  })

  it('derives a bucket from the key, never shipping the key itself', async () => {
    const key = 'ABCDE-FGHJK-LMNPQ-RSTUV'
    setSyncKey(key)
    const owner = await ownerKey()
    expect(owner).toMatch(/^forge-[0-9a-f]{64}$/)
    expect(owner).not.toContain(key)
  })

  it('re-derives when the key changes, rather than serving a stale bucket', async () => {
    setSyncKey('ABCDE-FGHJK-LMNPQ-RSTUV')
    const first = await ownerKey()
    setSyncKey('VUTSR-QPNML-KJHGF-EDCBA')
    expect(await ownerKey()).not.toBe(first)
  })

  it('gives two keys two buckets', async () => {
    setSyncKey(generateSyncKey())
    const a = await ownerKey()
    setSyncKey(generateSyncKey())
    expect(await ownerKey()).not.toBe(a)
  })
})

describe('what the request claims', () => {
  // Without this header the policy matches no rows at all — which is the whole
  // point, but it means a request that forgets it fails closed, silently.
  it('names the bucket in the header the policy reads', () => {
    expect(clientOptions('forge-abc123').global.headers[OWNER_HEADER]).toBe('forge-abc123')
  })

  it('carries exactly the bucket ownerKey resolved', async () => {
    setSyncKey('ABCDE-FGHJK-LMNPQ-RSTUV')
    const owner = await ownerKey()
    expect(clientOptions(owner).global.headers[OWNER_HEADER]).toBe(owner)
  })
})
