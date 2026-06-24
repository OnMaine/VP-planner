<template>
  <section class="panel">
    <button class="collapse-toggle" @click="open = !open">
      <span class="panel-title-row">
        <img :src="knightIcon" class="knight-icon" />
        Пал-оффи
        <span v-if="totalAssigned > 0" class="tower-count-badge">{{ totalAssigned }} призначено</span>
      </span>
      <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="mt">
      <div class="paloff-layout">

        <div class="paloff-troops">
          <table class="results-table" style="width:100%">
            <thead>
              <tr><th style="text-align:left">Гравець</th><th style="text-align:right">#</th></tr>
              <tr v-if="planStore.playerData.length > 0" class="tfoot-row">
                <td><strong>Всього</strong></td>
                <td style="text-align:right"><strong>{{ totalAvailable }}</strong></td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pd in planStore.playerData.filter(p => p.offPaladins > 0)" :key="pd.player">
                <td>{{ pd.player }}</td>
                <td style="text-align:right">{{ pd.offPaladins }}</td>
              </tr>
              <tr v-if="planStore.playerData.length === 0">
                <td colspan="2" class="muted-text" style="text-align:center">Імпортуйте CSV гравців</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="paloff-assign">
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:0.5rem">
            <button class="btn btn-secondary btn-sm" @click="distributeEvenly">Розподілити рівномірно</button>
            <button class="btn btn-secondary btn-sm" @click="clearAssignments">Скинути</button>
            <button class="btn btn-secondary btn-sm" @click="bulkOpen = !bulkOpen">
              {{ bulkOpen ? '▲' : '▼' }} Масова вставка
            </button>
            <span class="muted-text" style="font-size:0.8rem;margin-left:auto">
              Призначено: {{ totalAssigned }} / {{ totalAvailable }}
            </span>
          </div>

          <div v-if="bulkOpen" style="margin-bottom:0.75rem">
            <p class="bulk-hint">Формат: <code>координати,кількість</code> (або тільки координати — для рівномірного розподілу)</p>
            <textarea class="bulk-textarea" rows="5" v-model="bulkText" placeholder="416|535,3&#10;416|536,2&#10;416|537"></textarea>
            <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
            <button class="btn btn-primary btn-sm mt" @click="applyBulk">Застосувати</button>
          </div>

          <table class="results-table" style="width:100%">
            <thead><tr>
              <th style="text-align:left">Координати</th>
              <th style="text-align:left">Гравець (ціль)</th>
              <th style="text-align:right">Пал-оффів</th>
            </tr></thead>
            <tbody>
              <tr v-for="t in planStore.targets" :key="t.id">
                <td>{{ t.coords || '—' }}</td>
                <td class="muted-small">{{ resolveTargetPlayer(t) || '—' }}</td>
                <td style="text-align:right;width:90px">
                  <input
                    type="number" class="input" style="width:70px;text-align:right" min="0"
                    :value="t.palOffCount ?? 0"
                    @change="planStore.updateTarget(t.id, { palOffCount: +($event.target as HTMLInputElement).value || undefined })"
                  />
                </td>
              </tr>
              <tr v-if="planStore.targets.length === 0">
                <td colspan="3" class="muted-text" style="text-align:center">Немає цілей</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { usePlayerResolution } from '@/composables/usePlayerResolution'
import { UNIT_ICONS } from '@/utils/unitIcons'
const knightIcon = UNIT_ICONS.knight

const planStore = usePlanStore()
const { resolveTargetPlayer } = usePlayerResolution()

const open = ref(false)
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkError = ref('')

const totalAvailable = computed(() =>
  planStore.playerData.reduce((s, pd) => s + pd.offPaladins, 0),
)
const totalAssigned = computed(() =>
  planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0),
)

function distributeEvenly(): void {
  const targets = planStore.targets.filter((t) => t.coords)
  if (!targets.length) return
  const perTarget = Math.floor(totalAvailable.value / targets.length)
  const remainder = totalAvailable.value - perTarget * targets.length
  targets.forEach((t, i) =>
    planStore.updateTarget(t.id, { palOffCount: perTarget + (i < remainder ? 1 : 0) || undefined }),
  )
}

function clearAssignments(): void {
  for (const t of planStore.targets) planStore.updateTarget(t.id, { palOffCount: undefined })
}

function applyBulk(): void {
  bulkError.value = ''
  const lines = bulkText.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) { bulkError.value = 'Введіть хоча б один рядок'; return }
  const parsed: { coords: string; count: number | null }[] = []
  for (const line of lines) {
    const parts = line.split(',')
    const coords = parts[0].trim()
    if (!/^\d+\|\d+$/.test(coords)) { bulkError.value = `Невірний формат: ${line}`; return }
    const count = parts[1] ? parseInt(parts[1].trim(), 10) : null
    if (parts[1] && isNaN(count!)) { bulkError.value = `Невірна кількість: ${line}`; return }
    parsed.push({ coords, count })
  }
  const withCount = parsed.filter((p) => p.count !== null)
  const noCount = parsed.filter((p) => p.count === null)
  for (const { coords, count } of withCount) {
    const t = planStore.targets.find((t) => t.coords === coords)
    if (t) planStore.updateTarget(t.id, { palOffCount: count! || undefined })
  }
  if (noCount.length > 0) {
    const assigned = withCount.reduce((s, p) => s + (p.count ?? 0), 0)
    const remaining = Math.max(0, totalAvailable.value - assigned)
    const perTarget = Math.floor(remaining / noCount.length)
    const mod = remaining - perTarget * noCount.length
    noCount.forEach(({ coords }, i) => {
      const t = planStore.targets.find((t) => t.coords === coords)
      if (t) planStore.updateTarget(t.id, { palOffCount: perTarget + (i < mod ? 1 : 0) || undefined })
    })
  }
  bulkOpen.value = false
  bulkText.value = ''
}
</script>

<style lang="scss" scoped>
.paloff-layout { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
.paloff-troops { flex: 0 0 220px; min-width: 180px; }
.paloff-assign { flex: 1 1 400px; min-width: 300px; }

.panel-title-row { display: inline-flex; align-items: center; gap: 6px; }
.knight-icon { width: 16px; height: 16px; image-rendering: pixelated; }

.tfoot-row td {
  background: $border;
  border-bottom: 2px solid #1a3a6e;
  font-size: 0.85rem;
  padding: 4px 8px;
}
</style>
