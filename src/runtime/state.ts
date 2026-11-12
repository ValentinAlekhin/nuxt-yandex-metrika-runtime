import { useRuntimeConfig, useState } from '#app'
import { resolveMetrikaConfig } from './config'
import type { MetrikaConfig, YandexMetrikaOptions } from './types'

export function useMetrikaConfig() {
  const defaults = useRuntimeConfig().public.yandexMetrika as YandexMetrikaOptions
  return useState<MetrikaConfig>('yandex-metrika:config', () => resolveMetrikaConfig(defaults))
}
