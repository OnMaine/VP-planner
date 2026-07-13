<template>
  <section class="panel">
    <button class="collapse-toggle" @click="open = !open">
      <span class="panel-title-row">
        <img :src="knightIcon" class="knight-icon" />
        Пал-оффы и Пробои
        <span v-if="totalPalAssigned > 0 || totalBreachAssigned > 0 || totalBpAssigned > 0" class="tower-count-badge">
          <span v-if="totalPalAssigned > 0">{{ totalPalAssigned }} пал</span>
          <span v-if="totalPalAssigned > 0 && totalBreachAssigned > 0"> · </span>
          <span v-if="totalBreachAssigned > 0">{{ totalBreachAssigned }} проб</span>
          <span v-if="(totalPalAssigned > 0 || totalBreachAssigned > 0) && totalBpAssigned > 0"> · </span>
          <span v-if="totalBpAssigned > 0">{{ totalBpAssigned }} +п+пр</span>
        </span>
      </span>
      <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="mt">

      <!-- Pool summary -->
      <div class="pool-summary">
        <span class="pool-chip pool-bp" :title="'Пробой + паладин'">
          <img :src="knightIcon" class="chip-icon" />+Пробой: {{ planStore.offPoolStats.breachPal }}
        </span>
        <span class="pool-chip pool-pal" :title="'Паладин-офф (без пробоя)'">
          <img :src="knightIcon" class="chip-icon" />Пал: {{ planStore.offPoolStats.palOnly }}
        </span>
        <span class="pool-chip pool-breach" :title="'Пробой (без паладина)'">
          Пробой: {{ planStore.offPoolStats.breachOnly }}
        </span>
        <span class="pool-chip pool-full" :title="'Обычный фулл-офф'">
          Обычные: {{ planStore.offPoolStats.fullOnly }}
        </span>
      </div>

      <div class="paloff-layout">

        <div class="paloff-troops">
          <table class="results-table" style="width:100%">
            <thead>
              <tr>
                <th style="text-align:left">Игрок</th>
                <th style="text-align:right" title="Пал-офф (без пробоя)">Пал</th>
                <th style="text-align:right" title="Пробой (без паладина)">Проб</th>
                <th style="text-align:right" title="Пал + Пробой">+П+Пр</th>
              </tr>
              <tr v-if="planStore.playerData.length > 0" class="tfoot-row">
                <td><strong>Всего</strong></td>
                <td style="text-align:right"><strong>{{ planStore.offPoolStats.palOnly }}</strong></td>
                <td style="text-align:right"><strong>{{ planStore.offPoolStats.breachOnly }}</strong></td>
                <td style="text-align:right"><strong>{{ planStore.offPoolStats.breachPal }}</strong></td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pd in planStore.playerData.filter(p => p.offPaladins > 0 || (planStore.poolStatsByPlayer.get(p.player)?.breach ?? 0) > 0 || (planStore.poolStatsByPlayer.get(p.player)?.breachPal ?? 0) > 0)" :key="pd.player">
                <td>{{ pd.player }}</td>
                <td style="text-align:right">{{ planStore.poolStatsByPlayer.get(pd.player)?.pal ?? 0 }}</td>
                <td style="text-align:right">{{ planStore.poolStatsByPlayer.get(pd.player)?.breach ?? 0 }}</td>
                <td style="text-align:right">{{ planStore.poolStatsByPlayer.get(pd.player)?.breachPal ?? 0 }}</td>
              </tr>
              <tr v-if="planStore.playerData.length === 0">
                <td colspan="2" class="muted-text" style="text-align:center">Импортируйте CSV игроков</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="paloff-assign">
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:0.5rem">
            <button class="btn btn-secondary btn-sm" @click="distributePalEvenly">Пал: равномерно</button>
            <button class="btn btn-secondary btn-sm" @click="distributeBreachEvenly">Пробой: равномерно</button>
            <button class="btn btn-secondary btn-sm" @click="clearAssignments">Сбросить всё</button>
            <button class="btn btn-secondary btn-sm" @click="bulkOpen = !bulkOpen">
              {{ bulkOpen ? '▲' : '▼' }} Массовая вставка
            </button>
            <span class="muted-text" style="font-size:0.8rem;margin-left:auto">
              Пал: {{ totalPalAssigned }}/{{ totalPalAvailable }}
              · Пробой: {{ totalBreachAssigned }}/{{ totalBreachAvailable }}
              · +П+Пр: {{ totalBpAssigned }}/{{ totalBpAvailable }}
            </span>
          </div>

          <div v-if="bulkOpen" style="margin-bottom:0.75rem">
            <p class="bulk-hint">Формат: <code>координаты,пал,пробои</code> (0 = не менять)</p>
            <textarea class="bulk-textarea" rows="5" v-model="bulkText" placeholder="416|535,3,1&#10;416|536,2,0&#10;416|537,1,2"></textarea>
            <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
            <button class="btn btn-primary btn-sm mt" @click="applyBulk">Применить</button>
          </div>

          <table class="results-table" style="width:100%">
            <thead><tr>
              <th style="text-align:left">Координаты</th>
              <th style="text-align:left">Игрок (цель)</th>
              <th style="text-align:right" title="Пал-оффов (pal_off + breach+pal)">Пал</th>
              <th style="text-align:right" title="Пробоев (breach_off)">Проб</th>
              <th style="text-align:right" title="Пал + Пробой (breach+pal)">+П+Пр</th>
            </tr></thead>
            <tbody>
              <tr v-for="t in planStore.targets" :key="t.id">
                <td>
                  <div class="coords-cell">
                    {{ t.coords || '—' }}
                    <span v-if="towerCoordsSet.has(t.coords)" class="tower-badge" :title="`Башня уровень ${targetTowerLevel(t.coords)}`">
                      <img :src="watchtowerIcon" class="tower-icon" />{{ targetTowerLevel(t.coords) }}
                    </span>
                  </div>
                </td>
                <td class="muted-small">{{ resolveTargetPlayer(t) || '—' }}</td>
                <td style="text-align:right;width:70px">
                  <input
                    type="number" class="input" style="width:54px;text-align:right" min="0"
                    :max="totalPalAvailable - (totalPalAssigned - (t.palOffCount ?? 0))"
                    :value="t.palOffCount ?? 0"
                    @change="setPal(t.id, +($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = String(t.palOffCount ?? 0)"
                  />
                </td>
                <td style="text-align:right;width:70px">
                  <input
                    type="number" class="input" style="width:54px;text-align:right" min="0"
                    :max="totalBreachAvailable - (totalBreachAssigned - (t.breachOffCount ?? 0))"
                    :value="t.breachOffCount ?? 0"
                    @change="setBreach(t.id, +($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = String(t.breachOffCount ?? 0)"
                  />
                </td>
                <td style="text-align:right;width:70px">
                  <input
                    type="number" class="input" style="width:54px;text-align:right" min="0"
                    :max="totalBpAvailable - (totalBpAssigned - (t.bpOffCount ?? 0))"
                    :value="t.bpOffCount ?? 0"
                    @change="setBp(t.id, +($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = String(t.bpOffCount ?? 0)"
                  />
                </td>
              </tr>
              <tr v-if="planStore.targets.length === 0">
                <td colspan="5" class="muted-text" style="text-align:center">Нет целей</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { usePlayerResolution } from '@/composables/usePlayerResolution'
import { UNIT_ICONS, watchtowerIcon } from '@/utils/unitIcons'
const knightIcon = UNIT_ICONS.knight

const planStore = usePlanStore()
const { resolveTargetPlayer } = usePlayerResolution()

const open = ref(false)
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkError = ref('')

const towerCoordsSet = computed(() => new Set(planStore.watchtowerVillages.map((w) => w.coords)))

function targetTowerLevel(coords: string): number | null {
  const wt = planStore.watchtowerVillages.find((w) => w.coords === coords)
  return wt?.level ?? null
}

const totalPalAvailable = computed(() =>
  planStore.playerData.reduce((s, pd) => s + pd.offPaladins, 0),
)
const totalBreachAvailable = computed(() =>
  planStore.offPoolStats.breachPal + planStore.offPoolStats.breachOnly,
)
const totalBpAvailable = computed(() => planStore.offPoolStats.breachPal)
const totalPalAssigned = computed(() =>
  planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0),
)
const totalBreachAssigned = computed(() =>
  planStore.targets.reduce((s, t) => s + (t.breachOffCount ?? 0), 0),
)
const totalBpAssigned = computed(() =>
  planStore.targets.reduce((s, t) => s + (t.bpOffCount ?? 0), 0),
)

function setPal(targetId: string, raw: number) {
  const current = planStore.targets.find(t => t.id === targetId)?.palOffCount ?? 0
  const otherSum = totalPalAssigned.value - current
  const clamped = Math.max(0, Math.min(raw, totalPalAvailable.value - otherSum))
  planStore.updateTarget(targetId, { palOffCount: clamped || undefined })
}

function setBreach(targetId: string, raw: number) {
  const current = planStore.targets.find(t => t.id === targetId)?.breachOffCount ?? 0
  const otherSum = totalBreachAssigned.value - current
  const clamped = Math.max(0, Math.min(raw, totalBreachAvailable.value - otherSum))
  planStore.updateTarget(targetId, { breachOffCount: clamped || undefined })
}

function setBp(targetId: string, raw: number) {
  const current = planStore.targets.find(t => t.id === targetId)?.bpOffCount ?? 0
  const otherSum = totalBpAssigned.value - current
  const clamped = Math.max(0, Math.min(raw, totalBpAvailable.value - otherSum))
  planStore.updateTarget(targetId, { bpOffCount: clamped || undefined })
}

function distributePalEvenly(): void {
  const targets = planStore.targets.filter((t) => t.coords)
  if (!targets.length) return
  const total = totalPalAvailable.value
  const perTarget = Math.floor(total / targets.length)
  const remainder = total - perTarget * targets.length
  targets.forEach((t, i) =>
    planStore.updateTarget(t.id, { palOffCount: perTarget + (i < remainder ? 1 : 0) || undefined }),
  )
}

function distributeBreachEvenly(): void {
  const targets = planStore.targets.filter((t) => t.coords)
  if (!targets.length) return
  const total = totalBreachAvailable.value
  const perTarget = Math.floor(total / targets.length)
  const remainder = total - perTarget * targets.length
  targets.forEach((t, i) =>
    planStore.updateTarget(t.id, { breachOffCount: perTarget + (i < remainder ? 1 : 0) || undefined }),
  )
}

function clearAssignments(): void {
  for (const t of planStore.targets) {
    planStore.updateTarget(t.id, { palOffCount: undefined, breachOffCount: undefined, bpOffCount: undefined })
  }
}

function applyBulk(): void {
  bulkError.value = ''
  const lines = bulkText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { bulkError.value = 'Введите хотя бы одну строку'; return }
  for (const line of lines) {
    const parts = line.split(',')
    const coords = parts[0].trim()
    if (!/^\d+\|\d+$/.test(coords)) { bulkError.value = `Неверный формат: ${line}`; return }
    const palCount    = parts[1] ? parseInt(parts[1].trim(), 10) : null
    const breachCount = parts[2] ? parseInt(parts[2].trim(), 10) : null
    if (palCount !== null && isNaN(palCount))    { bulkError.value = `Неверное кол-во пал: ${line}`; return }
    if (breachCount !== null && isNaN(breachCount)) { bulkError.value = `Неверное кол-во пробоев: ${line}`; return }
    const t = planStore.targets.find((t) => t.coords === coords)
    if (!t) continue
    const patch: { palOffCount?: number; breachOffCount?: number } = {}
    if (palCount !== null)    patch.palOffCount    = palCount    || undefined
    if (breachCount !== null) patch.breachOffCount = breachCount || undefined
    planStore.updateTarget(t.id, patch)
  }
  bulkOpen.value = false
  bulkText.value = ''
}

defineExpose({ expand: () => { open.value = true } })
</script>

<style lang="scss" scoped>
.paloff-layout { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
.paloff-troops { flex: 0 0 300px; min-width: 260px; }
.paloff-assign { flex: 1 1 400px; min-width: 300px; }

.panel-title-row { display: inline-flex; align-items: center; gap: 6px; }
.knight-icon { width: 16px; height: 16px; image-rendering: pixelated; }

.coords-cell  { display: flex; align-items: center; gap: 0.4rem; }
.tower-badge  { display: inline-flex; align-items: center; gap: 2px; font-size: 0.72rem; color: $orange; white-space: nowrap; cursor: default; }
.tower-icon   { width: 14px; height: 14px; image-rendering: pixelated; }

.tfoot-row td {
  background: $border;
  border-bottom: 2px solid #1a3a6e;
  font-size: 0.85rem;
  padding: 4px 8px;
}

.pool-summary {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.pool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.chip-icon { width: 13px; height: 13px; image-rendering: pixelated; }

.pool-bp     { background: rgba(100, 80, 200, 0.15); border-color: rgba(100, 80, 200, 0.4); color: #a99ef0; }
.pool-pal    { background: rgba(100, 80, 200, 0.08); border-color: rgba(100, 80, 200, 0.25); color: #8878cc; }
.pool-breach { background: rgba(220, 120, 40, 0.12); border-color: rgba(220, 120, 40, 0.35); color: $orange; }
.pool-full   { background: rgba(255,255,255,0.04); border-color: $border; color: $text-dim; }
</style>
