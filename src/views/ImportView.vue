<template>
  <div class="import-view">
    <div class="import-header">
      <h1>Импорт CSV</h1>
      <button
        v-if="hasAnyData"
        class="btn btn-danger btn-sm"
        title="Удалить все деревни, пал-оффы, дворы и данные ручного ввода"
        @click="clearEverything"
      >✕ Очистить всю инфу по импорту</button>
    </div>

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
      <p>Перетащите CSV файл сюда или нажмите для выбора</p>
      <p class="drop-format">Формат: <code>Игрок,Координаты,Очки,Копья,Мечи,Топоры,Лазы,ЛК,ТК,Тараны,Каты,Пал,Двор</code></p>
      <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden-input" @change="onFileChange" />
    </div>

    <!-- Paste area -->
    <section class="panel">
      <h2>Или вставьте CSV-текст</h2>
      <textarea
        v-model="csvText"
        class="csv-textarea"
        placeholder="Игрок,Координаты,Очки,Копья,Мечи,Топоры,Лазы,ЛК,ТК,Тараны,Каты,Пал,Двор&#10;8Taras8,494|564,9289,13096,3156,0,581,0,0,4,0,0,1&#10;SomePlayer,510|549,4120,0,0,6200,0,0,0,120,0,1,3"
        rows="6"
      ></textarea>
      <div class="btn-row">
        <button class="btn btn-primary" @click="doParseText">Парсить</button>
        <button class="btn btn-secondary" @click="clearAll">Очистить</button>
      </div>
    </section>

    <!-- Error -->
    <div v-if="error" class="status-msg status-err">{{ error }}</div>

    <!-- Manual village entry -->
    <section class="panel">
      <button class="collapse-toggle" @click="manualOpen = !manualOpen">
        <span>
          Ручной ввод деревни
          <span v-if="manualAddedCount" class="tower-count-badge">{{ manualAddedCount }} добавлено</span>
        </span>
        <span class="collapse-icon">{{ manualOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="manualOpen" class="mt">
        <!-- Meta row: player / coords / points -->
        <div class="manual-meta">
          <label class="manual-field manual-field-lg">
            <span class="mf-label">Игрок</span>
            <input v-model="mPlayer" type="text" class="mf-input" placeholder="PlayerName" />
          </label>
          <label class="manual-field">
            <span class="mf-label">Координаты</span>
            <input
              v-model="mCoords" type="text" class="mf-input"
              placeholder="500|500"
              :class="{ 'mf-input-warn': mCoords && !coordsValid }"
            />
          </label>
          <label class="manual-field manual-field-sm">
            <span class="mf-label">Очки</span>
            <input v-model.number="mPoints" type="number" min="0" class="mf-input" />
          </label>
          <div v-if="coordsExisting" class="mf-hint mf-hint-warn">
            Деревня уже существует — будет обновлена
          </div>
        </div>

        <!-- Troop grid -->
        <div class="troop-grid">
          <div class="troop-cell" v-for="f in TROOP_FIELDS" :key="f.key">
            <span class="troop-label">{{ f.label }}</span>
            <input v-model.number="mTroops[f.key]" type="number" min="0" class="troop-input" />
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-primary" @click="addManualVillage">
            {{ coordsExisting ? 'Обновить' : 'Добавить' }}
          </button>
          <button class="btn btn-secondary" @click="resetManualForm">Сбросить</button>
        </div>

        <div v-if="manualMsg" class="status-msg status-ok">{{ manualMsg }}</div>
        <div v-if="manualErr" class="status-msg status-err">{{ manualErr }}</div>

        <!-- Recently added list -->
        <table v-if="manualHistory.length" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Игрок</th><th>Координаты</th><th>Топоры+ЛК</th><th>Тараны</th><th></th></tr></thead>
          <tbody>
            <tr v-for="v in manualHistory" :key="v.coords">
              <td>{{ v.player }}</td>
              <td class="num-hi">{{ v.coords }}</td>
              <td style="text-align:right">{{ v.troops.axe + v.troops.light }}</td>
              <td style="text-align:right">{{ v.troops.ram }}</td>
              <td>
                <button class="btn-remove" @click="removeManual(v.coords)" title="Удалить">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Nobles import -->
    <section class="panel">
      <button class="collapse-toggle" @click="noblesImportOpen = !noblesImportOpen">
        <span>
          Импорт дворов
          <span v-if="noblesImportApplied" class="tower-count-badge">{{ noblesImportApplied }} игроков</span>
        </span>
        <span class="collapse-icon">{{ noblesImportOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="noblesImportOpen" class="mt">
        <p class="drop-format" style="margin-bottom:0.5rem">
          Формат: <code>Игрок,количество</code> — данные из сбора инфы по дворам
        </p>
        <textarea v-model="noblesText" class="csv-textarea" rows="6" placeholder="Онмайн,12&#10;AnotherPlayer,8"></textarea>
        <div v-if="noblesError" class="status-msg status-err">{{ noblesError }}</div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="applyNoblesImport">Применить</button>
          <button class="btn btn-secondary" @click="noblesText = ''; noblesError = ''; noblesImportApplied = 0">Очистить ввод</button>
          <button v-if="planStore.playerData.some(pd => pd.totalNobles > 0)" class="btn btn-danger" @click="clearAllNobles">Сбросить все дворы</button>
        </div>
        <table v-if="planStore.playerData.some(pd => pd.totalNobles > 0)" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Игрок</th><th>Дворов</th><th>Паровозов</th><th></th></tr></thead>
          <tbody>
            <tr v-for="pd in planStore.playerData.filter(pd => pd.totalNobles > 0)" :key="pd.player">
              <td>{{ pd.player }}</td>
              <td class="num-hi" style="text-align:center">{{ pd.totalNobles }}</td>
              <td class="num-trains" style="text-align:center">{{ Math.floor(pd.totalNobles / 5) }}</td>
              <td><button class="btn-remove" title="Удалить" @click="planStore.setPlayerData(pd.player, { totalNobles: 0 })">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Pal-off import -->
    <section class="panel">
      <button class="collapse-toggle" @click="palOffImportOpen = !palOffImportOpen">
        <span>
          Импорт офовых палов
          <span v-if="palOffImportApplied" class="tower-count-badge">{{ palOffImportApplied }} игроков</span>
        </span>
        <span class="collapse-icon">{{ palOffImportOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="palOffImportOpen" class="mt">
        <p class="drop-format" style="margin-bottom:0.5rem">
          Формат: <code>Игрок,количество</code> — по одной строке на игрока
        </p>
        <textarea v-model="palOffText" class="csv-textarea" rows="6" placeholder="Онмайн,5&#10;AnotherPlayer,3"></textarea>
        <div v-if="palOffError" class="status-msg status-err">{{ palOffError }}</div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="applyPalOffImport">Применить</button>
          <button class="btn btn-secondary" @click="palOffText = ''; palOffError = ''; palOffImportApplied = 0">Очистить ввод</button>
          <button v-if="planStore.playerData.some(pd => pd.offPaladins > 0)" class="btn btn-danger" @click="clearAllPalOffs">Сбросить все пал-оффы</button>
        </div>
        <table v-if="planStore.playerData.some(pd => pd.offPaladins > 0)" class="mini-table" style="margin-top:1rem">
          <thead><tr><th>Игрок</th><th>Пал-оффов</th><th></th></tr></thead>
          <tbody>
            <tr v-for="pd in planStore.playerData.filter(pd => pd.offPaladins > 0)" :key="pd.player">
              <td>{{ pd.player }}</td>
              <td class="num-hi" style="text-align:center">{{ pd.offPaladins }}</td>
              <td><button class="btn-remove" title="Удалить" @click="planStore.setPlayerData(pd.player, { offPaladins: 0 })">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ImportStats v-if="statsVisible" ref="importStatsRef" :highlight="highlightCoords" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useVillagesStore } from '@/stores/villagesStore'
import { usePlanStore } from '@/stores/planStore'
import ImportStats from '@/components/ImportStats.vue'
import type { VillageTroops, Village } from '@/stores/villagesStore'

const route = useRoute()
const villagesStore = useVillagesStore()
const planStore = usePlanStore()

const highlightCoords = computed(() => route.query.highlight as string | undefined)

const importStatsRef = ref<InstanceType<typeof ImportStats> | null>(null)

const isDragging = ref(false)
const csvText = ref('')
const error = ref('')
const statsVisible = ref(villagesStore.villages.length > 0)
const fileInput = ref<HTMLInputElement | null>(null)

// ── Manual village entry ──────────────────────────────────────────────
const TROOP_FIELDS: Array<{ label: string; key: keyof VillageTroops }> = [
  { label: 'Копья',  key: 'spear'    },
  { label: 'Мечи',   key: 'sword'    },
  { label: 'Топоры', key: 'axe'      },
  { label: 'Лазы',   key: 'spy'      },
  { label: 'ЛК',     key: 'light'    },
  { label: 'ТК',     key: 'heavy'    },
  { label: 'Тараны', key: 'ram'      },
  { label: 'Каты',   key: 'catapult' },
  { label: 'Пал',    key: 'knight'   },
  { label: 'Двор',   key: 'snob'     },
]

function emptyTroops(): VillageTroops {
  return { spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 }
}

const manualOpen    = ref(false)
const mPlayer       = ref('')
const mCoords       = ref('')
const mPoints       = ref(0)
const mTroops       = ref<VillageTroops>(emptyTroops())
const manualMsg     = ref('')
const manualErr     = ref('')
const manualHistory = ref<Village[]>([])

const coordsValid   = computed(() => /^\d+\|\d+$/.test(mCoords.value.trim()))
const coordsExisting = computed(() =>
  coordsValid.value && villagesStore.villages.some(v => v.coords === mCoords.value.trim())
)
const manualAddedCount = computed(() => manualHistory.value.length)

function addManualVillage() {
  manualMsg.value = ''
  manualErr.value = ''
  if (!mPlayer.value.trim()) { manualErr.value = 'Укажите имя игрока'; return }
  const match = mCoords.value.trim().match(/^(\d+)\|(\d+)$/)
  if (!match) { manualErr.value = 'Неверный формат координат — ожидается 500|500'; return }
  const x = parseInt(match[1], 10)
  const y = parseInt(match[2], 10)
  const v: Village = {
    player: mPlayer.value.trim(),
    coords: mCoords.value.trim(),
    x, y,
    points: mPoints.value || 0,
    troops: { ...mTroops.value },
  }
  const updated = villagesStore.upsertVillage(v)
  manualMsg.value = updated ? `Деревня ${v.coords} обновлена` : `Деревня ${v.coords} добавлена`
  statsVisible.value = true
  // track in session history (upsert by coords)
  const hi = manualHistory.value.findIndex(h => h.coords === v.coords)
  if (hi >= 0) manualHistory.value[hi] = v
  else manualHistory.value.unshift(v)
  // reset form (keep player name for quick multi-add)
  mCoords.value = ''
  mPoints.value = 0
  mTroops.value = emptyTroops()
  setTimeout(() => importStatsRef.value?.prefillAll(), 0)
}

function removeManual(coords: string) {
  villagesStore.removeVillage(coords)
  manualHistory.value = manualHistory.value.filter(h => h.coords !== coords)
  if (!villagesStore.villages.length) statsVisible.value = false
}

function resetManualForm() {
  mPlayer.value = ''
  mCoords.value = ''
  mPoints.value = 0
  mTroops.value = emptyTroops()
  manualMsg.value = ''
  manualErr.value = ''
}

const noblesImportOpen = ref(false)
const noblesText = ref('')
const noblesError = ref('')
const noblesImportApplied = ref(0)

const palOffImportOpen = ref(false)
const palOffText = ref('')
const palOffError = ref('')
const palOffImportApplied = ref(0)

function clearAllNobles(): void {
  planStore.playerData.filter(pd => pd.totalNobles > 0).forEach(pd => planStore.setPlayerData(pd.player, { totalNobles: 0 }))
  noblesText.value = ''
  noblesError.value = ''
  noblesImportApplied.value = 0
}

function applyNoblesImport(): void {
  noblesError.value = ''
  const lines = noblesText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { noblesError.value = 'Введите хотя бы одну строку'; return }
  let applied = 0
  for (const line of lines) {
    const comma = line.lastIndexOf(',')
    if (comma === -1) { noblesError.value = `Неверный формат: "${line}"`; return }
    const player = line.slice(0, comma).trim()
    const count = parseInt(line.slice(comma + 1).trim(), 10)
    if (!player || isNaN(count) || count < 0) { noblesError.value = `Неверная строка: "${line}"`; return }
    planStore.setPlayerData(player, { totalNobles: count })
    applied++
  }
  noblesImportApplied.value = applied
}

function applyPalOffImport(): void {
  palOffError.value = ''
  const lines = palOffText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { palOffError.value = 'Введите хотя бы одну строку'; return }
  let applied = 0
  for (const line of lines) {
    const comma = line.lastIndexOf(',')
    if (comma === -1) { palOffError.value = `Неверный формат: "${line}"`; return }
    const player = line.slice(0, comma).trim()
    const count = parseInt(line.slice(comma + 1).trim(), 10)
    if (!player || isNaN(count) || count < 0) { palOffError.value = `Неверная строка: "${line}"`; return }
    planStore.setPlayerData(player, { offPaladins: count })
    applied++
  }
  palOffImportApplied.value = applied
}

function clearAllPalOffs(): void {
  planStore.playerData.filter(pd => pd.offPaladins > 0).forEach(pd => planStore.setPlayerData(pd.player, { offPaladins: 0 }))
  palOffText.value = ''
  palOffError.value = ''
  palOffImportApplied.value = 0
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
  if (!csvText.value.trim()) { error.value = 'CSV пустой'; return }
  parseCsv(csvText.value)
}

function parseCsv(text: string) {
  error.value = ''
  try {
    const result = villagesStore.parseCSV(text)
    statsVisible.value = true
    if (result.count === 0) {
      error.value = 'Не найдено ни одной строки. Проверьте формат CSV.'
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

const hasAnyData = computed(() =>
  villagesStore.villages.length > 0 ||
  planStore.playerData.some(pd => pd.totalNobles > 0)
)

function clearEverything() {
  clearAll()
  noblesText.value = ''
  noblesError.value = ''
  noblesImportApplied.value = 0
  manualHistory.value = []
  resetManualForm()
  planStore.playerData.forEach(pd => planStore.setPlayerData(pd.player, { totalNobles: 0 }))
}
</script>

<style lang="scss" scoped>
.import-view {
  max-width: 1100px;
  margin: 0 auto;
}

.import-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.5rem;

  h1 { margin: 0; }
}

.btn-danger {
  background: a($accent, 0.1);
  border: 1px solid a($accent, 0.35);
  color: $accent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.9rem;
  transition: background 0.15s, border-color 0.15s;

  &:hover { background: a($accent, 0.18); border-color: a($accent, 0.6); }
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

.btn-row    { margin-top: 0.75rem; }
.num-hi     { color: $accent; font-weight: 700; }
.num-trains { color: $green; font-weight: 700; }

// ── Manual entry ────────────────────────────────────────────────────
.manual-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 0.25rem;
}

.manual-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 100px;

  &-lg  { min-width: 180px; flex: 1; }
  &-sm  { max-width: 100px; }
}

.mf-label {
  font-size: 0.72rem;
  color: $text-faint;
}

.mf-input {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  box-sizing: border-box;
  width: 100%;

  &:focus { outline: none; border-color: $accent; }
  &-warn  { border-color: $orange !important; }
}

.mf-hint {
  font-size: 0.72rem;
  align-self: flex-end;
  padding-bottom: 0.35rem;

  &-warn { color: $orange; }
}

.troop-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
  margin: 0.75rem 0;

  @media (max-width: 600px) { grid-template-columns: repeat(3, 1fr); }
}

.troop-cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.troop-label {
  font-size: 0.7rem;
  color: $text-faint;
}

.troop-input {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  padding: 0.3rem 0.4rem;
  font-size: 0.82rem;
  text-align: right;
  width: 100%;
  box-sizing: border-box;

  &:focus { outline: none; border-color: $accent; }
}

.btn-remove {
  background: none;
  border: none;
  color: $text-faint;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.25rem;

  &:hover { color: $accent; }
}
</style>
