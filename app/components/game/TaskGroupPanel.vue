<template>
  <div
    v-if="tg"
    data-testid="tg-panel"
    class="pointer-events-auto absolute left-4 top-16 w-72 rounded-lg bg-gray-950/90 backdrop-blur border border-gray-700 overflow-hidden"
  >

    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-3 pb-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-semibold text-white text-sm truncate">{{ tg.name }}</span>
        <UBadge :color="tg.side === 'allied' ? 'info' : 'error'" variant="subtle" size="sm">
          {{ tg.side === 'allied' ? 'US' : 'IJN' }}
        </UBadge>
      </div>
      <UButton icon="i-heroicons-x-mark" size="xs" color="neutral" variant="ghost" @click="mapStore.selectTaskGroup(null)" />
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 gap-1 px-3 pb-2 text-xs">
      <div class="bg-gray-900 rounded px-2 py-1">
        <p class="text-gray-500 uppercase tracking-wide text-[10px]">Order</p>
        <p class="text-gray-200 uppercase font-medium">{{ tg.currentOrder }}</p>
      </div>
      <div class="bg-gray-900 rounded px-2 py-1">
        <p class="text-gray-500 uppercase tracking-wide text-[10px]">Speed</p>
        <p class="text-gray-200">{{ tg.speed }} kt</p>
      </div>
      <div class="bg-gray-900 rounded px-2 py-1">
        <p class="text-gray-500 uppercase tracking-wide text-[10px]">Fuel</p>
        <p :class="tg.fuelState < 25 ? 'text-red-400' : tg.fuelState < 50 ? 'text-amber-400' : 'text-gray-200'">
          {{ tg.fuelState }}%
        </p>
      </div>
    </div>

    <!-- Ships table -->
    <div class="border-t border-gray-800">
      <div class="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1 text-[10px] uppercase tracking-wide text-gray-600">
        <span>Ship</span><span>Hull</span><span>Fire</span><span>Status</span>
      </div>
      <div class="max-h-44 overflow-y-auto divide-y divide-gray-800/50">
        <div
          v-for="ship in ships"
          :key="ship.id"
          class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 px-3 py-1 text-xs"
        >
          <span class="text-gray-300 truncate" :title="ship.name">{{ ship.name }}</span>
          <span :class="hullColor(hullPct(ship))" class="tabular-nums w-8 text-right">
            {{ hullPct(ship) }}%
          </span>
          <span :class="ship.fires > 0 ? 'text-orange-400' : 'text-gray-600'" class="w-4 text-center">
            {{ ship.fires > 0 ? ship.fires : '—' }}
          </span>
          <UBadge :color="shipStatusColor(ship.status)" variant="subtle" size="xs">
            {{ ship.status }}
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Action buttons (allied only) -->
    <div v-if="tg.side === 'allied'" class="flex gap-2 p-3 border-t border-gray-800">
      <UButton
        label="Order"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-heroicons-arrow-path"
        class="flex-1"
        @click="emit('openOrderModal')"
      />
      <UButton
        v-if="hasCarrier"
        data-testid="air-ops-btn"
        label="Air Ops"
        size="xs"
        color="warning"
        variant="soft"
        icon="i-heroicons-paper-airplane"
        class="flex-1"
        @click="emit('openAirOpsModal')"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import type { Ship, ShipStatus } from '@game/types'
import { SHIP_CLASSES } from '@game/data/shipClasses'

const emit = defineEmits<{
  openOrderModal: []
  openAirOpsModal: []
}>()

const mapStore = useMapStore()
const forcesStore = useForcesStore()

const shipClassMap = new Map(SHIP_CLASSES.map(sc => [sc.id, sc]))

const tg = computed(() => {
  const id = mapStore.selectedTaskGroupId
  return id ? (forcesStore.taskGroups.get(id) ?? null) : null
})

const ships = computed(() => tg.value ? forcesStore.shipsInGroup(tg.value.id) : [])

const hasCarrier = computed(() =>
  ships.value.some(s => {
    const cls = shipClassMap.get(s.classId)
    return cls?.type === 'fleet-carrier' || cls?.type === 'light-carrier' || cls?.type === 'escort-carrier'
  })
)

function hullPct(ship: Ship): number {
  const maxHP = shipClassMap.get(ship.classId)?.hullPoints ?? 100
  return Math.max(0, Math.round((1 - ship.hullDamage / maxHP) * 100))
}

function hullColor(pct: number): string {
  if (pct >= 75) return 'text-green-400'
  if (pct >= 50) return 'text-amber-400'
  if (pct >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function shipStatusColor(status: ShipStatus): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'operational': return 'success'
    case 'damaged':     return 'warning'
    case 'on-fire':     return 'error'
    case 'sinking':     return 'error'
    case 'sunk':        return 'neutral'
    default:            return 'neutral'
  }
}
</script>
