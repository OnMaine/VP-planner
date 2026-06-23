<template>
  <div class="planner-view">
    <h1>Планер атак</h1>

    <!-- Form -->
    <section class="panel">
      <h2>Параметри атаки</h2>
      <div class="form-row">
        <label class="form-field">
          Ціль (X|Y)
          <input
            v-model="targetCoords"
            type="text"
            class="input"
            placeholder="напр. 500|500"
          />
        </label>

        <label class="form-field">
          Дата і час прибуття
          <input
            v-model="arrivalDateLocal"
            type="datetime-local"
            class="input"
            step="1"
          />
        </label>

        <label class="form-field">
          Мілісекунди
          <input
            v-model.number="arrivalMs"
            type="number"
            class="input"
            min="0"
            max="999"
            placeholder="000"
          />
        </label>

        <label class="form-field">
          Тип юніта
          <select v-model="selectedUnit" class="input">
            <option v-for="(label, key) in UNIT_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="formError" class="status-msg status-err">{{ formError }}</div>

      <button class="btn btn-primary mt" @click="doCalculate">Розрахувати</button>
    </section>

    <!-- Warning legend -->
    <div v-if="planStore.attacks.length > 0" class="legend">
      <span class="legend-item past">Відправлення в минулому</span>
      <span class="legend-item night">Нічне прибуття/відправлення</span>
      <span class="legend-item excluded">Виключено</span>
    </div>

    <!-- Results -->
    <AttackTable />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import type { VillageTroops } from '@/stores/villagesStore'
import AttackTable from '@/components/AttackTable.vue'

const planStore = usePlanStore()

const UNIT_LABELS: Record<keyof VillageTroops, string> = {
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

const targetCoords = ref(planStore.target || '')
const selectedUnit = ref<keyof VillageTroops>(planStore.unitKey || 'axe')
const formError = ref('')

// Build a default datetime-local value (now + 1 hour)
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

const initTime = new Date(Date.now() + 3600 * 1000)
const arrivalDateLocal = ref(toDatetimeLocal(initTime))
const arrivalMs = ref<number>(0)

function doCalculate() {
  formError.value = ''

  if (!targetCoords.value.trim()) {
    formError.value = 'Введіть координати цілі'
    return
  }

  if (!arrivalDateLocal.value) {
    formError.value = 'Введіть дату прибуття'
    return
  }

  // Parse datetime-local + ms
  const baseMs = new Date(arrivalDateLocal.value).getTime()
  if (isNaN(baseMs)) {
    formError.value = 'Некоректна дата'
    return
  }
  const ms = Math.max(0, Math.min(999, arrivalMs.value || 0))
  const arrivalTime = new Date(baseMs + ms)

  planStore.calculate(targetCoords.value.trim(), arrivalTime, selectedUnit.value)

  if (planStore.attacks.length === 0) {
    formError.value = 'Не знайдено сел з вибраним типом юніта. Перевірте імпорт CSV.'
  }
}
</script>

<style scoped>
.planner-view {
  max-width: 1200px;
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

.panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: #a0a0b0;
  min-width: 180px;
}

.input {
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 0.4rem 0.6rem;
  font-size: 0.9rem;
}

.input:focus {
  outline: none;
  border-color: #e94560;
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

.mt {
  margin-top: 0.75rem;
}

.status-msg {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.status-err {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}

.legend {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-item::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.legend-item.past::before {
  background: rgba(233, 69, 96, 0.5);
}

.legend-item.night::before {
  background: rgba(255, 200, 0, 0.4);
}

.legend-item.excluded::before {
  background: rgba(160, 160, 176, 0.3);
}
</style>
