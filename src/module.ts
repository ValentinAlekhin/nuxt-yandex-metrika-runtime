import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'
import { DEFAULT_CONFIG, resolveMetrikaConfig } from './runtime/config'
import type { MetrikaConfig, YandexMetrikaOptions } from './runtime/types'

export interface ModuleOptions extends YandexMetrikaOptions {}

export interface ModulePublicRuntimeConfig {
  yandexMetrika: MetrikaConfig
}

export type {
  MetrikaConfig,
  MetrikaHitOptions,
  MetrikaInitOptions,
  MetrikaParams,
  MetrikaStatus,
  YandexMetrika,
  YandexMetrikaOptions
} from './runtime/types'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-yandex-metrika-runtime',
    configKey: 'yandexMetrika',
    compatibility: { nuxt: '^4.0.0' }
  },
  defaults: DEFAULT_CONFIG,
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    Object.assign(nuxt.options.runtimeConfig.public, {
      yandexMetrika: resolveMetrikaConfig(
        defu(
          nuxt.options.runtimeConfig.public.yandexMetrika as YandexMetrikaOptions | undefined,
          options
        )
      )
    })

    addPlugin(resolver.resolve('./runtime/plugin.client'))
    addPlugin(resolver.resolve('./runtime/plugin.server'))
    addImports({
      name: 'useYandexMetrika',
      from: resolver.resolve('./runtime/composables/useYandexMetrika')
    })
  }
})
