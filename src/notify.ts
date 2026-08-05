/** Notification helpers for rest alerts that reach a backgrounded phone. */

const REST_TAG = 'forge-rest'
const REST_TITLE = 'Rest complete'
const REST_BODY = 'Time for your next set.'

/** How long to wait on a worker that hasn't activated yet before giving up. */
const READY_TIMEOUT_MS = 3000

const restOptions: NotificationOptions = {
  body: REST_BODY,
  tag: REST_TAG,
  icon: 'icon-192.png',
  badge: 'icon-192.png',
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

/** Ask for permission (from a user gesture). Returns the resulting state. */
export async function requestNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return notificationPermission()
  }
}

function serviceWorkers(): ServiceWorkerContainer | undefined {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker
}

let cachedReg: ServiceWorkerRegistration | undefined

/**
 * The registered service worker, cached once we have it (there's none in dev).
 *
 * `getRegistration()` answers `undefined` while a first registration is still in
 * flight — the registration script vite-plugin-pwa injects only runs on `load`,
 * so a rest started in the opening seconds of a fresh install used to find
 * nothing here and go through the whole rest with no alarm armed at all. Wait
 * on `ready` in that case, bounded: a browser that never activates a worker
 * must not leave the caller hanging forever.
 */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  const sw = serviceWorkers()
  if (!sw) return undefined
  if (cachedReg) return cachedReg
  try {
    cachedReg = (await sw.getRegistration()) ?? (await readyWithin(sw, READY_TIMEOUT_MS))
    return cachedReg
  } catch {
    return undefined
  }
}

function readyWithin(sw: ServiceWorkerContainer, ms: number): Promise<ServiceWorkerRegistration | undefined> {
  return Promise.race([
    sw.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ])
}

/**
 * The worker to talk to. On a first visit there's no active one yet — the
 * installing worker still receives messages, and it's parsed our listener by
 * then, so a rest started on the very first session isn't left uncovered.
 */
function worker(reg: ServiceWorkerRegistration): ServiceWorker | null {
  return reg.active ?? reg.waiting ?? reg.installing
}

/** The deadline the worker is currently holding, so we can hand it over again. */
let pendingRest: number | null = null
let watchingController = false

/**
 * A worker that takes over mid-rest starts with none of its predecessor's
 * state, so the alarm the old one was holding dies with it. `registerType:
 * 'autoUpdate'` makes that routine rather than rare — a deploy landing between
 * two sets used to swallow the alert — so re-hand the deadline to whoever is in
 * charge now. The timestamp trigger needs no such care: it lives in the
 * browser's notification store, not in worker memory.
 */
function watchController(): void {
  const sw = serviceWorkers()
  if (!sw || watchingController) return
  watchingController = true
  sw.addEventListener('controllerchange', () => {
    cachedReg = undefined
    if (pendingRest !== null) void scheduleRestAlert(pendingRest)
  })
}

/**
 * Hand the rest deadline to the service worker so the alert still fires with
 * the app closed.
 *
 * The in-app countdown can't do this itself: once the tab is hidden the browser
 * freezes its timers, so it only notices rest is over when you come back — by
 * which point you're looking at the screen and the alert is pointless. The
 * worker holds the deadline instead, and skips the notification if it finds a
 * visible window when it fires.
 *
 * `backgrounded` also arms a timestamp-triggered notification where the browser
 * supports it (Chromium's Notification Triggers). That one survives the worker
 * being shut down entirely, but it fires unconditionally — so it's only armed
 * once the app is actually off screen, and taken back down on return.
 */
export async function scheduleRestAlert(endsAt: number, backgrounded = false): Promise<void> {
  if (notificationPermission() !== 'granted') return
  if (endsAt <= Date.now()) return
  pendingRest = endsAt
  watchController()
  const reg = await registration()
  if (!reg) return
  worker(reg)?.postMessage({ type: 'forge-rest-schedule', at: endsAt, title: REST_TITLE, body: REST_BODY })
  if (backgrounded) await armTrigger(reg, endsAt)
}

/** Stand down a scheduled alert, and clear one that already fired. */
export async function cancelRestAlert(): Promise<void> {
  pendingRest = null
  const reg = await registration()
  if (!reg) return
  worker(reg)?.postMessage({ type: 'forge-rest-cancel' })
  try {
    const pending = await reg.getNotifications({ tag: REST_TAG, includeTriggered: true } as GetNotificationOptions)
    pending.forEach((n) => n.close())
  } catch {
    // Nothing scheduled, or the browser doesn't expose triggered notifications.
  }
}

type TimestampTriggerCtor = new (timestamp: number) => unknown

/** Chromium-only, and not on by default — feature-detected, never assumed. */
function timestampTrigger(): TimestampTriggerCtor | undefined {
  if (!notificationsSupported()) return undefined
  if (!('showTrigger' in Notification.prototype)) return undefined
  return (window as unknown as { TimestampTrigger?: TimestampTriggerCtor }).TimestampTrigger
}

async function armTrigger(reg: ServiceWorkerRegistration, endsAt: number): Promise<void> {
  const Trigger = timestampTrigger()
  if (!Trigger) return
  try {
    await reg.showNotification(REST_TITLE, {
      ...restOptions,
      showTrigger: new Trigger(endsAt),
    } as NotificationOptions)
  } catch {
    // Scheduling refused — the worker alarm above is still standing.
  }
}

/**
 * Warm the registration cache so the paths that run as the app is going off
 * screen don't have to wait on `getRegistration()` first. The browser can
 * freeze a page moments after its `visibilitychange` handler returns, and
 * anything still sat in a promise chain at that point never runs — so the
 * lookup happens while the rest starts, not while the screen is going dark.
 */
export function primeNotifications(): void {
  void registration()
}

/**
 * Fire a "rest over" alert. Only shown when the page is hidden — in the
 * foreground the in-app timer already signals. Prefers the service-worker
 * registration (required for notifications from an installed PWA), falling
 * back to a plain Notification.
 *
 * This is the path for a tab that's hidden but still running (a background
 * desktop tab). A frozen phone never gets here; that's what the worker alarm
 * in `scheduleRestAlert` is for. Both use the same tag, so if they both land
 * the second replaces the first instead of stacking.
 */
export async function notifyRestDone(): Promise<void> {
  if (notificationPermission() !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  try {
    const reg = await registration()
    if (reg) {
      await reg.showNotification(REST_TITLE, restOptions)
      return
    }
    new Notification(REST_TITLE, restOptions)
  } catch {
    // Notification unavailable — the in-app UI still updates on return.
  }
}

/**
 * Fire a "time to train" nudge. Unlike the rest alert this is allowed while the
 * app is foregrounded too — the caller (App) rate-limits it to once per day.
 *
 * Reports whether the notification actually went out, because the caller spends
 * the day's one nudge on the strength of the answer: permission not granted yet
 * is the ordinary case on a fresh install, and treating that as delivered burnt
 * the nudge for the rest of the day.
 */
export async function notifyTrainingReminder(title: string, body: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  const options: NotificationOptions = {
    body,
    tag: 'forge-train-reminder',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
  }
  try {
    const reg = await registration()
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
    new Notification(title, options)
    return true
  } catch {
    // Notification unavailable — the in-app banner still nudges.
    return false
  }
}
