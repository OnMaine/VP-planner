<template>
  <section class="panel">
    <div class="stats-header-row">
      <h2>Статистика</h2>
      <div class="settings-bar">
        <div class="settings-group">
          <span class="sg-label">Топоры</span>
          <label class="sg-field">фулл <input v-model.number="presetsStore.fullOffMinAxe"  type="number" min="1" class="inline-input sg-input" /></label>
          <label class="sg-field">med  <input v-model.number="presetsStore.halfOffMinAxe"  type="number" min="1" class="inline-input sg-input" /></label>
          <label class="sg-field">мини <input v-model.number="presetsStore.smallOffMinAxe" type="number" min="1" class="inline-input sg-input" /></label>
        </div>
        <div class="settings-group">
          <span class="sg-label">Пробой</span>
          <label class="sg-field">тар. <input v-model.number="presetsStore.breachMinRams" type="number" min="1" class="inline-input sg-input" /></label>
        </div>
        <div class="settings-group">
          <label class="sg-checkbox">
            <input v-model="presetsStore.catSplitSquads" type="checkbox" />
            Кат. отряды
          </label>
          <label class="sg-field">мин <input v-model.number="presetsStore.catMinSize" type="number" min="1" class="inline-input sg-input" /></label>
          <label v-if="presetsStore.catSplitSquads" class="sg-field">макс <input v-model.number="presetsStore.catMaxSize" type="number" min="1" class="inline-input sg-input" /></label>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card stat-card--blue">
        <span class="stat-num">{{ villagesStore.villages.length }}</span>
        <span class="stat-label">Деревень</span>
      </div>
      <div class="stat-card stat-card--blue">
        <span class="stat-num">{{ villagesStore.playerCount }}</span>
        <span class="stat-label">Игроков</span>
      </div>
      <div class="stat-card stat-card--accent">
        <span class="stat-num">{{ totals.breakOff }}</span>
        <span class="stat-label">Пробой</span>
      </div>
      <div class="stat-card stat-card--red">
        <span class="stat-num">{{ totals.fullOff }}</span>
        <span class="stat-label">Фулл офф</span>
      </div>
      <div class="stat-card stat-card--orange">
        <span class="stat-num">{{ totals.halfOff }}</span>
        <span class="stat-label">Медиум офф</span>
      </div>
      <div class="stat-card stat-card--yellow">
        <span class="stat-num">{{ totals.smallOff }}</span>
        <span class="stat-label">Мини</span>
      </div>
      <div class="stat-card stat-card--purple">
        <span class="stat-num">{{ totals.snobs }}</span>
        <span class="stat-label">Дворов</span>
      </div>
      <div class="stat-card stat-card--teal">
        <span class="stat-num">{{ totals.trains }}</span>
        <span class="stat-label">Паровозов</span>
      </div>
      <div class="stat-card stat-card--gold">
        <span class="stat-num">{{ planStore.playerData.reduce((s, pd) => s + pd.offPaladins, 0) }}</span>
        <span class="stat-label">Офф-палов</span>
      </div>
      <div class="stat-card stat-card--teal">
        <span class="stat-num">{{ totals.catSquadsTotal }}</span>
        <span class="stat-label">Кат отрядов</span>
        <span class="stat-sublabel">({{ totals.catapults }} кат)</span>
      </div>
    </div>

    <!-- Players table -->
    <h3>Игроки</h3>
    <div class="players-wrap">
      <table class="mini-table players-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th :title="`топоры ≥ ${presetsStore.fullOffMinAxe} и тараны ≥ ${presetsStore.breachMinRams}`">Пробой</th>
            <th :title="`топоры ≥ ${presetsStore.fullOffMinAxe} (без пробойных)`">Фулл офф</th>
            <th :title="`топоры ${presetsStore.halfOffMinAxe}–${presetsStore.fullOffMinAxe - 1}`">Медиум офф</th>
            <th :title="`топоры ${presetsStore.smallOffMinAxe}–${presetsStore.halfOffMinAxe - 1}`">Мини</th>
            <th>
              Каты
              <span class="th-info-icon" @mouseenter="showThTooltip('cats', $event)" @mouseleave="hideThTooltip">ⓘ</span>
            </th>
            <th>
              Пал-Офф
              <span class="th-info-icon" @mouseenter="showThTooltip('pal-off', $event)" @mouseleave="hideThTooltip">ⓘ</span>
            </th>
            <th>
              Дворы
              <span class="th-info-icon" @mouseenter="showThTooltip('nobles', $event)" @mouseleave="hideThTooltip">ⓘ</span>
            </th>
            <th>
              Паровозы
              <span class="th-info-icon" @mouseenter="showThTooltip('trains', $event)" @mouseleave="hideThTooltip">ⓘ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in allPlayers" :key="p.player">
            <td class="player-name">{{ p.player }}</td>
            <td class="num" :class="{ 'num-accent': p.breakOff > 0 }">{{ p.breakOff || '—' }}</td>
            <td class="num" :class="{ 'num-hi': p.fullOff > 0 }">
              {{ p.fullOff || '—' }}
              <span v-if="p.breakOff > 0" class="total-hint">
                ({{ p.fullOff + p.breakOff }})
                <span class="info-anchor">ⓘ
                  <span class="info-popup">
                    <span class="info-row"><span class="info-lbl">Фулл офф</span><span class="info-val">{{ p.fullOff }}</span></span>
                    <span class="info-row"><span class="info-lbl">Офф пробой</span><span class="info-val accent">{{ p.breakOff }}</span></span>
                    <span class="info-row info-row--total"><span class="info-lbl">Итого</span><span class="info-val">{{ p.fullOff + p.breakOff }}</span></span>
                  </span>
                </span>
              </span>
            </td>
            <td class="num" :class="{ 'num-mid': p.halfOff > 0 }">{{ p.halfOff }}</td>
            <td class="num">{{ p.smallOff }}</td>
            <td class="num">
              <template v-if="catSquadsForPlayer(p.player) > 0">
                <span class="num-hi">{{ catSquadsForPlayer(p.player) }}</span>
                <span class="cat-squads">({{ p.catapultsCsv }})</span>
              </template>
              <template v-else-if="p.catapultsCsv > 0">
                <span class="cat-below-min">{{ p.catapultsCsv }}</span>
              </template>
              <template v-else>—</template>
            </td>
            <td>
              <div class="input-wrap">
                <input
                  type="number" min="0"
                  :class="['inline-input', { 'input-edited': planStore.getPlayerData(p.player).offPaladins !== p.knightsCsv }]"
                  :value="planStore.getPlayerData(p.player).offPaladins"
                  @change="planStore.setPlayerData(p.player, { offPaladins: +($event.target as HTMLInputElement).value })"
                />
                <span
                  v-if="planStore.getPlayerData(p.player).offPaladins !== p.knightsCsv"
                  class="csv-hint"
                  :title="`Восстановить значение из CSV (${p.knightsCsv})`"
                  @click="planStore.setPlayerData(p.player, { offPaladins: p.knightsCsv })"
                >{{ p.knightsCsv }}</span>
              </div>
            </td>
            <td>
              <div class="input-wrap">
                <input
                  type="number" min="0"
                  :class="['inline-input', { 'input-edited': planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv }]"
                  :value="planStore.getPlayerData(p.player).totalNobles"
                  :title="planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv ? `Из CSV: ${p.snobsCsv}` : ''"
                  @change="planStore.setPlayerData(p.player, { totalNobles: +($event.target as HTMLInputElement).value })"
                />
                <span
                  v-if="planStore.getPlayerData(p.player).totalNobles !== p.snobsCsv"
                  class="csv-hint"
                  :title="`Восстановить значение из CSV (${p.snobsCsv})`"
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
    </div>
  </section>

  <!-- Villages table -->
  <section class="panel">
    <button class="collapse-toggle" @click="villagesOpen = !villagesOpen">
      <span>Все деревни ({{ villagesStore.villages.length }})</span>
      <span class="collapse-icon">{{ villagesOpen ? '▲' : '▼' }}</span>
    </button>
    <div v-if="villagesOpen" class="preview-wrap mt">
      <table class="mini-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th>Координаты</th>
            <th>Очки</th>
            <th title="Копья"><img :src="UNIT_ICONS.spear"    class="th-unit-icon" /></th>
            <th title="Мечи"><img :src="UNIT_ICONS.sword"    class="th-unit-icon" /></th>
            <th title="Топоры"><img :src="UNIT_ICONS.axe"   class="th-unit-icon" /></th>
            <th title="Лазы"><img :src="UNIT_ICONS.spy"     class="th-unit-icon" /></th>
            <th title="ЛК"><img :src="UNIT_ICONS.light"     class="th-unit-icon" /></th>
            <th title="ТК"><img :src="UNIT_ICONS.heavy"     class="th-unit-icon" /></th>
            <th title="Тараны"><img :src="UNIT_ICONS.ram"   class="th-unit-icon" /></th>
            <th title="Каты"><img :src="UNIT_ICONS.catapult" class="th-unit-icon" /></th>
            <th title="Пал"><img :src="UNIT_ICONS.knight"   class="th-unit-icon" /></th>
            <th title="Двор"><img :src="UNIT_ICONS.snob"    class="th-unit-icon" /></th>
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
            <td>
              <template v-if="catSquads(v.troops.catapult) > 0">
                <span class="num-hi">{{ catSquads(v.troops.catapult) }}</span>
                <span class="cat-squads">({{ v.troops.catapult }})</span>
              </template>
              <template v-else-if="v.troops.catapult > 0">
                <span class="cat-below-min">{{ v.troops.catapult }}</span>
              </template>
              <template v-else>0</template>
            </td>
            <td>{{ v.troops.knight }}</td>
            <td>{{ v.troops.snob }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="thTooltip" class="th-fixed-tooltip" :style="{ left: thTooltip.x + 'px', top: thTooltip.y + 'px' }">
      <template v-if="thTooltip.id === 'pal-off'">
        <div class="ftt-row"><span class="ftt-lbl">Источник</span><span class="ftt-val">CSV (поле «Пал»)</span></div>
        <div class="ftt-sep"></div>
        <div class="ftt-hint">
          Количество паладинов в офф-позиции.<br/>
          Редактируется вручную — изменения сохраняются.<br/>
          Используется планером для генерации<br/><strong>paladin_off</strong> атак.
        </div>
      </template>
      <template v-else-if="thTooltip.id === 'nobles'">
        <div class="ftt-row"><span class="ftt-lbl">По умолч.</span><span class="ftt-val">Из CSV</span></div>
        <div class="ftt-sep"></div>
        <div class="ftt-hint">
          Приоритет значений:<br/>
          <strong>1.</strong> Импорт дворов (отдельный сбор)<br/>
          <strong>2.</strong> Ручное редактирование<br/>
          <strong>3.</strong> CSV (построенные дворы)<br/>
          <br/>
          Отдельный сбор показывает <strong>доступные</strong> дворы,<br/>
          что может быть больше, чем построенных.
        </div>
      </template>
      <template v-else-if="thTooltip.id === 'cats'">
        <div class="ftt-row"><span class="ftt-lbl">Формат</span><span class="ftt-val">отряды (кат)</span></div>
        <div class="ftt-sep"></div>
        <div class="ftt-hint">
          <template v-if="presetsStore.catSplitSquads">
            Деление по отрядам включено.<br/>
            Мин. отряд: <strong>{{ presetsStore.catMinSize }}</strong> кат — меньше не считается.<br/>
            Макс. отряд: <strong>{{ presetsStore.catMaxSize }}</strong> кат — больше делится.<br/>
            Эскорт: <strong>{{ 1000 - presetsStore.catMaxSize }}</strong> юн. (1000 − макс кат).
          </template>
          <template v-else>
            Деление отключено — все каты деревни считаются<br/>
            <strong>одним отрядом</strong> без учёта лимитов.
          </template>
        </div>
      </template>
      <template v-else-if="thTooltip.id === 'trains'">
        <div class="ftt-row"><span class="ftt-lbl">Формула</span><span class="ftt-val">Дворы ÷ 5</span></div>
        <div class="ftt-sep"></div>
        <div class="ftt-hint">
          Сколько полных паровозов может собрать игрок.<br/>
          Считается от <strong>редактированного</strong> значения<br/>дворов, не из CSV.
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVillagesStore } from '@/stores/villagesStore'
import { usePlanStore } from '@/stores/planStore'
import { usePresetsStore } from '@/stores/presetsStore'
import { UNIT_ICONS } from '@/utils/unitIcons'

const villagesStore = useVillagesStore()
const planStore = usePlanStore()
const presetsStore = usePresetsStore()

function catSquads(cats: number): number {
  if (cats < presetsStore.catMinSize) return 0
  if (!presetsStore.catSplitSquads) return 1
  return Math.ceil(cats / presetsStore.catMaxSize)
}
function catSquadsForPlayer(player: string): number {
  return villagesStore.villages
    .filter((v) => v.player === player)
    .reduce((sum, v) => sum + catSquads(v.troops.catapult), 0)
}

const villagesOpen = ref(false)

// Tooltip
const thTooltip = ref<{ id: string; x: number; y: number } | null>(null)
function showThTooltip(id: string, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  thTooltip.value = { id, x: r.left + r.width / 2, y: r.bottom + 8 }
}
function hideThTooltip() { thTooltip.value = null }

interface PlayerStat {
  player: string
  breakOff: number
  fullOff: number
  halfOff: number
  smallOff: number
  snobsCsv: number
  knightsCsv: number
  catapultsCsv: number
}

const allPlayers = computed<PlayerStat[]>(() => {
  const map = new Map<string, PlayerStat>()
  for (const v of villagesStore.villages) {
    let s = map.get(v.player)
    if (!s) {
      s = { player: v.player, breakOff: 0, fullOff: 0, halfOff: 0, smallOff: 0, snobsCsv: 0, knightsCsv: 0, catapultsCsv: 0 }
      map.set(v.player, s)
    }
    const axe = v.troops.axe
    const ram = v.troops.ram
    if (axe >= presetsStore.fullOffMinAxe && ram >= presetsStore.breachMinRams) s.breakOff++
    else if (axe >= presetsStore.fullOffMinAxe)                                s.fullOff++
    else if (axe >= presetsStore.halfOffMinAxe)                                s.halfOff++
    else if (axe >= presetsStore.smallOffMinAxe)                               s.smallOff++
    s.snobsCsv     += v.troops.snob
    s.knightsCsv   += v.troops.knight
    s.catapultsCsv += v.troops.catapult
  }
  return [...map.values()].sort((a, b) => (b.breakOff + b.fullOff) - (a.breakOff + a.fullOff))
})

const totals = computed(() => {
  let breakOff = 0, fullOff = 0, halfOff = 0, smallOff = 0, catapults = 0
  for (const v of villagesStore.villages) {
    const axe = v.troops.axe
    const ram = v.troops.ram
    if (axe >= presetsStore.fullOffMinAxe && ram >= presetsStore.breachMinRams) breakOff++
    else if (axe >= presetsStore.fullOffMinAxe)                                fullOff++
    else if (axe >= presetsStore.halfOffMinAxe)                                halfOff++
    else if (axe >= presetsStore.smallOffMinAxe)                               smallOff++
    catapults += v.troops.catapult
  }
  const catSquadsTotal = villagesStore.villages.reduce((sum, v) => sum + catSquads(v.troops.catapult), 0)
  const snobs = allPlayers.value.reduce((sum, p) => sum + planStore.getPlayerData(p.player).totalNobles, 0)
  const trains = allPlayers.value.reduce((sum, p) => sum + Math.floor(planStore.getPlayerData(p.player).totalNobles / 5), 0)
  return { breakOff, fullOff, halfOff, smallOff, snobs, trains, catapults, catSquadsTotal }
})

function prefillMissing() {
  for (const p of allPlayers.value) {
    if (!planStore.playerDataMap.get(p.player)) {
      planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv })
    }
  }
}

function prefillAll() {
  for (const p of allPlayers.value) {
    planStore.setPlayerData(p.player, { totalNobles: p.snobsCsv })
  }
}

onMounted(prefillMissing)
defineExpose({ prefillAll })
</script>

<style lang="scss" scoped>
// Stats header
.stats-header-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  h2 { margin: 0; }
}

.settings-bar {
  display: flex;
  align-items: center;
  gap: 0.35rem 0.75rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
}

.settings-group {
  display: flex;
  align-items: center;
  gap: 0.3rem 0.45rem;
  background: a($bg-deep, 0.6);
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.25rem 0.55rem;
  flex-wrap: wrap;
}

.sg-label {
  color: $text-faint;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  margin-right: 0.1rem;
}

.sg-field {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: $text-dim;
  white-space: nowrap;
  cursor: default;
}

.sg-checkbox {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: $text-dim;
  cursor: pointer;
  white-space: nowrap;
  margin-right: 0.15rem;
}

.sg-input { width: 68px !important; }

// Stat cards
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 0.6rem;
  margin-bottom: 1rem;
}

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

.stat-num      { font-size: 1.35rem; font-weight: 700; color: $accent; line-height: 1.2; }
.stat-label    { font-size: 0.72rem; color: $text-dim; white-space: nowrap; }
.stat-sublabel { font-size: 0.68rem; color: $text-faint; white-space: nowrap; }

.stat-card--blue .stat-num   { color: #5b9bd5; }
.stat-card--accent .stat-num { color: $purple; font-weight: 800; }
.stat-card--red .stat-num    { color: $accent; }
.stat-card--purple .stat-num { color: $purple; }
.stat-card--teal .stat-num   { color: $green; }
.stat-card--gold .stat-num   { color: #f0c040; }
.stat-card--green .stat-num  { color: #6abf7b; }

// Players table
.players-table {
  .player-name { white-space: nowrap; }
  .num         { text-align: center; color: #8888a8; }
  .num-accent  { color: $purple; font-weight: 800; }
  .num-hi      { color: $accent; font-weight: 700; }
  .num-mid     { color: $orange; font-weight: 600; }
  .num-trains  { color: $green;  font-weight: 700; }
  .total-hint  { color: $text-faint; font-size: 0.75em; font-weight: 400; margin-left: 2px; }

  .info-anchor {
    position: relative;
    display: inline-block;
    color: $text-faint;
    font-size: 0.8em;
    cursor: help;
    opacity: 0.65;
    margin-left: 2px;
    &:hover { opacity: 1; }
    &:hover .info-popup { display: flex; }
  }

  .info-popup {
    display: none;
    flex-direction: column;
    gap: 4px;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: $bg-deep;
    border: 1px solid $border;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    min-width: 160px;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    pointer-events: none;
    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: $border;
    }
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.78rem;
    white-space: nowrap;
    &--total { border-top: 1px solid $border; padding-top: 3px; margin-top: 1px; }
  }

  .info-lbl { color: $text-dim; }
  .info-val  { color: $text; font-weight: 700; font-size: 0.8rem;
    &.accent { color: $purple; }
  }

  .th-info-icon {
    cursor: help;
    color: $text-faint;
    font-size: 0.8em;
    opacity: 0.65;
    margin-left: 3px;
    &:hover { opacity: 1; }
  }
}

// Inline edit
.input-wrap   { display: flex; align-items: center; gap: 0.3rem; }
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

.cat-squads     { color: $text-faint; font-size: 0.78em; font-weight: 400; margin-left: 2px; white-space: nowrap; }
.cat-below-min  { color: #555570; font-size: 0.85em; }
.th-unit-icon  { width: 16px; height: 16px; image-rendering: pixelated; display: block; margin: 0 auto; }

.players-wrap,
.preview-wrap {
  overflow-x: auto;
  table { border-collapse: separate; border-spacing: 0; }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: $border;
    box-shadow: 0 1px 0 $border;
  }
}
.players-wrap { max-height: 70vh; overflow-y: auto; }
.preview-wrap { max-height: 60vh; overflow-y: auto; }
</style>

<style lang="scss">
.th-fixed-tooltip {
  position: fixed;
  transform: translateX(-50%);
  z-index: 9999;
  background: $bg-deep;
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  min-width: 190px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.6);
  pointer-events: none;
  font-size: 0.8rem;

  .ftt-row  { display: flex; justify-content: space-between; gap: 1rem; }
  .ftt-lbl  { color: $text-dim; }
  .ftt-val  { color: $text; font-weight: 700; }
  .ftt-sep  { border-top: 1px solid $border; margin: 0.4rem 0; }
  .ftt-hint { color: $text-faint; font-size: 0.75rem; line-height: 1.5;
    strong { color: $text-dim; }
  }
}
</style>
