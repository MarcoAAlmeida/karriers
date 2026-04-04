<template>
  <UModal v-model:open="open" title="Issue Order" :ui="{ width: 'sm:max-w-sm' }">
    <template #content>
      <div class="p-4 space-y-4">

        <div v-if="tg" class="text-sm text-gray-400">
          Task force: <span class="text-white font-medium">{{ tg.name }}</span>
        </div>

        <!-- Order grid -->
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="order in ORDERS"
            :key="order.value"
            :label="order.label"
            :icon="order.icon"
            size="sm"
            :color="tg?.currentOrder === order.value ? 'primary' : 'neutral'"
            :variant="tg?.currentOrder === order.value ? 'solid' : 'outline'"
            class="justify-start"
            @click="issueOrder(order.value)"
          />
        </div>

        <!-- Speed selector -->
        <div class="border-t border-gray-800 pt-4 space-y-2">
          <p class="text-xs text-gray-500 uppercase tracking-wider">Speed</p>
          <div class="flex gap-2">
            <UButton
              v-for="spd in SPEEDS"
              :key="spd"
              :label="`${spd} kt`"
              size="xs"
              :color="tg?.speed === spd ? 'primary' : 'neutral'"
              :variant="tg?.speed === spd ? 'solid' : 'ghost'"
              @click="issueSetSpeed(spd)"
            />
          </div>
        </div>

      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { TaskGroupOrder } from '@game/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ taskGroupId: string | null }>()

const gameStore = useGameStore()
const forcesStore = useForcesStore()

const tg = computed(() => props.taskGroupId ? forcesStore.taskGroups.get(props.taskGroupId) ?? null : null)

const ORDERS: { value: TaskGroupOrder; label: string; icon: string }[] = [
  { value: 'standby',   label: 'Standby',   icon: 'i-heroicons-pause-circle' },
  { value: 'patrol',    label: 'Patrol',    icon: 'i-heroicons-arrow-path' },
  { value: 'search',    label: 'Search',    icon: 'i-heroicons-magnifying-glass' },
  { value: 'strike',    label: 'Strike',    icon: 'i-heroicons-bolt' },
  { value: 'intercept', label: 'Intercept', icon: 'i-heroicons-arrow-trending-up' },
  { value: 'escort',    label: 'Escort',    icon: 'i-heroicons-shield-check' },
  { value: 'refuel',    label: 'Refuel',    icon: 'i-heroicons-beaker' },
  { value: 'retire',    label: 'Retire',    icon: 'i-heroicons-arrow-uturn-left' }
]

const SPEEDS = [15, 20, 25, 30]

function issueOrder(order: TaskGroupOrder): void {
  if (!props.taskGroupId) return
  gameStore.issueOrder({ type: 'set-order', taskGroupId: props.taskGroupId, order })
  open.value = false
}

function issueSetSpeed(speedKnots: number): void {
  if (!props.taskGroupId) return
  gameStore.issueOrder({ type: 'set-speed', taskGroupId: props.taskGroupId, speedKnots })
}
</script>
