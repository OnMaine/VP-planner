<template>
  <div class="planner-view">
    <h1>Планер атак</h1>

    <section class="panel mode-bar">
      <button :class="['mode-btn', { active: aiStore.mode === 'manual' }]" @click="aiStore.setMode('manual')">Ручной</button>
      <button :class="['mode-btn', { active: aiStore.mode === 'ai' }]" @click="aiStore.setMode('ai')">AI</button>
      <span class="mode-bar-spacer" />
      <span class="plan-file-group">
        <button v-if="planStore.attacks.length > 0" class="btn btn-secondary btn-sm" title="Сохранить план в файл" @click="planStore.exportPlan()">↓ Сохранить план</button>
        <label class="btn btn-secondary btn-sm plan-import-label" title="Загрузить план из файла">
          ↑ Загрузить план
          <input type="file" accept=".json" class="plan-import-input" @change="onImportPlan" />
        </label>
        <span v-if="importError" class="import-error">{{ importError }}</span>
      </span>
    </section>

    <AIPlanPanel v-if="aiStore.mode === 'ai'" @generate="onGenerate" />

    <MassActivePanel />
    <TargetsTable />
    <WatchtowerTable />

    <!-- Generate -->
    <section class="panel generate-section">
      <div class="generate-main">
        <button
          :class="['btn', 'btn-primary', 'btn-generate', { 'btn-flash': justGenerated }]"
          :disabled="!canGenerate"
          :title="generateBlockReason ?? ''"
          @click="onGenerate"
        >Сгенерировать план</button>

        <div v-if="!canGenerate" class="generate-blocked">
          <span class="blocked-icon">⚠</span>
          <span>{{ generateBlockReason }}</span>
          <button v-if="needsDataRefresh" class="blocked-link blocked-btn" :disabled="refreshing" @click="refreshGameData">
            {{ refreshing ? 'Загрузка...' : 'Обновить игровые данные' }}
          </button>
          <span v-if="refreshError" class="refresh-error">{{ refreshError }}</span>
          <router-link v-for="link in generateBlockLinks" :key="link.to" :to="link.to" class="blocked-link">{{ link.label }}</router-link>
        </div>
      </div>

      <div v-if="planStore.attacks.length > 0" class="generate-stat">
        Всего атак: <strong>{{ planStore.attacks.length }}</strong>
        &nbsp;·&nbsp; Активных: <strong>{{ activeAttackCount }}</strong>
        <span v-if="lastGeneratedAt" class="generate-ts">· обновлено {{ lastGeneratedAt }}</span>
      </div>

      <div v-if="planStore.attacks.length > 0" class="pool-stats">
        <span class="pool-item">
          Офы: <strong :class="planStore.poolUsageStats.offsAvailable > 0 ? 'stat-warn' : 'stat-ok'">{{ planStore.poolUsageStats.offsUsed }}</strong>/{{ planStore.poolUsageStats.offsTotal }}
        </span>
        <span class="pool-sep">·</span>
        <span class="pool-item">
          Дворы: <strong>{{ planStore.poolUsageStats.noblesUsed }}</strong>/{{ planStore.poolUsageStats.noblesTotal }}
        </span>
        <template v-if="planStore.poolUsageStats.offsAvailable > 0">
          <span class="pool-sep">·</span>
          <span class="pool-unused">{{ planStore.poolUsageStats.offsAvailable }} офов не в плане</span>
          <button class="btn btn-secondary btn-sm" @click="onFillOffs">Добить офы</button>
        </template>
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
import { useMassConfigStore } from '@/stores/massConfigStore'
import MassActivePanel from '@/components/MassActivePanel.vue'
import TargetsTable from '@/components/TargetsTable.vue'
import WatchtowerTable from '@/components/WatchtowerTable.vue'
import AttackResultsPanel from '@/components/AttackResultsPanel.vue'
import AIPlanPanel from '@/components/AIPlanPanel.vue'

const planStore = usePlanStore()
const aiStore = useAIPlanStore()
const worldStore = useWorldStore()
const enemyStore = useEnemyDataStore()
const massConfigStore = useMassConfigStore()
const resultsPanel = ref<InstanceType<typeof AttackResultsPanel> | null>(null)

const activeAttackCount = computed(() => planStore.attacks.filter((a) => !a.excluded).length)

const generateBlockLinks = computed<Array<{ to: string; label: string }>>(() => {
  const links: Array<{ to: string; label: string }> = []
  if (!worldStore.settings.worldCode) links.push({ to: '/settings', label: 'Настройки мира →' })
  if (!massConfigStore.active) links.push({ to: '/mass-configs', label: 'Конфигуратор масса →' })
  return links
})

const generateBlockReason = computed<string | null>(() => {
  const missing: string[] = []
  if (!worldStore.settings.worldCode) missing.push('настройки мира')
  if (!enemyStore.hasVillageData)      missing.push('village.txt')
  if (!massConfigStore.active)         missing.push('масс-конфиг')
  if (missing.length === 0) return null
  return `Не хватает: ${missing.join(', ')}`
})

const needsDataRefresh = computed(() => !!worldStore.settings.worldCode && !enemyStore.hasVillageData)
const refreshing   = ref(false)
const refreshError = ref('')

async function refreshGameData(): Promise<void> {
  const code = worldStore.settings.worldCode
  if (!code) return
  refreshing.value = true
  refreshError.value = ''
  try {
    const base = `/game-proxy/${code}/map`
    const [vRes, pRes, aRes] = await Promise.all([
      fetch(`${base}/village.txt.gz`),
      fetch(`${base}/player.txt.gz`),
      fetch(`${base}/ally.txt.gz`),
    ])
    if (!vRes.ok) throw new Error(`village.txt: HTTP ${vRes.status}`)
    if (!pRes.ok) throw new Error(`player.txt: HTTP ${pRes.status}`)
    if (!aRes.ok) throw new Error(`ally.txt: HTTP ${aRes.status}`)
    const [vBlob, pBlob, aBlob] = await Promise.all([vRes.blob(), pRes.blob(), aRes.blob()])
    await Promise.all([
      enemyStore.loadVillageFile(new File([vBlob], 'village.txt.gz')),
      enemyStore.loadPlayerFile(new File([pBlob], 'player.txt.gz')),
      enemyStore.loadAllyFile(new File([aBlob], 'ally.txt.gz')),
    ])
    planStore.resolveAllFromMap()
  } catch (err) {
    refreshError.value = err instanceof Error ? err.message : String(err)
  } finally {
    refreshing.value = false
  }
}

const canGenerate = computed(() => generateBlockReason.value === null)

const lastGeneratedAt = ref<string>('')
const justGenerated   = ref(false)
const importError = ref<string>('')

async function onImportPlan(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importError.value = ''
  try {
    await planStore.importPlan(file)
    resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
  } catch (err: any) {
    importError.value = err?.message ?? 'Ошибка импорта'
  }
  ;(e.target as HTMLInputElement).value = ''
}

function doGenerate(): void {
  planStore.resolveAllFromMap()
  planStore.generate()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
  const now = new Date()
  lastGeneratedAt.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  justGenerated.value = true
  setTimeout(() => { justGenerated.value = false }, 600)
}

function onFillOffs(): void {
  planStore.fillRemainingOffs()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
}

function onGenerate(): void {
  if (!canGenerate.value) return
  doGenerate()
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

.plan-file-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.plan-import-label {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.plan-import-input {
  display: none;
}

.import-error {
  font-size: 0.8rem;
  color: $orange;
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

.blocked-btn {
  background: none;
  border: 1px solid a($accent, 0.4);
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  font-size: 0.82rem;
  transition: border-color 0.15s;
  &:hover:not(:disabled) { border-color: $accent; text-decoration: none; }
  &:disabled { opacity: 0.55; cursor: default; }
}

.refresh-error {
  color: $accent;
  font-size: 0.8rem;
}

.generate-stat {
  color: $text-dim;
  font-size: 0.95rem;

  strong { color: $text; }
}

.generate-ts {
  color: $text-faint;
  font-size: 0.82rem;
  margin-left: 0.2rem;
}

.pool-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  color: $text-dim;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 0.35rem;

  strong { color: $text; }
}

.pool-item  { display: flex; align-items: center; gap: 0.25rem; }
.pool-sep   { color: $text-faint; }
.pool-unused { color: $orange; font-weight: 600; }
.stat-ok   { color: $green !important; }
.stat-warn { color: $orange !important; }

@keyframes btn-flash {
  0%   { box-shadow: 0 0 0 0 rgba(78, 204, 163, 0.7); }
  60%  { box-shadow: 0 0 0 8px rgba(78, 204, 163, 0); }
  100% { box-shadow: 0 0 0 0 rgba(78, 204, 163, 0); }
}

.btn-flash {
  animation: btn-flash 0.6s ease-out;
}

.mode-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  margin-bottom: 0;
}

.mode-bar-spacer {
  flex: 1;
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
