<template>
  <section class="panel cat-mass-panel">
    <Transition name="cat-gen-overlay">
      <div v-if="isGenerating" class="cat-gen-overlay">
        <div class="cat-gen-box">
          <div class="cat-gen-spinner"></div>
          <span class="cat-gen-text">Генерация кат волны...</span>
        </div>
      </div>
    </Transition>

    <div class="section-header">
      <h2>Кат волна</h2>
      <div class="header-stats">
        <span class="stat-item">Свободных офов: <strong>{{ stats.availableOffs }}</strong></span>
        <span class="stat-sep">·</span>
        <span class="stat-item">Кат отрядов: <strong>{{ stats.availableCats }}</strong></span>
        <template v-if="stats.isGenerated">
          <span class="stat-sep">·</span>
          <span class="stat-item stat-result">Назначено: <strong>{{ stats.catMassOffs }}</strong> офов, <strong>{{ stats.catMassCats }}</strong> кат</span>
        </template>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-primary btn-sm"
          :disabled="planStore.catTargets.length === 0 || !mainMassGenerated || isGenerating"
          :title="!mainMassGenerated ? 'Сначала сгенерируйте основной масс' : ''"
          @click="doGenerateCatMass()"
        >Сгенерировать</button>
        <button
          v-if="stats.isGenerated"
          class="btn btn-danger btn-sm"
          @click="planStore.clearCatMass()"
        >Сбросить волну</button>
      </div>
    </div>

    <!-- Building priority queue -->
    <div class="queue-section">
      <div class="queue-header">
        <span class="queue-label">Здания под снос</span>
        <span class="queue-hint">по приоритету — первое в списке сносится первым</span>
      </div>

      <div class="queue-list" v-if="planStore.catMassBuildingQueue.length > 0">
        <div v-for="(entry, i) in planStore.catMassBuildingQueue" :key="entry.building" class="queue-item">
          <span class="queue-priority">{{ i + 1 }}</span>
          <span class="queue-name">{{ LABELS[entry.building] }}</span>
          <span class="queue-cats">≈{{ catsNeeded(entry.building, entry.targetLevel) }} кат</span>
          <div class="queue-target-level">
            <span class="queue-target-label">до ур.</span>
            <input
              type="number" min="0" :max="MAX_LEVEL[entry.building]"
              class="input level-input"
              :value="entry.targetLevel"
              :title="`Снести до уровня (0 = полный снос, макс. ${MAX_LEVEL[entry.building]})`"
              @change="planStore.setCatMassBuildingTarget(entry.building, +($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="queue-item-actions">
            <button class="icon-btn" :disabled="i === 0" @click="planStore.moveCatMassBuilding(i, i - 1)" title="Выше">↑</button>
            <button class="icon-btn" :disabled="i === planStore.catMassBuildingQueue.length - 1" @click="planStore.moveCatMassBuilding(i, i + 1)" title="Ниже">↓</button>
            <button class="icon-btn icon-btn-danger" @click="planStore.removeCatMassBuilding(entry.building)" title="Убрать">✕</button>
          </div>
        </div>
      </div>
      <div v-else class="queue-empty">
        Используется дефолтная очередь:
        <span class="queue-default-list">
          {{ CAT_MASS_DEFAULT_QUEUE.map(b => LABELS[b]).join(' → ') }}
        </span>
        <br>
        <span class="queue-hint">Если цель — деревня с башней, башня автоматически идёт первой.</span>
      </div>

      <div class="queue-add-row">
        <select v-model="buildingToAdd" class="input queue-select">
          <option value="">— добавить здание —</option>
          <option
            v-for="b in availableBuildings"
            :key="b"
            :value="b"
          >{{ LABELS[b] }} (макс. ур. {{ MAX_LEVEL[b] }}, ≈{{ catsNeeded(b, 0) }} кат)</option>
        </select>
        <button class="btn btn-secondary btn-sm" :disabled="!buildingToAdd" @click="addBuilding">+ Добавить</button>
      </div>

      <div v-if="planStore.catMassBuildingQueue.length > 0" class="queue-total">
        Итого кат на цель: <strong>≈{{ totalCatsNeeded }}</strong>
      </div>
    </div>

    <p class="off-hint">Офф подбирается по приоритету: мид → мини → фулл (фуллы сохраняются для основного масса)</p>

    <!-- Add targets bar -->
    <div class="add-bar">
      <button class="btn btn-primary btn-sm" @click="addEmpty">+ Добавить цель</button>
      <button class="btn btn-secondary btn-sm" @click="bulkOpen = !bulkOpen">
        {{ bulkOpen ? '▲' : '▼' }} Вставить несколько
      </button>
      <button
        v-if="planStore.catTargets.length > 0"
        class="btn btn-danger btn-sm"
        @click="planStore.clearCatTargets()"
      >Очистить цели</button>
    </div>

    <div v-if="bulkOpen" class="bulk-panel">
      <p class="bulk-hint">Координаты — по одной в строке: <code>500|500</code></p>
      <div class="bulk-row">
        <textarea v-model="bulkText" class="bulk-textarea" rows="4" placeholder="500|500&#10;501|501" />
        <div class="bulk-time">
          <label>
            Тайминг
            <input v-model="bulkDatetime" type="datetime-local" class="dt-input" step="0.001" />
          </label>
          <button class="btn btn-primary btn-sm" @click="doBulkAdd">Добавить</button>
        </div>
      </div>
      <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
    </div>

    <!-- Cat targets table -->
    <div v-if="planStore.catTargets.length > 0" class="table-wrap">
      <table class="mini-table">
        <thead><tr>
          <th>Координаты</th>
          <th>Игрок</th>
          <th>Племя</th>
          <th>Тайминг</th>
          <th></th>
        </tr></thead>
        <tbody>
          <tr v-for="t in planStore.catTargets" :key="t.id">
            <td>
              <input
                type="text" class="input" style="width:90px" placeholder="500|500"
                :value="t.coords"
                @input="filterCoordsInput($event)"
                @change="onCoordsChange(t.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="td-player">
              <span v-if="enemyInfo(t.coords)?.player" class="player-name">
                {{ enemyInfo(t.coords)!.player!.name }}
              </span>
              <span v-else class="td-empty">—</span>
            </td>
            <td class="td-tribe">
              <span v-if="enemyInfo(t.coords)?.ally" class="tribe-tag">
                {{ enemyInfo(t.coords)!.ally!.tag }}
              </span>
              <span v-else class="td-empty">—</span>
            </td>
            <td>
              <input
                type="datetime-local" class="input dt-input"
                step="0.001"
                :value="toDatetimeLocal(t.arrivalTime)"
                @change="onTimeChange(t.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <button class="btn btn-danger btn-sm" @click="planStore.removeCatTarget(t.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="empty-hint">Нет кат целей — добавьте координаты выше.</div>

  </section>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { CAT_TARGET_LABELS as LABELS, BUILDING_MAX_LEVEL as MAX_LEVEL, catsToReachLevel, type CatTarget } from '@/stores/presetsStore'
import { CAT_MASS_DEFAULT_QUEUE } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()

const isGenerating = ref(false)

async function doGenerateCatMass() {
  if (isGenerating.value) return
  isGenerating.value = true
  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, 30))
  planStore.generateCatMass()
  isGenerating.value = false
}

const stats = computed(() => planStore.catMassStats)

function enemyInfo(coords: string) {
  return enemyStore.lookupCoords(coords)
}
const mainMassGenerated = computed(() =>
  planStore.attacks.some(a => !a.catMass)
)

// ── Building queue ─────────────────────────────────────────────────────────────
const buildingToAdd = ref<CatTarget | ''>('')

const availableBuildings = computed(() =>
  (Object.keys(LABELS) as CatTarget[]).filter(
    b => !planStore.catMassBuildingQueue.some(e => e.building === b)
  )
)

function catsNeeded(b: CatTarget, targetLevel = 0): number {
  return catsToReachLevel(b, targetLevel)
}

const totalCatsNeeded = computed(() =>
  planStore.catMassBuildingQueue.reduce((s, e) => s + catsToReachLevel(e.building, e.targetLevel), 0)
)

function addBuilding() {
  if (!buildingToAdd.value) return
  planStore.addCatMassBuilding(buildingToAdd.value)
  buildingToAdd.value = ''
}

// ── Bulk add ──────────────────────────────────────────────────────────────────
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkError = ref('')

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
}

function defaultBulkDatetime(): string {
  const t = planStore.targets[0]?.arrivalTime
  if (t) return toDatetimeLocal(t)
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return toDatetimeLocal(d)
}

const bulkDatetime = computed({
  get: () => _bulkDatetime.value || defaultBulkDatetime(),
  set: (v) => { _bulkDatetime.value = v },
})
const _bulkDatetime = ref('')

function doBulkAdd() {
  bulkError.value = ''
  const dt = bulkDatetime.value
  if (!dt) { bulkError.value = 'Укажите время прилёта'; return }
  const arrivalTime = new Date(dt)
  if (isNaN(arrivalTime.getTime())) { bulkError.value = 'Неверный формат времени'; return }

  const coords = bulkText.value
    .split(/[\n,; ]+/)
    .map(s => s.trim())
    .filter(s => /^\d+\|\d+$/.test(s))

  if (coords.length === 0) { bulkError.value = 'Нет координат в формате 500|500'; return }

  for (const c of coords) planStore.addCatTarget(c, arrivalTime)
  bulkText.value = ''
  bulkOpen.value = false
}

// ── Add empty ─────────────────────────────────────────────────────────────────
function addEmpty() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  planStore.addEmptyCatTarget(d)
}

// ── Inline edit ───────────────────────────────────────────────────────────────
function filterCoordsInput(e: Event) {
  const input = e.target as HTMLInputElement
  const cleaned = input.value.replace(/[^\d|]/g, '')
  if (cleaned !== input.value) {
    input.value = cleaned
  }
}

function onCoordsChange(id: string, raw: string) {
  const coords = raw.trim()
  if (!/^\d+\|\d+$/.test(coords) && coords !== '') return
  planStore.updateCatTarget(id, { coords })
}

function onTimeChange(id: string, raw: string) {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return
  planStore.updateCatTarget(id, { arrivalTime: d })
}
</script>

<style lang="scss" scoped>
.cat-mass-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: relative;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  h2 { margin: 0; flex-shrink: 0; }
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  font-size: 0.82rem;
  color: $text-dim;
  flex-wrap: wrap;
}

.header-actions { display: flex; gap: 0.5rem; margin-left: auto; flex-shrink: 0; }

// ── Building queue ─────────────────────────────────────────────────────────────
.queue-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.8rem;
  background: a($border, 0.06);
  border: 1px solid a($border, 0.4);
  border-radius: 6px;
}

.queue-header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.queue-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: $text;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.queue-hint {
  font-size: 0.75rem;
  color: $text-faint;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  background: a($border, 0.06);
  border: 1px solid a($border, 0.3);
}

.queue-priority {
  font-size: 0.72rem;
  color: $text-faint;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.queue-name {
  font-size: 0.83rem;
  color: $text;
  flex: 1;
}

.queue-cats {
  font-size: 0.75rem;
  color: $text-dim;
  white-space: nowrap;
}

.queue-target-level {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}

.queue-target-label {
  font-size: 0.72rem;
  color: $text-faint;
  white-space: nowrap;
}

.level-input {
  width: 46px;
  padding: 0.1rem 0.25rem;
  font-size: 0.8rem;
  text-align: center;
  height: 22px;
}

.queue-item-actions {
  display: flex;
  gap: 0.2rem;
}

.icon-btn {
  background: none;
  border: 1px solid $border;
  border-radius: 3px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem 0.35rem;
  line-height: 1.4;
  transition: color 0.12s, border-color 0.12s;
  &:hover:not(:disabled) { color: $text; border-color: $text; }
  &:disabled { opacity: 0.35; cursor: default; }
}

.icon-btn-danger:hover:not(:disabled) { color: #e94560; border-color: #e94560; }

.queue-empty {
  font-size: 0.8rem;
  color: $text-faint;
  line-height: 1.6;
}

.queue-default-list {
  color: $text-dim;
  font-style: normal;
}

.queue-add-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.queue-select {
  font-size: 0.8rem;
  padding: 0.18rem 0.4rem;
  height: 28px;
  flex: 1;
  min-width: 200px;
}

.queue-total {
  font-size: 0.82rem;
  color: $text-dim;
  strong { color: $text; }
}

.cat-desc {
  font-size: 0.82rem;
  color: $text-faint;
  line-height: 1.4;
}

.off-hint {
  margin: 0;
  font-size: 0.75rem;
  color: $text-faint;
  font-style: italic;
}

.add-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.bulk-panel {
  padding: 0.75rem;
  background: a($border, 0.08);
  border: 1px solid a($border, 0.4);
  border-radius: 6px;
}

.bulk-hint {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: $text-faint;
}

.bulk-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.bulk-textarea {
  flex: 1;
  min-width: 160px;
  font-family: monospace;
  font-size: 0.85rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid $border;
  border-radius: 4px;
  background: $bg-page;
  color: $text;
  resize: vertical;
  &:focus { outline: none; border-color: $accent; }
}

.bulk-time {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  label {
    font-size: 0.82rem;
    color: $text-dim;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
}

.table-wrap { overflow-x: auto; }

.player-name {
  color: #4ecca3;
  font-size: 0.83rem;
  white-space: nowrap;
}

.tribe-tag {
  font-size: 0.8rem;
  color: $text-dim;
  white-space: nowrap;
}

.td-empty { color: $text-faint; font-size: 0.8rem; }
.td-player, .td-tribe { white-space: nowrap; }

.dt-input {
  padding: 0.18rem 0.35rem;
  font-size: 0.82rem;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  width: 188px;
  &:focus { outline: none; border-color: $accent; }
}

.empty-hint {
  font-size: 0.85rem;
  color: $text-faint;
  font-style: italic;
}

.stat-sep  { color: $text-faint; }
.stat-result { color: #4ecca3; }

.status-msg { font-size: 0.85rem; margin-top: 0.4rem; }
.status-err { color: #e94560; }

// ── Generate overlay ────────────────────────────────────────────────────────
.cat-gen-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
  border-radius: inherit;
  backdrop-filter: blur(2px);
}

.cat-gen-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  background: $bg-panel;
  border-radius: 14px;
  padding: 2rem 3rem;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

@keyframes cat-gen-spin { to { transform: rotate(360deg) } }
.cat-gen-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.12);
  border-top-color: #89b4fa;
  border-radius: 50%;
  animation: cat-gen-spin 0.75s linear infinite;
}

.cat-gen-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255,255,255,0.75);
}

.cat-gen-overlay-enter-active,
.cat-gen-overlay-leave-active { transition: opacity 0.15s ease }
.cat-gen-overlay-enter-from,
.cat-gen-overlay-leave-to   { opacity: 0 }
</style>
