<template>
  <section v-if="planStore.massConfig.useSpamNobles" class="panel">
    <div class="section-header">
      <h2>Цели (спам дворы)</h2>
      <button
        v-if="planStore.spamNobleTargets.length"
        class="btn btn-danger btn-sm"
        @click="planStore.clearSpamNobleTargets()"
      >Очистить</button>
    </div>

    <div class="action-row">
      <button class="btn btn-primary" @click="addEmpty">+ Вручную</button>
      <button class="btn btn-secondary" @click="bulkOpen = !bulkOpen">
        {{ bulkOpen ? '▲' : '▼' }} Массовая вставка
      </button>
      <span v-if="planStore.spamNobleTargets.length" class="target-count" style="margin-left:auto">
        {{ planStore.spamNobleTargets.length }} целей
      </span>
    </div>

    <div v-if="bulkOpen" class="bulk-panel">
      <p class="bulk-hint">Координаты целей — по одной или через пробел/запятую/новую строку</p>
      <div class="bulk-row">
        <textarea v-model="bulkText" class="bulk-textarea" rows="4" placeholder="500|500&#10;501|501" />
        <div class="bulk-time">
          <label>Дата и время прилёта
            <input v-model="bulkDatetime" type="datetime-local" class="input" step="1" />
          </label>
          <button class="btn btn-primary" @click="doBulkAdd">Добавить</button>
        </div>
      </div>
      <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
    </div>

    <div v-if="planStore.spamNobleTargets.length" class="table-wrap mt">
      <table class="mini-table targets-table">
        <thead><tr>
          <th>Координаты</th>
          <th>Игрок (цель)</th>
          <th>Племя</th>
          <th>Время прилёта</th>
          <th></th>
        </tr></thead>
        <tbody>
          <tr v-for="t in planStore.spamNobleTargets" :key="t.id">
            <td>
              <input
                type="text" class="input" style="width:85px" placeholder="500|500"
                :value="t.coords"
                @input="filterCoordsInput($event)"
                @change="onCoordsChange(t.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <input
                type="text" class="input" style="width:120px" placeholder="имя игрока"
                :value="resolveTargetPlayer(t)"
                :class="{ 'input-autofilled': !!enemyStore.lookupCoords(t.coords)?.player }"
                @change="onPlayerChange(t.id, t.coords, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="muted-small">{{ enemyStore.lookupCoords(t.coords)?.ally?.tag ?? t.enemyAllyTag ?? '—' }}</td>
            <td>
              <input
                type="datetime-local" class="input" style="width:185px" step="1"
                :value="toDatetimeLocal(t.arrivalTime)"
                @change="onDateChange(t.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td><button class="btn btn-danger btn-sm" @click="planStore.removeSpamNobleTarget(t.id)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted-text" style="margin-top:0.5rem">Целей ещё нет.</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { useCoordInput } from '@/composables/useCoordInput'
import { usePlayerResolution } from '@/composables/usePlayerResolution'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()
const { toDatetimeLocal } = useDateFormat()
const { filterCoordsInput } = useCoordInput()
const { resolveTargetPlayer } = usePlayerResolution()

const bulkOpen = ref(false)
const bulkText = ref('')
const bulkDatetime = ref(toDatetimeLocal(new Date(Date.now() + 3600_000)))
const bulkError = ref('')

function addEmpty(): void {
  const now = new Date()
  now.setSeconds(0); now.setMilliseconds(0)
  planStore.addEmptySpamNobleTarget(now)
}

function doBulkAdd(): void {
  bulkError.value = ''
  const arrivalTime = new Date(bulkDatetime.value)
  if (isNaN(arrivalTime.getTime())) { bulkError.value = 'Укажите время прилёта'; return }
  const matches = bulkText.value.match(/\d{1,3}\|\d{1,3}/g)
  if (!matches?.length) { bulkError.value = 'Не найдено ни одной координаты'; return }
  let added = 0
  for (const coords of matches) {
    if (planStore.addSpamNobleTarget(coords, arrivalTime)) added++
  }
  if (added) { bulkOpen.value = false; bulkText.value = '' }
}

function onCoordsChange(id: string, coords: string): void {
  const patch: Parameters<typeof planStore.updateSpamNobleTarget>[1] = { coords }
  const info = enemyStore.lookupCoords(coords)
  if (info?.player) { patch.enemyPlayer = info.player.name; patch.enemyAllyTag = info.ally?.tag ?? '' }
  planStore.updateSpamNobleTarget(id, patch)
}

function onPlayerChange(id: string, _coords: string, value: string): void {
  planStore.updateSpamNobleTarget(id, { enemyPlayer: value || undefined })
}

function onDateChange(id: string, value: string): void {
  if (!value) return
  planStore.updateSpamNobleTarget(id, { arrivalTime: new Date(value) })
}
</script>

<style lang="scss" scoped>
.targets-table td { vertical-align: middle; }
</style>
