<template>
  <div id="app-layout">
    <header class="app-header">
      <RouterLink to="/" class="brand">VP Planner</RouterLink>
      <nav>
        <span class="nav-group-label plan">План</span>

        <RouterLink to="/settings">
          Настройки
          <span v-if="!hasWorld" class="badge badge-warn" title="Настройки не сохранены">●</span>
        </RouterLink>
        <RouterLink to="/import">
          Импорт
          <span v-if="!hasVillages" class="badge badge-warn" title="Нет деревень">●</span>
        </RouterLink>
        <RouterLink to="/presets">Пресеты войск</RouterLink>
        <RouterLink to="/mass-configs">Пресеты масса</RouterLink>
        <RouterLink to="/planner">Планер</RouterLink>
        <RouterLink to="/attack-map">Карта атак</RouterLink>

        <span class="nav-spacer" />

        <span class="nav-group-label analysis">Анализ</span>

        <RouterLink to="/world-map">Карта мира</RouterLink>
        <RouterLink to="/def-map">Карта дефа</RouterLink>
        <RouterLink to="/def-analytics">Аналитика</RouterLink>
        <RouterLink to="/attack-scout">Засветы</RouterLink>
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

<style lang="scss" scoped>
#app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: $bg-panel;
  padding: 0 1.5rem;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 2rem;
  border-bottom: 2px solid $accent;
  flex-shrink: 0;

  nav {
    display: flex;
    align-items: center;
    gap: 1.15rem;
    flex: 1;

    .nav-spacer { flex: 1 1 auto; }

    a {
      color: $text-md;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      transition: color 0.2s;
      display: flex;
      align-items: center;
      gap: 0.3rem;

      &.router-link-active { color: $accent; }
    }

    .nav-group-label {
      flex-shrink: 0;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.12rem 0.5rem;
      border-radius: 10px;
      margin: 0 0.25rem;
      border: 1px solid transparent;

      &.plan     { color: $accent; background: a($accent, 0.12); border-color: a($accent, 0.3); }
      &.analysis { color: #4ecca3; background: a(#4ecca3, 0.12); border-color: a(#4ecca3, 0.3); }
    }
  }
}


.brand {
  font-size: 1.1rem;
  font-weight: 700;
  color: $accent;
  white-space: nowrap;
  text-decoration: none;
  &:hover { filter: brightness(1.15); }
}

.badge {
  font-size: 0.65rem;
  line-height: 1;

  &-warn { color: $orange; }
}

.app-main {
  padding: 1.5rem;
  flex: 1;
  background: $bg-page;
  color: $text;
}
</style>
