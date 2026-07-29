import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * The shell's overlay layer — a `.app` child, set by `App` once on mount.
 * Null only before the shell has rendered, which is before anything can be
 * opened.
 */
export const OverlayHostContext = createContext<HTMLElement | null>(null)

/**
 * Hangs bottom-docked UI — sheets, their backdrop, the rest timer — off the
 * app shell instead of leaving it where it was written in the tree.
 *
 * Anything pinned to the bottom of the screen used to do it with
 * `position: fixed`, which resolves against the *layout* viewport: the box the
 * browser pretends the page has, not the box you can see once a phone's
 * toolbars are in the way. The tab bar hit exactly this — it came to rest about
 * 60px clear of the bottom edge — and was re-hung as a flex child of `.app`,
 * which is sized in `dvh` and so tracks the viewport you can actually see.
 *
 * Sheets and the rest timer were left on `fixed`, so they measured from a
 * different bottom edge than the tab bar did. The two disagree by the height of
 * whichever browser bar is showing, and the controls sitting closest to a
 * sheet's bottom edge — "Delete session" is 20px off it — drift into the strip
 * the tab bar and the browser's own bar occupy, where the tap goes somewhere
 * else or nowhere.
 *
 * Portalling into a layer that is itself a child of `.app` lets them position
 * with `absolute` against the same box the tab bar uses, so the two can no
 * longer disagree. It also means a sheet no longer inherits whatever the
 * screen that opened it had going on — the scroller it sits in, a transformed
 * ancestor, a stacking context — which is what makes `fixed` unreliable in the
 * first place.
 */
export function Overlay({ children }: { children: ReactNode }) {
  const host = useContext(OverlayHostContext)
  // Before the shell exists there is nothing to portal into; rendering in place
  // is wrong-looking but reachable, which beats rendering nothing.
  if (host === null) return <>{children}</>
  return createPortal(children, host)
}
