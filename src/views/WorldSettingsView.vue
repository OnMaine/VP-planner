<template>
  <div class="settings-view">
    <h1>Налаштування світу</h1>

    <!-- Current settings summary (priority display) -->
    <section class="panel panel-summary">
      <h2>Поточні налаштування</h2>
      <div v-if="worldStore.settings.worldCode" class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Світ</span>
          <span class="summary-value highlight">{{ worldStore.settings.worldCode }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Швидкість світу</span>
          <span class="summary-value">×{{ worldStore.settings.worldSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Швидкість юнітів</span>
          <span class="summary-value">×{{ worldStore.settings.unitSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Розмір карти</span>
          <span class="summary-value">{{ worldStore.settings.mapSize }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Нічний бонус</span>
          <span class="summary-value" :class="worldStore.settings.nightActive ? 'text-ok' : 'text-dim'">
            {{ worldStore.settings.nightActive
              ? `${worldStore.settings.nightFrom}:00 – ${worldStore.settings.nightTo}:00`
              : 'вимкнено' }}
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Макс. дальність двора</span>
          <span class="summary-value">{{ worldStore.settings.snobMaxDist }} клітинок</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Розрив паровоза</span>
          <span class="summary-value">{{ worldStore.settings.snobIntervalMs }} мс</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Сторожова башта</span>
          <span class="summary-value" :class="worldStore.settings.watchtowerEnabled ? 'text-ok' : 'text-dim'">
            {{ worldStore.settings.watchtowerEnabled ? 'є в грі' : 'вимкнена' }}
          </span>
        </div>
      </div>
      <div v-else class="no-settings">
        Світ не налаштовано — завантажте через API або пресет нижче
      </div>

      <div class="unit-times-row" v-if="worldStore.settings.worldCode">
        <span v-for="(label, key) in UNIT_LABELS" :key="key" class="unit-chip">
          <img :src="UNIT_ICONS[key]" class="unit-chip-img" :alt="label" />
          <span class="unit-chip-name">{{ label }}</span>
          <span class="unit-chip-val">{{ worldStore.settings.unitTimes[key] }}с</span>
        </span>
      </div>
    </section>

    <!-- Fetch from API / Preset -->
    <section class="panel">
      <h2>Завантажити налаштування</h2>
      <div class="row">
        <input
          v-model="worldCodeInput"
          type="text"
          placeholder="Код світу, напр. ru100"
          class="input"
          @keydown.enter="doFetch"
        />
        <button class="btn btn-primary" :disabled="fetching" @click="doFetch">
          {{ fetching ? 'Завантаження...' : 'З API' }}
        </button>
        <button class="btn btn-secondary" :disabled="!hasPreset" @click="doPreset" :title="hasPreset ? '' : 'Пресет для цього світу не знайдено'">
          Пресет
        </button>
      </div>
      <div v-if="statusMsg" :class="['status-msg', statusClass]">{{ statusMsg }}</div>
    </section>

    <!-- Manual settings (collapsible) -->
    <section class="panel">
      <button class="collapse-toggle" @click="manualOpen = !manualOpen">
        <span>Ручне введення</span>
        <span class="collapse-icon">{{ manualOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="manualOpen" class="collapse-body">
        <div class="form-grid mt">
          <label>
            Код світу
            <input v-model="form.worldCode" type="text" class="input" />
          </label>
          <label>
            Швидкість світу
            <input v-model.number="form.worldSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Швидкість юнітів
            <input v-model.number="form.unitSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Розмір карти
            <input v-model.number="form.mapSize" type="number" min="100" class="input" />
          </label>
          <label>
            Макс. дальність двора (клітинок)
            <input v-model.number="form.snobMaxDist" type="number" min="1" class="input" />
          </label>
          <label>
            Розрив паровоза (мс)
            <input v-model.number="form.snobIntervalMs" type="number" min="0" step="50" class="input" />
          </label>
          <label class="checkbox-label">
            <input v-model="form.watchtowerEnabled" type="checkbox" />
            Сторожова башта є в грі
          </label>
          <label class="checkbox-label">
            <input v-model="form.nightActive" type="checkbox" />
            Нічний бонус активний
          </label>
          <label>
            Ніч від (годин)
            <input v-model.number="form.nightFrom" type="number" min="0" max="23" class="input" />
          </label>
          <label>
            Ніч до (годин)
            <input v-model.number="form.nightTo" type="number" min="0" max="23" class="input" />
          </label>
        </div>

        <h3>Час юнітів (секунд/клітинку)</h3>
        <div class="form-grid">
          <label v-for="(label, key) in UNIT_LABELS" :key="key">
            <span class="unit-form-label">
              <img :src="UNIT_ICONS[key]" class="unit-icon-sm" :alt="label" />{{ label }}
            </span>
            <input v-model.number="form.unitTimes[key]" type="number" min="1" class="input" />
          </label>
        </div>

        <button class="btn btn-primary mt" @click="saveManual">Зберегти</button>
        <div v-if="savedMsg" class="status-msg status-ok">{{ savedMsg }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useWorldStore } from '@/stores/worldStore'
import { KNOWN_WORLDS } from '@/stores/worldStore'
import type { UnitTimes } from '@/stores/worldStore'
import { UNIT_ICONS } from '@/utils/unitIcons'

const worldStore = useWorldStore()

const worldCodeInput = ref(worldStore.settings.worldCode || '')
const fetching = ref(false)
const statusMsg = ref('')
const statusClass = ref('')
const savedMsg = ref('')
const manualOpen = ref(false)

const hasPreset = computed(() => Boolean(worldCodeInput.value && KNOWN_WORLDS[worldCodeInput.value.trim()]))

const UNIT_LABELS: Record<keyof UnitTimes, string> = {
  spear: 'Копья',
  sword: 'Мечи',
  axe: 'Топоры',
  spy: 'Лазы',
  light: 'ЛК',
  heavy: 'ТК',
  ram: 'Тараны',
  catapult: 'Каты',
  knight: 'Пал',
  snob: 'Двор',
}

const form = reactive({
  worldCode: worldStore.settings.worldCode,
  worldSpeed: worldStore.settings.worldSpeed,
  unitSpeed: worldStore.settings.unitSpeed,
  mapSize: worldStore.settings.mapSize,
  nightActive: worldStore.settings.nightActive,
  nightFrom: worldStore.settings.nightFrom,
  nightTo: worldStore.settings.nightTo,
  snobMaxDist: worldStore.settings.snobMaxDist,
  snobIntervalMs: worldStore.settings.snobIntervalMs,
  watchtowerEnabled: worldStore.settings.watchtowerEnabled,
  unitTimes: { ...worldStore.settings.unitTimes } as UnitTimes,
})

watch(
  () => worldStore.settings,
  (s) => {
    form.worldCode = s.worldCode
    form.worldSpeed = s.worldSpeed
    form.unitSpeed = s.unitSpeed
    form.mapSize = s.mapSize
    form.nightActive = s.nightActive
    form.nightFrom = s.nightFrom
    form.nightTo = s.nightTo
    form.snobMaxDist = s.snobMaxDist
    form.snobIntervalMs = s.snobIntervalMs
    form.watchtowerEnabled = s.watchtowerEnabled
    Object.assign(form.unitTimes, s.unitTimes)
  },
  { deep: true },
)

async function doFetch() {
  const code = worldCodeInput.value.trim()
  if (!code) {
    statusMsg.value = 'Введіть код світу'
    statusClass.value = 'status-err'
    return
  }
  fetching.value = true
  statusMsg.value = ''
  try {
    await worldStore.fetchFromApi(code)
    statusMsg.value = `Успішно завантажено налаштування для "${code}"`
    statusClass.value = 'status-ok'
  } catch (err) {
    statusMsg.value = `Помилка: ${err instanceof Error ? err.message : String(err)}. Спробуйте пресет або ручне введення.`
    statusClass.value = 'status-err'
  } finally {
    fetching.value = false
  }
}

function doPreset() {
  const code = worldCodeInput.value.trim()
  if (worldStore.applyPreset(code)) {
    statusMsg.value = `Пресет "${code}" застосовано`
    statusClass.value = 'status-ok'
  } else {
    statusMsg.value = `Пресет для "${code}" не знайдено`
    statusClass.value = 'status-err'
  }
}

function saveManual() {
  worldStore.updateSettings({
    worldCode: form.worldCode,
    worldSpeed: form.worldSpeed,
    unitSpeed: form.unitSpeed,
    mapSize: form.mapSize,
    nightActive: form.nightActive,
    nightFrom: form.nightFrom,
    nightTo: form.nightTo,
    snobMaxDist: form.snobMaxDist,
    snobIntervalMs: form.snobIntervalMs,
    watchtowerEnabled: form.watchtowerEnabled,
    unitTimes: { ...form.unitTimes },
  })
  savedMsg.value = 'Збережено!'
  setTimeout(() => { savedMsg.value = '' }, 2000)
}
</script>

<style lang="scss" scoped>
.settings-view {
  max-width: 900px;
  margin: 0 auto;
}

// Panel accent override
.panel-summary { border-color: $accent; }

// Summary block
.summary-grid { display: flex; flex-wrap: wrap; gap: 1rem 2rem; margin-bottom: 1rem; }

.summary-item { display: flex; flex-direction: column; gap: 0.2rem; }

.summary-label {
  font-size: 0.75rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-value {
  font-size: 1rem;
  font-weight: 600;
  color: $text;
  &.highlight { color: $accent; font-size: 1.15rem; }
}

.text-ok  { color: $orange; }
.text-dim { color: #555570; }

.no-settings { color: $text-faint; font-style: italic; font-size: 0.9rem; }

// Unit chips
.unit-times-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }

.unit-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: $border;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  min-width: 48px;
}
.unit-chip-img  { width: 18px; height: 18px; image-rendering: pixelated; }
.unit-chip-name { font-size: 0.7rem; color: #8888a8; }
.unit-chip-val  { font-size: 0.8rem; color: $text; font-weight: 600; }

.unit-form-label { display: inline-flex; align-items: center; gap: 5px; }
.unit-icon-sm    { width: 16px; height: 16px; image-rendering: pixelated; }

// Fetch row
.row { display: flex; gap: 0.75rem; align-items: center; }

// Collapse body
.collapse-body { margin-top: 1rem; border-top: 1px solid $border; padding-top: 1rem; }

// Form
.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: $text-dim;
}

.checkbox-label { flex-direction: row; align-items: center; gap: 0.5rem; color: $text; font-size: 0.9rem; }

// Wider padding for this view's inputs
.input { padding: 0.4rem 0.6rem; font-size: 0.9rem; width: 100%; }

// Disabled state
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-primary:hover:not(:disabled)  { opacity: 0.85; }
.btn-secondary:hover:not(:disabled) { opacity: 0.85; }

// status-msg margin override (shared uses margin-bottom, here we need margin-top)
.status-msg { margin-top: 0.75rem; margin-bottom: 0; }

// status-ok is unique to this view
.status-ok { background: rgba(0, 200, 100, 0.15); color: $green; }
</style>
