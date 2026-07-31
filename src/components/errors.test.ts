import { describe, expect, it } from 'vitest'
import { isModuleLoadError } from './ErrorBoundary'

/**
 * The detector decides whether a crash gets a reload (the fix for a chunk that
 * went missing under an open session) or a "try again" (a screen that threw for
 * its own reasons). Browsers word the failure differently, so the messages here
 * are the real ones each engine produces.
 */
describe('isModuleLoadError', () => {
  it('recognises a missing chunk in every engine that reports one', () => {
    const real = [
      new TypeError('Failed to fetch dynamically imported module: https://x/assets/Log-abc.js'),
      new TypeError('error loading dynamically imported module: https://x/assets/Log-abc.js'),
      new TypeError('Importing a module script failed.'), // Safari
      Object.assign(new Error('Loading chunk 4 failed.'), { name: 'ChunkLoadError' }),
    ]
    for (const err of real) expect(isModuleLoadError(err)).toBe(true)
  })

  it('leaves ordinary render errors alone', () => {
    expect(isModuleLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isModuleLoadError(new RangeError('Invalid array length'))).toBe(false)
    expect(isModuleLoadError('something went wrong')).toBe(false)
  })
})
