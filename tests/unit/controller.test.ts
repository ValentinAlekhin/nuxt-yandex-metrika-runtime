import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { resolveMetrikaConfig } from '../../src/runtime/config'
import { createMetrikaController } from '../../src/runtime/controller'
import type { MetrikaDriver, YandexMetrikaOptions } from '../../src/runtime/types'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function createDriver() {
  return {
    load: vi.fn<MetrikaDriver['load']>().mockResolvedValue(),
    init: vi.fn<MetrikaDriver['init']>().mockResolvedValue(),
    destruct: vi.fn<MetrikaDriver['destruct']>(),
    call: vi.fn<MetrikaDriver['call']>()
  }
}

function setup(options: YandexMetrikaOptions = {}) {
  const state = ref(resolveMetrikaConfig({ id: 123, ...options }))
  const driver = createDriver()
  return { state, driver, api: createMetrikaController(state, driver) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('counter lifecycle', () => {
  it('loads and initializes only once for concurrent or repeated starts', async () => {
    const { api, driver } = setup()
    await Promise.all([api.start(), api.start()])
    await api.start()

    expect(driver.load).toHaveBeenCalledTimes(1)
    expect(driver.init).toHaveBeenCalledExactlyOnceWith(
      '123',
      expect.objectContaining({ defer: true, triggerEvent: true }),
      expect.any(AbortSignal),
      10000
    )
    expect(api.status.value).toBe('running')
    expect(api.config.value.enabled).toBe(true)
  })

  it('does not create a counter when stopped during SDK loading', async () => {
    const { api, driver } = setup()
    const sdk = deferred()
    driver.load.mockReturnValue(sdk.promise)
    const starting = api.start()
    await Promise.resolve()
    await api.stop()
    sdk.resolve()
    await starting

    expect(driver.init).not.toHaveBeenCalled()
    expect(driver.destruct).not.toHaveBeenCalled()
    expect(api.status.value).toBe('stopped')
  })

  it('aborts pending initialization and destroys the instance on stop', async () => {
    const { api, driver } = setup()
    const ready = deferred()
    driver.init.mockReturnValue(ready.promise)
    const starting = api.start()
    await vi.waitFor(() => expect(driver.init).toHaveBeenCalled())
    const signal = driver.init.mock.calls[0]![2]
    await api.stop()
    ready.resolve()
    await starting

    expect(signal.aborted).toBe(true)
    expect(driver.destruct).toHaveBeenCalledExactlyOnceWith('123')
    expect(api.status.value).toBe('stopped')
  })

  it('changes the ID while running and can switch back to the original ID', async () => {
    const { api, driver } = setup()
    await api.start()
    await api.configure({ id: 456 })
    await api.configure({ id: 123 })
    api.reachGoal('contact_submit')

    expect(driver.init.mock.calls.map(([id]) => id)).toEqual(['123', '456', '123'])
    expect(driver.destruct.mock.calls).toEqual([['123'], ['456']])
    expect(driver.call.mock.calls[0]?.slice(0, 3)).toEqual(['123', 'reachGoal', 'contact_submit'])
  })

  it('restarts a stopped counter with the same ID', async () => {
    const { api, driver } = setup()
    await api.start()
    await api.stop()
    await api.stop()
    await api.start()

    expect(driver.init).toHaveBeenCalledTimes(2)
    expect(driver.destruct).toHaveBeenCalledTimes(1)
    expect(api.status.value).toBe('running')
  })

  it('keeps the counter stopped when changing only its configuration', async () => {
    const { api, driver } = setup()
    await api.stop()
    await api.configure({ id: 456, options: { webvisor: true } })

    expect(api.status.value).toBe('stopped')
    expect(api.config.value.id).toBe('456')
    expect(driver.load).not.toHaveBeenCalled()
  })

  it('restarts only for initialization changes, preserving nested defaults', async () => {
    const { api, driver } = setup()
    await api.start()
    await api.configure({ trackPageviews: false })
    await api.configure({ options: { webvisor: true } })
    await api.configure({ options: { webvisor: true } })

    expect(driver.init).toHaveBeenCalledTimes(2)
    expect(driver.init.mock.calls[1]?.[1]).toMatchObject({ webvisor: true, clickmap: true })
  })

  it('uses only the last ID when configurations race during loading', async () => {
    const { api, driver } = setup()
    const sdk = deferred()
    driver.load.mockReturnValue(sdk.promise)
    const a = api.start()
    await Promise.resolve()
    const b = api.configure({ id: 456 })
    const c = api.configure({ id: 789 })
    sdk.resolve()
    await Promise.all([a, b, c])

    expect(driver.init.mock.calls.map(([id]) => id)).toEqual(['789'])
    expect(api.status.value).toBe('running')
  })

  it('does not apply an invalid patch or disturb the active counter', async () => {
    const { api, driver } = setup()
    await api.start()
    await expect(api.configure({ id: -1, enabled: false })).rejects.toThrow(TypeError)

    expect(api.config.value).toMatchObject({ id: '123', enabled: true })
    expect(api.status.value).toBe('running')
    expect(driver.destruct).not.toHaveBeenCalled()
  })

  it('drops events while stopped rather than replaying them into another counter', async () => {
    const { api, driver } = setup()
    api.reachGoal('before-start')
    await api.start()
    await api.stop()
    api.reachGoal('after-stop')
    await api.configure({ id: 456, enabled: true })
    api.hit('/current', { title: 'Current' })

    expect(driver.call.mock.calls).toEqual([['456', 'hit', '/current', { title: 'Current' }]])
  })

  it('reports a load error and permits an explicit retry', async () => {
    const { api, driver } = setup()
    driver.load.mockRejectedValueOnce(new Error('blocked'))
    await expect(api.start()).rejects.toThrow('blocked')
    expect(api.status.value).toBe('error')
    expect(api.error.value?.message).toBe('blocked')
    await api.start()
    expect(api.status.value).toBe('running')
    expect(api.error.value).toBeNull()
  })

  it('cleans up a failed initialization before a retry', async () => {
    const { api, driver } = setup()
    driver.init.mockRejectedValueOnce(new Error('not ready'))
    await expect(api.start()).rejects.toThrow('not ready')
    expect(driver.destruct).toHaveBeenCalledExactlyOnceWith('123')
    await api.start()
    expect(api.status.value).toBe('running')
  })

  it('updates serializable configuration during SSR without a browser driver', async () => {
    const state = ref(resolveMetrikaConfig())
    const api = createMetrikaController(state)
    await api.configure({ id: 123, enabled: true })
    await api.start()
    api.reachGoal('server')

    expect(api.status.value).toBe('idle')
    expect(JSON.parse(JSON.stringify(state.value))).toMatchObject({ id: '123', enabled: true })
  })

  it('reconstructs the same SSR status from hydrated configuration', async () => {
    const state = ref(resolveMetrikaConfig())
    const server = createMetrikaController(state)
    await server.configure({ id: 123 })
    const hydratedState = ref(JSON.parse(JSON.stringify(state.value)))
    const client = createMetrikaController(hydratedState, createDriver())

    expect(client.status.value).toBe(server.status.value)
    expect(client.status.value).toBe('stopped')
  })

  it('isolates controllers and rejects actions after disposal', async () => {
    const first = setup()
    const second = setup({ id: 456 })
    await first.api.start()
    first.api.dispose()
    first.api.dispose()

    expect(first.driver.destruct).toHaveBeenCalledTimes(1)
    await expect(first.api.start()).rejects.toThrow('disposed')
    expect(second.api.config.value.enabled).toBe(false)
    expect(second.driver.load).not.toHaveBeenCalled()
  })

  it('blocks events even when vendor cleanup throws and retries cleanup on the next stop', async () => {
    const { api, driver } = setup()
    await api.start()
    driver.destruct.mockImplementationOnce(() => {
      throw new Error('cleanup failed')
    })
    await expect(api.stop()).rejects.toThrow('cleanup failed')
    api.reachGoal('must-not-send')

    expect(api.status.value).toBe('stopped')
    expect(api.config.value.enabled).toBe(false)
    expect(api.error.value?.message).toBe('cleanup failed')
    expect(driver.call).not.toHaveBeenCalled()
    await api.stop()
    expect(driver.destruct).toHaveBeenCalledTimes(2)
    expect(api.error.value).toBeNull()
  })

  it('does not let vendor cleanup failure escape disposal', async () => {
    const { api, driver } = setup()
    await api.start()
    driver.destruct.mockImplementation(() => {
      throw new Error('cleanup failed')
    })

    expect(() => api.dispose()).not.toThrow()
    expect(api.status.value).toBe('stopped')
    expect(api.error.value?.message).toBe('cleanup failed')
  })

  it('waits before requesting the SDK and shares the delay between concurrent starts', async () => {
    vi.useFakeTimers()
    const { api, driver } = setup({ delay: 100 })
    const first = api.start()
    const second = api.start()
    await vi.advanceTimersByTimeAsync(99)

    expect(api.status.value).toBe('loading')
    expect(driver.load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([first, second])
    expect(driver.load).toHaveBeenCalledTimes(1)
    expect(driver.init).toHaveBeenCalledTimes(1)
  })

  it('cancels the delay without requesting the SDK and removes its timer', async () => {
    vi.useFakeTimers()
    const { api, driver } = setup({ delay: 100 })
    const starting = api.start()
    await vi.advanceTimersByTimeAsync(50)
    await api.stop()
    await starting

    expect(vi.getTimerCount()).toBe(0)
    expect(driver.load).not.toHaveBeenCalled()
    expect(driver.init).not.toHaveBeenCalled()
    expect(api.status.value).toBe('stopped')
  })

  it('applies the latest ID and delay when reconfigured during the pending delay', async () => {
    vi.useFakeTimers()
    const { api, driver } = setup({ delay: 100 })
    const starting = api.start()
    await vi.advanceTimersByTimeAsync(50)
    const changing = api.configure({ id: 456, delay: 200 })
    await vi.advanceTimersByTimeAsync(199)
    expect(driver.load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.all([starting, changing])

    expect(driver.init.mock.calls.map(([id]) => id)).toEqual(['456'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('logs only lifecycle and method names with the counter ID when debug is enabled', async () => {
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { api, driver } = setup()
    await api.start()
    api.params({ email: 'private@example.com' })
    expect(log).not.toHaveBeenCalled()

    await api.configure({ debug: true, delay: 1000 })
    api.params({ email: 'private@example.com' })
    api.setUserID('private-user-id')
    api.hit('/private-url')
    await api.stop()

    expect(driver.init).toHaveBeenCalledTimes(1)
    expect(driver.call).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[yandex-metrika]', 'params', '123')
    expect(log).toHaveBeenCalledWith('[yandex-metrika]', 'destruct', '123')
    expect(log).toHaveBeenCalledWith('[yandex-metrika]', 'stopped', '123')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private')
  })
})
