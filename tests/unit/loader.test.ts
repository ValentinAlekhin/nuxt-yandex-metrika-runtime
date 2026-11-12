import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDriver, METRIKA_SCRIPT_URL } from '../../src/runtime/loader'

function setup() {
  const doc = document.implementation.createHTMLDocument()
  const driver = createBrowserDriver(window, doc)
  const ym = vi.fn()
  Object.assign(window, { ym, Ya: undefined })
  const append = doc.head.append.bind(doc.head)
  vi.spyOn(doc.head, 'append').mockImplementation((...nodes) => {
    // Keep happy-dom scripts inert; these tests explicitly control SDK load/error events.
    for (const node of nodes) {
      if (node instanceof HTMLScriptElement) node.type = 'application/json'
    }
    append(...nodes)
  })
  return { doc, driver, ym }
}

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'ym')
  Reflect.deleteProperty(window, 'Ya')
})

describe('browser driver', () => {
  it('shares a single script and waits for its load event rather than a bare ym queue', async () => {
    const { doc, driver } = setup()
    const loaded = vi.fn()
    const first = driver.load(1000).then(loaded)
    const second = createBrowserDriver(window, doc).load(1000)
    await Promise.resolve()

    expect(loaded).not.toHaveBeenCalled()
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    const script = doc.querySelector('script')!
    expect(script.src).toBe(METRIKA_SCRIPT_URL)
    expect(script.async).toBe(true)
    script.dispatchEvent(new Event('load'))
    await Promise.all([first, second])
    expect(loaded).toHaveBeenCalledOnce()
    await driver.load(1000)
    expect(doc.querySelectorAll('script')).toHaveLength(1)
  })

  it('allows a new load after a network error', async () => {
    const { doc, driver } = setup()
    const failed = driver.load(1000)
    const assertion = expect(failed).rejects.toThrow('failed to load SDK')
    doc.querySelector('script')!.dispatchEvent(new Event('error'))
    await assertion
    expect(doc.querySelector('script')).toBeNull()

    const retry = driver.load(1000)
    doc.querySelector('script')!.dispatchEvent(new Event('load'))
    await retry
  })

  it('times out a blocked SDK and removes its own script', async () => {
    vi.useFakeTimers()
    const { doc, driver } = setup()
    const failed = driver.load(50)
    const assertion = expect(failed).rejects.toThrow('SDK load timed out')
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(doc.querySelector('script')).toBeNull()
  })

  it('preserves an external script and its ym global', async () => {
    const { doc, driver, ym } = setup()
    const script = doc.createElement('script')
    script.src = METRIKA_SCRIPT_URL
    doc.head.append(script)
    const loading = driver.load(1000)
    script.dispatchEvent(new Event('load'))
    await loading
    driver.destruct('123')

    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect((window as unknown as { ym: unknown }).ym).toBe(ym)
    expect(ym).toHaveBeenCalledWith('123', 'destruct')
  })

  it('registers readiness before calling init and clears its timeout', async () => {
    vi.useFakeTimers()
    const { doc, driver, ym } = setup()
    ym.mockImplementation((id: string, method: string) => {
      if (method === 'init') doc.dispatchEvent(new Event(`yacounter${id}inited`))
    })

    await driver.init('123', { defer: true, triggerEvent: true }, new AbortController().signal, 50)
    expect(ym).toHaveBeenCalledWith('123', 'init', { defer: true, triggerEvent: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects initialization that never reports readiness', async () => {
    vi.useFakeTimers()
    const { driver } = setup()
    const initialized = driver.init(
      '123',
      { defer: true, triggerEvent: true },
      new AbortController().signal,
      50
    )
    const assertion = expect(initialized).rejects.toThrow('counter initialization timed out')
    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })

  it('removes the pending readiness listener on cancellation', async () => {
    vi.useFakeTimers()
    const { doc, driver } = setup()
    const remove = vi.spyOn(doc, 'removeEventListener')
    const abort = new AbortController()
    const initialized = driver.init('123', { defer: true, triggerEvent: true }, abort.signal, 50)
    const assertion = expect(initialized).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await assertion

    expect(remove).toHaveBeenCalledWith('yacounter123inited', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
})
