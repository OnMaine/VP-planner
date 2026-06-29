<template>
  <div class="attack-table-wrap">
    <div v-if="attacks.length === 0" class="empty-msg">
      Нет результатов. Заполните форму и нажмите «Рассчитать».
    </div>
    <table v-else class="attack-table">
      <thead>
        <tr>
          <th>Игрок</th>
          <th>Координаты</th>
          <th>Расстояние</th>
          <th>Время в пути</th>
          <th>Время отправки</th>
          <th>Время прибытия</th>
          <th>Всего юнитов</th>
          <th>Исключить</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in attacks"
          :key="row.id"
          :class="rowClass(row)"
        >
          <td>{{ row.fromVillage.player }}</td>
          <td>{{ row.fromVillage.coords }}</td>
          <td>{{ row.distance.toFixed(1) }}</td>
          <td>{{ formatDuration(row.travelSeconds) }}</td>
          <td class="mono">{{ formatDateTime(row.sendTime) }}</td>
          <td class="mono">{{ formatDateTime(row.arrivalTime) }}</td>
          <td>{{ row.totalUnits.toLocaleString() }}</td>
          <td class="center">
            <input
              type="checkbox"
              :checked="row.excluded"
              @change="planStore.toggleExclude(row.id)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { usePlanStore } from '@/stores/planStore'
import type { Attack } from '@/stores/planStore'
import { formatDuration } from '@/utils/travelTime'

const planStore = usePlanStore()

const attacks = planStore.attacks

function rowClass(row: Attack): string {
  if (row.excluded) return 'row-excluded'
  if (row.warnings.includes('SEND_IN_PAST')) return 'row-past'
  if (row.warnings.includes('NIGHT_ARRIVAL') || row.warnings.includes('NIGHT_SEND'))
    return 'row-night'
  return ''
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
  )
}
</script>

<style scoped>
.attack-table-wrap {
  overflow-x: auto;
  margin-top: 1.5rem;
}

.empty-msg {
  color: #a0a0b0;
  text-align: center;
  padding: 2rem;
}

.attack-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.attack-table th,
.attack-table td {
  padding: 0.5rem 0.75rem;
  border: 1px solid #0f3460;
  text-align: left;
  white-space: nowrap;
}

.attack-table th {
  background: #0f3460;
  color: #e0e0e0;
  font-weight: 600;
}

.attack-table tbody tr:nth-child(even) {
  background: rgba(15, 52, 96, 0.2);
}

.attack-table tbody tr:hover {
  background: rgba(233, 69, 96, 0.08);
}

.mono {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
}

.center {
  text-align: center;
}

.row-past td {
  background: rgba(233, 69, 96, 0.2) !important;
  color: #ff8a9a;
}

.row-night td {
  background: rgba(255, 200, 0, 0.15) !important;
  color: #ffe066;
}

.row-excluded td {
  opacity: 0.4;
  text-decoration: line-through;
}
</style>
