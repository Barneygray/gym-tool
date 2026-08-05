/*
 * Rest-alert alarm. Imported into the Workbox-generated service worker (see
 * `workbox.importScripts` in vite.config.ts), so it runs on the worker thread
 * rather than the page.
 *
 * That's the whole point: when the phone locks or you switch apps mid-set, the
 * page's setInterval is frozen, so the in-app countdown never reaches zero and
 * never gets to fire its own notification. The page hands the deadline over
 * here before it goes under, and the worker — which the browser keeps alive for
 * the duration of a pending `waitUntil` — rings the bell instead.
 */

/* global self, clients */

const REST_TAG = 'forge-rest'

// A worker restart drops this, which is exactly why the alarm holds the
// message event open: the pending promise is what keeps the worker resident.
let restAlarm = null

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'forge-rest-schedule') {
    event.waitUntil(scheduleRest(data))
  } else if (data.type === 'forge-rest-cancel') {
    clearRest()
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openApp())
})

function scheduleRest({ at, title, body }) {
  clearRest()
  const delay = Math.max(0, at - Date.now())
  // Browsers cap how long one event may keep a worker alive (~5 min in
  // Chromium). A rest period is a fraction of that; anything longer is a bad
  // deadline rather than a real one, so don't sit on it.
  if (delay > 10 * 60 * 1000) return Promise.resolve()
  return new Promise((resolve) => {
    restAlarm = {
      resolve,
      timeout: setTimeout(() => {
        restAlarm = null
        fireRest(title, body).then(resolve, resolve)
      }, delay),
    }
  })
}

function clearRest() {
  if (!restAlarm) return
  const { timeout, resolve } = restAlarm
  restAlarm = null
  clearTimeout(timeout)
  resolve()
}

async function fireRest(title, body) {
  // The page cancels on its way back to the foreground, but that message can
  // lose the race with a resuming tab — check for ourselves rather than
  // interrupting someone who is already looking at the timer.
  if (await appOnScreen()) return
  try {
    await self.registration.showNotification(title || 'Rest complete', {
      body: body || 'Time for your next set.',
      tag: REST_TAG,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      renotify: true,
      requireInteraction: true,
      vibrate: [180, 90, 180],
    })
  } catch {
    // Permission revoked mid-rest, or notifications unavailable.
  }
}

/**
 * Our own windows. `includeUncontrolled` reaches across the whole origin, not
 * just this scope, and on GitHub Pages the origin is shared with every other
 * project on the account — so the scope filter is what makes these windows
 * *ours*. Without it an unrelated tab left open on the same origin counted as
 * the app being on screen, and silently ate the alert.
 */
async function appWindows() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.filter((client) => client.url.startsWith(self.registration.scope))
}

async function appOnScreen() {
  const windows = await appWindows()
  return windows.some((client) => client.visibilityState === 'visible')
}

async function openApp() {
  const windows = await appWindows()
  for (const client of windows) {
    if ('focus' in client) return client.focus()
  }
  if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope)
}
