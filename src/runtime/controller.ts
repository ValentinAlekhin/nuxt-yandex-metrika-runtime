import { readonly, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { resolveMetrikaConfig } from './config'
import type { MetrikaConfig, MetrikaDriver, MetrikaStatus, YandexMetrika } from './types'

function waitForDelay(delay: number, signal: AbortSignal): Promise<void> {
  if (!delay || signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delay)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

export function createMetrikaController(
  config: Ref<MetrikaConfig>,
  driver?: MetrikaDriver
): YandexMetrika {
  const status = shallowRef<MetrikaStatus>(config.value.enabled ? 'idle' : 'stopped')
  const error = shallowRef<Error | null>(null)
  let generation = 0
  let counterId: string | undefined
  let abortController: AbortController | undefined
  let pending: { fingerprint: string; promise: Promise<void> } | undefined
  let activeFingerprint: string | undefined
  let disposed = false

  function assertAvailable() {
    if (disposed) throw new Error('Yandex Metrika: controller has been disposed')
  }

  function debug(action: string, id = config.value.id) {
    if (driver && config.value.debug) console.debug('[yandex-metrika]', action, id)
  }

  function cancel(): Error | undefined {
    generation++
    abortController?.abort()
    abortController = undefined
    pending = undefined
    activeFingerprint = undefined
    const previousId = counterId
    counterId = undefined
    if (previousId) {
      try {
        debug('destruct', previousId)
        driver?.destruct(previousId)
      } catch (cause) {
        counterId = previousId
        return cause instanceof Error ? cause : new Error(String(cause))
      }
    }
    return undefined
  }

  function reconcile(): Promise<void> {
    const current = config.value
    if (!current.enabled || !current.id || !driver) {
      const failure = cancel()
      status.value = current.enabled ? 'idle' : 'stopped'
      debug(status.value)
      error.value = failure ?? null
      if (failure) return Promise.reject(failure)
      return Promise.resolve()
    }
    const activeSignature = JSON.stringify([current.id, current.options])
    const fingerprint = JSON.stringify([activeSignature, current.loadTimeout, current.delay])
    if (status.value === 'running' && activeFingerprint === activeSignature)
      return Promise.resolve()
    if (pending?.fingerprint === fingerprint) return pending.promise

    const cleanupFailure = cancel()
    if (cleanupFailure) {
      error.value = cleanupFailure
      status.value = 'error'
      return Promise.reject(cleanupFailure)
    }
    const token = generation
    const abort = new AbortController()
    abortController = abort
    error.value = null
    const isCurrent = () => token === generation && !abort.signal.aborted
    const promise = Promise.resolve().then(async () => {
      if (!isCurrent()) return
      try {
        if (current.delay) {
          await waitForDelay(current.delay, abort.signal)
          if (!isCurrent()) return
        }
        debug('load', current.id)
        await driver.load(current.loadTimeout)
        if (!isCurrent()) return
        counterId = current.id
        debug('init', current.id)
        await driver.init(
          current.id,
          { ...current.options, defer: true, triggerEvent: true },
          abort.signal,
          current.loadTimeout
        )
        if (!isCurrent()) return
        activeFingerprint = activeSignature
        debug('running', current.id)
        status.value = 'running'
      } catch (cause) {
        if (!isCurrent()) return
        const failure = cause instanceof Error ? cause : new Error(String(cause))
        cancel()
        error.value = failure
        debug('error', current.id)
        status.value = 'error'
        throw failure
      } finally {
        if (isCurrent()) {
          pending = undefined
          abortController = undefined
        }
      }
    })
    pending = { fingerprint, promise }
    debug('loading', current.id)
    status.value = 'loading'
    return promise
  }

  function call(method: string, ...args: unknown[]) {
    if (status.value === 'running' && counterId) {
      debug(method, counterId)
      driver?.call(counterId, method, ...args)
    }
  }

  return {
    config: readonly(config),
    status: readonly(status),
    error: readonly(error),
    async configure(patch) {
      assertAvailable()
      const next = resolveMetrikaConfig(patch, config.value)
      config.value = next
      await reconcile()
    },
    async start() {
      assertAvailable()
      if (!config.value.id)
        throw new Error('Yandex Metrika: configure a counter id before starting')
      config.value = resolveMetrikaConfig({ enabled: true }, config.value)
      await reconcile()
    },
    async stop() {
      assertAvailable()
      config.value = resolveMetrikaConfig({ enabled: false }, config.value)
      await reconcile()
    },
    hit: (url, options) => call('hit', url, options),
    reachGoal: (target, params, callback, ctx) => call('reachGoal', target, params, callback, ctx),
    params: (params) => call('params', params),
    userParams: (params) => call('userParams', params),
    setUserID: (id) => call('setUserID', id),
    getClientID: (callback) => call('getClientID', callback),
    dispose() {
      if (disposed) return
      disposed = true
      debug('dispose')
      const failure = cancel()
      if (failure) error.value = failure
      status.value = 'stopped'
    }
  }
}
