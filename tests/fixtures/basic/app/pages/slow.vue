<script setup lang="ts">
if (import.meta.client) {
  await new Promise<void>((resolve) => setTimeout(resolve, 1300))
}
useHead({ title: 'Slow page' })
</script>

<template>
  <main><h1>Slow page</h1></main>
</template>
