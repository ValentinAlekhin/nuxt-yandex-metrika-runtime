export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'header-max-length': [2, 'always', 100]
  },
  helpUrl:
    'https://github.com/ValentinAlekhin/nuxt-yandex-metrika-runtime/blob/main/CONTRIBUTING.md'
}
