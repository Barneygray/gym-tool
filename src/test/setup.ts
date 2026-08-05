// Must load before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * Shared setup for the screen tests. jsdom is a browser with several things
 * this app leans on missing entirely, and each of them throws rather than
 * degrading — which would fail tests for reasons that have nothing to do with
 * what they're checking.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

// The workout screen holds a wake lock while a session is live.
Object.defineProperty(navigator, 'wakeLock', {
  configurable: true,
  value: { request: () => Promise.resolve({ release: () => Promise.resolve(), addEventListener() {} }) },
})

// Rest-timer chime and vibration.
Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true })
class SilentAudioContext {
  currentTime = 0
  destination = {}
  state = 'running'
  createOscillator() {
    return { connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {} }, type: 'sine' }
  }
  createGain() {
    return {
      connect() {},
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
    }
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
}
// @ts-expect-error — a stand-in, not a faithful AudioContext.
globalThis.AudioContext = SilentAudioContext

// Layout APIs jsdom doesn't implement, used by the overlay host and the game.
const noop = () => {}
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: noop,
  removeEventListener: noop,
  addListener: noop,
  removeListener: noop,
  dispatchEvent: () => false,
})) as typeof globalThis.matchMedia
globalThis.scrollTo ??= noop
Element.prototype.scrollIntoView = noop
