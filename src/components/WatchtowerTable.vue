<template>
  <section class="panel">
    <div class="section-header">
      <button class="collapse-toggle" @click="open = !open">
        <span class="panel-title-row">
          <img :src="watchtowerIcon" class="section-icon" />
          Башни врага
          <span v-if="planStore.watchtowerVillages.length" class="tower-count-badge">
            {{ planStore.watchtowerVillages.length }}
          </span>
        </span>
        <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
      </button>
      <button
        v-if="planStore.watchtowerVillages.length"
        class="btn btn-danger btn-sm"
        @click.stop="clearAllTowers()"
      >Очистить</button>
    </div>

    <div v-if="open" class="mt">
      <div class="add-targets-bar">
        <button class="btn btn-primary" @click="addEmptyTower">+ Вручную</button>
        <button class="btn btn-secondary" @click="bulkOpen = !bulkOpen">
          {{ bulkOpen ? '▲' : '▼' }} Массовая вставка
        </button>
        <label class="btn btn-secondary file-btn">
          Загрузить файл
          <input ref="fileInput" type="file" accept=".txt,.csv" class="hidden-input" @change="onTowerFile" />
        </label>
        <span class="fmt-tip">ⓘ<span class="fmt-tip-body">
          Одна строка = одна башня<br>
          <code>500|500</code> ← только коры (уровень 20)<br>
          <code>500|500,EnemyNick</code> ← с ником<br>
          <code>500|500,EnemyNick,15</code> ← с ником и уровнем
        </span></span>
      </div>

      <div v-if="bulkOpen" class="bulk-panel">
        <p class="bulk-hint">
          Формат строки: <code>500|500,НикВрага,15</code> — ник и уровень необязательны. Без уровня — башня 20.
        </p>
        <div class="bulk-row">
          <textarea
            v-model="bulkText"
            class="bulk-textarea"
            rows="5"
            placeholder="500|500,EnemyPlayer,15   ← ник + уровень&#10;501|501,AnotherEnemy    ← без уровня (20)&#10;502|502,,10            ← без ника, уровень 10&#10;503|503               ← только коры (20)"
          />
          <div class="bulk-time" style="min-width:160px">
            <button class="btn btn-primary" @click="doBulkAdd">Додати</button>
          </div>
        </div>
        <div v-if="bulkError" class="status-msg status-err">{{ bulkError }}</div>
      </div>

      <template v-if="planStore.watchtowerVillages.length">
        <div v-for="block in towerBlocks" :key="block.player" class="tower-group mt">
          <div v-if="towerBlocks.length > 1 || block.player" class="tower-group-header">
            <span class="tower-group-player">{{ block.player || '(без игрока)' }}</span>
            <span class="tower-group-count">{{ block.villages.length }} башен</span>
          </div>
          <div class="table-wrap">
            <table class="mini-table">
              <thead><tr>
                <th>Координаты</th>
                <th>Игрок</th>
                <th>Уровень (0–20)</th>
                <th></th>
              </tr></thead>
              <tbody>
                <tr v-for="wt in block.villages" :key="wt.id">
                  <td>
                    <input
                      type="text" class="input" style="width:85px" placeholder="500|500"
                      :value="wt.coords"
                      @input="filterCoordsInput($event)"
                      @change="onTowerCoordsChange(wt.id, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                  <td>
                    <input
                      type="text" class="input" style="width:130px" placeholder="(необяз.)"
                      :value="resolveTowerPlayer(wt)"
                      :class="{ 'input-autofilled': !!enemyStore.lookupCoords(wt.coords)?.player }"
                      @change="onTowerPlayerChange(wt.id, wt.coords, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                  <td>
                    <input
                      type="number" class="input" style="width:65px" min="0" max="20"
                      :value="wt.level"
                      @change="planStore.updateWatchtowerVillage(wt.id, { level: +($event.target as HTMLInputElement).value })"
                    />
                  </td>
                  <td><button class="btn btn-danger btn-sm" @click="planStore.removeWatchtowerVillage(wt.id)">✕</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <p v-else class="muted-text">
        Башни не добавлены. Добавь башни врага, чтобы видеть предупреждения WATCHTOWER_HIT в плане.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useCoordInput } from '@/composables/useCoordInput'
import { usePlayerResolution } from '@/composables/usePlayerResolution'
import type { WatchtowerVillage } from '@/stores/planStore'
import { watchtowerIcon } from '@/utils/unitIcons'

const planStore = usePlanStore()

function clearAllTowers() {
  if (window.confirm('Очистить все башни?')) planStore.clearWatchtowerVillages()
}
const enemyStore = useEnemyDataStore()
const { filterCoordsInput } = useCoordInput()
const { resolveTowerPlayer } = usePlayerResolution()

const open = ref(false)
const bulkOpen = ref(false)
const bulkText = ref('')
const bulkError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

interface TowerBlock { player: string; villages: WatchtowerVillage[] }

const towerBlocks = computed<TowerBlock[]>(() => {
  const m = new Map<string, WatchtowerVillage[]>()
  for (const wt of planStore.watchtowerVillages) {
    const key = resolveTowerPlayer(wt)
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(wt)
  }
  return [...m.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1
      if (!b) return -1
      return a.localeCompare(b)
    })
    .map(([player, villages]) => ({ player, villages }))
})

function addEmptyTower(): void {
  planStore.addWatchtowerVillage('', '', 20)
  open.value = true
}

function onTowerCoordsChange(id: string, coords: string): void {
  const patch: Parameters<typeof planStore.updateWatchtowerVillage>[1] = { coords }
  const info = enemyStore.lookupCoords(coords)
  if (info?.player) patch.player = info.player.name
  planStore.updateWatchtowerVillage(id, patch)
}

function onTowerPlayerChange(id: string, coords: string, value: string): void {
  planStore.updateWatchtowerVillage(id, { player: value })
  const target = planStore.targets.find((t) => t.coords === coords)
  if (target) planStore.updateTarget(target.id, { enemyPlayer: value || undefined })
}

interface ParsedTower { coords: string; player: string; level: number }

function parseTowersFromText(text: string): ParsedTower[] {
  const results: ParsedTower[] = []
  for (const line of text.split(/[\n\r]+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(',')
    const coordsPart = parts[0].trim()
    if (!/^\d{1,3}\|\d{1,3}$/.test(coordsPart)) continue
    const player = (parts[1] ?? '').trim()
    const levelRaw = parseInt((parts[2] ?? '').trim(), 10)
    const level = isNaN(levelRaw) ? 20 : Math.max(0, Math.min(20, levelRaw))
    results.push({ coords: coordsPart, player, level })
  }
  return results
}

function doBulkAdd(): void {
  bulkError.value = ''
  const entries = parseTowersFromText(bulkText.value)
  if (!entries.length) { bulkError.value = 'Не найдено координат. Формат: 500|500,НикВрага,15'; return }
  planStore.importWatchtowerVillages(entries)
  bulkText.value = ''
  bulkOpen.value = false
}

function onTowerFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    const entries = parseTowersFromText(text)
    if (!entries.length) { bulkError.value = 'В файле не найдено строк формата 500|500'; return }
    planStore.importWatchtowerVillages(entries)
    bulkError.value = `Из файла добавлено ${entries.length} башен.`
    if (fileInput.value) fileInput.value.value = ''
  }
  reader.readAsText(file, 'utf-8')
}
</script>

<style lang="scss" scoped>
.tower-group {
  border: 1px solid $border;
  border-radius: 4px;
  overflow: hidden;
}
.tower-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.75rem;
  background: #0d2a50;
  border-bottom: 1px solid $border;
}
.tower-group-player { font-weight: 700; color: $text; font-size: 0.85rem; }
.tower-group-count  { color: $text-faint; font-size: 0.75rem; }

.panel-title-row { display: inline-flex; align-items: center; gap: 6px; }
.section-icon    { width: 18px; height: 18px; image-rendering: pixelated; }
</style>
