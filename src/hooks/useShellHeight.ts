import { useEffect } from 'react'

/** Anything smaller than this is a bogus reading — never size the shell to it. */
const MIN_SANE_HEIGHT = 160

/**
 * Keep `--app-h` equal to the height of the viewport you can actually see, so
 * the shell — and with it the tab bar on its bottom edge — ends exactly where
 * the screen does.
 *
 * `100dvh` is meant to be that number, and it is the fallback here. But iOS
 * updates it lazily: it lags a toolbar collapsing or expanding, a rotation, and
 * a home-screen app being resumed, and while it lags the shell is the height of
 * the *previous* viewport. Too tall and the tab bar sits below the screen edge;
 * too short and it floats above it, which is how the bar keeps "creeping up".
 * `visualViewport.height` is the measurement itself rather than a value derived
 * from it, and it comes with an event that fires when it changes.
 *
 * The on-screen keyboard also shrinks the visual viewport, and there we want
 * the old behaviour: the shell keeps its full height and the keyboard covers
 * the bottom of it, rather than the whole layout concertina-ing up on every tap
 * into a weight field. So readings taken while a text field has focus are
 * ignored, and we re-measure once focus leaves.
 */
export function useShellHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const typing = () => {
      const el = document.activeElement
      if (el === null) return false
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        (el as HTMLElement).isContentEditable === true
      )
    }

    const apply = () => {
      if (typing() || document.visibilityState !== 'visible') return
      const h = Math.floor(vv.height)
      // A backgrounded or mid-transition page can report nonsense; a shell
      // sized to that is a blank screen, which is worse than a stale one.
      if (h < MIN_SANE_HEIGHT) return
      document.documentElement.style.setProperty('--app-h', `${h}px`)
    }

    // The keyboard is still on its way out when `focusout` fires, so the height
    // that matters arrives on the next visualViewport resize — but that resize
    // is exactly the one the guard above dropped if focus moved to another
    // field. Re-measuring a beat later covers both.
    const afterBlur = () => setTimeout(apply, 300)

    apply()
    vv.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    window.addEventListener('pageshow', apply)
    document.addEventListener('focusout', afterBlur)
    document.addEventListener('visibilitychange', apply)

    return () => {
      vv.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      window.removeEventListener('pageshow', apply)
      document.removeEventListener('focusout', afterBlur)
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])
}
