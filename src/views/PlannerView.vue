<template>
  <div class="planner-view">
    <h1>Планер атак</h1>

    <section class="panel mode-bar">
      <button :class="['mode-btn', { active: aiStore.mode === 'manual' }]" @click="aiStore.setMode('manual')">Ручной</button>
      <button :class="['mode-btn', { active: aiStore.mode === 'ai' }]" @click="aiStore.setMode('ai')">AI</button>
    </section>

    <AIPlanPanel v-if="aiStore.mode === 'ai'" @generate="onGenerate" />

    <MassActivePanel />
    <TargetsTable />
    <SpamNobleTargetsTable />
    <WatchtowerTable />
    <PalOffPanel />

    <!-- Generate -->
    <section class="panel generate-section">
      <div class="generate-main">
        <button
          class="btn btn-primary btn-generate"
          :disabled="!canGenerate"
          :title="generateBlockReason ?? ''"
          @click="onGenerate"
        >Сгенерировать план</button>

        <div v-if="!canGenerate" class="generate-blocked">
          <span class="blocked-icon">⚠</span>
          <span>{{ generateBlockReason }}</span>
          <router-link to="/settings" class="blocked-link">Настройки мира →</router-link>
        </div>
      </div>

      <div v-if="planStore.attacks.length > 0" class="generate-stat">
        Всего атак: <strong>{{ planStore.attacks.length }}</strong>
        &nbsp;·&nbsp; Активных: <strong>{{ activeAttackCount }}</strong>
      </div>
    </section>

    <AttackResultsPanel ref="resultsPanel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlanStore } from '@/stores/planStore'
import { useAIPlanStore } from '@/stores/aiPlanStore'
import { useWorldStore } from '@/stores/worldStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import MassActivePanel from '@/components/MassActivePanel.vue'
import TargetsTable from '@/components/TargetsTable.vue'
import SpamNobleTargetsTable from '@/components/SpamNobleTargetsTable.vue'
import WatchtowerTable from '@/components/WatchtowerTable.vue'
import PalOffPanel from '@/components/PalOffPanel.vue'
import AttackResultsPanel from '@/components/AttackResultsPanel.vue'
import AIPlanPanel from '@/components/AIPlanPanel.vue'

const planStore = usePlanStore()
const aiStore = useAIPlanStore()
const worldStore = useWorldStore()
const enemyStore = useEnemyDataStore()
const resultsPanel = ref<InstanceType<typeof AttackResultsPanel> | null>(null)

const activeAttackCount = computed(() => planStore.attacks.filter((a) => !a.excluded).length)

const generateBlockReason = computed<string | null>(() => {
  const missing: string[] = []
  if (!worldStore.settings.worldCode) missing.push('настройки мира (загрузи из API)')
  if (!enemyStore.hasVillageData)      missing.push('игровые данные (village.txt)')
  if (missing.length === 0) return null
  return `Сначала загрузи: ${missing.join(' и ')}`
})

const canGenerate = computed(() => generateBlockReason.value === null)

function onGenerate(): void {
  if (!canGenerate.value) return
  planStore.resolveAllFromMap()
  planStore.generate()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
}
</script>

<style lang="scss" scoped>
.planner-view {
  max-width: 1300px;
  margin: 0 auto;
}

.generate-section {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.generate-main {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.generate-blocked {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: $text-dim;
}

.blocked-icon { color: $orange; }

.blocked-link {
  color: $accent;
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
}

.generate-stat {
  color: $text-dim;
  font-size: 0.95rem;

  strong { color: $text; }
}

.mode-bar {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  margin-bottom: 0;
}

.mode-btn {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 6px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.3rem 1rem;
  transition: border-color 0.15s, color 0.15s;

  &:hover { border-color: $accent; color: $text; }
  &.active { border-color: $accent; color: $accent; background: rgba(100, 80, 200, 0.08); }
}
</style>
