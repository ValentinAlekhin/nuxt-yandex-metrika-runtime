import type { MetrikaDriver } from './types'

export const METRIKA_SCRIPT_URL = 'https://mc.yandex.ru/metrika/tag.js'

interface YmFunction {
  (id: string, method: string, ...args: unknown[]): void
  a?: unknown[][]
  l?: number
}

type MetrikaWindow = Window & {
  ym?: YmFunction
  Ya?: { Metrika2?: unknown }
}

const scripts = new WeakMap<Document, Promise<void>>()

export function createBrowserDriver(
  win: Window = window,
  doc: Document = win.document
): MetrikaDriver {
  const browser = win as MetrikaWindow

  function call(id: string, method: string, ...args: unknown[]) {
    if (typeof browser.ym !== 'function') throw new Error('Yandex Metrika: SDK is unavailable')
    browser.ym(id, method, ...args)
  }

  return {
    load(timeout) {
      const existing = scripts.get(doc)
      // shortcut: an in-flight SDK load keeps its first timeout, add per-call deadlines if needed.
      if (existing) return existing
      if (typeof browser.ym === 'function' && typeof browser.Ya?.Metrika2 === 'function') {
        return Promise.resolve()
      }
      if (typeof browser.ym !== 'function') {
        const queue: YmFunction = (id, method, ...args) => {
          queue.a ??= []
          queue.a.push([id, method, ...args])
        }
        queue.l = Date.now()
        browser.ym = queue
      }
      const existingScript = Array.from(doc.scripts).find(
        (script) => script.src === METRIKA_SCRIPT_URL
      )
      const script = existingScript ?? doc.createElement('script')
      let connect = () => {}
      const promise = new Promise<void>((resolve, reject) => {
        const timer = win.setTimeout(
          () => fail(new Error('Yandex Metrika: SDK load timed out')),
          timeout
        )
        function cleanup() {
          win.clearTimeout(timer)
          script.removeEventListener('load', loaded)
          script.removeEventListener('error', failed)
        }
        function loaded() {
          cleanup()
          resolve()
        }
        function fail(error: Error) {
          cleanup()
          scripts.delete(doc)
          if (!existingScript) script.remove()
          reject(error)
        }
        function failed() {
          fail(new Error('Yandex Metrika: failed to load SDK'))
        }
        script.addEventListener('load', loaded, { once: true })
        script.addEventListener('error', failed, { once: true })
        if (!existingScript) {
          script.src = METRIKA_SCRIPT_URL
          script.async = true
          script.dataset.nuxtYandexMetrika = ''
          connect = () => {
            try {
              doc.head.append(script)
            } catch (cause) {
              fail(cause instanceof Error ? cause : new Error(String(cause)))
            }
          }
        }
      })
      scripts.set(doc, promise)
      connect()
      return promise
    },
    init(id, options, signal, timeout) {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Yandex Metrika: initialization cancelled', 'AbortError'))
          return
        }
        const event = `yacounter${id}inited`
        const timer = win.setTimeout(
          () => finish(new Error('Yandex Metrika: counter initialization timed out')),
          timeout
        )
        function finish(error?: unknown) {
          win.clearTimeout(timer)
          doc.removeEventListener(event, ready)
          signal.removeEventListener('abort', aborted)
          if (error) reject(error)
          else resolve()
        }
        function ready() {
          finish()
        }
        function aborted() {
          finish(new DOMException('Yandex Metrika: initialization cancelled', 'AbortError'))
        }
        doc.addEventListener(event, ready, { once: true })
        signal.addEventListener('abort', aborted, { once: true })
        try {
          call(id, 'init', options)
        } catch (error) {
          finish(error)
        }
      })
    },
    destruct: (id) => call(id, 'destruct'),
    call
  }
}
