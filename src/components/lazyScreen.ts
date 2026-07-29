import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * `React.lazy` with one retry.
 *
 * The screens behind the tab bar are dynamic imports, so opening a tab is a
 * network fetch — and in a gym that fetch happens on two bars of signal. A
 * single dropped request used to throw the app away; asking a second time
 * costs nothing and covers the blip. What it deliberately doesn't do is
 * swallow the failure: a chunk that is genuinely gone (the usual cause — the
 * app updated underneath a session that was left open) still throws, and
 * `ErrorBoundary` turns that into a reload rather than a black screen.
 */
// Constrained on the component rather than its props: inferring the props out
// of `ComponentType<P>` runs backwards through a function parameter and lands
// on `never`, which then rejects every screen that takes props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React's own `lazy` constraint
export function lazyScreen<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    load().catch(async (err: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return load().catch(() => {
        throw err
      })
    }),
  )
}
