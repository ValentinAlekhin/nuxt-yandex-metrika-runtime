import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

const modulePath = fileURLToPath(
  new URL(
    process.env.METRIKA_TEST_DIST === '1' ? '../../../dist/module.mjs' : '../../../src/module.ts',
    import.meta.url
  )
)

export default defineNuxtConfig({
  compatibilityDate: '2025-12-01',
  devtools: { enabled: false },
  modules: [modulePath],
  yandexMetrika: {
    id: 33333333,
    enabled: false,
    options: { webvisor: false }
  },
  runtimeConfig: {
    public: {
      yandexMetrika: {
        id: '12345678',
        options: { webvisor: true }
      }
    }
  }
})
