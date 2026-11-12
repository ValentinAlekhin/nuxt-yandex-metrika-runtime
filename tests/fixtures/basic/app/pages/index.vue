<script setup lang="ts">
const metrika = useYandexMetrika()
const route = useRoute()

if (import.meta.server && (route.query.id || route.query.enabled)) {
  await metrika.configure({
    ...(route.query.id ? { id: String(route.query.id) } : {}),
    ...(route.query.enabled ? { enabled: route.query.enabled === 'true' } : {})
  })
}

useHead({ title: 'Metrika fixture' })
</script>

<template>
  <main>
    <h1>Metrika fixture</h1>
    <p data-testid="counter-id">{{ metrika.config.value.id }}</p>
    <p data-testid="counter-status">{{ metrika.status.value }}</p>
    <button data-testid="start" @click="metrika.start()">Start</button>
    <button data-testid="stop" @click="metrika.stop()">Stop</button>
    <button data-testid="switch" @click="metrika.configure({ id: 87654321 })">Switch</button>
    <button data-testid="goal" @click="metrika.reachGoal('contact_submit')">Goal</button>
    <NuxtLink data-testid="other" to="/other">Other</NuxtLink>
    <NuxtLink data-testid="slow" to="/slow">Slow</NuxtLink>
  </main>
</template>
