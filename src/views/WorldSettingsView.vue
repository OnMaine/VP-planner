<template>
  <div class="settings-view">
    <h1>Настройки мира</h1>

    <!-- Current settings summary (priority display) -->
    <section class="panel panel-summary">
      <h2>Текущие настройки</h2>
      <div v-if="worldStore.settings.worldCode" class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Мир</span>
          <span class="summary-value highlight">{{ worldStore.settings.worldCode }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Скорость мира</span>
          <span class="summary-value">×{{ worldStore.settings.worldSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Скорость юнитов</span>
          <span class="summary-value">×{{ worldStore.settings.unitSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Размер карты</span>
          <span class="summary-value">{{ worldStore.settings.mapSize }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Ночной бонус</span>
          <button
            :class="['summary-toggle', worldStore.settings.nightActive ? 'toggle-on' : 'toggle-off']"
            @click="worldStore.updateSettings({ nightActive: !worldStore.settings.nightActive })"
          >
            {{ worldStore.settings.nightActive
              ? `${worldStore.settings.nightFrom}:00 – ${worldStore.settings.nightTo}:00`
              : 'отключён' }}
          </button>
        </div>
        <div class="summary-item">
          <span class="summary-label">Макс. дальность двора</span>
          <span class="summary-value">{{ worldStore.settings.snobMaxDist }} клеток</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Разрыв паровоза</span>
          <span class="summary-value">{{ worldStore.settings.snobIntervalMs }} мс</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Мин. войск в атаке</span>
          <input
            type="number" min="1"
            class="summary-inline-input"
            :value="worldStore.settings.minAttackSize"
            @change="worldStore.updateSettings({ minAttackSize: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="summary-item">
          <span class="summary-label">Сторожевая башня</span>
          <button
            :class="['summary-toggle', worldStore.settings.watchtowerEnabled ? 'toggle-on' : 'toggle-off']"
            @click="worldStore.updateSettings({ watchtowerEnabled: !worldStore.settings.watchtowerEnabled })"
          >
            {{ worldStore.settings.watchtowerEnabled ? 'есть в игре' : 'отключена' }}
          </button>
        </div>
      </div>
      <div v-else class="no-settings">
        Мир не настроен — загрузите через API или пресет ниже
      </div>

      <div class="unit-times-row" v-if="worldStore.settings.worldCode">
        <span v-for="(label, key) in UNIT_LABELS" :key="key" class="unit-chip">
          <img :src="UNIT_ICONS[key]" class="unit-chip-img" :alt="label" />
          <span class="unit-chip-name">{{ label }}</span>
          <span class="unit-chip-val">{{ Math.round(worldStore.settings.unitTimes[key] / 60) }}<span class="unit-chip-unit">мин</span></span>
          <span class="unit-chip-pop"><span class="pop-icon">⌂</span>{{ worldStore.settings.unitPop[key] }}</span>
        </span>
      </div>
    </section>

    <!-- World map -->
    <WorldMapPanel />

    <!-- Fetch from API / Preset -->
    <section class="panel">
      <h2>Загрузить настройки</h2>
      <div class="row">
        <input
          v-model="worldCodeInput"
          type="text"
          placeholder="Код мира, напр. ru100"
          class="input"
          @keydown.enter="doFetch"
        />
        <button class="btn btn-primary" :disabled="fetching" @click="doFetch">
          {{ fetching ? 'Загрузка...' : 'Из API' }}
        </button>
        <button class="btn btn-secondary" :disabled="!hasPreset" @click="doPreset" :title="hasPreset ? '' : 'Пресет для этого мира не найден'">
          Пресет
        </button>
      </div>
      <div v-if="statusMsg" :class="['status-msg', statusClass]">{{ statusMsg }}</div>
    </section>

    <!-- Manual settings -->
    <section class="panel">
      <h2>Ручной ввод</h2>
      <div class="collapse-body">
        <div class="form-grid mt">
          <label>
            Код мира
            <input v-model="form.worldCode" type="text" class="input" />
          </label>
          <label>
            Скорость мира
            <input v-model.number="form.worldSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Скорость юнитов
            <input v-model.number="form.unitSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Размер карты
            <input v-model.number="form.mapSize" type="number" min="100" class="input" />
          </label>
          <label>
            Макс. дальность двора (клеток)
            <input v-model.number="form.snobMaxDist" type="number" min="1" class="input" />
          </label>
          <label>
            Разрыв паровоза (мс)
            <input v-model.number="form.snobIntervalMs" type="number" min="0" step="50" class="input" />
          </label>
          <label class="checkbox-label">
            <input v-model="form.watchtowerEnabled" type="checkbox" />
            Сторожевая башня есть в игре
          </label>
          <label class="checkbox-label">
            <input v-model="form.nightActive" type="checkbox" />
            Ночной бонус активен
          </label>
          <label>
            Ночь от (часов)
            <input v-model.number="form.nightFrom" type="number" min="0" max="23" class="input" />
          </label>
          <label>
            Ночь до (часов)
            <input v-model.number="form.nightTo" type="number" min="0" max="23" class="input" />
          </label>
        </div>

        <h3>Время юнитов (минут/клетку)</h3>
        <div class="form-grid">
          <label v-for="(label, key) in UNIT_LABELS" :key="key">
            <span class="unit-form-label">
              <img :src="UNIT_ICONS[key]" class="unit-icon-sm" :alt="label" />{{ label }}
            </span>
            <input v-model.number="form.unitTimesMin[key]" type="number" min="1" class="input" />
          </label>
        </div>

        <h3>Усадьба юнитов (мест/юнит)</h3>
        <div class="form-grid">
          <label v-for="(label, key) in UNIT_LABELS" :key="key">
            <span class="unit-form-label">
              <img :src="UNIT_ICONS[key]" class="unit-icon-sm" :alt="label" />{{ label }}
            </span>
            <input v-model.number="form.unitPop[key]" type="number" min="1" class="input" />
          </label>
        </div>

        <button class="btn btn-primary mt" @click="saveManual">Сохранить</button>
        <div v-if="savedMsg" class="status-msg status-ok">{{ savedMsg }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useWorldStore } from '@/stores/worldStore'
import { KNOWN_WORLDS } from '@/stores/worldStore'
import type { UnitTimes, UnitPop } from '@/stores/worldStore'
import { UNIT_ICONS } from '@/utils/unitIcons'
import WorldMapPanel from '@/components/WorldMapPanel.vue'

const worldStore = useWorldStore()

const worldCodeInput = ref(worldStore.settings.worldCode || '')
const fetching = ref(false)
const statusMsg = ref('')
const statusClass = ref('')
const savedMsg = ref('')


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
  unitTimesMin: Object.fromEntries(
    Object.entries(worldStore.settings.unitTimes).map(([k, v]) => [k, Math.round(v / 60)])
  ) as unknown as UnitTimes,
  unitPop: { ...worldStore.settings.unitPop } as UnitPop,
})

function secToMin(times: UnitTimes): UnitTimes {
  return Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v / 60)])) as unknown as UnitTimes
}

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
    Object.assign(form.unitTimesMin, secToMin(s.unitTimes))
    Object.assign(form.unitPop, s.unitPop)
  },
  { deep: true },
)

async function doFetch() {
  const code = worldCodeInput.value.trim()
  if (!code) {
    statusMsg.value = 'Введите код мира'
    statusClass.value = 'status-err'
    return
  }
  fetching.value = true
  statusMsg.value = ''
  try {
    await worldStore.fetchFromApi(code)
    statusMsg.value = `Настройки для "${code}" успешно загружены`
    statusClass.value = 'status-ok'
  } catch (err) {
    statusMsg.value = `Ошибка: ${err instanceof Error ? err.message : String(err)}. Попробуйте пресет или ручной ввод.`
    statusClass.value = 'status-err'
  } finally {
    fetching.value = false
  }
}

function doPreset() {
  const code = worldCodeInput.value.trim()
  if (worldStore.applyPreset(code)) {
    statusMsg.value = `Пресет "${code}" применён`
    statusClass.value = 'status-ok'
  } else {
    statusMsg.value = `Пресет для "${code}" не найден`
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
    unitTimes: Object.fromEntries(
      Object.entries(form.unitTimesMin).map(([k, v]) => [k, v * 60])
    ) as unknown as UnitTimes,
    unitPop: { ...form.unitPop },
  })
  savedMsg.value = 'Сохранено!'
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

.summary-toggle {
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;

  &.toggle-on  { color: $orange; background: a($orange, 0.1); border-color: a($orange, 0.4); }
  &.toggle-off { color: #555570; background: a(#555570, 0.08); border-color: a(#555570, 0.25);
    &:hover { border-color: $accent; color: $text-dim; }
  }
}

.summary-inline-input {
  width: 72px;
  padding: 0.2rem 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  color: $text;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  text-align: center;
  &:focus { outline: none; border-color: $accent; }
}

.text-ok  { color: $orange; }
.text-dim { color: #555570; }

.no-settings { color: $text-faint; font-style: italic; font-size: 0.9rem; }

// Unit chips
.unit-times-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.unit-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  background: a($accent, 0.06);
  border: 1px solid a($accent, 0.15);
  border-radius: 8px;
  padding: 0.5rem 0.6rem 0.4rem;
  min-width: 58px;
  transition: border-color 0.15s;

  &:hover { border-color: a($accent, 0.35); }
}

.unit-chip-img  {
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
  margin-bottom: 0.1rem;
}

.unit-chip-name {
  font-size: 0.65rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.unit-chip-val {
  font-size: 1rem;
  color: $text;
  font-weight: 700;
  line-height: 1;
}

.unit-chip-unit {
  font-size: 0.65rem;
  font-weight: 400;
  color: $text-dim;
  margin-left: 1px;
}

.unit-chip-pop {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.7rem;
  color: $text-dim;
  background: a($border, 0.6);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  margin-top: 0.1rem;
}

.pop-icon {
  font-size: 0.75rem;
  color: $text-faint;
}

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
