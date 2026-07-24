import { useEffect } from 'react'

/**
 * Hold a screen wake lock while `active` is true, so the phone doesn't sleep
 * mid-set and kill the rest timer. The lock is auto-released by the browser
 * when the tab is hidden, so we re-acquire it whenever the page becomes visible
 * again. A no-op where the API is unsupported.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    const acquire = async () => {
      if (released || document.visibilityState !== 'visible') return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (e.g. low battery) — nothing we can do; fail quietly.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
