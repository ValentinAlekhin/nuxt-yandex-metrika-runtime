<script setup lang="ts">
const metrika = useYandexMetrika()
useHead({ title: 'Other page' })
</script>

<template>
  <main>
    <h1>Other page</h1>
    <p data-testid="counter-status">{{ metrika.status.value }}</p>
    <NuxtLink data-testid="home" to="/">Home</NuxtLink>
  </main>
</template>
