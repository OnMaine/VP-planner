<template>
  <div id="app-layout">
    <header class="app-header">
      <div class="brand">VP Planner</div>
      <nav>
        <RouterLink to="/">Головна</RouterLink>
        <RouterLink to="/settings">
          Налаштування
          <span v-if="!hasWorld" class="badge badge-warn" title="Налаштування не збережені">●</span>
        </RouterLink>
        <RouterLink to="/import">
          Імпорт
          <span v-if="!hasVillages" class="badge badge-warn" title="Немає сел">●</span>
        </RouterLink>
        <RouterLink to="/planner">Планер</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useWorldStore } from '@/stores/worldStore'
import { useVillagesStore } from '@/stores/villagesStore'

const worldStore = useWorldStore()
const villagesStore = useVillagesStore()

const hasWorld = computed(() => Boolean(worldStore.settings.worldCode))
const hasVillages = computed(() => villagesStore.villages.length > 0)
</script>

<style scoped>
#app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: #1a1a2e;
  padding: 0 1.5rem;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 2rem;
  border-bottom: 2px solid #e94560;
  flex-shrink: 0;
}

.brand {
  font-size: 1.1rem;
  font-weight: 700;
  color: #e94560;
  white-space: nowrap;
}

.app-header nav {
  display: flex;
  gap: 1.5rem;
}

.app-header nav a {
  color: #c8c8d4;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.app-header nav a.router-link-active {
  color: #e94560;
}

.badge {
  font-size: 0.65rem;
  line-height: 1;
}

.badge-warn {
  color: #f5a623;
}

.app-main {
  padding: 1.5rem;
  flex: 1;
  background: #16213e;
  color: #e0e0e0;
}
</style>
