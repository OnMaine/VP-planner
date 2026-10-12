<template>
  <section class="panel">
    <button class="collapse-toggle" @click="open = !open">
      <span>
        Цели<template v-if="scopedTargets.length"> ({{ scopedTargets.length }})</template>
        <span v-if="selectedWaveInfo" class="targets-wave-badge">волна {{ selectedWaveInfo.ordinal }} · {{ selectedWaveInfo.name }}</span>
      </span>
      <span class="collapse-right">
        <span @click.stop>
          <button
            v-if="planStore.targets.length"
            class="btn btn-danger btn-sm"
            @click="clearAllTargets()"
          >Очистить</button>
        </span>
        <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
      </span>
    </button>

    <template v-if="open">

    <div class="add-targets-bar">
      <button class="btn btn-primary" @click="addEmptyTarget">+ Вручную</button>
      <button class="btn btn-secondary" @click="bulkOpen = !bulkOpen">
        {{ bulkOpen ? '▲' : '▼' }} Массовая вставка
      </button>
      <label class="btn btn-secondary file-btn">
        Загрузить файл
        <input ref="fileInput" type="file" accept=".txt,.csv,.xlsx,.xls" class="hidden-input" @change="onTargetFile" />
      </label>
      <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Одна строка = одна цель<br><code>500|500</code><br><code>501|501</code></span></span>
    </div>

    <div class="sort-bar">
      <span class="sort-label">Группировать:</span>
      <button
        v-for="opt in groupByOptions" :key="opt.value"
        :class="['btn', 'btn-sm', groupBy === opt.value ? 'btn-active' : 'btn-secondary']"
        @click="groupBy = opt.value"
      >{{ opt.label }}</button>
      <div class="sort-bar-sep"></div>
      <span v-if="scopedTargets.length" class="target-count" style="margin-left:auto">
        {{ scopedTargets.length }} целей
      </span>
    </div>

    <div v-if="bulkOpen" class="bulk-panel">
      <p class="bulk-hint">
        Координаты целей — по одной или несколько через пробел/запятую/новую строку: <code>500|500</code>
      </p>
      <div class="bulk-row">
        <textarea v-model="bulkText" class="bulk-textarea" rows="4" placeholder="500|500&#10;501|501&#10;502|502 503|503" />
        <div class="bulk-time">
          <label>
            Дата и время прилёта
            <input v-model="bulkDatetime" type="datetime-local" class="input" step="0.001" />
          </label>
          <button class="btn btn-primary" @click="doBulkAdd">Добавить</button>
        </div>
      </div>
      <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
    </div>

    <div v-if="scopedTargets.length" class="table-wrap">
      <table class="mini-table targets-table">
        <thead><tr>
          <th>Координаты</th>
          <th>Игрок (цель)</th>
          <th>Племя</th>
          <th>Тайминг</th>
          <th></th>
        </tr></thead>
        <tbody>
          <template v-for="block in targetBlocks" :key="block.key">
            <tr v-if="groupBy !== 'none'" class="group-sep-row">
              <td colspan="4">
                <span class="target-group-player">{{ block.label }}</span>
                <span v-if="block.sublabel" class="target-group-ally">{{ block.sublabel }}</span>
                <span class="target-group-count">{{ block.targets.length }} целей</span>
              </td>
            </tr>
            <tr
              v-for="t in block.targets" :key="t.id"
              :class="{
                'row-has-tower': towerCoordsSet.has(t.coords),
                'row-uncovered': planStore.uncoveredTargetCoords.has(t.coords),
                'row-muted': t.muted,
              }"
            >
              <td>
                <div class="coords-cell">
                  <input
                    type="text" class="input" style="width:85px" placeholder="500|500"
                    :value="t.coords"
                    @input="filterCoordsInput($event)"
                    @change="onCoordsChange(t.id, ($event.target as HTMLInputElement).value)"
                  />
                  <span v-if="t.muted" class="muted-badge" title="Заглушена — не участвует в генерации">🔇 заглушена</span>
                  <span v-if="planStore.uncoveredTargetCoords.has(t.coords)" class="uncovered-badge" title="Не хватило войск для покрытия этой цели">⚠</span>
                  <span v-if="towerCoordsSet.has(t.coords)" class="tower-badge" :title="`Башня уровень ${targetTowerLevel(t.coords)}`">
                    <img :src="watchtowerIcon" class="tower-icon" />{{ targetTowerLevel(t.coords) }}
                  </span>

                </div>
              </td>
              <td>
                <input
                  type="text" class="input" style="width:120px" placeholder="имя игрока"
                  :value="resolveTargetPlayer(t)"
                  :class="{ 'input-autofilled': !!enemyStore.lookupCoords(t.coords)?.player }"
                  @change="onTargetPlayerChange(t.id, t.coords, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="muted-small">{{ enemyStore.lookupCoords(t.coords)?.ally?.tag ?? t.enemyAllyTag ?? '—' }}</td>
              <td>
                <input
                  type="datetime-local" class="input" style="width:185px" step="0.001"
                  :value="toDatetimeLocal(t.arrivalTime)"
                  @change="onDatetimeChange(t.id, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="target-actions-cell">
                <button
                  class="btn btn-sm mute-toggle-btn"
                  :class="t.muted ? 'mute-toggle-btn--on' : ''"
                  :title="t.muted ? 'Вернуть цель в генерацию' : 'Заглушить — выключить из генерации (обратимо)'"
                  @click="planStore.setTargetMuted(t.id, !t.muted)"
                >{{ t.muted ? '🔈 Вернуть' : '🔇' }}</button>
                <button class="btn btn-danger btn-sm" title="Удалить цель" @click="planStore.removeTarget(t.id)">✕</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-else class="muted-text">Целей ещё нет. Добавь выше.</p>

    </template><!-- end v-if="open" -->
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import type { Target } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useMassConfigStore } from '@/stores/massConfigStore'
import { readTabularFile } from '@/utils/importFile'
import { useDateFormat } from '@/composables/useDateFormat'
import { useCoordInput } from '@/composables/useCoordInput'
import { usePlayerResolution } from '@/composables/usePlayerResolution'
import { useTargetGroups } from '@/composables/useTargetGroups'
import type { GroupBy } from '@/composables/useTargetGroups'
import { watchtowerIcon } from '@/utils/unitIcons'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()

function clearAllTargets() {
  if (window.confirm('Очистить все цели?')) planStore.clearTargets()
}
const { toDatetimeLocal } = useDateFormat()
const { filterCoordsInput } = useCoordInput()
const { resolveTargetPlayer } = usePlayerResolution()

// UI state
// Collapsed by default when targets already exist (e.g. loaded from a plan).
const massConfigStore = useMassConfigStore()

// Выбранная волна (её цели показываем). При ≤1 волне — просто единственная/нет.
const selectedWaveId = computed(() => planStore.selectedWaveId ?? planStore.planWaves[0]?.id ?? null)
const selectedWaveInfo = computed(() => {
  const waves = planStore.planWaves
  if (waves.length <= 1) return null
  const idx = waves.findIndex(w => w.id === selectedWaveId.value)
  if (idx < 0) return null
  const cfg = massConfigStore.all.find(c => c.id === waves[idx].configId)
  return { ordinal: idx + 1, name: cfg?.name ?? '(конфиг удалён)' }
})

// Цели выбранной волны (при ≤1 волне — все цели плана).
const scopedTargets = computed<Target[]>(() => {
  if (planStore.planWaves.length <= 1) return planStore.targets
  return planStore.targets.filter(t => t.waveId === selectedWaveId.value)
})

const open = ref(planStore.targets.length === 0)
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkDatetime = ref(toDatetimeLocal(new Date(Math.floor((Date.now() + 3600_000) / 1000) * 1000)))
const bulkError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const groupBy = ref<GroupBy>('none')
const groupByOptions = computed<{ value: GroupBy; label: string }[]>(() => [
  { value: 'none',    label: 'Нет' },
  { value: 'player',  label: 'Игрок' },
  { value: 'tribe',   label: 'Племя' },
  { value: 'arrival', label: 'Время прилёта' },
  { value: 'tower',   label: 'Башня' },
])

const towerCoordsSet = computed(() => new Set(planStore.watchtowerVillages.map((w) => w.coords)))
const { targetBlocks } = useTargetGroups(groupBy, towerCoordsSet, () => scopedTargets.value)

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
  if (info) {
    patch.villageId = info.village.id
    if (info.player) { patch.enemyPlayer = info.player.name; patch.enemyAllyTag = info.ally?.tag ?? '' }
  }
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

// Add empty — привязываем к выбранной волне.
function addEmptyTarget(): void {
  const now = new Date()
  now.setSeconds(0); now.setMilliseconds(0)
  const t = planStore.addEmptyTarget(now)
  if (planStore.planWaves.length > 1 && selectedWaveId.value) {
    planStore.updateTarget(t.id, { waveId: selectedWaveId.value })
  }
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

function addTargetsFromParsed(entries: ParsedTarget[], arrivalTime: Date, waveId?: string): { added: number; skipped: number } {
  let added = 0; let skipped = 0
  // Дедуп пер-волну: одни коры в одной волне — раз, в разных волнах — можно.
  const existing = new Set(planStore.targets.filter(t => t.waveId === waveId).map(t => t.coords).filter(Boolean))
  for (const e of entries) {
    if (existing.has(e.coords)) { skipped++; continue }
    const info = enemyStore.lookupCoords(e.coords)
    const opts: Record<string, unknown> = {}
    if (waveId) opts.waveId = waveId
    if (info) {
      opts.villageId = info.village.id
      if (info.player) { opts.enemyPlayer = info.player.name; opts.enemyAllyTag = info.ally?.tag ?? '' }
    }
    if (planStore.addTarget(e.coords, arrivalTime, opts)) { added++; existing.add(e.coords) }
    else skipped++
  }
  return { added, skipped }
}

function doBulkAdd(): void {
  bulkError.value = ''
  const entries = parseTargetsFromText(bulkText.value)
  if (!entries.length) { bulkError.value = 'Не найдено координат. Формат: 500|500 или 500|500,15 (уровень башни)'; return }
  const arrivalTime = new Date(bulkDatetime.value)
  if (isNaN(arrivalTime.getTime())) { bulkError.value = 'Некорректная дата'; return }
  const { added, skipped } = addTargetsFromParsed(entries, arrivalTime, (planStore.planWaves.length > 1 ? selectedWaveId.value : null) ?? undefined)
  bulkText.value = ''
  bulkOpen.value = false
  if (added) open.value = false   // auto-collapse the filled list
  if (skipped) bulkError.value = `Добавлено ${added}, пропущено ${skipped} некорректных`
}

function onTargetFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  readTabularFile(file).then((text) => {
    const entries = parseTargetsFromText(text)
    if (!entries.length) { bulkError.value = 'В файле не найдено координат формата 500|500'; return }
    const arrivalTime = new Date(Date.now() + 3600_000)
    const { added } = addTargetsFromParsed(entries, arrivalTime, (planStore.planWaves.length > 1 ? selectedWaveId.value : null) ?? undefined)
    if (added) open.value = false   // auto-collapse the filled list
    bulkError.value = `Из файла добавлено ${added} целей. Отредактируй время прилёта в таблице.`
    if (fileInput.value) fileInput.value.value = ''
  }).catch((err) => { bulkError.value = err instanceof Error ? err.message : String(err) })
}
</script>

<style lang="scss" scoped>
.collapse-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: 0; color: inherit; font-size: 1rem; font-weight: 600; text-align: left;
  &:hover { opacity: 0.85; }
}
.collapse-right { display: flex; align-items: center; gap: 0.5rem; }
.targets-wave-badge {
  margin-left: 0.5rem; font-size: 0.72rem; font-weight: 600;
  color: $green; background: a($green, 0.12); border: 1px solid a($green, 0.3);
  border-radius: 999px; padding: 0.05rem 0.5rem; white-space: nowrap;
}
.collapse-icon  { font-size: 0.75rem; color: $text-faint; }

.targets-table td { vertical-align: middle; }

.group-sep-row td {
  background: #0d2a50;
  padding: 0.3rem 0.75rem;
  border-top: 2px solid $border;
}
.target-group-player { font-weight: 700; color: $text; font-size: 0.85rem; margin-right: 0.4rem; }
.target-group-ally   { color: $orange; font-size: 0.78rem; margin-right: 0.4rem; }
.target-group-count  { color: $text-faint; font-size: 0.75rem; float: right; }

/* Блок волны — заголовок + вставка полной шириной */
.wave-block-row td {
  background: #0c2546;
  border-top: 3px solid a($green, 0.55);
  padding: 0.55rem 0.7rem;
}
.wave-block-row--none td { border-top-color: a($orange, 0.5); background: a($orange, 0.05); }
.wave-block-head { display: flex; align-items: center; gap: 0.5rem; }
.wave-ordinal {
  font-weight: 700; font-size: 0.72rem; letter-spacing: 0.02em; flex-shrink: 0;
  color: $green; background: a($green, 0.12);
  border: 1px solid a($green, 0.35); border-radius: 999px;
  padding: 0.05rem 0.5rem; cursor: default;
}
.wave-block-name { font-weight: 700; font-size: 0.9rem; color: $text; }
.wave-block-count { margin-left: auto; font-size: 0.78rem; color: $text-dim; font-variant-numeric: tabular-nums; }
.wave-block-insert { display: flex; gap: 0.5rem; align-items: stretch; margin-top: 0.5rem; }
.wave-insert-area {
  flex: 1; min-width: 0; resize: vertical; font-family: monospace; font-size: 0.82rem;
  min-height: 2.6rem; line-height: 1.4;
}
.wave-insert-btn { white-space: nowrap; align-self: stretch; }
.wave-block-hint { margin-top: 0.4rem; font-size: 0.78rem; color: $orange; }

.row-has-tower  { background: a($orange, 0.07) !important; border-left: 2px solid a($orange, 0.5); }
.row-uncovered  { background: a($accent, 0.08) !important; border-left: 2px solid a($accent, 0.5); opacity: 0.7; }
.row-muted      { background: a($text-dim, 0.06) !important; border-left: 2px solid a($text-dim, 0.5); opacity: 0.55; }

.muted-badge {
  display: inline-flex; align-items: center;
  font-size: 0.68rem; font-weight: 600; white-space: nowrap;
  color: $text-dim; background: a($text-dim, 0.12);
  border: 1px solid a($text-dim, 0.3); border-radius: 8px;
  padding: 0.05rem 0.4rem; cursor: default;
}

.target-actions-cell { display: flex; gap: 0.3rem; align-items: center; white-space: nowrap; }
.mute-toggle-btn {
  background: a($text-dim, 0.12); color: $text-dim; border: 1px solid a($text-dim, 0.3);
  &:hover { background: a($text-dim, 0.22); }
  &--on { background: a($green, 0.16); color: $green; border-color: a($green, 0.45); &:hover { background: a($green, 0.26); } }
}

.coords-cell  { display: flex; align-items: center; gap: 0.4rem; }
.tower-badge  { display: inline-flex; align-items: center; gap: 2px; font-size: 0.72rem; color: $orange; white-space: nowrap; cursor: default; }
.tower-icon   { width: 14px; height: 14px; image-rendering: pixelated; }
.uncovered-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  color: $accent;
  cursor: default;
  line-height: 1;
}
</style>
