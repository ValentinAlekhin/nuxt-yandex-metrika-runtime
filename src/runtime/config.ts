import { z } from 'zod'
import type { MetrikaConfig, YandexMetrikaOptions } from './types'

export const DEFAULT_CONFIG: MetrikaConfig = {
  id: '',
  enabled: false,
  debug: false,
  delay: 0,
  trackPageviews: true,
  loadTimeout: 10000,
  options: {
    accurateTrackBounce: true,
    clickmap: true,
    trackLinks: true,
    webvisor: false
  }
}

const plainObjectSchema = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype,
  { error: 'must be a plain object' }
)

// Configuration is transferred through the Nuxt payload, so it must contain JSON values.
const jsonValueSchema: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    jsonObjectSchema
  ])
)
// Parsing entries preserves the JSON key __proto__, which z.record skips.
const jsonObjectSchema = plainObjectSchema
  .transform(Object.entries)
  .pipe(z.array(z.tuple([z.string(), jsonValueSchema])))
  .transform(Object.fromEntries)
const paramsSchema = jsonObjectSchema.transform(
  (value) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>
)

const idError = 'must be a positive integer or an empty string'
const idSchema = z
  .union(
    [
      z.literal(''),
      z.int({ error: idError }).positive({ error: idError }),
      z
        .string()
        .regex(/^[1-9]\d*$/, { error: idError })
        .refine((value) => Number.isSafeInteger(Number(value)) && String(Number(value)) === value, {
          error: idError
        })
    ],
    { error: idError }
  )
  .transform(String)

const optionsSchema = z.strictObject({
  accurateTrackBounce: z.union([z.boolean(), z.int().nonnegative()]).exactOptional(),
  childIframe: z.boolean().exactOptional(),
  clickmap: z.boolean().exactOptional(),
  disableYtm: z.boolean().exactOptional(),
  ecommerce: z.union([z.boolean(), z.string().min(1)]).exactOptional(),
  params: paramsSchema.exactOptional(),
  sendTitle: z.boolean().exactOptional(),
  trackHash: z.boolean().exactOptional(),
  trackLinks: z.boolean().exactOptional(),
  trustedDomains: z.array(z.string().min(1)).exactOptional(),
  type: z.literal([0, 1]).exactOptional(),
  userParams: paramsSchema.exactOptional(),
  webvisor: z.boolean().exactOptional()
})

const configSchema = z.strictObject({
  id: idSchema,
  enabled: z.boolean(),
  debug: z.boolean(),
  delay: z.int().nonnegative(),
  trackPageviews: z.boolean(),
  loadTimeout: z.int().positive(),
  options: optionsSchema
})

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0]!
      const field = issue.path.join('.') || 'configuration'
      throw new TypeError(`Yandex Metrika: ${field}: ${issue.message}`)
    }
    throw new TypeError(
      'Yandex Metrika: params must contain only JSON values without circular references'
    )
  }
}

export function resolveMetrikaConfig(
  patch: YandexMetrikaOptions = {},
  base: MetrikaConfig = DEFAULT_CONFIG
): MetrikaConfig {
  const values = parse(plainObjectSchema, patch)
  const options =
    'options' in values ? parse(plainObjectSchema.pipe(optionsSchema), values.options) : {}
  return parse(configSchema, {
    ...base,
    ...values,
    options: { ...base.options, ...options }
  })
}
