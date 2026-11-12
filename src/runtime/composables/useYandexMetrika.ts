import { useNuxtApp } from '#app'
import type { YandexMetrika } from '../types'

export function useYandexMetrika(): YandexMetrika {
  return useNuxtApp().$yandexMetrika
}

declare module '#app' {
  interface NuxtApp {
    $yandexMetrika: YandexMetrika
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $yandexMetrika: YandexMetrika
  }
}
