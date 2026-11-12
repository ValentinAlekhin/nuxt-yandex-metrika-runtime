import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { Window as HappyDomWindow } from 'happy-dom'
import { defineComponent, h, nextTick } from 'vue'
import { useNuxtApp } from '#app'
import { NuxtPage } from '#components'
import { useYandexMetrika } from '../../src/runtime/composables/useYandexMetrika'
import type { YandexMetrika } from '../../src/runtime/types'

const sdk = vi.fn((id: string, method: string, ..._args: unknown[]) => {
  if (method === 'init') document.dispatchEvent(new Event(`yacounter${id}inited`))
})
const sdkWindow = window as Window & { ym?: typeof sdk }
const wrappers: { unmount: () => void }[] = []
let metrika: YandexMetrika
let sdkLoaded = false
const browserSettings = (window as unknown as HappyDomWindow).happyDOM.settings
const originalSettings = {
  disableJavaScriptFileLoading: browserSettings.disableJavaScriptFileLoading,
  handleDisabledFileLoadingAsSuccess: browserSettings.handleDisabledFileLoadingAsSuccess
}

beforeAll(() => {
  browserSettings.disableJavaScriptFileLoading = true
  browserSettings.handleDisabledFileLoadingAsSuccess = true
})

afterAll(() => {
  Object.assign(browserSettings, originalSettings)
})

registerEndpoint('/api/test-metrika-config', () => ({ id: 87654321, enabled: true }))

async function loadSdk(action: () => Promise<void>) {
  sdkWindow.ym = sdk
  const pending = action()
  void pending.catch(() => {})
  if (!sdkLoaded) {
    await vi.waitFor(() => {
      expect(document.querySelector('script[data-nuxt-yandex-metrika]')).not.toBeNull()
    })
    document.querySelector('script[data-nuxt-yandex-metrika]')!.dispatchEvent(new Event('load'))
    sdkLoaded = true
  }
  await pending
  await flushPromises()
}

async function start() {
  await loadSdk(() => metrika.start())
  await vi.waitFor(() => expect(hits()).toHaveLength(1))
}

function hits() {
  return sdk.mock.calls.filter(([, method]) => method === 'hit')
}

beforeEach(async () => {
  metrika = await useNuxtApp().runWithContext(() => useYandexMetrika())
  await metrika.stop()
  await metrika.configure({
    id: 12345678,
    enabled: false,
    trackPageviews: true,
    options: { webvisor: false }
  })
  sdk.mockClear()
})

afterEach(async () => {
  await metrika.stop()
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('useYandexMetrika in a Nuxt app', () => {
  it('is available with enabled:false and shares reactive state between Vue consumers', async () => {
    const consumers: YandexMetrika[] = []
    const Consumer = defineComponent({
      setup() {
        const analytics = useYandexMetrika()
        consumers.push(analytics)
        return () => h('span', `${analytics.config.value.id}:${analytics.status.value}`)
      }
    })
    const wrapper = await mountSuspended(
      defineComponent({ render: () => h('div', [h(Consumer), h(Consumer)]) }),
      { route: false }
    )
    wrappers.push(wrapper)

    expect(consumers).toHaveLength(2)
    expect(consumers[0]).toBe(metrika)
    expect(consumers[1]).toBe(metrika)
    expect(metrika.config.value.enabled).toBe(false)
    expect(sdk).not.toHaveBeenCalled()

    await consumers[0]!.configure({ id: 87654321 })
    await nextTick()
    expect(wrapper.findAll('span').map((span) => span.text())).toEqual([
      '87654321:stopped',
      '87654321:stopped'
    ])
    expect(sdk).not.toHaveBeenCalled()
  })

  it('starts, switches the counter and stops through the public composable', async () => {
    await start()
    expect(metrika.status.value).toBe('running')
    expect(sdk).toHaveBeenCalledWith(
      '12345678',
      'init',
      expect.objectContaining({ defer: true, triggerEvent: true })
    )
    metrika.reachGoal('contact_submit', { source: 'form' })
    expect(sdk.mock.calls.find(([, method]) => method === 'reachGoal')?.slice(0, 4)).toEqual([
      '12345678',
      'reachGoal',
      'contact_submit',
      { source: 'form' }
    ])

    await metrika.configure({ id: 87654321 })
    expect(sdk).toHaveBeenCalledWith('12345678', 'destruct')
    expect(sdk).toHaveBeenCalledWith('87654321', 'init', expect.any(Object))
    expect(metrika.config.value.id).toBe('87654321')

    await metrika.stop()
    sdk.mockClear()
    metrika.reachGoal('after_stop')
    expect(metrika.status.value).toBe('stopped')
    expect(sdk).not.toHaveBeenCalled()

    const script = document.querySelector('script[data-nuxt-yandex-metrika]')
    await metrika.start()
    expect(metrika.status.value).toBe('running')
    expect(sdk).toHaveBeenCalledWith('87654321', 'init', expect.any(Object))
    expect(document.querySelectorAll('script[data-nuxt-yandex-metrika]')).toHaveLength(1)
    expect(document.querySelector('script[data-nuxt-yandex-metrika]')).toBe(script)
  })

  it('starts from enabled:true at runtime and keeps repeated start calls idempotent', async () => {
    await loadSdk(() => metrika.configure({ enabled: true }))
    await vi.waitFor(() => expect(hits()).toHaveLength(1))
    expect(metrika.status.value).toBe('running')
    expect(sdk.mock.calls.filter(([, method]) => method === 'init')).toHaveLength(1)

    await metrika.start()
    await metrika.start()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()
    expect(hits()).toHaveLength(1)
    expect(sdk.mock.calls.filter(([, method]) => method === 'init')).toHaveLength(1)
  })

  it('can enable automatic pageviews without restarting the counter or disabling goals', async () => {
    await metrika.configure({ trackPageviews: false })
    await loadSdk(() => metrika.start())
    expect(metrika.status.value).toBe('running')
    expect(hits()).toHaveLength(0)
    sdk.mockClear()

    metrika.reachGoal('manual_tracking')
    expect(sdk.mock.calls.at(-1)?.slice(0, 3)).toEqual(['12345678', 'reachGoal', 'manual_tracking'])
    await metrika.configure({ trackPageviews: true })
    await vi.waitFor(() => expect(hits()).toHaveLength(1))
    expect(sdk.mock.calls.some(([, method]) => method === 'init' || method === 'destruct')).toBe(
      false
    )
    expect(hits()[0]?.[2]).toBe(window.location.href)
  })

  it('accepts configuration returned by an application API without changing runtimeConfig', async () => {
    await start()
    const app = useNuxtApp()
    const initialConfig = JSON.stringify(app.$config.public.yandexMetrika)
    const Consumer = defineComponent({
      async setup() {
        const analytics = useYandexMetrika()
        const settings = await $fetch<{ id: number; enabled: boolean }>('/api/test-metrika-config')
        await analytics.configure(settings)
        return () => h('span', analytics.config.value.id)
      }
    })
    const wrapper = await mountSuspended(Consumer, { route: false })
    wrappers.push(wrapper)

    expect(wrapper.text()).toBe('87654321')
    expect(metrika.status.value).toBe('running')
    expect(JSON.stringify(app.$config.public.yandexMetrika)).toBe(initialConfig)
  })

  it('keeps the application counter running when a consumer is unmounted', async () => {
    await start()
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const analytics = useYandexMetrika()
          return () => h('span', analytics.status.value)
        }
      }),
      { route: false }
    )
    sdk.mockClear()
    wrapper.unmount()
    await flushPromises()

    expect(metrika.status.value).toBe('running')
    expect(sdk).not.toHaveBeenCalled()
    metrika.reachGoal('still_running')
    expect(sdk.mock.calls.at(-1)?.slice(0, 3)).toEqual(['12345678', 'reachGoal', 'still_running'])
  })

  it('tracks one initial view and completed page changes, ignoring hashes and stopped navigation', async () => {
    const wrapper = await mountSuspended(NuxtPage, { route: '/' })
    wrappers.push(wrapper)
    await start()
    expect(hits()).toHaveLength(1)

    const router = useNuxtApp().$router
    await router.push('/other')
    await flushPromises()
    await vi.waitFor(() => expect(hits()).toHaveLength(2))

    await router.push('/other#section')
    await flushPromises()
    await router.push('/other#section')
    await flushPromises()
    expect(hits()).toHaveLength(2)

    await metrika.stop()
    sdk.mockClear()
    await router.push('/')
    await flushPromises()
    expect(hits()).toHaveLength(0)
  })
})
