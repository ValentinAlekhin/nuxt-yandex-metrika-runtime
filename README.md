# nuxt-yandex-metrika-runtime

Модуль Nuxt 4 для Яндекс Метрики с SSR, типизированным `useYandexMetrika()` и управлением
счётчиком без перезагрузки страницы. Позволяет менять ID и настройки, запускать и останавливать
счётчик во время работы приложения.

## Установка

Требуются Nuxt 4, Vue 3.5+ и Node.js 24.22.1 или новее.

```sh
npm install nuxt-yandex-metrika-runtime
```

Зарегистрируйте модуль в `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-yandex-metrika-runtime'],
  yandexMetrika: {
    id: 12345678,
    enabled: true
  }
})
```

При заполненном ID и `enabled: true` счётчик автоматически запускается после монтирования
приложения в браузере. При `enabled: false` SDK не загружается до явного запуска через API.

## Конфигурация

| Поле             | По умолчанию | Назначение                                                                                      |
| ---------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `id`             | `''`         | Положительный целочисленный ID, строка или число; пустая строка оставляет счётчик ненастроенным |
| `enabled`        | `false`      | Включить счётчик                                                                                |
| `debug`          | `false`      | Выводить диагностику жизненного цикла и названия вызываемых методов                             |
| `delay`          | `0`          | Задержка перед новым запуском, мс; остановка отменяет ожидание                                  |
| `trackPageviews` | `true`       | Отправлять начальный просмотр и просмотры при переходах Nuxt                                    |
| `loadTimeout`    | `10000`      | Таймаут загрузки SDK и ожидания готовности счётчика, мс                                         |
| `options`        | См. ниже     | Параметры инициализации Метрики                                                                 |

Значения `options` по умолчанию:

```ts
options: {
  accurateTrackBounce: true,
  clickmap: true,
  trackLinks: true,
  webvisor: false
}
```

Допустимые параметры `options` описаны типом `MetrikaInitOptions`. `defer` и `triggerEvent`
управляются модулем и не принимаются в настройках.

Настройки переносятся в `runtimeConfig.public.yandexMetrika`. Явные значения этого runtime
config имеют приоритет над `yandexMetrika` в Nuxt config. Поддерживаются стандартные
переменные окружения Nuxt:

```dotenv
NUXT_PUBLIC_YANDEX_METRIKA_ID=12345678
NUXT_PUBLIC_YANDEX_METRIKA_ENABLED=true
NUXT_PUBLIC_YANDEX_METRIKA_DEBUG=false
NUXT_PUBLIC_YANDEX_METRIKA_DELAY=0
NUXT_PUBLIC_YANDEX_METRIKA_OPTIONS_WEBVISOR=false
```

`debug: true` не отключает отправку данных: Метрика продолжает получать события.
Параметры событий и пользовательские данные в диагностические сообщения не включаются.
Изменение `debug`, `delay` и `loadTimeout` не переинициализирует уже работающий счётчик.

## Управление счётчиком

`useYandexMetrika()` автоматически импортируется в компонентах, composables и Nuxt-плагинах.
Все вызовы в одном Nuxt-приложении получают общий контроллер:

```ts
const metrika = useYandexMetrika()

await metrika.configure({ id: 12345678 })
await metrika.start()

metrika.reachGoal('contact_submit', { source: 'contacts' })
metrika.params({ section: 'portfolio' })

await metrika.configure({
  id: 87654321,
  options: { webvisor: true }
})

await metrika.stop()
```

`configure(patch)` объединяет настройки с текущими, включая отдельные поля `options`.
Если `enabled` не передан, его значение сохраняется. Некорректные параметры отклоняются
до применения. Изменение ID или параметров инициализации работающего счётчика вызывает
`destruct` старого и `init` нового. Повторные команды безопасны; при быстрых переключениях
побеждает последняя конфигурация.

`start()` устанавливает `enabled: true` и ожидает готовность счётчика. Без ID запуск
отклоняется. `stop()` устанавливает `enabled: false`, отменяет отложенный запуск и вызывает
`destruct`, если инициализация уже началась. Для повторного запуска вызовите `start()`.

| Метод                                         | Назначение                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `hit(url, options?)`                          | Отправить просмотр; `options` принимает `title`, `referer`, `params`, `callback`, `ctx` |
| `reachGoal(target, params?, callback?, ctx?)` | Отправить достижение цели                                                               |
| `params(params)`                              | Передать параметры визита                                                               |
| `userParams(params)`                          | Передать параметры посетителя                                                           |
| `setUserID(id)`                               | Установить идентификатор пользователя                                                   |
| `getClientID(callback)`                       | Получить идентификатор посетителя в callback                                            |

События отправляются только при `status.value === 'running'`. События до готовности
и после остановки отбрасываются. Перед отправкой цели сразу после запуска дождитесь
`await metrika.start()`.

`config`, `status` и `error` — Vue refs только для чтения. Возможные состояния:
`idle`, `loading`, `running`, `stopped`, `error`. Сбои загрузки и инициализации отражаются
в `error.value`; явные вызовы возвращают отклонённый Promise:

```ts
try {
  await metrika.start()
} catch (error) {
  console.error('Failed to start Yandex Metrika', error)
}
```

Ошибка автоматического запуска не прерывает работу приложения. После устранения причины
можно вызвать `start()` повторно.

## Настройки из API приложения

Модуль принимает настройки через JavaScript API и не зависит от конкретного сервера или CMS:

```ts
import type { YandexMetrikaOptions } from 'nuxt-yandex-metrika-runtime'

const metrika = useYandexMetrika()
const settings = await $fetch<YandexMetrikaOptions>('/api/analytics-config')
await metrika.configure(settings)
```

Пример ответа: `{ "id": 12345678, "enabled": true, "options": { "webvisor": false } }`.
Адрес endpoint, хранение настроек и авторизация принадлежат приложению. Изменения применяются
при получении ответа; для обновления открытых вкладок приложение использует повторные
запросы, polling или SSE.

## SSR и просмотры страниц

На сервере composable доступен, конфигурация изолирована между запросами и передаётся
через Nuxt payload. `configure()` и `start()` могут изменить желаемую конфигурацию для
гидратации; SDK и события на сервере не запускаются.

SDK загружается один раз на документ с `https://mc.yandex.ru/metrika/tag.js`.
Модуль использует `defer: true` и `triggerEvent: true`, отдельно отправляет начальный `hit`
и по одному просмотру на завершённый переход с актуальными `title` и `referer` после рендера.
Неудачные, повторные и hash-only переходы исключаются. Страницы с асинхронной загрузкой
ожидаются до `page:finish`.

`trackPageviews: false` отключает автоматические просмотры модуля и оставляет `hit()`
под контролем приложения. При необходимости отслеживание hash самим SDK включается через
`options.trackHash: true`.

## Ограничения

- `stop()` не отзывает уже отправленные данные, запросы в полёте и cookies. Загруженный SDK
  и глобальный `window.ym` сохраняются; следующий запуск использует тот же SDK.
- Уже начатая общая загрузка SDK сохраняет таймаут первого запуска. Новый `loadTimeout`
  применяется к следующей загрузке и следующему ожиданию готовности счётчика.
- Управляемый ID должен принадлежать модулю. Одновременная инициализация того же ID другой
  интеграцией не поддерживается.
- Автоматические тесты используют подмену SDK. Поведение настоящего SDK, включая повторную
  инициализацию и остановку Вебвизора, требует отдельной проверки на тестовом счётчике.

## Разработка и релизы

Установка окружения, команды проверок и правила Conventional Commits описаны
в [CONTRIBUTING.md](https://github.com/ValentinAlekhin/nuxt-yandex-metrika-runtime/blob/main/CONTRIBUTING.md). Тесты охватывают контроллер и загрузчик SDK,
Nuxt runtime, production SSR, гидратацию и переходы в Chromium. Реальная аналитика
в тестах не отправляется.

Версии следуют SemVer. Отправка тега `vX.Y.Z` запускает проверки, публикацию в npm
и создание GitHub Release. Настройка первой публикации описана в руководстве для участников.

Лицензия — [MIT](LICENSE).
