import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt',
    'nuxt-llms'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  alias: {
    '@game': fileURLToPath(new URL('./game', import.meta.url))
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    preset: 'cloudflare-pages'
  },

  hub: {
    db: 'sqlite'
  },

  vite: {
    optimizeDeps: {
      include: ['pixi.js', 'honeycomb-grid', 'maplibre-gl']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  llms: {
    domain: 'https://karriers.app',
    title: 'Karriers',
    description: 'A Nuxt 3 / PixiJS remake of the 1984 wargame "Carriers at War". '
      + 'A single-page application featuring a pure-TypeScript game engine, hex-grid map rendering, '
      + 'IJN AI, air operations, and surface combat — playable in the browser.',
    notes: [
      'This is a client-side SPA (ssr: false). All game logic runs in the browser.',
      'The game engine lives under /game and is framework-agnostic TypeScript.',
      'UI is built with Nuxt 3 + Nuxt UI + Pinia. Map and unit sprites use PixiJS.'
    ],
    sections: [
      {
        title: 'Game Engine',
        description: 'Pure-TypeScript systems under game/engine/. No framework dependencies.',
        links: [
          { title: 'GameEngine', href: 'https://karriers.app/game/engine/GameEngine.ts', description: 'Main game loop, system orchestration, turn management' },
          { title: 'AirOpsSystem', href: 'https://karriers.app/game/engine/AirOpsSystem.ts', description: 'Strike planning, CAP, scout missions, air combat resolution' },
          { title: 'JapaneseAI', href: 'https://karriers.app/game/engine/JapaneseAI.ts', description: 'IJN AI decision-making for air operations and fleet movement' },
          { title: 'CombatSystem', href: 'https://karriers.app/game/engine/CombatSystem.ts', description: 'Air and surface combat resolution' },
          { title: 'MovementSystem', href: 'https://karriers.app/game/engine/MovementSystem.ts', description: 'Hex-grid fleet movement and fuel tracking' },
          { title: 'SearchSystem', href: 'https://karriers.app/game/engine/SearchSystem.ts', description: 'Scouting and intelligence gathering' },
          { title: 'FogOfWarSystem', href: 'https://karriers.app/game/engine/FogOfWarSystem.ts', description: 'Visibility and intel management' }
        ]
      },
      {
        title: 'Game Types',
        description: 'TypeScript type definitions for all game entities.',
        links: [
          { title: 'Aircraft types', href: 'https://karriers.app/game/types/aircraft.ts', description: 'Squadron, mission, and aircraft state types' },
          { title: 'Combat types', href: 'https://karriers.app/game/types/combat.ts', description: 'Strike, engagement, and damage result types' },
          { title: 'Ship types', href: 'https://karriers.app/game/types/ships.ts', description: 'Task group, vessel, and fleet state types' },
          { title: 'Scenario types', href: 'https://karriers.app/game/types/scenario.ts', description: 'Scenario definition and setup types' }
        ]
      },
      {
        title: 'Scenarios',
        description: 'Historical Pacific War scenarios included with the game.',
        links: [
          { title: 'Coral Sea', href: 'https://karriers.app/game/data/scenarios/coralSea.ts', description: 'Battle of the Coral Sea, May 1942' },
          { title: 'Midway', href: 'https://karriers.app/game/data/scenarios/midway.ts', description: 'Battle of Midway, June 1942' }
        ]
      },
      {
        title: 'UI Components',
        description: 'Vue 3 components under app/components/.',
        links: [
          { title: 'GameHUD', href: 'https://karriers.app/app/components/game/GameHUD.vue', description: 'In-game heads-up display and panel layout' },
          { title: 'AirOpModal', href: 'https://karriers.app/app/components/menus/AirOpModal.vue', description: 'Air operations planning modal' },
          { title: 'GameCanvas', href: 'https://karriers.app/app/components/game/GameCanvas.vue', description: 'PixiJS canvas mount and renderer integration' }
        ]
      }
    ],
    full: {
      title: 'Karriers — Full Documentation',
      description: 'Complete reference for the Karriers game engine, scenarios, and UI layer.'
    }
  }
})
