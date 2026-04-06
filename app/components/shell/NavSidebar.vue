<template>
  <nav
    data-testid="shell-nav-sidebar"
    :class="[
      'flex flex-col shrink-0 bg-slate-900 border-r border-slate-700 overflow-hidden transition-all duration-200',
      expanded ? 'w-44' : 'w-13'
    ]"
  >
    <!-- Main nav items -->
    <div class="flex flex-col gap-0.5 p-2 pt-3 flex-1">
      <button
        v-for="item in mainItems"
        :key="item.id"
        :class="[
          'flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-xs transition-colors text-left',
          item.active
            ? 'bg-sky-900/50 text-sky-300'
            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200 cursor-default'
        ]"
        :title="!expanded ? item.label : undefined"
      >
        <UIcon :name="item.icon" class="shrink-0 w-4 h-4" />
        <span v-if="expanded" class="truncate tracking-wide">{{ item.label }}</span>
      </button>
    </div>

    <!-- Settings pinned to bottom -->
    <div class="p-2 pb-3">
      <button
        class="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-default"
        :title="!expanded ? 'Settings' : undefined"
      >
        <UIcon name="i-heroicons-cog-6-tooth" class="shrink-0 w-4 h-4" />
        <span v-if="expanded" class="truncate tracking-wide">Settings</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ expanded: boolean }>()

const mainItems = [
  { id: 'map',      icon: 'i-heroicons-squares-2x2',    label: 'Tactical Map', active: true  },
  { id: 'units',    icon: 'i-heroicons-users',           label: 'Units',        active: false },
  { id: 'missions', icon: 'i-heroicons-paper-airplane',  label: 'Missions',     active: false },
  { id: 'intel',    icon: 'i-heroicons-eye',             label: 'Intel',        active: false },
]
</script>
