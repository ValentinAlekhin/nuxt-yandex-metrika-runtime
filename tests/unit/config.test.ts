import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveMetrikaConfig } from '../../src/runtime/config'
import type { YandexMetrikaOptions } from '../../src/runtime/types'

describe('configuration', () => {
  it('normalizes numeric IDs and merges nested initialization options', () => {
    const base = resolveMetrikaConfig({ id: 123, enabled: true, options: { webvisor: true } })
    const next = resolveMetrikaConfig({ options: { clickmap: false } }, base)

    expect(next).toMatchObject({
      id: '123',
      enabled: true,
      options: { webvisor: true, clickmap: false, trackLinks: true }
    })
    expect(base.options.clickmap).toBe(true)
    expect(DEFAULT_CONFIG.id).toBe('')
  })

  it('copies configuration values instead of retaining mutable input references', () => {
    const params = { user: { role: 'visitor' } }
    const trustedDomains = ['example.com']
    const config = resolveMetrikaConfig({ options: { params, trustedDomains } })
    params.user.role = 'admin'
    trustedDomains.push('other.example')

    expect(config.options.params).toEqual({ user: { role: 'visitor' } })
    expect(config.options.trustedDomains).toEqual(['example.com'])
  })

  it.each([
    0,
    -1,
    1.5,
    '00123',
    '1e3',
    'abc',
    ' 123 ',
    '123\n',
    '123\r\n',
    Number.MAX_SAFE_INTEGER + 1,
    String(Number.MAX_SAFE_INTEGER + 1)
  ])('rejects invalid counter ID %s', (id) => {
    expect(() => resolveMetrikaConfig({ id })).toThrow(/id: must be a positive integer/)
  })

  it.each([
    { enabled: 'false' },
    { debug: 'true' },
    { delay: -1 },
    { delay: 1.5 },
    { trackPageviews: 1 },
    { loadTimeout: 0 },
    { loadTimeout: 1.5 },
    { loadTimeout: Number.MAX_SAFE_INTEGER + 1 },
    { delay: Infinity },
    { id: undefined },
    { enabled: undefined },
    { options: undefined },
    { options: null },
    { options: { webvisor: undefined } },
    { options: { webvisor: 'false' } },
    { options: { accurateTrackBounce: -1 } },
    { options: { accurateTrackBounce: Number.MAX_SAFE_INTEGER + 1 } },
    { options: { ecommerce: '' } },
    { options: { type: '0' } },
    { options: { trustedDomains: [42] } },
    { options: { params: { callback: () => {} } } },
    { options: { defer: false } },
    { options: { triggerEvent: true } },
    { scriptUrl: 'https://other.example/sdk.js' }
  ])('rejects invalid API configuration %#', (patch) => {
    expect(() => resolveMetrikaConfig(patch as YandexMetrikaOptions)).toThrow(TypeError)
  })

  it('accepts safe integer boundaries and normalizes string IDs', () => {
    const config = resolveMetrikaConfig({
      id: String(Number.MAX_SAFE_INTEGER),
      delay: 0,
      loadTimeout: Number.MAX_SAFE_INTEGER,
      options: { accurateTrackBounce: 0, ecommerce: 'dataLayer', type: 0 }
    })

    expect(config.id).toBe(String(Number.MAX_SAFE_INTEGER))
    expect(config.options).toMatchObject({
      accurateTrackBounce: 0,
      ecommerce: 'dataLayer',
      type: 0
    })
    expect(resolveMetrikaConfig({ id: '' }).id).toBe('')
    expect(resolveMetrikaConfig({ id: Number.MAX_SAFE_INTEGER }).id).toBe(config.id)
  })

  it.each(['params', 'userParams'] as const)(
    'rejects non-JSON and circular values in %s',
    (key) => {
      const cycle: Record<string, unknown> = {}
      cycle.self = cycle
      const arrayCycle: unknown[] = []
      arrayCycle.push(arrayCycle)

      for (const value of [
        undefined,
        () => {},
        1n,
        NaN,
        Infinity,
        Symbol('value'),
        new Date(),
        new Map(),
        Object.create(null),
        [undefined],
        cycle,
        arrayCycle
      ]) {
        expect(() => resolveMetrikaConfig({ options: { [key]: { nested: value } } })).toThrow(
          TypeError
        )
      }
    }
  )

  it('copies nested JSON and shared references when merging options', () => {
    const shared = { labels: ['initial'] }
    const params = { first: shared, second: shared, values: [null, true, 1.5] }
    const base = resolveMetrikaConfig({ options: { params, userParams: { profile: shared } } })
    const next = resolveMetrikaConfig({ options: { webvisor: true } }, base)
    shared.labels.push('input mutation')
    const first = base.options.params!.first as typeof shared
    first.labels.push('base mutation')

    expect(next.options.params).toEqual({
      first: { labels: ['initial'] },
      second: { labels: ['initial'] },
      values: [null, true, 1.5]
    })
    expect(next.options.userParams).toEqual({ profile: { labels: ['initial'] } })
    expect(next.options.params!.first).not.toBe(next.options.params!.second)
  })

  it('rejects non-plain objects and preserves the base on failure', () => {
    const base = resolveMetrikaConfig({ id: 123, enabled: true })
    const snapshot = structuredClone(base)
    for (const patch of [
      null,
      [],
      Object.create(null),
      new Date(),
      { options: Object.create(null) },
      { id: 456, options: { params: { forbidden: undefined } } }
    ]) {
      expect(() => resolveMetrikaConfig(patch as YandexMetrikaOptions, base)).toThrow(TypeError)
      expect(base).toEqual(snapshot)
    }
  })

  it('preserves and validates JSON keys without changing the prototype', () => {
    const params = JSON.parse('{"__proto__":{"active":true},"constructor":"value"}')
    const config = resolveMetrikaConfig({ options: { params } })

    expect(config.options.params).toEqual(params)
    expect(Object.getPrototypeOf(config.options.params)).toBe(Object.prototype)
    Object.defineProperty(params, '__proto__', { value: { forbidden: undefined } })
    expect(() => resolveMetrikaConfig({ options: { params } })).toThrow(TypeError)
  })
})
