/** Notification helpers for rest alerts that reach a backgrounded phone. */

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

/**
 * Fire a "rest over" alert. Only shown when the page is hidden — in the
 * foreground the in-app timer already signals. Prefers the service-worker
 * registration (required for notifications from an installed PWA), falling
 * back to a plain Notification.
 */
export async function notifyRestDone(): Promise<void> {
  if (notificationPermission() !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return
  const title = 'Rest complete 💪'
  const options: NotificationOptions = {
    body: 'Time for your next set.',
    tag: 'forge-rest',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.showNotification(title, options)
        return
      }
    }
    new Notification(title, options)
  } catch {
    // Notification unavailable — the in-app UI still updates on return.
  }
}
