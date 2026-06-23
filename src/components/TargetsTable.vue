<template>
  <section class="panel">
    <div class="section-header">
      <h2>Цілі</h2>
      <button
        v-if="planStore.targets.length"
        class="btn btn-danger btn-sm"
        @click="confirm('Очистити всі цілі?') && planStore.clearTargets()"
      >Очистити</button>
    </div>

    <div class="add-targets-bar">
      <button class="btn btn-primary" @click="addEmptyTarget">+ Вручну</button>
      <button class="btn btn-secondary" @click="bulkOpen = !bulkOpen">
        {{ bulkOpen ? '▲' : '▼' }} Масова вставка
      </button>
      <label class="btn btn-secondary file-btn">
        Завантажити файл
        <input ref="fileInput" type="file" accept=".txt,.csv" class="hidden-input" @change="onTargetFile" />
      </label>
      <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Один рядок = одна ціль<br><code>500|500</code><br><code>501|501</code></span></span>
    </div>

    <div class="sort-bar">
      <span class="sort-label">Групувати:</span>
      <button
        v-for="opt in groupByOptions" :key="opt.value"
        :class="['btn', 'btn-sm', groupBy === opt.value ? 'btn-active' : 'btn-secondary']"
        @click="groupBy = opt.value"
      >{{ opt.label }}</button>
      <div class="sort-bar-sep"></div>
      <label class="col-toggle">
        <input type="checkbox" v-model="showLabel" />
        Мітки
      </label>
      <span v-if="planStore.targets.length" class="target-count" style="margin-left:auto">
        {{ planStore.targets.length }} цілей
      </span>
    </div>

    <div v-if="bulkOpen" class="bulk-panel">
      <p class="bulk-hint">
        Координати цілей — по одній або кілька через пробіл/кому/новий рядок: <code>500|500</code>
      </p>
      <div class="bulk-row">
        <textarea v-model="bulkText" class="bulk-textarea" rows="4" placeholder="500|500&#10;501|501&#10;502|502 503|503" />
        <div class="bulk-time">
          <label>
            Дата і час прильоту
            <input v-model="bulkDatetime" type="datetime-local" class="input" step="1" />
          </label>
          <button class="btn btn-primary" @click="doBulkAdd">Додати</button>
        </div>
      </div>
      <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
    </div>

    <div v-if="planStore.targets.length" class="table-wrap">
      <table class="mini-table targets-table">
        <thead><tr>
          <th>Координати</th>
          <th>Гравець (ціль)</th>
          <th>Плем'я</th>
          <th v-if="showLabel">Мітка</th>
          <th>Час прильоту</th>
          <th></th>
        </tr></thead>
        <tbody>
          <template v-for="block in targetBlocks" :key="block.key">
            <tr v-if="groupBy !== 'none'" class="group-sep-row">
              <td :colspan="showLabel ? 6 : 5">
                <span class="target-group-player">{{ block.label }}</span>
                <span v-if="block.sublabel" class="target-group-ally">{{ block.sublabel }}</span>
                <span class="target-group-count">{{ block.targets.length }} цілей</span>
              </td>
            </tr>
            <tr
              v-for="t in block.targets" :key="t.id"
              :class="{ 'row-has-tower': towerCoordsSet.has(t.coords), 'row-has-paloff': (t.palOffCount ?? 0) > 0 }"
            >
              <td>
                <div class="coords-cell">
                  <input
                    type="text" class="input" style="width:85px" placeholder="500|500"
                    :value="t.coords"
                    @input="filterCoordsInput($event)"
                    @change="onCoordsChange(t.id, ($event.target as HTMLInputElement).value)"
                  />
                  <span v-if="towerCoordsSet.has(t.coords)" class="tower-badge" :title="`Вежа рівень ${targetTowerLevel(t.coords)}`">
                    🗼{{ targetTowerLevel(t.coords) }}
                  </span>
                  <span v-if="(t.palOffCount ?? 0) > 0" class="paloff-badge" :title="`Пал-оффів: ${t.palOffCount}`">
                    ♞{{ t.palOffCount }}
                  </span>
                </div>
              </td>
              <td>
                <input
                  type="text" class="input" style="width:120px" placeholder="ім'я гравця"
                  :value="resolveTargetPlayer(t)"
                  :class="{ 'input-autofilled': !!enemyStore.lookupCoords(t.coords)?.player }"
                  @change="onTargetPlayerChange(t.id, t.coords, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="muted-small">{{ enemyStore.lookupCoords(t.coords)?.ally?.tag ?? t.enemyAllyTag ?? '—' }}</td>
              <td v-if="showLabel">
                <input
                  type="text" class="input" style="width:100px" placeholder="мітка…"
                  :value="t.label ?? ''"
                  @change="planStore.updateTarget(t.id, { label: ($event.target as HTMLInputElement).value || undefined })"
                />
              </td>
              <td>
                <input
                  type="datetime-local" class="input" style="width:185px" step="1"
                  :value="toDatetimeLocal(t.arrivalTime)"
                  @change="onDatetimeChange(t.id, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td><button class="btn btn-danger btn-sm" @click="planStore.removeTarget(t.id)">✕</button></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-else class="muted-text">Цілей ще немає. Додай вище.</p>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { useCoordInput } from '@/composables/useCoordInput'
import { usePlayerResolution } from '@/composables/usePlayerResolution'
import { useTargetGroups } from '@/composables/useTargetGroups'
import type { GroupBy } from '@/composables/useTargetGroups'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()
const { toDatetimeLocal } = useDateFormat()
const { filterCoordsInput } = useCoordInput()
const { resolveTargetPlayer } = usePlayerResolution()

// UI state
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkDatetime = ref(toDatetimeLocal(new Date(Date.now() + 3600_000)))
const bulkError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const showLabel = ref(false)

const groupBy = ref<GroupBy>('none')
const groupByOptions: { value: GroupBy; label: string }[] = [
  { value: 'none',    label: 'Немає' },
  { value: 'player',  label: 'Гравець' },
  { value: 'tribe',   label: 'Плем\'я' },
  { value: 'arrival', label: 'Час прильоту' },
  { value: 'tower',   label: 'Вежа' },
]

const towerCoordsSet = computed(() => new Set(planStore.watchtowerVillages.map((w) => w.coords)))
const { targetBlocks } = useTargetGroups(groupBy, towerCoordsSet)

function targetTowerLevel(coords: string): number | null {
  const wt = planStore.watchtowerVillages.find((w) => w.coords === coords)
  return wt ? wt.level : null
}

// Coords change
function onCoordsChange(id: string, coords: string): void {
  const m = coords.match(/^(\d+)\|(\d+)$/)
  if (!m) return
  const patch: Parameters<typeof planStore.updateTarget>[1] = {
    coords, x: parseInt(m[1], 10), y: parseInt(m[2], 10),
  }
  const info = enemyStore.lookupCoords(coords)
  if (info?.player) { patch.enemyPlayer = info.player.name; patch.enemyAllyTag = info.ally?.tag ?? '' }
  planStore.updateTarget(id, patch)
}

function onDatetimeChange(id: string, value: string): void {
  if (!value) return
  const d = new Date(value)
  if (!isNaN(d.getTime())) planStore.updateTarget(id, { arrivalTime: d })
}

function onTargetPlayerChange(id: string, coords: string, value: string): void {
  planStore.updateTarget(id, { enemyPlayer: value || undefined })
  const tower = planStore.watchtowerVillages.find((w) => w.coords === coords)
  if (tower) planStore.updateWatchtowerVillage(tower.id, { player: value })
}

// Add empty
function addEmptyTarget(): void {
  const now = new Date()
  now.setSeconds(0); now.setMilliseconds(0)
  planStore.addEmptyTarget(now)
}

// Bulk add
interface ParsedTarget { coords: string; tower: number }

function parseTargetsFromText(text: string): ParsedTarget[] {
  const results: ParsedTarget[] = []
  const tokens = text.split(/[\n\r; \t]+/).map((s) => s.trim()).filter(Boolean)
  for (const token of tokens) {
    const m = token.match(/^(\d{1,3}\|\d{1,3})(?:,(\d{1,2}))?$/)
    if (m) {
      const tower = m[2] !== undefined ? Math.min(20, Math.max(0, parseInt(m[2], 10))) : 20
      results.push({ coords: m[1], tower })
    }
  }
  return results
}

function addTargetsFromParsed(entries: ParsedTarget[], arrivalTime: Date): { added: number; skipped: number } {
  let added = 0; let skipped = 0
  for (const e of entries) {
    if (planStore.addTarget(e.coords, arrivalTime, { watchtowerLevel: e.tower })) added++
    else skipped++
  }
  return { added, skipped }
}

function doBulkAdd(): void {
  bulkError.value = ''
  const entries = parseTargetsFromText(bulkText.value)
  if (!entries.length) { bulkError.value = 'Не знайдено координат. Формат: 500|500 або 500|500,15 (рівень вежі)'; return }
  const arrivalTime = new Date(bulkDatetime.value)
  if (isNaN(arrivalTime.getTime())) { bulkError.value = 'Некоректна дата'; return }
  const { added, skipped } = addTargetsFromParsed(entries, arrivalTime)
  bulkText.value = ''
  bulkOpen.value = false
  if (skipped) bulkError.value = `Додано ${added}, пропущено ${skipped} некоректних`
}

function onTargetFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    const entries = parseTargetsFromText(text)
    if (!entries.length) { bulkError.value = 'У файлі не знайдено координат формату 500|500'; return }
    const arrivalTime = new Date(Date.now() + 3600_000)
    const { added } = addTargetsFromParsed(entries, arrivalTime)
    bulkError.value = `З файлу додано ${added} цілей. Відредагуй час прильоту в таблиці.`
    if (fileInput.value) fileInput.value.value = ''
  }
  reader.readAsText(file, 'utf-8')
}
</script>

<style lang="scss" scoped>
.targets-table td { vertical-align: middle; }

.group-sep-row td {
  background: #0d2a50;
  padding: 0.3rem 0.75rem;
  border-top: 2px solid $border;
}
.target-group-player { font-weight: 700; color: $text; font-size: 0.85rem; margin-right: 0.4rem; }
.target-group-ally   { color: $orange; font-size: 0.78rem; margin-right: 0.4rem; }
.target-group-count  { color: $text-faint; font-size: 0.75rem; float: right; }

.row-has-tower  { background: a($orange, 0.07) !important; border-left: 2px solid a($orange, 0.5); }
.row-has-paloff { background: a($green,  0.07) !important; border-left: 2px solid a($green,  0.45); }

.coords-cell  { display: flex; align-items: center; gap: 0.4rem; }
.tower-badge  { font-size: 0.72rem; color: $orange; white-space: nowrap; cursor: default; }
.paloff-badge { font-size: 0.72rem; color: $green;  white-space: nowrap; cursor: default; margin-left: 2px; }
</style>
