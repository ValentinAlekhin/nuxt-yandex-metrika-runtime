import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, createPage, setup, url } from '@nuxt/test-utils/e2e'

const sdkUrl = 'https://mc.yandex.ru/metrika/tag.js'
const fakeSdk = `
window.__metrikaCalls = []
window.ym = function (id, method, ...args) {
  window.__metrikaCalls.push([id, method, ...args])
  if (method === 'init') {
    queueMicrotask(() => document.dispatchEvent(new Event('yacounter' + id + 'inited')))
  }
}
`

describe('Nuxt module', async () => {
  process.env.METRIKA_TEST_DIST = '1'
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    nuxtConfig: { buildDir: '.nuxt-test-e2e' },
    browser: true
  })

  it('renders on the server without loading the SDK and isolates configuration per request', async () => {
    const [first, second] = await Promise.all([
      $fetch<string>('/?id=11111111'),
      $fetch<string>('/?id=22222222')
    ])

    expect(first).toContain('data-testid="counter-id">11111111</p>')
    expect(second).toContain('data-testid="counter-id">22222222</p>')
    expect(first).not.toContain(sdkUrl)
    expect(first).not.toContain('mc.yandex.ru/watch/')

    const next = await $fetch<string>('/')
    expect(next).toContain('data-testid="counter-id">12345678</p>')
  })

  it('hydrates disabled, starts, switches counters, stops and restarts without reloading SDK', async () => {
    const page = await createPage()
    let sdkRequests = 0
    await page.route(sdkUrl, async (route) => {
      sdkRequests++
      await route.fulfill({ contentType: 'application/javascript', body: fakeSdk })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    try {
      await page.goto(url('/'), { waitUntil: 'hydration' })
      expect(await page.getByTestId('counter-status').textContent()).toBe('stopped')
      expect(sdkRequests).toBe(0)

      await page.getByTestId('start').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-status"]')?.textContent === 'running'
      )
      await page.getByTestId('goal').click()
      await page.getByTestId('switch').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-id"]')?.textContent === '87654321'
      )
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-status"]')?.textContent === 'running'
      )
      await page.getByTestId('stop').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-status"]')?.textContent === 'stopped'
      )
      await page.getByTestId('goal').click()
      await page.getByTestId('start').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-status"]')?.textContent === 'running'
      )

      const calls = await page.evaluate(
        () => (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls
      )
      expect(calls.filter((call) => call[1] === 'init').map((call) => call[0])).toEqual([
        '12345678',
        '87654321',
        '87654321'
      ])
      expect(calls.filter((call) => call[1] === 'destruct').map((call) => call[0])).toEqual([
        '12345678',
        '87654321'
      ])
      expect(calls.filter((call) => call[1] === 'reachGoal')).toHaveLength(1)
      expect(calls.find((call) => call[1] === 'init')?.[2]).toMatchObject({
        webvisor: true,
        clickmap: true,
        defer: true,
        triggerEvent: true
      })
      expect(sdkRequests).toBe(1)
      expect(errors).toEqual([])
    } finally {
      await page.close()
    }
  })

  it('hydrates configuration received during SSR without hydration warnings', async () => {
    const page = await createPage()
    const hydrationWarnings: string[] = []
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()) && /hydration/i.test(message.text())) {
        hydrationWarnings.push(message.text())
      }
    })

    try {
      await page.goto(url('/?id=11111111'), { waitUntil: 'hydration' })
      expect(await page.getByTestId('counter-id').textContent()).toBe('11111111')
      expect(await page.getByTestId('counter-status').textContent()).toBe('stopped')
      expect(hydrationWarnings).toEqual([])
    } finally {
      await page.close()
    }
  })

  it('automatically starts after hydration when SSR configuration enables the counter', async () => {
    const page = await createPage()
    await page.route(sdkUrl, (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fakeSdk })
    )

    try {
      await page.goto(url('/?id=11111111&enabled=true'), { waitUntil: 'hydration' })
      await page.waitForFunction(
        () => document.querySelector('[data-testid="counter-status"]')?.textContent === 'running'
      )
      await page.waitForFunction(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls?.some(
          (call) => call[1] === 'hit'
        )
      )
      const calls = await page.evaluate(
        () => (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls
      )
      expect(calls.filter((call) => call[1] === 'init').map((call) => call[0])).toEqual([
        '11111111'
      ])
      expect(calls.filter((call) => call[1] === 'hit')).toHaveLength(1)
    } finally {
      await page.close()
    }
  })

  it('sends one initial pageview and one pageview after a completed navigation', async () => {
    const page = await createPage()
    await page.route(sdkUrl, (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fakeSdk })
    )

    try {
      await page.goto(url('/'), { waitUntil: 'hydration' })
      await page.getByTestId('start').click()
      await page.waitForFunction(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls?.some(
          (call) => call[1] === 'hit'
        )
      )
      await page.getByTestId('other').click()
      await page.waitForFunction(
        () =>
          (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls.filter(
            (call) => call[1] === 'hit'
          ).length === 2
      )

      const hits = await page.evaluate(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls.filter(
          (call) => call[1] === 'hit'
        )
      )
      expect(hits).toHaveLength(2)
      expect(hits[0]?.[2]).toBe(url('/'))
      expect(hits[0]?.[3]).toMatchObject({ title: 'Metrika fixture' })
      expect(hits[1]?.[2]).toBe(url('/other'))
      expect(hits[1]?.[3]).toMatchObject({ title: 'Other page', referer: url('/') })
    } finally {
      await page.close()
    }
  })

  it('waits for async pages before sending their pageview and title', async () => {
    const page = await createPage()
    await page.route(sdkUrl, (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fakeSdk })
    )

    try {
      await page.goto(url('/'), { waitUntil: 'hydration' })
      await page.getByTestId('start').click()
      await page.waitForFunction(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls?.some(
          (call) => call[1] === 'hit'
        )
      )
      await page.getByTestId('slow').click()
      await page.waitForTimeout(1100)

      const beforeResolve = await page.evaluate(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls.filter(
          (call) => call[1] === 'hit'
        )
      )
      expect(beforeResolve).toHaveLength(1)

      await page.waitForFunction(
        () =>
          (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls.filter(
            (call) => call[1] === 'hit'
          ).length === 2
      )
      const hits = await page.evaluate(() =>
        (window as unknown as { __metrikaCalls: unknown[][] }).__metrikaCalls.filter(
          (call) => call[1] === 'hit'
        )
      )
      expect(hits[1]?.[2]).toBe(url('/slow'))
      expect(hits[1]?.[3]).toMatchObject({ title: 'Slow page', referer: url('/') })
    } finally {
      await page.close()
    }
  })
})
