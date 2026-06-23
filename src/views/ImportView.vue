<template>
  <div class="import-view">
    <h1>Імпорт CSV</h1>

    <!-- Drop zone -->
    <div
      class="drop-zone"
      :class="{ 'drag-over': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="triggerFileInput"
    >
      <div class="drop-icon">📂</div>
      <p>Перетягніть CSV файл сюди або натисніть для вибору</p>
      <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden-input" @change="onFileChange" />
    </div>

    <!-- Paste area -->
    <section class="panel">
      <h2>Або вставте CSV-текст</h2>
      <textarea
        v-model="csvText"
        class="csv-textarea"
        placeholder="Вставте CSV тут..."
        rows="6"
      ></textarea>
      <div class="btn-row">
        <button class="btn btn-primary" @click="doParseText">Парсити</button>
        <button class="btn btn-secondary" @click="clearAll">Очистити</button>
      </div>
    </section>

    <!-- Error -->
    <div v-if="error" class="status-msg status-err">{{ error }}</div>

    <!-- Stats -->
    <section v-if="statsVisible" class="panel">
      <h2>Статистика</h2>
      <div class="stats-grid">
        <div class="stat-card stat-card--blue">
          <span class="stat-num">{{ villagesStore.villages.length }}</span>
          <span class="stat-label">Сел</span>
        </div>
        <div class="stat-card stat-card--blue">
          <span class="stat-num">{{ villagesStore.playerCount }}</span>
          <span class="stat-label">Гравців</span>
        </div>
        <div class="stat-card stat-card--red">
          <span class="stat-num">{{ totals.fullOff }}</span>
          <span class="stat-label">Фулл офф</span>
        </div>
        <div class="stat-card stat-card--orange">
          <span class="stat-num">{{ totals.halfOff }}</span>
          <span class="stat-label">Пів-офф</span>
        </div>
        <div class="stat-card stat-card--yellow">
          <span class="stat-num">{{ totals.smallOff }}</span>
          <span class="stat-label">Міні офф</span>
        </div>
        <div class="stat-card stat-card--purple">
          <span class="stat-num">{{ totals.snobs }}</span>
          <span class="stat-label">Дворів</span>
        </div>
        <div class="stat-card stat-card--teal">
          <span class="stat-num">{{ totals.trains }}</span>
          <span class="stat-label">Паравозів</span>
        </div>
        <div class="stat-card stat-card--gold">
          <span class="stat-num">{{ totals.knights }}</span>
          <span class="stat-label">Паладинів</span>
        </div>
      </div>

      <!-- All players -->
      <h3>Гравці</h3>
      <table class="mini-table players-table">
        <thead>
          <tr>
            <th>Гравець</th>
            <th title="Сел з топорами ≥ 5 000">Фулл офф</th>
            <th title="Сел з топорами 2 000–4 999">Пів-офф</th>
            <th title="Сел з топорами 1 000–1 999">Міні офф</th>
            <th title="Дворяни з CSV. Редагується вручну">Двори</th>
            <th title="Паладини з CSV. Редагується вручну">Пал-Офф</th>
            <th title="1 паровоз = 5 дворів (від редагованого значення)">Паравози</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in allPlayers" :key="p.player">
            <td class="player-name">{{ p.player }}</td>
            <td class="num" :class="{ 'num-hi': p.fullOff > 0 }">{{ p.fullOff }}</td>
            <td class="num" :class="{ 'num-mid': p.halfOff > 0 }">{{ p.halfOff }}</td>
            <td class="num">{{ p.smallOff }}</td>
            <td>
              <div class="input-wrap">
                <input
                  type="number"
                  min="0"
                  :class="['inline-input', { 'input-edited': planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv }]"
                  :value="planStore.getPlayerData(p.player).totalNobles"
                  :title="planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv ? `З CSV: ${p.snobsCsv}` : ''"
                  @change="planStore.setPlayerData(p.player, { totalNobles: +($event.target as HTMLInputElement).value })"
                />
                <span
                  v-if="planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv"
                  class="csv-hint"
                  :title="`Відновити значення з CSV (${p.snobsCsv})`"
                  @click="planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv })"
                >{{ p.snobsCsv }}</span>
              </div>
            </td>
            <td>
              <div class="input-wrap">
                <input
                  type="number"
                  min="0"
                  :class="['inline-input', { 'input-edited': planStore.getPlayerData(p.player).offPaladins !== p.knightsCsv }]"
                  :value="planStore.getPlayerData(p.player).offPaladins"
                  :title="planStore.getPlayerData(p.player).offPaladins !== p.knightsCsv ? `З CSV: ${p.knightsCsv}` : ''"
                  @change="planStore.setPlayerData(p.player, { offPaladins: +($event.target as HTMLInputElement).value })"
                />
                <span
                  v-if="planStore.getPlayerData(p.player).offPaladins !== p.knightsCsv"
                  class="csv-hint"
                  :title="`Відновити значення з CSV (${p.knightsCsv})`"
                  @click="planStore.setPlayerData(p.player, { offPaladins: p.knightsCsv })"
                >{{ p.knightsCsv }}</span>
              </div>
            </td>
            <td class="num num-trains">
              {{ Math.floor(planStore.getPlayerData(p.player).totalNobles / 5) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- All villages (collapsible) -->
    <section v-if="statsVisible" class="panel">
      <button class="collapse-toggle" @click="villagesOpen = !villagesOpen">
        <span>Всі села ({{ villagesStore.villages.length }})</span>
        <span class="collapse-icon">{{ villagesOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="villagesOpen" class="preview-wrap mt">
        <table class="mini-table">
          <thead>
            <tr>
              <th>Гравець</th>
              <th>Координати</th>
              <th>Очки</th>
              <th>Копья</th>
              <th>Мечи</th>
              <th>Топоры</th>
              <th>Лазы</th>
              <th>ЛК</th>
              <th>ТК</th>
              <th>Тараны</th>
              <th>Каты</th>
              <th>Пал</th>
              <th>Двор</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in villagesStore.villages" :key="i">
              <td>{{ v.player }}</td>
              <td>{{ v.coords }}</td>
              <td>{{ v.points }}</td>
              <td>{{ v.troops.spear }}</td>
              <td>{{ v.troops.sword }}</td>
              <td>{{ v.troops.axe }}</td>
              <td>{{ v.troops.spy }}</td>
              <td>{{ v.troops.light }}</td>
              <td>{{ v.troops.heavy }}</td>
              <td>{{ v.troops.ram }}</td>
              <td>{{ v.troops.catapult }}</td>
              <td>{{ v.troops.knight }}</td>
              <td>{{ v.troops.snob }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVillagesStore } from '@/stores/villagesStore'
import { usePlanStore } from '@/stores/planStore'

const villagesStore = useVillagesStore()
const planStore = usePlanStore()

const isDragging = ref(false)
const csvText = ref('')
const error = ref('')
const statsVisible = ref(villagesStore.villages.length > 0)
const villagesOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

interface PlayerStat {
  player: string
  fullOff: number    // villages with axe >= 5000
  halfOff: number    // villages with 2000 <= axe < 5000
  smallOff: number   // villages with 1000 <= axe < 2000
  snobsCsv: number   // total snobs from CSV
  knightsCsv: number // total paladins from CSV
}

const totals = computed(() => {
  let fullOff = 0, halfOff = 0, smallOff = 0, snobs = 0, knights = 0
  for (const v of villagesStore.villages) {
    const axe = v.troops.axe
    if (axe >= 5000)      fullOff++
    else if (axe >= 2000) halfOff++
    else if (axe >= 1000) smallOff++
    snobs   += v.troops.snob
    knights += v.troops.knight
  }
  const snobsEdited = allPlayers.value.reduce(
    (sum, p) => sum + planStore.getPlayerData(p.player).totalNobles, 0
  )
  const trains = allPlayers.value.reduce(
    (sum, p) => sum + Math.floor(planStore.getPlayerData(p.player).totalNobles / 5), 0
  )
  return { fullOff, halfOff, smallOff, snobs: snobsEdited, knights, trains }
})

const allPlayers = computed<PlayerStat[]>(() => {
  const map = new Map<string, PlayerStat>()
  for (const v of villagesStore.villages) {
    let s = map.get(v.player)
    if (!s) {
      s = { player: v.player, fullOff: 0, halfOff: 0, smallOff: 0, snobsCsv: 0, knightsCsv: 0 }
      map.set(v.player, s)
    }
    const axe = v.troops.axe
    if (axe >= 5000)       s.fullOff++
    else if (axe >= 2000)  s.halfOff++
    else if (axe >= 1000)  s.smallOff++
    s.snobsCsv += v.troops.snob
    s.knightsCsv += v.troops.knight
  }
  return [...map.values()].sort((a, b) => b.fullOff - a.fullOff)
})

// On mount: fill only players missing from playerData (preserves manual edits across sessions)
function prefillMissing() {
  for (const p of allPlayers.value) {
    if (!planStore.playerDataMap.get(p.player)) {
      planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv, offPaladins: p.knightsCsv })
    }
  }
}

// On fresh CSV parse: fill all players from CSV (overrides previous data for this import)
function prefillAll() {
  for (const p of allPlayers.value) {
    planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv, offPaladins: p.knightsCsv })
  }
}

onMounted(prefillMissing)

function triggerFileInput() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) readFile(file)
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) readFile(file)
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    csvText.value = text
    parseCsv(text)
  }
  reader.readAsText(file, 'utf-8')
}

function doParseText() {
  if (!csvText.value.trim()) {
    error.value = 'CSV порожній'
    return
  }
  parseCsv(csvText.value)
}

function parseCsv(text: string) {
  error.value = ''
  try {
    const result = villagesStore.parseCSV(text)
    statsVisible.value = true
    if (result.count === 0) {
      error.value = 'Не знайдено жодного рядка. Перевірте формат CSV.'
      return
    }
    prefillAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    statsVisible.value = false
  }
}

function clearAll() {
  csvText.value = ''
  error.value = ''
  statsVisible.value = false
  villagesStore.clear()
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<style scoped>
.import-view {
  max-width: 1100px;
  margin: 0 auto;
}

h1 {
  color: #e94560;
  margin-bottom: 1.5rem;
}

h2 {
  color: #c8c8d4;
  font-size: 1.1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #0f3460;
  padding-bottom: 0.5rem;
}

h3 {
  color: #c8c8d4;
  font-size: 0.95rem;
  margin: 1rem 0 0.5rem;
}

.drop-zone {
  border: 2px dashed #0f3460;
  border-radius: 10px;
  padding: 3rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 1.5rem;
  background: #1a1a2e;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: #e94560;
  background: rgba(233, 69, 96, 0.05);
}

.drop-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.drop-zone p {
  color: #a0a0b0;
  margin: 0;
}

.hidden-input {
  display: none;
}

.panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.csv-textarea {
  width: 100%;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 0.6rem;
  font-family: monospace;
  font-size: 0.8rem;
  resize: vertical;
  box-sizing: border-box;
}

.csv-textarea:focus {
  outline: none;
  border-color: #e94560;
}

.btn-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary {
  background: #e94560;
  color: #fff;
}

.btn-primary:hover {
  opacity: 0.85;
}

.btn-secondary {
  background: #0f3460;
  color: #e0e0e0;
}

.btn-secondary:hover {
  opacity: 0.85;
}

.status-msg {
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.status-err {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}

.stats-grid {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.stat-card {
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 72px;
}

.stat-num {
  font-size: 1.35rem;
  font-weight: 700;
  color: #e94560;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.72rem;
  color: #a0a0b0;
  white-space: nowrap;
}

.stat-card--blue .stat-num   { color: #5b9bd5; }
.stat-card--red .stat-num    { color: #e94560; }
.stat-card--orange .stat-num { color: #b85c4a; }
.stat-card--yellow .stat-num { color: #6abf7b; }
.stat-card--purple .stat-num { color: #a78bfa; }
.stat-card--teal .stat-num   { color: #4ecca3; }
.stat-card--gold .stat-num   { color: #f0c040; }

.preview-wrap {
  overflow-x: auto;
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.mini-table th,
.mini-table td {
  padding: 0.4rem 0.6rem;
  border: 1px solid #0f3460;
  text-align: left;
  white-space: nowrap;
}

.mini-table th {
  background: #0f3460;
  color: #e0e0e0;
}

.mini-table tbody tr:nth-child(even) {
  background: rgba(15, 52, 96, 0.2);
}

.players-table .player-name {
  white-space: nowrap;
}

.players-table .num {
  text-align: center;
  color: #8888a8;
}

.players-table .num-hi {
  color: #e94560;
  font-weight: 700;
}

.players-table .num-mid {
  color: #f5a623;
  font-weight: 600;
}

.players-table .num-trains {
  color: #4ecca3;
  font-weight: 700;
}

.input-wrap {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.input-edited {
  border-color: #f5a623 !important;
  color: #f5a623;
}

.csv-hint {
  font-size: 0.7rem;
  color: #6a6a8a;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: underline dotted;
  transition: color 0.15s;
}

.csv-hint:hover {
  color: #e94560;
}

.inline-input {
  width: 60px;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  color: #e0e0e0;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  text-align: center;
}

.inline-input:focus {
  outline: none;
  border-color: #e94560;
}

.collapse-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  color: #c8c8d4;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: #e94560;
}

.collapse-icon {
  font-size: 0.75rem;
  color: #6a6a8a;
}

.mt {
  margin-top: 1rem;
}
</style>
