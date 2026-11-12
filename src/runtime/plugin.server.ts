import { defineNuxtPlugin } from '#app'
import { createMetrikaController } from './controller'
import { useMetrikaConfig } from './state'

export default defineNuxtPlugin({
  name: 'yandex-metrika',
  setup() {
    return {
      provide: {
        yandexMetrika: createMetrikaController(useMetrikaConfig())
      }
    }
  }
})
