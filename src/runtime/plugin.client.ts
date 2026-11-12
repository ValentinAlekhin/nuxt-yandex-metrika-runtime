import { defineNuxtPlugin, useRouter } from '#app'
import { nextTick, watch } from 'vue'
import { createMetrikaController } from './controller'
import { createBrowserDriver } from './loader'
import { useMetrikaConfig } from './state'

export default defineNuxtPlugin({
  name: 'yandex-metrika',
  setup(nuxtApp) {
    const config = useMetrikaConfig()
    const metrika = createMetrikaController(config, createBrowserDriver(window, document))
    const router = useRouter()
    let mounted = false
    let pagePending = false
    let lastPage = ''
    let pending: { url: string; referer: string } | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const pageKey = (url: string) => url.replace(/#.*$/, '')
    const canTrack = () =>
      mounted && metrika.status.value === 'running' && config.value.trackPageviews

    function cancelPending() {
      clearTimeout(timer)
      pending = undefined
    }

    async function sendPageview() {
      const page = pending
      if (!page || !canTrack() || pagePending) return
      // Nuxt updates the head on page:finish; wait for Vue and the DOM update.
      await nextTick()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (pending !== page || !canTrack() || pagePending) return
      if (pageKey(page.url) !== pageKey(window.location.href)) return
      cancelPending()
      if (lastPage === pageKey(page.url)) return
      lastPage = pageKey(page.url)
      metrika.hit(page.url, { title: document.title, referer: page.referer })
    }

    function queuePageview(url: string, referer: string) {
      cancelPending()
      if (!canTrack()) return
      pending = { url, referer }
      // Custom router views may not emit NuxtPage lifecycle hooks.
      timer = setTimeout(() => void sendPageview(), 1000)
    }

    function initialPageview() {
      lastPage = ''
      queuePageview(window.location.href, document.referrer)
      void sendPageview()
    }

    const stopStatusWatch = watch(
      metrika.status,
      (status) => {
        cancelPending()
        if (status === 'running') initialPageview()
      },
      { flush: 'sync' }
    )
    const stopPageviewWatch = watch(
      () => config.value.trackPageviews,
      (enabled) => {
        cancelPending()
        if (enabled && canTrack()) initialPageview()
      },
      { flush: 'sync' }
    )
    const removeRouterHook = router.afterEach((to, from, failure) => {
      if (failure || pageKey(to.fullPath) === pageKey(from.fullPath)) return
      const url = new URL(router.resolve(to.fullPath).href, window.location.href).href
      const referer = new URL(router.resolve(from.fullPath).href, window.location.href).href
      queuePageview(url, referer)
    })
    const removePageStartHook = nuxtApp.hook('page:start', () => {
      pagePending = true
    })
    const removePageHook = nuxtApp.hook('page:finish', () => {
      pagePending = false
      return sendPageview()
    })
    const removeLoadingHook = nuxtApp.hook('page:loading:end', sendPageview)
    const removeMountedHook = nuxtApp.hook('app:mounted', () => {
      mounted = true
      if (metrika.status.value === 'running') initialPageview()
      else if (config.value.enabled && config.value.id) {
        // Analytics failures are exposed through error/status and must not break the app.
        void metrika.start().catch(() => {})
      }
    })

    function dispose() {
      mounted = false
      cancelPending()
      stopStatusWatch()
      stopPageviewWatch()
      removeRouterHook()
      removePageStartHook()
      removePageHook()
      removeLoadingHook()
      removeMountedHook()
      metrika.dispose()
    }

    nuxtApp.vueApp.onUnmount(dispose)
    if (import.meta.hot) import.meta.hot.dispose(dispose)

    return { provide: { yandexMetrika: metrika } }
  }
})
