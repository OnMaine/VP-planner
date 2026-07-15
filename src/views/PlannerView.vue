<template>
  <div class="planner-view">
    <Transition name="gen-overlay">
      <div v-if="isGenerating" class="gen-overlay">
        <div class="gen-overlay-box">
          <div class="gen-overlay-spinner"></div>
          <span class="gen-overlay-text">Генерация плана...</span>
        </div>
      </div>
    </Transition>

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

    <!-- Generate -->
    <section class="panel generate-section">
      <div class="generate-main">
        <button
          :class="['btn', 'btn-primary', 'btn-generate', { 'btn-flash': justGenerated }]"
          :disabled="!canGenerate || isGenerating"
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

      <div v-if="showSpecialOffWarning" class="special-off-warning">
        <span class="warning-icon">⚠</span>
        <span class="warning-text">Есть неназначенные пал/пробои — задайте их в панели ниже.</span>
        <div class="warning-actions">
          <button class="btn btn-secondary btn-sm" @click="specialOffWarningDismissed = true; doGenerate()">Игнорировать</button>
          <button class="btn btn-primary btn-sm" @click="showSpecialOffWarning = false; palOffPanel?.expand()">Назначить</button>
        </div>
      </div>

      <div v-if="worldStore.settings.paladinMode === 'auto' && planStore.offDistribution === 'far_first' && !planStore.attacks.length && (planStore.offPoolStats.breachPal + planStore.offPoolStats.palOnly + planStore.offPoolStats.breachOnly) > 0" class="pal-dist-notice">
        <span class="blocked-icon">ℹ</span>
        <span>Пал-оффы и пробои в режиме «Дальние вперёд» распределяются по ближайшей дистанции — дальний порядок применяется только к обычным фулл-оффам.</span>
      </div>

      <div v-if="planStore.attacks.length > 0" class="generate-stat">
        Всего атак: <strong>{{ planStore.attacks.length }}</strong>
        &nbsp;·&nbsp; Активных: <strong>{{ activeAttackCount }}</strong>
        <span v-if="lastGeneratedAt" class="generate-ts">· обновлено {{ lastGeneratedAt }}</span>
      </div>

      <div v-if="planStore.attacks.length > 0" class="pool-stats">
        <span class="pool-item">
          Офы: <strong>{{ planStore.poolUsageStats.offsUsed }}</strong>/{{ planStore.poolUsageStats.offsTotal }}
        </span>
        <span class="pool-sep">·</span>
        <span class="pool-item">
          Дворы: <strong>{{ planStore.poolUsageStats.noblesUsed }}</strong>/{{ planStore.poolUsageStats.noblesTotal }}
        </span>
        <template v-if="palOffTotal > 0 || breachOffTotal > 0">
          <span class="pool-sep">·</span>
          <template v-if="palOffTotal > 0">
            <span class="pool-item pool-item--dim">
              Пал-оффы: <strong :class="palOffAssigned < palOffTotal ? 'stat-warn' : 'stat-ok'">{{ palOffAssigned }}</strong>/{{ palOffTotal }}
            </span>
          </template>
          <span v-if="palOffTotal > 0 && breachOffTotal > 0" class="pool-sep">·</span>
          <template v-if="breachOffTotal > 0">
            <span class="pool-item pool-item--dim">
              Пробои: <strong :class="breachOffAssigned < breachOffTotal ? 'stat-warn' : 'stat-ok'">{{ breachOffAssigned }}</strong>/{{ breachOffTotal }}
            </span>
          </template>
        </template>
        <template v-if="planStore.poolUsageStats.offsAvailable > 0">
          <span class="pool-sep">·</span>
          <span class="pool-unused">{{ planStore.poolUsageStats.offsAvailable }} офов не в плане</span>
        </template>
        <template v-if="planStore.poolUsageStats.reservedOffCount > 0">
          <span class="pool-sep">·</span>
          <span class="pool-reserved">Резерв: {{ planStore.poolUsageStats.reservedOffCount }}</span>
        </template>
        <template v-if="planStore.poolUsageStats.catSquadsTotal > 0">
          <span class="pool-sep">·</span>
          <span class="pool-item">
            Каты: <strong>{{ planStore.poolUsageStats.catSquadsUsed }}</strong>/{{ planStore.poolUsageStats.catSquadsTotal }}
          </span>
          <template v-if="planStore.poolUsageStats.catSquadsLeft > 0">
            <span class="pool-sep">·</span>
            <span class="pool-unused">{{ planStore.poolUsageStats.catSquadsLeft }} кат не в плане</span>
          </template>
        </template>
      </div>
    </section>

    <PalOffPanel v-if="worldStore.settings.paladinMode === 'manual'" ref="palOffPanel" />
    <CatMassPanel v-if="massConfigStore.active?.catMassEnabled" />
    <TargetsTable />
    <WatchtowerTable />

    <AttackResultsPanel ref="resultsPanel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlanStore } from '@/stores/planStore'
import { useAIPlanStore } from '@/stores/aiPlanStore'
import { useWorldStore } from '@/stores/worldStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useMassConfigStore } from '@/stores/massConfigStore'
import MassActivePanel from '@/components/MassActivePanel.vue'
import TargetsTable from '@/components/TargetsTable.vue'
import PalOffPanel from '@/components/PalOffPanel.vue'
import WatchtowerTable from '@/components/WatchtowerTable.vue'
import AttackResultsPanel from '@/components/AttackResultsPanel.vue'
import AIPlanPanel from '@/components/AIPlanPanel.vue'
import CatMassPanel from '@/components/CatMassPanel.vue'

const planStore = usePlanStore()
const aiStore = useAIPlanStore()
const worldStore = useWorldStore()
const enemyStore = useEnemyDataStore()
const massConfigStore = useMassConfigStore()
const resultsPanel   = ref<InstanceType<typeof AttackResultsPanel> | null>(null)
const palOffPanel    = ref<InstanceType<typeof PalOffPanel> | null>(null)
const isGenerating   = ref(false)

const activeAttackCount = computed(() => planStore.attacks.filter((a) => !a.excluded).length)

const palOffTotal    = computed(() => planStore.offPoolStats.breachPal + planStore.offPoolStats.palOnly)
const breachOffTotal = computed(() => planStore.offPoolStats.breachPal + planStore.offPoolStats.breachOnly)
const palOffAssigned = computed(() => {
  if (worldStore.settings.paladinMode === 'auto')
    return planStore.attacks.filter(a => a.type === 'paladin_off').length
  return planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0)
})
const breachOffAssigned = computed(() => {
  if (worldStore.settings.paladinMode === 'auto')
    return planStore.attacks.filter(a => a.label?.includes('+Пробой')).length
  return planStore.targets.reduce((s, t) => s + (t.breachOffCount ?? 0), 0)
})

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
const showSpecialOffWarning    = ref(false)
const specialOffWarningDismissed = ref(false)
const importError = ref<string>('')

const unassignedSpecialOffs = computed(() => {
  if (worldStore.settings.paladinMode === 'auto') return false
  if (worldStore.settings.paladinMode === 'none') return false
  const pool = planStore.offPoolStats
  if (pool.breachPal + pool.palOnly + pool.breachOnly === 0) return false
  const totalPal    = planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0)
  const totalBreach = planStore.targets.reduce((s, t) => s + (t.breachOffCount ?? 0), 0)
  return (pool.breachPal + pool.palOnly > 0 && totalPal === 0) ||
         (pool.breachPal + pool.breachOnly > 0 && totalBreach === 0)
})

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

async function doGenerate(): Promise<void> {
  if (isGenerating.value) return
  showSpecialOffWarning.value = false
  isGenerating.value = true
  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, 30))
  planStore.resolveAllFromMap()
  planStore.generate()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
  const now = new Date()
  lastGeneratedAt.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  justGenerated.value = true
  specialOffWarningDismissed.value = false
  isGenerating.value = false
  setTimeout(() => { justGenerated.value = false }, 600)
}


function onGenerate(): void {
  if (!canGenerate.value) return
  if (unassignedSpecialOffs.value && !specialOffWarningDismissed.value) {
    showSpecialOffWarning.value = true
    return
  }
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

.btn-generate {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 170px;
  justify-content: center;
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
.pool-item--dim { font-size: 0.82rem; color: $text-faint; strong { color: $text-dim; } }
.pool-sep   { color: $text-faint; }
.pool-unused    { color: $orange; font-weight: 600; }
.pool-reserved  { color: #c8a020; font-weight: 600; }

.stat-ok   { color: $green !important; }
.stat-warn { color: $orange !important; }

.special-off-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: a($orange, 0.08);
  border: 1px solid a($orange, 0.3);
  font-size: 0.85rem;

  .warning-icon { color: $orange; flex-shrink: 0; }
  .warning-text { flex: 1; color: $text-dim; }
  .warning-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
}

.pal-dist-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: $text-faint;
  width: 100%;
}

.pool-stats-special {
  font-size: 0.82rem;
  color: $text-faint;
  strong { color: $text-dim; }
}

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

// ── Generation overlay ─────────────────────────────────────────────────────
.gen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 16, 32, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.gen-overlay-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  background: #101828;
  border: 1px solid rgba(100, 80, 200, 0.3);
  border-radius: 14px;
  padding: 2.5rem 3.5rem;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

@keyframes gen-spin { to { transform: rotate(360deg) } }
.gen-overlay-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(255,255,255,0.12);
  border-top-color: #6450c8;
  border-radius: 50%;
  animation: gen-spin 0.75s linear infinite;
}

.gen-overlay-text {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255,255,255,0.75);
  letter-spacing: 0.02em;
}

.gen-overlay-enter-active,
.gen-overlay-leave-active { transition: opacity 0.15s ease }
.gen-overlay-enter-from,
.gen-overlay-leave-to   { opacity: 0 }

.btn-generate { min-width: 170px; }
</style>
