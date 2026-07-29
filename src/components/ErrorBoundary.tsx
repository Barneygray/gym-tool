import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * True for the failure you get when a lazily-imported chunk can't be fetched.
 *
 * This is the one that turned the app black. Every tab but Train is a dynamic
 * import, and the service worker updates itself the moment a new build lands
 * (`registerType: 'autoUpdate'`). A session that was open across a deploy is
 * still holding the old chunk names, and those files are gone from both the
 * cache and the server — so the next tab tap fetches a 404, the import
 * rejects, and with nothing to catch it React unmounts the whole tree. Black
 * screen until the page is loaded again, which is precisely what fixes it:
 * a fresh document asks for the chunk names that exist.
 */
export function isModuleLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /dynamically imported module|module script failed|ChunkLoadError|Failed to fetch/i.test(msg)
}

const RELOAD_KEY = 'forge-chunk-reload' // epoch ms of the last automatic reload
const RELOAD_COOLDOWN = 30_000

/** Reload at most once per cooldown, so a permanently broken build can't loop. */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY))
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Private mode with storage denied — one reload attempt is still better
    // than a dead screen, and without storage there's nothing to loop on but
    // the cooldown we can't record. Fall through and reload.
  }
  window.location.reload()
  return true
}

interface Props {
  children: ReactNode
  /** Change this to clear a caught error — the tab id, so switching tab retries. */
  resetKey?: string | number
}

interface State {
  error: Error | null
  key: string | number | undefined
  reloading: boolean
}

/**
 * Catches anything a screen throws while rendering and shows a way out.
 *
 * Without one, a single bad render takes the entire app down to a blank page
 * with no route back short of killing and reopening it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: undefined, reloading: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null
    // A different screen is being asked for — give it a clean slate, so one
    // broken tab doesn't hold the other five hostage.
    return { key: props.resetKey, error: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack)
    // A missing chunk is not a bug in the screen and can't be retried in
    // place: `lazy` remembers the rejection. Reloading is both the fix and
    // what the user would have done by hand.
    if (isModuleLoadError(error) && reloadOnce()) this.setState({ reloading: true })
  }

  render(): ReactNode {
    const { error, reloading } = this.state
    if (error === null) return this.props.children
    if (reloading) return <div className="screen-loading">Updating…</div>

    const stale = isModuleLoadError(error)
    return (
      <div className="app-error">
        <p className="micro">{stale ? 'Update needed' : 'Something broke'}</p>
        <h2>{stale ? "This screen didn't load" : "This screen didn't open"}</h2>
        <p className="app-error-note">
          {stale
            ? 'The app updated in the background. Reloading picks up the new version — nothing logged is lost.'
            : 'Your logged sessions are safe. Reloading usually clears it.'}
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        {!stale && (
          <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        )}
      </div>
    )
  }
}
