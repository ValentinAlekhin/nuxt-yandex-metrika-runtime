import type { DeepReadonly, Ref } from 'vue'

export type MetrikaStatus = 'idle' | 'loading' | 'running' | 'stopped' | 'error'
export type MetrikaParams = Record<string, unknown>

export interface MetrikaInitOptions {
  accurateTrackBounce?: boolean | number
  childIframe?: boolean
  clickmap?: boolean
  disableYtm?: boolean
  ecommerce?: boolean | string
  params?: MetrikaParams
  sendTitle?: boolean
  trackHash?: boolean
  trackLinks?: boolean
  trustedDomains?: string[]
  type?: 0 | 1
  userParams?: MetrikaParams
  webvisor?: boolean
}

export interface YandexMetrikaOptions {
  id?: string | number
  enabled?: boolean
  debug?: boolean
  delay?: number
  trackPageviews?: boolean
  loadTimeout?: number
  options?: MetrikaInitOptions
}

export interface MetrikaConfig {
  id: string
  enabled: boolean
  debug: boolean
  delay: number
  trackPageviews: boolean
  loadTimeout: number
  options: MetrikaInitOptions
}

export interface MetrikaHitOptions {
  title?: string
  referer?: string
  params?: MetrikaParams
  callback?: () => void
  ctx?: unknown
}

export interface MetrikaDriver {
  load(timeout: number): Promise<void>
  init(
    id: string,
    options: MetrikaInitOptions & { defer: true; triggerEvent: true },
    signal: AbortSignal,
    timeout: number
  ): Promise<void>
  destruct(id: string): void
  call(id: string, method: string, ...args: unknown[]): void
}

export interface YandexMetrika {
  readonly config: DeepReadonly<Ref<MetrikaConfig>>
  readonly status: Readonly<Ref<MetrikaStatus>>
  readonly error: Readonly<Ref<Error | null>>
  configure(patch: YandexMetrikaOptions): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  hit(url: string, options?: MetrikaHitOptions): void
  reachGoal(target: string, params?: MetrikaParams, callback?: () => void, ctx?: unknown): void
  params(params: MetrikaParams): void
  userParams(params: MetrikaParams): void
  setUserID(id: string): void
  getClientID(callback: (id: string) => void): void
  dispose(): void
}
