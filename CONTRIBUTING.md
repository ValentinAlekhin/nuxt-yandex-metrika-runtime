# Разработка и выпуск версий

Документация, описания коммитов и релизов пишутся на русском. Исходный код, комментарии,
тесты и технические сообщения — на английском, включая стандартные ошибки Zod.

## Окружение и проверки

Используйте Node.js из `.nvmrc` и npm с `package-lock.json`:

```sh
nvm use
npm ci
npm run hooks:install
npm run dev:prepare
npm run test:install-browser
npm test
npm run typecheck
npm run lint
npm run format:check
```

`npm test` собирает пакет и запускает unit, Nuxt runtime и браузерные e2e-тесты.
E2E используют production-сборку из `dist/` и подменяют SDK: данные в Метрику не отправляются.
Отдельные проекты доступны через `test:unit`, `test:nuxt`, `test:e2e`.
В GitHub Actions выполняются те же проверки на Node.js из `.nvmrc` и Ubuntu с Chromium.

Настройки модуля валидируются Zod. При изменении схем сохраняйте отклонение ошибочной
конфигурации до её применения, объединение отдельных полей `options` и изоляцию SSR-запросов.

## Коммиты

Используется [Conventional Commits](https://www.conventionalcommits.org/ru/v1.0.0/):

```text
feat(runtime): добавить смену счётчика без перезагрузки
fix(ssr): изолировать настройки между запросами
docs: уточнить пример подключения
chore(release): выпустить версию 0.1.1
```

Допустимые типы: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`. Область в скобках необязательна, заголовок — до 100 символов.
Несовместимые изменения обозначаются `!` и поясняются в `BREAKING CHANGE:`.
Описание и пояснения пишите на русском.

Формат проверяет `commitlint`: локально через `.githooks/commit-msg` после `hooks:install`,
в CI — для коммитов pull request. Стандартные сообщения слияния пропускаются.
При squash-слиянии итоговый заголовок также должен соответствовать соглашению.

## Подход к релизам

Используются [SemVer](https://semver.org/lang/ru/) и релизы по тегам.
Номер версии выбирает сопровождающий: `patch` для исправлений, `minor` для новых возможностей,
`major` для несовместимых изменений. До `1.0.0` API находится в начальной разработке.

Отправка тега `vX.Y.Z` запускает `release.yml`: проверку версии, полный CI,
публикацию проверенного архива в npm и создание GitHub Release через `release-it`.
Версии в теге, `package.json` и `package-lock.json` должны совпадать.
Для предварительных версий используйте, например, `v0.2.0-beta.1`; они публикуются в npm с тегом
`next` и отмечаются как предварительные в GitHub.

В штатном выпуске достаточно:

```sh
git switch main
git pull --ff-only
npm version patch -m "chore(release): выпустить версию %s"
git push origin main --follow-tags
```

Для `minor` или `major` замените аргумент `patch`. Для предварительной версии:

```sh
npm version prerelease --preid=beta -m "chore(release): выпустить версию %s"
git push origin main --follow-tags
```

Коммит повышения версии должен содержать только изменение номера: `release-it` формирует
описание из предшествующих коммитов. Выпущенные теги не передвигайте; исправление выпускайте
под новой версией.

## Первая публикация

Новое имя пакета сначала нужно опубликовать из аккаунта владельца npm. После этого можно
настроить доверенного издателя для автоматических публикаций через OIDC.
Постоянный секрет `NPM_TOKEN` для workflow не нужен.

Создайте публичный репозиторий `ValentinAlekhin/nuxt-yandex-metrika-runtime`, отправьте `main`
и дождитесь успешного CI. Локальный `origin` должен указывать на этот репозиторий.
Для отправки workflow через HTTPS токен GitHub CLI должен иметь разрешение `workflow`:
при необходимости выполните `gh auth refresh --hostname github.com --scopes workflow`.

Начните с чистого рабочего дерева и опубликуйте предварительную версию, сохранив `0.1.0`
для первого автоматического выпуска:

```sh
npm login
npm version 0.1.0-beta.0 --no-git-tag-version
npm pack
npm publish nuxt-yandex-metrika-runtime-0.1.0-beta.0.tgz --tag next --access public --ignore-scripts
git restore package.json package-lock.json
```

В настройках пакета на npmjs.com добавьте **Trusted Publisher → GitHub Actions**:

| Поле                 | Значение                      |
| -------------------- | ----------------------------- |
| Organization or user | `ValentinAlekhin`             |
| Repository           | `nuxt-yandex-metrika-runtime` |
| Workflow filename    | `release.yml`                 |
| Environment name     | Оставить пустым               |
| Allowed actions      | Разрешить `npm publish`       |

Затем создайте первый тег на подготовленном коммите `main`:

```sh
git tag -a v0.1.0 -m "Версия 0.1.0"
git push origin v0.1.0
```

Новая настройка доверенного издателя должна выполнить первую успешную публикацию в течение
двух дней; иначе её потребуется создать заново. Публичный GitHub-репозиторий необходим для
provenance — подтверждения происхождения сборки. Подробнее: [документация npm](https://docs.npmjs.com/trusted-publishers/).

## Восстановление после сбоя

Если проверки или публикация не завершились, исправьте причину и повторите неудавшиеся задания
в GitHub Actions. Если npm уже принял версию, а создание GitHub Release завершилось ошибкой,
повторите релиз без npm-публикации:

```sh
gh workflow run release.yml --ref v0.1.0 -f publish_npm=false
```

Подставьте нужный тег. Повторная публикация той же версии в npm запрещена самим реестром.

## Лицензия

Пакет распространяется по [MIT](LICENSE).
