<script setup>
// Force dark mode — this is a game, not a document; no light mode needed
const colorMode = useColorMode()
colorMode.preference = 'dark'

useHead({
  title: 'Karriers at War',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
