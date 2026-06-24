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
        <textarea v-model="palOffText" class="csv-textarea" rows="6" placeholder="Онмайн,5&#10;AnotherPlayer,3"></textarea>
        <div v-if="palOffError" class="status-msg status-err">{{ palOffError }}</div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="applyPalOffImport">Застосувати</button>
          <button class="btn btn-secondary" @click="palOffText = ''; palOffError = ''; palOffImportApplied = 0">Очистити</button>
        </div>
        <table v-if="planStore.playerData.some(pd => pd.offPaladins > 0)" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Гравець</th><th>Пал-оффів</th></tr></thead>
          <tbody>
            <tr v-for="pd in planStore.playerData.filter(pd => pd.offPaladins > 0)" :key="pd.player">
              <td>{{ pd.player }}</td>
              <td class="num-hi" style="text-align:center">{{ pd.offPaladins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Nobles import -->
    <section class="panel">
      <button class="collapse-toggle" @click="noblesImportOpen = !noblesImportOpen">
        <span>
          Імпорт дворів
          <span v-if="noblesImportApplied" class="tower-count-badge">{{ noblesImportApplied }} гравців</span>
        </span>
        <span class="collapse-icon">{{ noblesImportOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="noblesImportOpen" class="mt">
        <p class="drop-format" style="margin-bottom:0.5rem">
          Формат: <code>Гравець,кількість</code> — дані зі збору інфи по дворах
        </p>
        <textarea v-model="noblesText" class="csv-textarea" rows="6" placeholder="Онмайн,12&#10;AnotherPlayer,8"></textarea>
        <div v-if="noblesError" class="status-msg status-err">{{ noblesError }}</div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="applyNoblesImport">Застосувати</button>
          <button class="btn btn-secondary" @click="noblesText = ''; noblesError = ''; noblesImportApplied = 0">Очистити</button>
        </div>
        <table v-if="planStore.playerData.some(pd => pd.totalNobles > 0)" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Гравець</th><th>Дворів</th><th>Паравозів</th></tr></thead>
          <tbody>
            <tr v-for="pd in planStore.playerData.filter(pd => pd.totalNobles > 0)" :key="pd.player">
              <td>{{ pd.player }}</td>
              <td class="num-hi" style="text-align:center">{{ pd.totalNobles }}</td>
              <td class="num-trains" style="text-align:center">{{ Math.floor(pd.totalNobles / 5) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ImportStats v-if="statsVisible" ref="importStatsRef" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useVillagesStore } from '@/stores/villagesStore'
import { usePlanStore } from '@/stores/planStore'
import ImportStats from '@/components/ImportStats.vue'

const villagesStore = useVillagesStore()
const planStore = usePlanStore()

const importStatsRef = ref<InstanceType<typeof ImportStats> | null>(null)

const isDragging = ref(false)
const csvText = ref('')
const error = ref('')
const statsVisible = ref(villagesStore.villages.length > 0)
const fileInput = ref<HTMLInputElement | null>(null)

const palOffImportOpen = ref(false)
const palOffText = ref('')
const palOffError = ref('')
const palOffImportApplied = ref(0)

const noblesImportOpen = ref(false)
const noblesText = ref('')
const noblesError = ref('')
const noblesImportApplied = ref(0)

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

function applyNoblesImport(): void {
  noblesError.value = ''
  const lines = noblesText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { noblesError.value = 'Введіть хоча б один рядок'; return }
  let applied = 0
  for (const line of lines) {
    const comma = line.lastIndexOf(',')
    if (comma === -1) { noblesError.value = `Невірний формат: "${line}"`; return }
    const player = line.slice(0, comma).trim()
    const count = parseInt(line.slice(comma + 1).trim(), 10)
    if (!player || isNaN(count) || count < 0) { noblesError.value = `Невірний рядок: "${line}"`; return }
    planStore.setPlayerData(player, { totalNobles: count })
    applied++
  }
  noblesImportApplied.value = applied
}

function triggerFileInput() { fileInput.value?.click() }

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
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
    csvText.value = e.target?.result as string
    parseCsv(csvText.value)
  }
  reader.readAsText(file, 'utf-8')
}

function doParseText() {
  if (!csvText.value.trim()) { error.value = 'CSV порожній'; return }
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
    // prefillAll runs after DOM update so ImportStats is mounted
    setTimeout(() => importStatsRef.value?.prefillAll(), 0)
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

.btn-row  { margin-top: 0.75rem; }
.num-hi   { color: $accent; font-weight: 700; }
.num-trains { color: $green; font-weight: 700; }
</style>
