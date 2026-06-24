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
      <p class="drop-format">Формат: <code>Игрок,Координаты,Очки,Копья,Мечи,Топоры,Лазы,ЛК,ТК,Тараны,Каты,Пал,Двор</code></p>
      <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden-input" @change="onFileChange" />
    </div>

    <!-- Paste area -->
    <section class="panel">
      <h2>Або вставте CSV-текст</h2>
      <textarea
        v-model="csvText"
        class="csv-textarea"
        placeholder="Игрок,Координаты,Очки,Копья,Мечи,Топоры,Лазы,ЛК,ТК,Тараны,Каты,Пал,Двор&#10;8Taras8,494|564,9289,13096,3156,0,581,0,0,4,0,0,1&#10;SomePlayer,510|549,4120,0,0,6200,0,0,0,120,0,1,3"
        rows="6"
      ></textarea>
      <div class="btn-row">
        <button class="btn btn-primary" @click="doParseText">Парсити</button>
        <button class="btn btn-secondary" @click="clearAll">Очистити</button>
      </div>
    </section>

    <!-- Error -->
    <div v-if="error" class="status-msg status-err">{{ error }}</div>

    <!-- Pal-off import -->
    <section class="panel">
      <button class="collapse-toggle" @click="palOffImportOpen = !palOffImportOpen">
        <span>
          Імпорт пал-оффів
          <span v-if="palOffImportApplied" class="tower-count-badge">{{ palOffImportApplied }} гравців</span>
        </span>
        <span class="collapse-icon">{{ palOffImportOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="palOffImportOpen" class="mt">
        <p class="drop-format" style="margin-bottom:0.5rem">
          Формат: <code>Гравець,кількість</code> — по одному рядку на гравця
        </p>
        <textarea
          v-model="palOffText"
          class="csv-textarea"
          rows="6"
          placeholder="Онмайн,5&#10;AnotherPlayer,3"
        ></textarea>
        <div v-if="palOffError" class="status-msg status-err">{{ palOffError }}</div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="applyPalOffImport">Застосувати</button>
          <button class="btn btn-secondary" @click="palOffText = ''; palOffError = ''; palOffImportApplied = 0">Очистити</button>
        </div>
        <table v-if="planStore.playerData.some(pd => pd.offPaladins > 0)" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Гравець</th><th>Пал-оффів</th></tr></thead>
          <tbody>
            <tr v-for="pd in planStore.playerData.filter(pd => pd.offPaladins > 0)" :key="pd.player">
              <td class="player-name">{{ pd.player }}</td>
              <td class="num num-hi">{{ pd.offPaladins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
          <span class="stat-num">{{ planStore.playerData.reduce((s, pd) => s + pd.offPaladins, 0) }}</span>
          <span class="stat-label">Офф-палів</span>
        </div>
        <div class="stat-card stat-card--teal">
          <span class="stat-num">{{ totals.catapults }}</span>
          <span class="stat-label">Кат</span>
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
            <th title="Катапульти з CSV">Кати</th>
            <th title="Паладини з CSV. Редагується вручну">Пал-Офф</th>
            <th title="Дворяни з CSV. Редагується вручну">Двори</th>
            <th title="1 паровоз = 5 дворів (від редагованого значення)">Паравози</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in allPlayers" :key="p.player">
            <td class="player-name">{{ p.player }}</td>
            <td class="num" :class="{ 'num-hi': p.fullOff > 0 }">{{ p.fullOff }}</td>
            <td class="num" :class="{ 'num-mid': p.halfOff > 0 }">{{ p.halfOff }}</td>
            <td class="num">{{ p.smallOff }}</td>
            <td class="num" :class="{ 'num-hi': p.catapultsCsv > 0 }">{{ p.catapultsCsv }}</td>
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
const palOffImportOpen = ref(false)
const palOffText = ref('')
const palOffError = ref('')
const palOffImportApplied = ref(0)

function applyPalOffImport(): void {
  palOffError.value = ''
  const lines = palOffText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { palOffError.value = 'Введіть хоча б один рядок'; return }
  let applied = 0
  for (const line of lines) {
    const comma = line.lastIndexOf(',')
    if (comma === -1) { palOffError.value = `Невірний формат: "${line}"`; return }
    const player = line.slice(0, comma).trim()
    const count = parseInt(line.slice(comma + 1).trim(), 10)
    if (!player || isNaN(count) || count < 0) { palOffError.value = `Невірний рядок: "${line}"`; return }
    planStore.setPlayerData(player, { offPaladins: count })
    applied++
  }
  palOffImportApplied.value = applied
}

interface PlayerStat {
  player: string
  fullOff: number
  halfOff: number
  smallOff: number
  snobsCsv: number
  knightsCsv: number
  catapultsCsv: number
}

const totals = computed(() => {
  let fullOff = 0, halfOff = 0, smallOff = 0, snobs = 0, catapults = 0
  for (const v of villagesStore.villages) {
    const axe = v.troops.axe
    if (axe >= 5000)      fullOff++
    else if (axe >= 2000) halfOff++
    else if (axe >= 1000) smallOff++
    snobs      += v.troops.snob
    catapults  += v.troops.catapult
  }
  const snobsEdited = allPlayers.value.reduce(
    (sum, p) => sum + planStore.getPlayerData(p.player).totalNobles, 0
  )
  const trains = allPlayers.value.reduce(
    (sum, p) => sum + Math.floor(planStore.getPlayerData(p.player).totalNobles / 5), 0
  )
  return { fullOff, halfOff, smallOff, snobs: snobsEdited, trains, catapults }
})

const allPlayers = computed<PlayerStat[]>(() => {
  const map = new Map<string, PlayerStat>()
  for (const v of villagesStore.villages) {
    let s = map.get(v.player)
    if (!s) {
      s = { player: v.player, fullOff: 0, halfOff: 0, smallOff: 0, snobsCsv: 0, knightsCsv: 0, catapultsCsv: 0 }
      map.set(v.player, s)
    }
    const axe = v.troops.axe
    if (axe >= 5000)       s.fullOff++
    else if (axe >= 2000)  s.halfOff++
    else if (axe >= 1000)  s.smallOff++
    s.snobsCsv += v.troops.snob
    s.knightsCsv += v.troops.knight
    s.catapultsCsv += v.troops.catapult
  }
  return [...map.values()].sort((a, b) => b.fullOff - a.fullOff)
})

// On mount: fill only players missing from playerData (preserves manual edits across sessions)
function prefillMissing() {
  for (const p of allPlayers.value) {
    if (!planStore.playerDataMap.get(p.player)) {
      planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv })
    }
  }
}

// On fresh CSV parse: fill all players from CSV (overrides previous data for this import)
function prefillAll() {
  for (const p of allPlayers.value) {
    planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv })
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

<style lang="scss" scoped>
.import-view {
  max-width: 1100px;
  margin: 0 auto;
}

// Drop zone
.drop-zone {
  border: 2px dashed $border;
  border-radius: 10px;
  padding: 3rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 1.5rem;
  background: $bg-panel;

  &:hover, &.drag-over { border-color: $accent; background: a($accent, 0.05); }

  p { color: $text-dim; margin: 0; }
}

.drop-icon { font-size: 3rem; margin-bottom: 0.5rem; }

.drop-format {
  font-size: 0.72rem;
  margin-top: 0.5rem !important;
  color: #5a5a7a !important;

  code { background: a($border, 0.6); padding: 0.1rem 0.35rem; border-radius: 3px; color: #7a7aaa; font-size: 0.7rem; }
}

// CSV textarea
.csv-textarea {
  width: 100%;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  padding: 0.6rem;
  font-family: monospace;
  font-size: 0.8rem;
  resize: vertical;
  box-sizing: border-box;
  &:focus { outline: none; border-color: $accent; }
}

// btn-row margin override (base layout comes from shared)
.btn-row { margin-top: 0.75rem; }

// Stats
.stats-grid { display: flex; gap: 1.5rem; margin-bottom: 1rem; flex-wrap: wrap; }

.stat-card {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 72px;
}

.stat-num   { font-size: 1.35rem; font-weight: 700; color: $accent; line-height: 1.2; }
.stat-label { font-size: 0.72rem; color: $text-dim; white-space: nowrap; }

.stat-card--blue .stat-num   { color: #5b9bd5; }
.stat-card--red .stat-num    { color: $accent; }
.stat-card--purple .stat-num { color: $purple; }
.stat-card--teal .stat-num   { color: $green; }
.stat-card--gold .stat-num   { color: #f0c040; }
.stat-card--green .stat-num  { color: #6abf7b; }

// Players table
.players-table {
  .player-name { white-space: nowrap; }
  .num        { text-align: center; color: #8888a8; }
  .num-hi     { color: $accent;  font-weight: 700; }
  .num-mid    { color: $orange;  font-weight: 600; }
  .num-trains { color: $green;   font-weight: 700; }
}

// Inline edit
.input-wrap { display: flex; align-items: center; gap: 0.3rem; }

.input-edited { border-color: $orange !important; color: $orange; }

.csv-hint {
  font-size: 0.7rem;
  color: $text-faint;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: underline dotted;
  transition: color 0.15s;
  &:hover { color: $accent; }
}

.inline-input {
  width: 60px;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 3px;
  color: $text;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  text-align: center;
  &:focus { outline: none; border-color: $accent; }
}
</style>
