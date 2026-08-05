import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * These cover the plumbing between the page and the service worker, which is
 * where rest alerts went missing: a worker that hadn't registered yet, and a
 * worker replaced by an update partway through a rest.
 */

interface Msg { type: string; at?: number }

class FakeWorker {
  messages: Msg[] = []
  postMessage(m: Msg) { this.messages.push(m) }
}

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

function install(opts: {
  permission?: NotificationPermission
  /** Whether `getRegistration()` already knows about a worker. */
  registered?: boolean
  /** Whether `ready` ever settles — it doesn't in a browser with no worker. */
  activates?: boolean
} = {}) {
  const { permission = 'granted', registered = true, activates = true } = opts
  const worker = new FakeWorker()
  const reg = {
    active: worker as FakeWorker | null,
    showNotification: vi.fn(async () => {}),
    getNotifications: vi.fn(async () => []),
  }
  const listeners = new Map<string, Array<() => void>>()
  const container = {
    getRegistration: vi.fn(async () => (registered ? reg : undefined)),
    ready: activates ? Promise.resolve(reg) : new Promise<never>(() => {}),
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
  }

  const Stub = function () {} as unknown as { permission: NotificationPermission; prototype: object }
  Stub.permission = permission
  define('Notification', Stub)
  define('window', { Notification: Stub })
  define('navigator', { serviceWorker: container })
  define('document', { visibilityState: 'hidden' })

  return {
    reg,
    worker,
    container,
    fire: (type: string) => (listeners.get(type) ?? []).forEach((fn) => fn()),
  }
}

/** Let queued promise callbacks run, without leaning on timers. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const load = () => import('./notify')

beforeEach(() => vi.resetModules())
afterEach(() => vi.useRealTimers())

describe('scheduleRestAlert', () => {
  it('hands the deadline to the worker', async () => {
    const h = install()
    const endsAt = Date.now() + 90_000
    await (await load()).scheduleRestAlert(endsAt)
    expect(h.worker.messages).toEqual([
      expect.objectContaining({ type: 'forge-rest-schedule', at: endsAt }),
    ])
  })

  it('waits for a registration that is still in flight', async () => {
    // The registration script only runs on `load`, so a rest started in the
    // opening seconds of a fresh install finds `getRegistration()` empty.
    const h = install({ registered: false })
    const endsAt = Date.now() + 90_000
    await (await load()).scheduleRestAlert(endsAt)
    expect(h.worker.messages).toHaveLength(1)
  })

  it('gives up instead of hanging when no worker ever activates', async () => {
    install({ registered: false, activates: false })
    vi.useFakeTimers()
    const pending = (await load()).scheduleRestAlert(Date.now() + 90_000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toBeUndefined()
  })

  it('says nothing without permission', async () => {
    const h = install({ permission: 'default' })
    await (await load()).scheduleRestAlert(Date.now() + 90_000)
    expect(h.worker.messages).toEqual([])
  })

  it('ignores a deadline that has already passed', async () => {
    const h = install()
    await (await load()).scheduleRestAlert(Date.now() - 1000)
    expect(h.worker.messages).toEqual([])
  })
})

describe('a worker replaced mid-rest', () => {
  it('gets handed the live deadline', async () => {
    const h = install()
    const endsAt = Date.now() + 90_000
    await (await load()).scheduleRestAlert(endsAt)

    const replacement = new FakeWorker()
    h.reg.active = replacement
    h.fire('controllerchange')
    await settle()

    expect(replacement.messages).toEqual([
      expect.objectContaining({ type: 'forge-rest-schedule', at: endsAt }),
    ])
  })

  it('is left alone once the rest is over', async () => {
    const h = install()
    const notify = await load()
    await notify.scheduleRestAlert(Date.now() + 90_000)
    await notify.cancelRestAlert()

    const replacement = new FakeWorker()
    h.reg.active = replacement
    h.fire('controllerchange')
    await settle()

    expect(replacement.messages).toEqual([])
  })
})

describe('notifyTrainingReminder', () => {
  it('reports the nudge it actually showed', async () => {
    const h = install()
    await expect((await load()).notifyTrainingReminder('Time to train', 'Push day')).resolves.toBe(true)
    expect(h.reg.showNotification).toHaveBeenCalledWith('Time to train', expect.objectContaining({ body: 'Push day' }))
  })

  it('reports the nudge it could not show', async () => {
    install({ permission: 'default' })
    await expect((await load()).notifyTrainingReminder('Time to train', 'Push day')).resolves.toBe(false)
  })

  it('reports a nudge the browser refused', async () => {
    const h = install()
    h.reg.showNotification = vi.fn(async () => { throw new Error('permission revoked') })
    await expect((await load()).notifyTrainingReminder('Time to train', 'Push day')).resolves.toBe(false)
  })
})
