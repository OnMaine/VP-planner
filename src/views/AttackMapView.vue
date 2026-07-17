<template>
  <div class="map-page">

    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div class="map-toolbar">


      <!-- Отображение карты -->
      <div class="tb-group">
        <span class="tb-group-label">Карта</span>
        <label class="tog" title="Радиусы башен наблюдения — показывает, какие деревни могут засветить атаку">
          <input type="checkbox" v-model="showTowers" /> Башни
        </label>
        <label class="tog" title="Маршруты спам-атак (по умолчанию скрыты — слишком много линий)">
          <input type="checkbox" v-model="showSpam" /> Спам
        </label>
        <label class="tog" title="Показывать кат волну на карте (цели и линии атак)">
          <input type="checkbox" v-model="showCatMass" /> Кат волна
        </label>
        <label class="tog" title="Координаты и имена игроков над деревнями">
          <input type="checkbox" v-model="showLabels" /> Подписи
        </label>
        <label class="tog" title="Показывать деревни без атак в плане (когда выключено — только атакующие)">
          <input type="checkbox" v-model="showAllVillages" /> Без атак
        </label>
        <label class="tog" title="Скрыть деревни из которых уже назначены атаки">
          <input type="checkbox" v-model="hideAssigned" /> Скрыть назначенные
        </label>
      </div>

      <span class="vsep" />

      <!-- Фильтр деревень -->
      <div class="tb-group">
        <span class="tb-group-label">Деревни</span>
        <div class="vfilter-group">
          <button
            v-for="opt in VFILTER_OPTS" :key="opt.value"
            class="vfilter-btn"
            :class="{ active: villageFilter === opt.value }"
            :style="villageFilter === opt.value && opt.color ? { background: opt.color + '22', color: opt.color, borderColor: opt.color + '66' } : {}"
            :title="opt.hint"
            @click="villageFilter = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <span class="vsep" />

      <!-- Игрок -->
      <div class="tb-group" v-if="allPlayers.length > 1">
        <span class="tb-group-label">Игрок</span>
        <select class="input player-filter" v-model="filterPlayer" title="Показать деревни и атаки только одного игрока">
          <option value="">Все</option>
          <option v-for="p in allPlayers" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <span class="vsep" v-if="allPlayers.length > 1" />

      <!-- Враг -->
      <div class="tb-group" v-if="allEnemies.length > 1">
        <span class="tb-group-label">Враг</span>
        <select class="input player-filter" v-model="filterEnemy" title="Показать атаки только на одного врага">
          <option value="">Все</option>
          <option v-for="p in allEnemies" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <span class="vsep" v-if="allEnemies.length > 1" />

      <!-- Статистика атак -->
      <div class="tb-group">
        <span class="tb-group-label">Атаки</span>
        <span class="toolbar-info" v-if="planStore.attacks.length">
          {{ planStore.attacks.length }} · {{ uniquePairs.length }} маршрутов
          <template v-if="detectedCount > 0"> · <span class="warn-count">{{ detectedCount }} засвечено</span></template>
        </span>
        <span class="toolbar-info dim" v-else>нет — сгенерируйте в Планере</span>
      </div>

      <span class="vsep" v-if="planStore.attacks.length" />

      <!-- Пул -->
      <div class="tb-group" v-if="planStore.attacks.length">
        <span class="tb-group-label">Пул</span>
        <div class="pool-bar">
          <span class="pool-bar-item" title="Офф-деревни в плане / всего в пуле">
            <span class="pool-bar-lbl">Офы</span>
            <span class="pool-bar-val" :class="planStore.poolUsageStats.offsAvailable > 0 ? 'val-warn' : 'val-ok'">{{ planStore.poolUsageStats.offsUsed }}</span>
            <span class="pool-bar-sep">/</span>
            <span class="pool-bar-total">{{ planStore.poolUsageStats.offsTotal }}</span>
          </span>
          <span class="pool-bar-dot" />
          <span class="pool-bar-item" title="Дворяне в плане / всего в пуле">
            <span class="pool-bar-lbl">Дворы</span>
            <span class="pool-bar-val">{{ planStore.poolUsageStats.noblesUsed }}</span>
            <span class="pool-bar-sep">/</span>
            <span class="pool-bar-total">{{ planStore.poolUsageStats.noblesTotal }}</span>
          </span>
          <template v-if="planStore.offPoolStats.palOnly + planStore.offPoolStats.breachPal > 0">
            <span class="pool-bar-dot" />
            <span class="pool-bar-item" title="Пал-оффы (pal_off + breach+pal) в пуле">
              <span class="pool-bar-lbl">Пал</span>
              <span class="pool-bar-total">{{ planStore.offPoolStats.palOnly + planStore.offPoolStats.breachPal }}</span>
            </span>
          </template>
          <template v-if="planStore.offPoolStats.breachOnly + planStore.offPoolStats.breachPal > 0">
            <span class="pool-bar-dot" />
            <span class="pool-bar-item" title="Пробои (breach_off + breach+pal) в пуле">
              <span class="pool-bar-lbl">Пробой</span>
              <span class="pool-bar-total">{{ planStore.offPoolStats.breachOnly + planStore.offPoolStats.breachPal }}</span>
            </span>
          </template>
          <template v-if="planStore.poolUsageStats.offsAvailable > 0">
            <span class="pool-bar-dot" />
            <span class="pool-unused">{{ planStore.poolUsageStats.offsAvailable }} не в плане</span>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Map + Detail panel ────────────────────────────────────────────── -->
    <div class="map-body">
      <div class="map-container" ref="containerEl">
        <canvas
          ref="canvasEl"
          class="map-canvas"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseLeave"
          @click="onMapClick"
        />

        <button class="map-center-btn" @click="fitToData" title="Центрировать карту по данным">⊹ Центрировать</button>

        <div v-if="tooltip" class="map-tt" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
          <div class="tt-head">{{ tooltip.head }}</div>
          <div v-if="tooltip.sub" class="tt-sub">{{ tooltip.sub }}</div>
          <div class="tt-sep" v-if="tooltip.rows.length" />
          <template v-for="(r, i) in tooltip.rows" :key="i">
            <div v-if="r.sep" class="tt-sep" />
            <div v-else class="tt-row">
              <span v-if="r.dot" class="tt-dot" :style="{ background: r.dot }" />
              <span>{{ r.text }}</span>
            </div>
          </template>
        </div>

        <div v-if="isEmpty" class="map-empty">
          <span>Добавьте цели и деревни, затем сгенерируйте атаки в Планере</span>
        </div>
      </div>

      <!-- ── Detail panel ────────────────────────────────────────────────── -->
      <transition name="slide-panel">
        <div v-if="activePanel" class="detail-panel" :key="activePanel">

          <template v-if="selectedVillage">
            <div class="dp-head">
              <div class="dp-head-info">
                <span class="dp-coords">{{ selectedVillage.coords }}</span>
                <span class="dp-enemy">{{ selectedVillage.player }}</span>
              </div>
              <button class="dp-close" @click="selectedVillageCoords = null">✕</button>
            </div>
            <div class="dp-troops">
              <template v-for="u in TROOP_LABELS" :key="u.key">
                <div v-if="selectedVillage.troops[u.key] > 0" class="dp-troop-cell">
                  <span class="dp-troop-lbl">{{ u.label }}</span>
                  <span class="dp-troop-val">{{ selectedVillage.troops[u.key].toLocaleString() }}</span>
                </div>
              </template>
            </div>
          </template>

          <template v-else-if="selectedTarget">
            <div class="dp-head">
              <div class="dp-head-info">
                <span class="dp-coords">{{ selectedTarget.coords }}</span>
                <span v-if="selectedTarget.enemyPlayer" class="dp-enemy">{{ selectedTarget.enemyPlayer }}</span>
                <span
                  v-if="targetTower(selectedTarget.coords)"
                  class="dp-tower-badge"
                  :title="`Башня уровня ${targetTower(selectedTarget.coords)!.level} — радиус обнаружения ${targetTower(selectedTarget.coords)!.level} клеток`"
                >🗼 {{ targetTower(selectedTarget.coords)!.level }} ур.</span>
              </div>
              <div class="dp-head-actions">
                <button class="dp-add-btn" :class="{ active: addingAttack }" title="Добавить атаку" @click.stop="openAddForm">+</button>
                <button class="dp-close" @click="selectedTargetId = null">✕</button>
              </div>
            </div>
          </template>

          <div class="dp-body">
            <div v-if="!activeAttacks.length && !addingAttack" class="dp-empty">Атак нет</div>
            <template v-for="atk in activeAttacks" :key="atk.id">
              <div
                class="dp-atk"
                :class="{
                  'dp-atk-excl':     atk.excluded,
                  'dp-atk-editing':  editingAtkId === atk.id,
                  'dp-atk-dragging': dragSourceId === atk.id,
                  'dp-atk-over':     dragOverId === atk.id,
                }"
                draggable="true"
                @click.stop="toggleEdit(atk)"
                @mouseenter="hoveredAtkId = atk.id"
                @mouseleave="hoveredAtkId = null"
                @dragstart="onDragStart($event, atk.id)"
                @dragover.prevent="onDragOver($event, atk.id)"
                @dragleave="onDragLeave(atk.id)"
                @drop.prevent="onDrop($event, atk.id)"
                @dragend="onDragEnd"
              >
                <span class="dp-drag" title="Перетащить" @click.stop>⠿</span>
                <div class="dp-atk-body">
                  <div class="dp-atk-main">
                    <span class="dp-badge" :style="atkBadgeStyle(atk)">{{ atkLabel(atk) }}</span>
                    <span class="dp-from">{{ selectedVillage ? atk.target.coords : atk.fromVillage.coords }}</span>
                    <span v-if="!selectedVillage" class="dp-player-dot" :style="{ background: playerColor(atk.fromVillage.player) }" :title="atk.fromVillage.player" />
                    <span class="dp-arr">{{ fmtTime(atk.arrivalTime) }}</span>
                    <span v-if="atk.warnings.includes('WATCHTOWER_HIT')" class="dp-tower-hit" title="Маршрут проходит через радиус башни врага">🗼</span>
                    <span v-if="atk.warnings.filter(w => w !== 'WATCHTOWER_HIT').length" class="dp-warn" :title="atk.warnings.filter(w => w !== 'WATCHTOWER_HIT').map(warnText).join('\n')">⚠</span>
                    <button
                      class="dp-excl-btn"
                      :title="atk.excluded ? 'Включить в план' : 'Исключить из плана'"
                      @click.stop="planStore.toggleExclude(atk.id)"
                    >{{ atk.excluded ? '+' : '×' }}</button>
                  </div>
                  <div v-if="compLine(atk)" class="dp-comp">{{ compLine(atk) }}</div>
                </div>
              </div>

              <div v-if="editingAtkId === atk.id" class="dp-editor" @click.stop>
                <div class="dpe-row">
                  <span class="dpe-label">Прилёт</span>
                  <input type="datetime-local" step="0.001" class="dpe-time"
                    :value="editArrival"
                    @change="editArrival = ($event.target as HTMLInputElement).value"
                  />
                </div>
                <div class="dpe-row">
                  <span class="dpe-label">Назв.</span>
                  <input type="text" class="dpe-coords-input" placeholder="оставить пусто = авто"
                    :value="editLabel"
                    @input="editLabel = ($event.target as HTMLInputElement).value"
                  />
                </div>
                <div class="dpe-row">
                  <span class="dpe-label">Цвет</span>
                  <div class="dpe-colors">
                    <button
                      v-for="p in COLOR_PRESETS" :key="p.label"
                      class="dpe-color-btn"
                      :class="{ active: editColor === p.color }"
                      :style="p.color ? { background: p.color + '33', color: p.color, borderColor: editColor === p.color ? p.color : p.color + '55' } : {}"
                      @click="editColor = p.color"
                    >{{ p.label }}</button>
                    <input type="color" class="dpe-color-custom"
                      :value="editColor ?? '#e07b39'"
                      @input="editColor = ($event.target as HTMLInputElement).value"
                      title="Свой цвет"
                    />
                  </div>
                </div>
                <div class="dpe-row">
                  <span class="dpe-label">Тип</span>
                  <div class="dpe-types">
                    <button
                      v-for="t in ATK_TYPE_OPTIONS" :key="t.type"
                      class="dpe-type-btn"
                      :class="{ active: editType === t.type }"
                      :style="editType === t.type ? { background: t.color + '22', color: t.color, borderColor: t.color + '88' } : {}"
                      @click="editType = t.type"
                    >{{ t.label }}</button>
                  </div>
                </div>
                <div class="dpe-row">
                  <span class="dpe-label">{{ selectedVillage ? 'Цель' : 'Деревня' }}</span>
                  <input type="text" class="dpe-coords-input" placeholder="123|456"
                    :value="editFromCoords"
                    @change="editFromCoords = ($event.target as HTMLInputElement).value.trim()"
                  />
                </div>
                <div class="dpe-row dpe-comp-row">
                  <span class="dpe-label">Войска</span>
                  <div class="dpe-comp">
                    <label v-for="u in COMP_UNITS" :key="u.key" class="dpe-unit">
                      <span class="dpe-unit-lbl">{{ u.label }}</span>
                      <input type="number" min="0" class="dpe-unit-input"
                        :value="editComp[u.key]"
                        @change="editComp = { ...editComp, [u.key]: +($event.target as HTMLInputElement).value }"
                      />
                    </label>
                  </div>
                </div>
                <div class="dpe-actions">
                  <button class="btn btn-primary btn-sm" @click="applyEdit(atk.id)">Применить</button>
                  <button class="btn btn-secondary btn-sm" @click="editingAtkId = null">Отмена</button>
                  <button class="btn btn-sm dpe-del-btn" @click="planStore.removeAttack(atk.id); editingAtkId = null">Удалить</button>
                </div>
              </div>
            </template>

            <div v-if="addingAttack && selectedTarget" class="dp-add-form" @click.stop>
              <div class="dpe-row">
                <span class="dpe-label">Деревня</span>
                <input type="text" class="dpe-coords-input" placeholder="123|456"
                  :value="addFromCoords"
                  @change="addFromCoords = ($event.target as HTMLInputElement).value.trim()"
                />
              </div>
              <div class="dpe-row">
                <span class="dpe-label">Прилёт</span>
                <input type="datetime-local" step="0.001" class="dpe-time"
                  :value="addArrival"
                  @change="addArrival = ($event.target as HTMLInputElement).value"
                />
              </div>
              <div class="dpe-row">
                <span class="dpe-label">Тип</span>
                <div class="dpe-types">
                  <button
                    v-for="t in ATK_TYPE_OPTIONS" :key="t.type"
                    class="dpe-type-btn"
                    :class="{ active: addType === t.type }"
                    :style="addType === t.type ? { background: t.color + '22', color: t.color, borderColor: t.color + '88' } : {}"
                    @click="addType = t.type"
                  >{{ t.label }}</button>
                </div>
              </div>
              <div class="dpe-row dpe-comp-row">
                <span class="dpe-label">Войска</span>
                <div class="dpe-comp">
                  <label v-for="u in COMP_UNITS" :key="u.key" class="dpe-unit">
                    <span class="dpe-unit-lbl">{{ u.label }}</span>
                    <input type="number" min="0" class="dpe-unit-input"
                      :value="addComp[u.key]"
                      @change="addComp = { ...addComp, [u.key]: +($event.target as HTMLInputElement).value }"
                    />
                  </label>
                </div>
              </div>
              <div class="dpe-actions">
                <button class="btn btn-primary btn-sm" @click="confirmAddAttack">Добавить</button>
                <button class="btn btn-secondary btn-sm" @click="addingAttack = false">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- ── Legend ────────────────────────────────────────────────────────── -->
    <div class="map-legend">
      <div v-for="l in TYPE_LEGEND" :key="l.label" class="leg-item">
        <span class="leg-line" :style="{ background: l.color, boxShadow: `0 0 4px ${l.color}` }" />
        <span>{{ l.label }}</span>
      </div>
      <span class="vsep" />
      <div class="leg-item">
        <span class="leg-dash" />
        <span>Предупреждение</span>
      </div>
      <div class="leg-item">
        <span class="leg-dot" style="background:#2a2d3e; outline: 2px solid #e94560; outline-offset: 1px;" />
        <span>Цель</span>
      </div>
      <div v-if="planStore.reservedVillages.size > 0" class="leg-item">
        <span class="leg-dot leg-dot-reserved" />
        <span>Резерв ({{ planStore.reservedVillages.size }})</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useVillagesStore } from '@/stores/villagesStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePresetsStore, CAT_TARGET_LABELS } from '@/stores/presetsStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { watchtowerIcon } from '@/utils/unitIcons'
import type { Village } from '@/stores/villagesStore'
import type { Target, Attack, AttackType, AttackComposition } from '@/stores/planStore'

const planStore      = usePlanStore()
const villagesStore  = useVillagesStore()
const worldStore     = useWorldStore()
const presetsStore   = usePresetsStore()
const enemyStore     = useEnemyDataStore()
const { toDatetimeLocal } = useDateFormat()

// ── Display toggles ───────────────────────────────────────────────────
const showTowers      = ref(true)
const showSpam        = ref(false)
const showCatMass     = ref(false)
const showAllVillages = ref(false)
const hideAssigned   = ref(false)
const showLabels      = ref(true)
const filterPlayer    = ref('')
const filterEnemy     = ref('')

// ── Village pool filter ───────────────────────────────────────────────
type VillageFilter = 'all' | 'offs' | 'full_off' | 'mid_off' | 'mini_off' | 'breach' | 'paladin' | 'nobles' | 'cat_wave'
const villageFilter = ref<VillageFilter>('all')

const VFILTER_OPTS: Array<{ value: VillageFilter; label: string; color?: string; hint: string }> = [
  { value: 'all',      label: 'Все',       hint: 'Весь пул деревень без фильтра' },
  { value: 'offs',     label: 'Все оффы',  color: '#e94560', hint: 'Все офф-деревни (Full + Mid + Mini)' },
  { value: 'full_off', label: 'Full_OFF',  color: '#e94560', hint: 'Full_OFF — полные оффы (высший порог offFarm)' },
  { value: 'mid_off',  label: 'Mid_OFF',   color: '#c87d3e', hint: 'Mid_OFF — средний офф (между порогами Mid и Full)' },
  { value: 'mini_off', label: 'Mini_OFF',  color: '#b8a832', hint: 'Mini_OFF — мини офф (между порогами Mini и Mid)' },
  { value: 'breach',   label: 'Пробой',    color: '#89b4fa', hint: 'Full_OFF с таранами ≥ порога пробоя (могут пробить стену)' },
  { value: 'paladin',  label: 'Пал-офф',   color: '#a99ef0', hint: 'Деревни с офф-паладином (pal_off или breach+pal)' },
  { value: 'nobles',   label: 'Дворяне',   color: '#a78bfa', hint: 'Деревни, из которых идёт дворянская атака в плане' },
  { value: 'cat_wave', label: 'Кат волна', color: '#89b4fa', hint: 'Деревни, назначенные в кат волну' },
]

function villageMatchesFilter(v: Village): boolean {
  if (villageFilter.value === 'all') return true
  const up = worldStore.settings.unitPop
  const ps = presetsStore
  const offFarm = v.troops.axe * up.axe + v.troops.light * up.light + v.troops.ram * up.ram
  switch (villageFilter.value) {
    case 'offs':     return offFarm >= ps.smallOffMinOffFarm
    case 'full_off': return offFarm >= ps.fullOffMinOffFarm
    case 'mid_off':  return offFarm >= ps.halfOffMinOffFarm && offFarm < ps.fullOffMinOffFarm
    case 'mini_off': return offFarm >= ps.smallOffMinOffFarm && offFarm < ps.halfOffMinOffFarm
    case 'breach':   return offFarm >= ps.fullOffMinOffFarm && v.troops.ram >= ps.breachMinRams
    case 'paladin':   return planStore.palVillageCoords.has(v.coords)
    case 'nobles':    return nobleAttackCoords.value.has(v.coords)
    case 'cat_wave':  return catWaveCoords.value.has(v.coords)
    default:          return true
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────
const containerEl = ref<HTMLElement | null>(null)
const canvasEl    = ref<HTMLCanvasElement | null>(null)

// ── Pan / zoom — plain vars, NOT reactive refs.
// Kept out of Vue's reactivity so wheel/drag events bypass VDOM entirely.
let _scale = 1
let _panX  = 0
let _panY  = 0

// ── Sprite image ──────────────────────────────────────────────────────
let _villageImg: HTMLImageElement | null = null
let _towerImg:   HTMLImageElement | null = null
const imgLoaded = ref(false)

// Map village points to sprite sheet cell {col, row} in villages.png (3×2)
function villageSprite(points: number): { col: number; row: number } {
  if (points < 100)   return { col: 0, row: 0 }
  if (points < 500)   return { col: 1, row: 0 }
  if (points < 1000)  return { col: 2, row: 0 }
  if (points < 3000)  return { col: 0, row: 1 }
  if (points < 10000) return { col: 1, row: 1 }
  return { col: 2, row: 1 }
}

// ── RAF ───────────────────────────────────────────────────────────────
let _rafId: number | null = null

function scheduleFrame() {
  if (_rafId !== null) return
  _rafId = requestAnimationFrame(() => { _rafId = null; drawFrame() })
}

// ── Village sprite layout ─────────────────────────────────────────────
const VS_COLS = 3, VS_ROWS = 2
const VS_R    = 15                // visual radius in screen pixels

// ── Attack type colors ────────────────────────────────────────────────
const C_OFF   = '#e94560'
const C_NOBLE = '#a78bfa'
const C_SPLIT = '#f5a623'
const C_SPAM  = '#6c7086'
const C_EXCL  = '#313244'

const TYPE_LEGEND = [
  { color: C_OFF,   label: 'Офф-атаки'   },
  { color: C_NOBLE, label: 'Дворяне'      },
  { color: C_SPLIT, label: 'Медиум/Сплит' },
  { color: C_SPAM,  label: 'Спам'         },
]

// ── Player colors ─────────────────────────────────────────────────────
const PLAYER_PALETTE = [
  '#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7',
  '#89dceb', '#fab387', '#94e2d5', '#f38ba8',
  '#b4befe', '#74c7ec',
]

const playerColorMap = computed(() => {
  const m = new Map<string, string>()
  let i = 0
  for (const v of villagesStore.villages) {
    if (!m.has(v.player)) m.set(v.player, PLAYER_PALETTE[i++ % PLAYER_PALETTE.length])
  }
  return m
})

function playerColor(player: string): string {
  return playerColorMap.value.get(player) ?? '#89b4fa'
}

function targetTower(coords: string) {
  return planStore.watchtowerVillages.find(w => w.coords === coords) ?? null
}

function shortName(player: string): string {
  return player.length > 12 ? player.slice(0, 12) + '…' : player
}

const allPlayers = computed(() => [...playerColorMap.value.keys()])

const allEnemies = computed(() => {
  const s = new Set<string>()
  for (const t of planStore.targets)
    if (t.enemyPlayer) s.add(t.enemyPlayer)
  return [...s].sort()
})

// ── Attack type color ─────────────────────────────────────────────────
function atkTypeColor(atk: Attack): string {
  if (atk.excluded) return C_EXCL
  return atk.color ?? C_OFF
}

function atkBadgeStyle(atk: Attack): Record<string, string> {
  const c = atkTypeColor(atk)
  return { background: c + '22', color: c, borderColor: c + '55' }
}

function atkTypeShort(atk: Attack): string {
  const t = atk.type
  if (t === 'paladin_off')    return 'Пал-Офф'
  if (t === 'off')            return 'Офф'
  if (t === 'spam_noble')     return 'Спам-двор'
  if (t === 'spam')           return 'Спам'
  if (t === 'mid_off')  return 'Медиум'
  if (t === 'mini_off') return 'Мини'
  if (t === 'cat')            return atk.catTarget ? `CAT (${CAT_TARGET_LABELS[atk.catTarget]})` : 'CAT'
  return t
}

function atkLabel(atk: Attack): string {
  if (atk.type === 'cat') return atkTypeShort(atk)
  return atk.label ?? atkTypeShort(atk)
}

const WARN_TEXT: Record<string, string> = {
  SEND_IN_PAST:     '⏰ Время отправки уже прошло',
  NIGHT_ARRIVAL:    '🌙 Прилёт попадает в ночное окно',
  NIGHT_SEND:       '🌙 Отправка попадает в ночное окно',
  WATCHTOWER_HIT:   '👁 Засвет башней наблюдения',
  MORALE_HIGH_RISK: '⚖ Мораль: высокий риск (< 1×)',
  MORALE_MEDIUM:    '⚖ Мораль: средний риск (< 1.5×)',
}

function warnText(code: string): string {
  return WARN_TEXT[code] ?? code
}

function atkTypeColorByLabel(lbl: string): string {
  if (lbl.includes('двор') || lbl.includes('Двор')) return C_NOBLE
  if (lbl === 'Спам' || lbl === 'Спам-двор') return C_SPAM
  if (lbl.includes('Медиум') || lbl.includes('Mid') || lbl.includes('Mini')) return C_SPLIT
  return C_OFF
}

// ── Unique attack-line pairs ──────────────────────────────────────────
// lineW is in screen-pixel base (divided by _scale at draw time).
// dashType replaces the old scale-dependent string — computed once, not per zoom.
interface Pair {
  key: string
  fx: number; fy: number; tx: number; ty: number
  count: number; color: string
  isSpam: boolean; opacity: number
  lineW: number
  dashType: 'crit' | 'warn' | null
  attacks: Attack[]
}

const TYPE_PRIORITY: Record<string, number> = {
  [C_NOBLE]: 3, [C_OFF]: 2, [C_SPLIT]: 1, [C_SPAM]: 0, [C_EXCL]: -1,
}

const uniquePairs = computed<Pair[]>(() => {
  const map = new Map<string, Pair>()
  for (const atk of planStore.attacks) {
    if (filterPlayer.value && atk.fromVillage.player !== filterPlayer.value) continue
    if (filterEnemy.value && atk.target.enemyPlayer !== filterEnemy.value) continue
    const key   = `${atk.fromVillage.coords}→${atk.target.coords}`
    const color = atkTypeColor(atk)
    const isSpam = atk.type === 'spam' || atk.type === 'spam_noble'
    const ex = map.get(key)
    if (!ex) {
      map.set(key, {
        key,
        fx: atk.fromVillage.x, fy: atk.fromVillage.y,
        tx: atk.target.x,      ty: atk.target.y,
        count: 1, color, isSpam,
        opacity: atk.excluded ? 0.2 : 0.8,
        lineW: 0, dashType: null, attacks: [atk],
      })
    } else {
      ex.count++
      ex.attacks.push(atk)
      if ((TYPE_PRIORITY[color] ?? 0) > (TYPE_PRIORITY[ex.color] ?? 0)) ex.color = color
      if (!atk.excluded) ex.opacity = 0.8
      if (!isSpam) ex.isSpam = false
    }
  }
  for (const p of map.values()) {
    const nonExcl = p.attacks.filter(a => !a.excluded)
    p.lineW = nonExcl.length >= 4 ? 2.5 : nonExcl.length >= 2 ? 1.8 : 1.2
    const hasCrit  = nonExcl.some(a => a.warnings.includes('MORALE_HIGH_RISK'))
    const hasTower = nonExcl.some(a => a.warnings.includes('WATCHTOWER_HIT'))
    p.dashType = hasCrit ? 'crit' : hasTower ? 'warn' : null
  }
  return [...map.values()]
})

const visiblePairs = computed(() => {
  const filteredCoords = villageFilter.value === 'all'
    ? null
    : new Set(renderedVillages.value.map(v => v.coords))
  return uniquePairs.value.filter(p => {
    if (p.isSpam && !showSpam.value) return false
    if (p.attacks[0]?.catMass && !showCatMass.value) return false
    const fromCoords = p.attacks[0]?.fromVillage.coords
    if (hideAssigned.value && fromCoords && attackingCoords.value.has(fromCoords)) return false
    if (filteredCoords) {
      if (fromCoords && !filteredCoords.has(fromCoords)) return false
    }
    return true
  })
})
const pairsWithCount = computed(() => visiblePairs.value.filter(p => p.count > 1))
const detectedCount  = computed(() => uniquePairs.value.filter(p =>
  p.attacks.some(a => a.warnings.includes('WATCHTOWER_HIT') || a.warnings.includes('MORALE_HIGH_RISK'))
).length)

// ── Villages ──────────────────────────────────────────────────────────
const attackingCoords = computed(() => {
  let attacks = filterEnemy.value
    ? planStore.attacks.filter(a => a.target.enemyPlayer === filterEnemy.value)
    : planStore.attacks
  if (!showCatMass.value) {
    // exclude villages whose only attacks are cat mass
    const nonCatCoords = new Set(attacks.filter(a => !a.catMass).map(a => a.fromVillage.coords))
    attacks = attacks.filter(a => nonCatCoords.has(a.fromVillage.coords))
  }
  return new Set(attacks.map(a => a.fromVillage.coords))
})

const nobleAttackCoords = computed(() =>
  new Set(planStore.attacks.filter(a => (a.composition.snob ?? 0) > 0).map(a => a.fromVillage.coords))
)

const catWaveCoords = computed(() =>
  new Set(planStore.attacks.filter(a => a.catMass).map(a => a.fromVillage.coords))
)

const renderedVillages = computed(() => {
  const base = filterPlayer.value
    ? villagesStore.villages.filter(v => v.player === filterPlayer.value)
    : villagesStore.villages
  const filtered = villageFilter.value === 'all'
    ? base
    : base.filter(v => villageMatchesFilter(v))
  const byAssigned = hideAssigned.value
    ? filtered.filter(v => !attackingCoords.value.has(v.coords))
    : filtered
  if (showAllVillages.value) return byAssigned
  return byAssigned.filter(v => attackingCoords.value.has(v.coords))
})

function isAttacking(coords: string): boolean {
  return attackingCoords.value.has(coords)
}

// ── Targets ───────────────────────────────────────────────────────────
const attacksByTarget = computed(() => planStore.attacksByTarget)

function targetHasAttacks(id: string): boolean {
  return (attacksByTarget.value.get(id)?.length ?? 0) > 0
}

function targetBorderColor(id: string): string {
  const atks = attacksByTarget.value.get(id)
  if (!atks || atks.length === 0) return '#45475a'
  const hasNoble = atks.some(a => a.type.startsWith('noble') || a.type === 'spam_noble')
  return hasNoble ? C_NOBLE : C_OFF
}

// ── Bbox ──────────────────────────────────────────────────────────────
const bbox = computed(() => {
  const pts = [
    ...villagesStore.villages.map(v => ({ x: v.x, y: v.y })),
    ...planStore.targets.filter(t => t.coords).map(t => ({ x: t.x, y: t.y })),
    ...planStore.watchtowerVillages.map(w => ({ x: w.x, y: w.y })),
  ]
  if (pts.length === 0) return { minX: 400, minY: 400, maxX: 600, maxY: 600 }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
})

// ── Fit to data ───────────────────────────────────────────────────────
function fitToData() {
  const canvas = canvasEl.value
  const cW = (canvas?.clientWidth  || 800)
  const cH = (canvas?.clientHeight || 600)
  const pad = 60
  const bx  = bbox.value
  const bW  = (bx.maxX - bx.minX) || 50
  const bH  = (bx.maxY - bx.minY) || 50
  const s   = Math.min(cW / (bW + pad * 2), cH / (bH + pad * 2))
  _scale = s
  _panX  = (cW - bW * s) / 2 - bx.minX * s
  _panY  = (cH - bH * s) / 2 - bx.minY * s
  scheduleFrame()
}

// ── isEmpty ───────────────────────────────────────────────────────────
const isEmpty = computed(() =>
  villagesStore.villages.length === 0 && planStore.targets.length === 0
)

// ─────────────────────────────────────────────────────────────────────
// Canvas drawing
// ─────────────────────────────────────────────────────────────────────

function drawFrame() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const dw  = (canvas.clientWidth  || canvas.width)
  const dh  = (canvas.clientHeight || canvas.height)
  const pw  = Math.round(dw * dpr)
  const ph  = Math.round(dh * dpr)
  if (canvas.width !== pw) canvas.width  = pw
  if (canvas.height !== ph) canvas.height = ph

  const w = dw, h = dh
  ctx.clearRect(0, 0, pw, ph)

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.translate(_panX, _panY)
  ctx.scale(_scale, _scale)

  drawGrid(ctx)
  if (showTowers.value && worldStore.settings.watchtowerEnabled) drawTowers(ctx)
  drawLines(ctx)
  drawVillages(ctx)
  drawTargets(ctx)

  ctx.restore()
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  const bx  = bbox.value
  const pad = 30, step = 50
  const x0  = Math.floor((bx.minX - pad) / step) * step
  const x1  = Math.ceil( (bx.maxX + pad) / step) * step
  const y0  = Math.floor((bx.minY - pad) / step) * step
  const y1  = Math.ceil( (bx.maxY + pad) / step) * step

  ctx.beginPath()
  ctx.strokeStyle = '#3a6030'
  ctx.lineWidth   = 0.4 / _scale
  ctx.globalAlpha = 0.3
  for (let x = x0; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
  for (let y = y0; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawTowers(ctx: CanvasRenderingContext2D) {
  for (const tw of planStore.watchtowerVillages) {
    if (filterEnemy.value) {
      const twPlayer = tw.player || enemyStore.lookupCoords(tw.coords)?.player?.name || ''
      if (twPlayer !== filterEnemy.value) continue
    }
    ctx.beginPath()
    ctx.arc(tw.x, tw.y, tw.level, 0, Math.PI * 2)
    ctx.fillStyle   = '#f38ba8'
    ctx.globalAlpha = 0.04
    ctx.fill()
    ctx.strokeStyle = '#f38ba8'
    ctx.lineWidth   = 0.8 / _scale
    ctx.setLineDash([2 / _scale, 2 / _scale])
    ctx.globalAlpha = 0.45
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // Tower center dot
    const dotR = Math.max(2.5, Math.min(5, 3.5 / _scale))
    ctx.beginPath()
    ctx.arc(tw.x, tw.y, dotR / _scale, 0, Math.PI * 2)
    ctx.fillStyle = '#f38ba8'
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.strokeStyle = '#0d0e14'
    ctx.lineWidth = 0.8 / _scale
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

function drawLines(ctx: CanvasRenderingContext2D) {
  const highlighted = highlightedPairKey.value
  const pairs       = visiblePairs.value

  for (const p of pairs) {
    const dx = p.tx - p.fx, dy = p.ty - p.fy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) continue

    const nx = dx / len, ny = dy / len
    const margin  = (VS_R + 1) / _scale
    const arrowL  = 8 / _scale
    const arrowW  = 4 / _scale

    const sx = p.fx + nx * margin
    const sy = p.fy + ny * margin
    const ex = p.tx - nx * margin
    const ey = p.ty - ny * margin

    const isHL  = highlighted !== null && p.key === highlighted
    const alpha = highlighted !== null ? (isHL ? 1 : 0.08) : p.opacity
    const lw    = (isHL ? p.lineW * 2.5 : p.lineW) / _scale

    ctx.globalAlpha = alpha
    ctx.strokeStyle = p.color
    ctx.lineWidth   = lw

    if      (p.dashType === 'crit') ctx.setLineDash([2 / _scale, 2 / _scale])
    else if (p.dashType === 'warn') ctx.setLineDash([5 / _scale, 2.5 / _scale])
    else                            ctx.setLineDash([])

    // Line body
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex - nx * arrowL, ey - ny * arrowL)
    ctx.stroke()
    ctx.setLineDash([])

    // Arrow head
    const ax = ex - nx * arrowL, ay = ey - ny * arrowL
    const px = -ny * arrowW,     py =  nx * arrowW
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ax + px, ay + py)
    ctx.lineTo(ax - px, ay - py)
    ctx.closePath()
    ctx.fillStyle = p.color
    ctx.fill()
  }

  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Count badges on multi-attack routes
  for (const p of pairsWithCount.value) {
    const cx2 = (p.fx + p.tx) / 2
    const cy2 = (p.fy + p.ty) / 2
    const r   = 5.5 / _scale

    ctx.beginPath()
    ctx.arc(cx2, cy2, r, 0, Math.PI * 2)
    ctx.fillStyle   = p.color
    ctx.globalAlpha = 0.95
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle    = '#0d0e14'
    ctx.font         = `bold ${5 / _scale}px sans-serif`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(p.count), cx2, cy2 + 0.3 / _scale)
  }
}

function drawVillages(ctx: CanvasRenderingContext2D) {
  const img  = _villageImg
  const r    = VS_R / _scale
  const cellW = img ? img.naturalWidth  / VS_COLS : 0
  const cellH = img ? img.naturalHeight / VS_ROWS : 0

  for (const v of renderedVillages.value) {
    const isAtk      = attackingCoords.value.has(v.coords)
    const isSel      = selectedVillageCoords.value === v.coords
    const isReserved = planStore.reservedVillages.has(v.coords)
    ctx.globalAlpha = isReserved ? 0.25 : (isAtk || isSel ? 1 : 0.42)

    if (img) {
      const sp = villageSprite(v.points)
      ctx.save()
      ctx.beginPath()
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, sp.col * cellW, sp.row * cellH, cellW, cellH, v.x - r, v.y - r, r * 2, r * 2)
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#3a3d56'
      ctx.fill()
    }

    // Ring — selected (white) or reserved (gold)
    if (isSel) {
      ctx.beginPath()
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = 3.5 / _scale
      ctx.stroke()
    } else if (isReserved) {
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(v.x, v.y, r + 2 / _scale, 0, Math.PI * 2)
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth   = 2 / _scale
      ctx.setLineDash([4 / _scale, 3 / _scale])
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (showLabels.value) {
      const textColor = isAtk ? playerColor(v.player) : '#6c7086'
      ctx.textAlign   = 'center'
      ctx.strokeStyle = '#0d0e14'

      ctx.globalAlpha  = isAtk ? 0.95 : 0.7
      ctx.fillStyle    = textColor
      ctx.font         = `bold ${9 / _scale}px sans-serif`
      ctx.lineWidth    = 2.5 / _scale
      ctx.textBaseline = 'bottom'
      const ty1 = v.y - (VS_R + 5) / _scale
      ctx.strokeText(v.coords, v.x, ty1)
      ctx.fillText(v.coords, v.x, ty1)

      ctx.globalAlpha  = 0.55
      ctx.fillStyle    = isAtk ? '#89b4fa' : '#585b70'
      ctx.font         = `${7 / _scale}px sans-serif`
      ctx.lineWidth    = 2 / _scale
      ctx.textBaseline = 'top'
      const ty2 = v.y + (VS_R + 3) / _scale
      ctx.strokeText(shortName(v.player), v.x, ty2)
      ctx.fillText(shortName(v.player), v.x, ty2)
    }

    ctx.globalAlpha = 1
  }
}

function drawTargets(ctx: CanvasRenderingContext2D) {
  const img   = _villageImg
  const r     = VS_R / _scale
  const cellW = img ? img.naturalWidth  / VS_COLS : 0
  const cellH = img ? img.naturalHeight / VS_ROWS : 0
  const targets    = planStore.targets.filter(t => t.coords && (!filterEnemy.value || t.enemyPlayer === filterEnemy.value))
  const towerCoords = new Set(planStore.watchtowerVillages.map(w => w.coords))

  for (const t of targets) {
    const isSel      = selectedTargetId.value === t.id
    const borderColor = isSel ? '#ffffff' : '#e94560'

    if (img) {
      const epts = enemyStore.lookupCoords(t.coords)?.village.points ?? 0
      const sp   = villageSprite(epts)
      ctx.save()
      ctx.beginPath()
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, sp.col * cellW, sp.row * cellH, cellW, cellH, t.x - r, t.y - r, r * 2, r * 2)
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#2a2d3e'
      ctx.fill()
    }

    // Inner ring
    ctx.beginPath()
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth   = (isSel ? 3.5 : 2) / _scale
    ctx.globalAlpha = 0.95
    ctx.stroke()
    ctx.globalAlpha = 1

    // Outer dashed ring
    ctx.beginPath()
    ctx.arc(t.x, t.y, (VS_R + 3.5) / _scale, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth   = 1 / _scale
    ctx.setLineDash([3 / _scale, 2.5 / _scale])
    ctx.globalAlpha = 0.45
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    if (showLabels.value) {
      ctx.textAlign   = 'center'
      ctx.strokeStyle = '#0d0e14'

      ctx.globalAlpha  = 0.9
      ctx.fillStyle    = '#cdd6f4'
      ctx.font         = `bold ${9 / _scale}px sans-serif`
      ctx.lineWidth    = 2.5 / _scale
      ctx.textBaseline = 'bottom'
      ctx.strokeText(t.coords, t.x, t.y - (VS_R + 6) / _scale)
      ctx.fillText(t.coords, t.x, t.y - (VS_R + 6) / _scale)

      if (t.enemyPlayer) {
        ctx.globalAlpha  = 0.7
        ctx.fillStyle    = '#a6adc8'
        ctx.font         = `${7 / _scale}px sans-serif`
        ctx.lineWidth    = 2 / _scale
        ctx.textBaseline = 'top'
        ctx.strokeText(t.enemyPlayer, t.x, t.y + (VS_R + 4) / _scale)
        ctx.fillText(t.enemyPlayer, t.x, t.y + (VS_R + 4) / _scale)
      }
      ctx.globalAlpha = 1
    }

    // Attack count badge
    if (targetHasAttacks(t.id)) {
      const cnt = (attacksByTarget.value.get(t.id) ?? []).length
      const br  = 6 / _scale
      const bx2 = t.x + (VS_R + 3) / _scale
      const by2 = t.y - (VS_R + 3) / _scale

      ctx.beginPath()
      ctx.arc(bx2, by2, br, 0, Math.PI * 2)
      ctx.fillStyle   = '#e94560'
      ctx.globalAlpha = 0.92
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.fillStyle    = '#ffffff'
      ctx.font         = `bold ${5.5 / _scale}px sans-serif`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(cnt), bx2, by2 + 0.3 / _scale)
    }

    // Tower badge (top-left) — watchtower icon in white circle
    if (towerCoords.has(t.coords) && _towerImg) {
      const br  = 7 / _scale
      const cx3 = t.x - (VS_R + 3) / _scale
      const cy3 = t.y - (VS_R + 3) / _scale
      ctx.beginPath()
      ctx.arc(cx3, cy3, br, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.95
      ctx.fill()
      ctx.globalAlpha = 1
      const sz  = 11 / _scale
      ctx.globalAlpha = 0.95
      ctx.drawImage(_towerImg, cx3 - sz / 2, cy3 - sz / 2, sz, sz)
      ctx.globalAlpha = 1
    } else if (towerCoords.has(t.coords)) {
      // fallback until image loads
      const br  = 6 / _scale
      const bx3 = t.x - (VS_R + 3) / _scale
      const by3 = t.y - (VS_R + 3) / _scale
      ctx.beginPath()
      ctx.arc(bx3, by3, br, 0, Math.PI * 2)
      ctx.fillStyle = '#f38ba8'; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
      ctx.fillStyle = '#0d0e14'
      ctx.font = `bold ${6.5 / _scale}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('T', bx3, by3 + 0.3 / _scale)
    }
  }

  // ── Cat wave targets (drawn only when showCatMass is on) ──────────────
  if (showCatMass.value) {
    const CAT_COLOR = '#89b4fa'
    for (const t of planStore.catTargets) {
      if (!t.coords || !t.x) continue
      const r2 = VS_R / _scale

      if (img) {
        const epts = enemyStore.lookupCoords(t.coords)?.village.points ?? 0
        const sp   = villageSprite(epts)
        ctx.save()
        ctx.beginPath()
        ctx.arc(t.x, t.y, r2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, sp.col * cellW, sp.row * cellH, cellW, cellH, t.x - r2, t.y - r2, r2 * 2, r2 * 2)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(t.x, t.y, r2, 0, Math.PI * 2)
        ctx.fillStyle = '#1e2030'
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(t.x, t.y, r2, 0, Math.PI * 2)
      ctx.strokeStyle = CAT_COLOR
      ctx.lineWidth   = 2 / _scale
      ctx.globalAlpha = 0.9
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.beginPath()
      ctx.arc(t.x, t.y, (VS_R + 3.5) / _scale, 0, Math.PI * 2)
      ctx.strokeStyle = CAT_COLOR
      ctx.lineWidth   = 1 / _scale
      ctx.setLineDash([3 / _scale, 2.5 / _scale])
      ctx.globalAlpha = 0.4
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      if (showLabels.value) {
        ctx.textAlign   = 'center'
        ctx.strokeStyle = '#0d0e14'
        ctx.globalAlpha  = 0.9
        ctx.fillStyle    = CAT_COLOR
        ctx.font         = `bold ${9 / _scale}px sans-serif`
        ctx.lineWidth    = 2.5 / _scale
        ctx.textBaseline = 'bottom'
        ctx.strokeText(t.coords, t.x, t.y - (VS_R + 6) / _scale)
        ctx.fillText(t.coords, t.x, t.y - (VS_R + 6) / _scale)
        if (t.enemyPlayer) {
          ctx.globalAlpha  = 0.7
          ctx.fillStyle    = '#a6adc8'
          ctx.font         = `${7 / _scale}px sans-serif`
          ctx.lineWidth    = 2 / _scale
          ctx.textBaseline = 'top'
          ctx.strokeText(t.enemyPlayer, t.x, t.y + (VS_R + 4) / _scale)
          ctx.fillText(t.enemyPlayer, t.x, t.y + (VS_R + 4) / _scale)
        }
        ctx.globalAlpha = 1
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mouse / hit-testing
// ─────────────────────────────────────────────────────────────────────

function screenToWorld(cx: number, cy: number) {
  return { wx: (cx - _panX) / _scale, wy: (cy - _panY) / _scale }
}

function hitTest(wx: number, wy: number) {
  const hr2 = ((VS_R + 4) / _scale) ** 2
  // Targets on top
  for (const t of planStore.targets) {
    if (!t.coords) continue
    const dx = wx - t.x, dy = wy - t.y
    if (dx * dx + dy * dy <= hr2) return { type: 'target' as const, id: t.id }
  }
  for (const v of renderedVillages.value) {
    const dx = wx - v.x, dy = wy - v.y
    if (dx * dx + dy * dy <= hr2) return { type: 'village' as const, coords: v.coords }
  }
  return null
}

let _isDragging = false
let _isDragged  = false
let _dsx = 0, _dsy = 0, _pox = 0, _poy = 0

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  _isDragging = true
  _isDragged  = false
  _dsx = e.clientX; _dsy = e.clientY
  _pox = _panX;     _poy = _panY
}

function onMouseMove(e: MouseEvent) {
  if (_isDragging) {
    const dx = e.clientX - _dsx, dy = e.clientY - _dsy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _isDragged = true
    _panX = _pox + dx
    _panY = _poy + dy
    scheduleFrame()
  }

  const rect = containerEl.value!.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const { wx, wy } = screenToWorld(cx, cy)
  const hit = hitTest(wx, wy)

  if (canvasEl.value) {
    canvasEl.value.style.cursor = hit ? 'pointer' : (_isDragging ? 'grabbing' : 'grab')
  }

  if (hit?.type === 'village') {
    const v = renderedVillages.value.find(v2 => v2.coords === hit.coords)
    if (v) buildVillageTip(v, cx + 16, cy - 16)
  } else if (hit?.type === 'target') {
    const t = planStore.targets.find(t2 => t2.id === hit.id)
    if (t) buildTargetTip(t, cx + 16, cy - 16)
  } else if (!_isDragging) {
    tooltip.value = null
  }
}

function onMouseUp() {
  _isDragging = false
  if (canvasEl.value) canvasEl.value.style.cursor = 'grab'
}

function onMouseLeave() {
  _isDragging = false
  tooltip.value = null
  if (canvasEl.value) canvasEl.value.style.cursor = 'grab'
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const rect   = containerEl.value!.getBoundingClientRect()
  const cx     = e.clientX - rect.left
  const cy     = e.clientY - rect.top
  const gx     = (cx - _panX) / _scale
  const gy     = (cy - _panY) / _scale
  const ns     = Math.max(0.05, Math.min(200, _scale * factor))
  _panX   = cx - gx * ns
  _panY   = cy - gy * ns
  _scale  = ns
  scheduleFrame()
}

function onMapClick(e: MouseEvent) {
  if (_isDragged) { _isDragged = false; return }

  const rect = containerEl.value!.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const { wx, wy } = screenToWorld(cx, cy)
  const hit = hitTest(wx, wy)

  if      (hit?.type === 'village') selectVillage(hit.coords)
  else if (hit?.type === 'target')  selectTarget(hit.id)
  else { selectedTargetId.value = null; selectedVillageCoords.value = null }
}

// ─────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────

interface TooltipRow { text?: string; dot?: string; sep?: boolean }
interface Tooltip { head: string; sub?: string; rows: TooltipRow[]; x: number; y: number }
const tooltip = ref<Tooltip | null>(null)

const TROOP_LABELS: Array<{ key: keyof Village['troops']; label: string }> = [
  { key: 'axe',      label: 'Топ'  },
  { key: 'light',    label: 'ЛК'   },
  { key: 'heavy',    label: 'ТК'   },
  { key: 'ram',      label: 'Тар'  },
  { key: 'catapult', label: 'Кат'  },
  { key: 'knight',   label: 'Пал'  },
  { key: 'snob',     label: 'Двор' },
  { key: 'spy',      label: 'Разв' },
  { key: 'spear',    label: 'Коп'  },
  { key: 'sword',    label: 'Меч'  },
]

function troopRows(troops: Village['troops']): TooltipRow[] {
  const parts = TROOP_LABELS
    .filter(({ key }) => (troops[key] ?? 0) > 0)
    .map(({ key, label }) => `${label}: ${troops[key]}`)
  if (parts.length === 0) return [{ text: 'Войск нет' }]
  const rows: TooltipRow[] = []
  for (let i = 0; i < parts.length; i += 3) rows.push({ text: parts.slice(i, i + 3).join('  ·  ') })
  return rows
}

function buildVillageTip(v: Village, x: number, y: number) {
  const attacks = planStore.attacks.filter(a => a.fromVillage.coords === v.coords && !a.excluded)
  const byType  = new Map<string, number>()
  for (const a of attacks) {
    const lbl = atkLabel(a)
    byType.set(lbl, (byType.get(lbl) ?? 0) + 1)
  }
  const atkRows: TooltipRow[] = attacks.length === 0
    ? [{ text: 'Не атакует' }]
    : [
        { text: `Атак: ${attacks.length}` },
        ...[...byType.entries()].map(([lbl, cnt]) => ({ text: `${lbl}: ${cnt}`, dot: playerColor(v.player) })),
      ]
  tooltip.value = { head: v.coords, sub: v.player, rows: [...atkRows, { sep: true }, ...troopRows(v.troops)], x, y }
}

function buildTargetTip(t: Target, x: number, y: number) {
  const atks   = attacksByTarget.value.get(t.id) ?? []
  const byType = new Map<string, number>()
  for (const a of atks.filter(a => !a.excluded)) {
    const lbl = atkLabel(a)
    byType.set(lbl, (byType.get(lbl) ?? 0) + 1)
  }
  tooltip.value = {
    head: t.coords, sub: t.enemyPlayer ?? undefined,
    rows: [
      { text: `Атак: ${atks.length}` },
      ...[...byType.entries()].map(([lbl, cnt]) => ({ text: `${lbl}: ${cnt}`, dot: atkTypeColorByLabel(lbl) })),
    ],
    x, y,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Selected target / village / detail panel
// ─────────────────────────────────────────────────────────────────────

const selectedTargetId      = ref<string | null>(null)
const selectedVillageCoords = ref<string | null>(null)

const selectedVillage = computed(() =>
  selectedVillageCoords.value
    ? villagesStore.villages.find(v => v.coords === selectedVillageCoords.value) ?? null
    : null
)

const selectedTarget = computed(() =>
  planStore.targets.find(t => t.id === selectedTargetId.value) ?? null
)

const selectedVillageAttacks = computed(() => {
  if (!selectedVillageCoords.value) return []
  return planStore.attacks
    .filter(a => a.fromVillage.coords === selectedVillageCoords.value)
    .slice().sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
})

const selectedTargetAttacks = computed(() => {
  if (!selectedTargetId.value) return []
  return (attacksByTarget.value.get(selectedTargetId.value) ?? [])
    .slice().sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
})

const activePanel   = computed(() => selectedVillageCoords.value ?? selectedTargetId.value)
const activeAttacks = computed(() =>
  selectedVillage.value ? selectedVillageAttacks.value : selectedTargetAttacks.value
)

function selectVillage(coords: string) {
  selectedVillageCoords.value = selectedVillageCoords.value === coords ? null : coords
  selectedTargetId.value = null
  editingAtkId.value = null
  addingAttack.value = false
}

function selectTarget(id: string) {
  const fromCoords = selectedVillageCoords.value

  const newId = selectedTargetId.value === id ? null : id
  selectedTargetId.value      = newId
  selectedVillageCoords.value = null
  editingAtkId.value          = null
  addingAttack.value          = false

  if (fromCoords && newId) {
    const target  = planStore.targets.find(t => t.id === newId)
    const village = villagesStore.villages.find(v => v.coords === fromCoords)
    addFromCoords.value = fromCoords
    addArrival.value    = target ? toDatetimeLocal(target.arrivalTime) : ''
    addType.value       = 'off'
    addComp.value       = village
      ? { ...village.troops }
      : { spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 }
    addingAttack.value  = true
  }
}

// ── Highlighted pair (hover from detail panel attack rows) ────────────
const hoveredAtkId = ref<string | null>(null)

const highlightedPairKey = computed(() => {
  if (!hoveredAtkId.value) return null
  return uniquePairs.value.find(p => p.attacks.some(a => a.id === hoveredAtkId.value))?.key ?? null
})

// ── Drag & drop (reorder attack arrival times in detail panel) ────────
const dragSourceId = ref<string | null>(null)
const dragOverId   = ref<string | null>(null)

function onDragStart(e: DragEvent, atkId: string) {
  dragSourceId.value = atkId
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(_e: DragEvent, atkId: string) {
  if (dragSourceId.value && dragSourceId.value !== atkId) dragOverId.value = atkId
}
function onDragLeave(atkId: string) {
  if (dragOverId.value === atkId) dragOverId.value = null
}
function onDrop(_e: DragEvent, targetAtkId: string) {
  if (dragSourceId.value && dragSourceId.value !== targetAtkId)
    planStore.swapAttackTimes(dragSourceId.value, targetAtkId)
  dragSourceId.value = null; dragOverId.value = null
}
function onDragEnd() { dragSourceId.value = null; dragOverId.value = null }

// ── Inline attack editor ──────────────────────────────────────────────
const ATK_TYPE_OPTIONS: Array<{ type: AttackType; label: string; color: string }> = [
  { type: 'off',            label: 'Офф',      color: C_OFF   },
  { type: 'paladin_off',    label: 'Пал-Офф',  color: C_OFF   },
  { type: 'mid_off',         label: 'Медиум',    color: C_SPLIT },
  { type: 'mini_off',        label: 'Мини',      color: C_SPLIT },
  { type: 'spam_noble',      label: 'Спам-двор', color: C_NOBLE },
  { type: 'spam',           label: 'Спам',     color: C_SPAM  },
]

const COMP_UNITS: Array<{ key: keyof AttackComposition; label: string }> = [
  { key: 'axe',      label: 'Топ'  },
  { key: 'light',    label: 'ЛК'   },
  { key: 'heavy',    label: 'ТК'   },
  { key: 'ram',      label: 'Тар'  },
  { key: 'catapult', label: 'Кат'  },
  { key: 'knight',   label: 'Пал'  },
  { key: 'snob',     label: 'Двор' },
  { key: 'spy',      label: 'Разв' },
  { key: 'spear',    label: 'Коп'  },
  { key: 'sword',    label: 'Меч'  },
]

const COLOR_PRESETS = [
  { color: null,      label: 'Авто'  },
  { color: '#4ecca3', label: 'Зел'   },
  { color: '#89b4fa', label: 'Синий' },
  { color: '#f9e2af', label: 'Жёлт'  },
  { color: '#e07b39', label: 'Рыж'   },
  { color: '#e94560', label: 'Красн' },
]

const editingAtkId   = ref<string | null>(null)
const editType       = ref<AttackType>('off')
const editArrival    = ref('')
const editLabel      = ref('')
const editColor      = ref<string | null>(null)
const editFromCoords = ref('')
const editComp       = ref<AttackComposition>({ spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 })

function toggleEdit(atk: Attack) {
  if (editingAtkId.value === atk.id) { editingAtkId.value = null; addingAttack.value = false; return }
  editingAtkId.value   = atk.id
  editType.value       = atk.type
  editArrival.value    = toDatetimeLocal(atk.arrivalTime)
  editLabel.value      = atk.label ?? ''
  editColor.value      = atk.color ?? null
  editFromCoords.value = selectedVillage.value ? atk.target.coords : atk.fromVillage.coords
  editComp.value       = { ...atk.composition }
  addingAttack.value   = false
}

function applyEdit(id: string) {
  const arrDate = new Date(editArrival.value)
  const coordPatch = selectedVillage.value
    ? { targetCoords:      editFromCoords.value || undefined }
    : { fromVillageCoords: editFromCoords.value || undefined }
  planStore.patchAttack(id, {
    type:  editType.value,
    label: editLabel.value || undefined,
    color: editColor.value,
    composition: { ...editComp.value },
    arrivalTime: isNaN(arrDate.getTime()) ? undefined : arrDate,
    ...coordPatch,
  })
  editingAtkId.value = null
}

// ── Add attack form ───────────────────────────────────────────────────
const addingAttack  = ref(false)
const addFromCoords = ref('')
const addType       = ref<AttackType>('off')
const addArrival    = ref('')
const addComp       = ref<AttackComposition>({ spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 })

function openAddForm() {
  addingAttack.value = !addingAttack.value
  if (addingAttack.value) {
    editingAtkId.value  = null
    addFromCoords.value = ''
    addType.value       = 'off'
    addArrival.value    = selectedTarget.value ? toDatetimeLocal(selectedTarget.value.arrivalTime) : ''
    addComp.value       = { spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 }
  }
}

function confirmAddAttack() {
  if (!selectedTargetId.value) return
  const arrDate = new Date(addArrival.value)
  if (isNaN(arrDate.getTime()) || !addFromCoords.value) return
  const ok = planStore.addManualAttack(selectedTargetId.value, addFromCoords.value, addType.value, { ...addComp.value }, arrDate)
  if (ok) addingAttack.value = false
}

// ── Detail panel display helpers ──────────────────────────────────────
const COMP_DISPLAY: Array<{ key: keyof AttackComposition; label: string }> = [
  { key: 'axe',      label: 'Топ'  },
  { key: 'light',    label: 'ЛК'   },
  { key: 'heavy',    label: 'ТК'   },
  { key: 'ram',      label: 'Тар'  },
  { key: 'catapult', label: 'Кат'  },
  { key: 'knight',   label: 'Пал'  },
  { key: 'snob',     label: 'Двор' },
  { key: 'spy',      label: 'Лаз'  },
  { key: 'spear',    label: 'Коп'  },
  { key: 'sword',    label: 'Меч'  },
]

function fmtUnit(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0', '') + 'к' : String(n)
}

function fmtTravel(seconds: number): string {
  const ms  = Math.round(seconds * 1000)
  const h   = Math.floor(ms / 3_600_000)
  const m   = Math.floor((ms % 3_600_000) / 60_000)
  const s   = Math.floor((ms % 60_000) / 1000)
  const msr = ms % 1000
  const ss  = `${String(s).padStart(2,'0')}.${String(msr).padStart(3,'0')}с`
  if (h > 0) return `${h}ч ${String(m).padStart(2,'0')}м ${ss}`
  if (m > 0) return `${m}м ${ss}`
  return ss
}

function compLine(atk: Attack): string {
  const troops = COMP_DISPLAY
    .filter(u => (atk.composition[u.key] ?? 0) > 0)
    .map(u => `${u.label} ${fmtUnit(atk.composition[u.key]!)}`)
    .join(' · ')
  return troops ? `${troops} · ⏱ ${fmtTravel(atk.travelSeconds)}` : `⏱ ${fmtTravel(atk.travelSeconds)}`
}

function fmtTime(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${dy}.${mo} ${hh}:${mm}:${ss}`
}

// ── watchEffect: trigger canvas redraws on reactive data changes ───────
watchEffect(() => {
  // Access reactive deps so Vue tracks them
  const _vp = visiblePairs.value.length
  const _rv = renderedVillages.value.length
  const _tl = planStore.targets.length
  const _al = planStore.attacks.length
  const _sv = selectedVillageCoords.value
  const _si = selectedTargetId.value
  const _hk = highlightedPairKey.value
  const _st = showTowers.value
  const _sl = showLabels.value
  const _il = imgLoaded.value
  const _cm = showCatMass.value
  const _ctl = planStore.catTargets.length
  void [_vp, _rv, _tl, _al, _sv, _si, _hk, _st, _sl, _il, _cm, _ctl]
  scheduleFrame()
})

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  const img = new Image()
  img.src = '/villages.png'
  img.onload = () => { _villageImg = img; imgLoaded.value = true }

  const timg = new Image()
  timg.src = watchtowerIcon
  timg.onload = () => { _towerImg = timg; scheduleFrame() }

  let ro: ResizeObserver | null = null
  if (containerEl.value) {
    ro = new ResizeObserver(() => scheduleFrame())
    ro.observe(containerEl.value)
  }

  fitToData()

  onUnmounted(() => {
    ro?.disconnect()
    if (_rafId !== null) cancelAnimationFrame(_rafId)
  })
})
</script>

<style lang="scss" scoped>
.map-page {
  margin: -1.5rem;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 52px);
  overflow: hidden;
}

// ── Toolbar ──────────────────────────────────────────────────────────
.map-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 0.55rem 1rem 0.5rem;
  background: $bg-panel;
  border-bottom: 1px solid $border;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tb-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  position: relative;
  padding-top: 0.9rem;
}

.tb-group-label {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $text-faint;
  white-space: nowrap;
  opacity: 0.7;
}

.vsep {
  width: 1px;
  height: 18px;
  background: $border;
  flex-shrink: 0;
}

.tog {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: $text-dim;
  cursor: pointer;
  user-select: none;
  input[type='checkbox'] { cursor: pointer; }
}

.vfilter-group {
  display: flex;
  gap: 0.2rem;
  flex-wrap: wrap;
}

.vfilter-btn {
  background: a($text-dim, 0.06);
  border: 1px solid $border;
  border-radius: 8px;
  color: $text-faint;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.14rem 0.5rem;
  transition: all 0.12s;
  white-space: nowrap;
  &:hover { border-color: $text-dim; color: $text-dim; }
  &.active { font-weight: 700; }
}

.player-filter {
  font-size: 0.8rem;
  padding: 0.18rem 0.5rem;
  height: 26px;
  cursor: pointer;
  max-width: 180px;
}

.toolbar-info {
  font-size: 0.78rem;
  color: $text-faint;
  &.dim { font-style: italic; }
}
.warn-count { color: $orange; font-weight: 600; }

.pool-bar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  color: $text-dim;
  margin-left: auto;
}
.pool-bar-item  { display: flex; align-items: center; gap: 0.2rem; }
.pool-bar-lbl   { color: $text-faint; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
.pool-bar-val   { font-weight: 700; color: $text; }
.pool-bar-sep   { color: $text-faint; }
.pool-bar-total { color: $text-dim; }
.pool-bar-dot   { width: 3px; height: 3px; border-radius: 50%; background: $text-faint; flex-shrink: 0; }
.val-ok         { color: $green  !important; }
.val-warn       { color: $orange !important; }
.pool-unused    { color: $orange; font-weight: 600; font-size: 0.75rem; }

// ── Map body ──────────────────────────────────────────────────────────
.map-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.map-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #1a3a0d;
}

.map-center-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 10;
  background: a($bg-panel, 0.85);
  border: 1px solid $border;
  border-radius: 6px;
  color: $text-dim;
  font-size: 0.75rem;
  padding: 0.3rem 0.65rem;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: border-color 0.15s, color 0.15s;
  &:hover { border-color: $accent; color: $accent; }
}

.map-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  user-select: none;
  &:active { cursor: grabbing; }
}

// ── Tooltip ───────────────────────────────────────────────────────────
.map-tt {
  position: absolute;
  pointer-events: none;
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 7px;
  padding: 0.5rem 0.75rem;
  font-size: 0.78rem;
  z-index: 20;
  max-width: 220px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.7);

  .tt-head { font-weight: 700; color: $text; font-size: 0.88rem; }
  .tt-sub  { color: $text-faint; font-size: 0.72rem; margin-top: 2px; }
  .tt-sep  { height: 1px; background: $border; margin: 0.35rem 0; }
  .tt-row  { display: flex; align-items: center; gap: 0.4rem; color: $text-dim; line-height: 1.7; font-size: 0.76rem; }
  .tt-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
}

// ── Empty state ───────────────────────────────────────────────────────
.map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  span {
    color: $text-faint;
    font-size: 0.9rem;
    background: rgba($bg-panel, 0.9);
    padding: 0.7rem 1.4rem;
    border-radius: 8px;
    border: 1px solid $border;
  }
}

// ── Detail panel ──────────────────────────────────────────────────────
.detail-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 290px;
  background: $bg-panel;
  border-left: 1px solid $border;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.dp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid $border;
  flex-shrink: 0;
}

.dp-head-info  { display: flex; flex-direction: column; gap: 3px; }
.dp-coords     { font-weight: 700; color: $text; font-size: 1.05rem; }
.dp-enemy      { font-size: 0.75rem; color: $text-faint; }
.dp-close      { background: none; border: none; color: $text-faint; cursor: pointer; font-size: 0.88rem; padding: 0; line-height: 1; &:hover { color: $text; } }

.dp-body  { flex: 1; overflow-y: auto; padding: 0.3rem 0; }
.dp-empty { padding: 1rem 0.85rem; color: $text-faint; font-size: 0.82rem; font-style: italic; }

.dp-atk {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.32rem 0.65rem 0.32rem 0.55rem;
  border-bottom: 1px solid a($border, 0.4);
  border-top: 2px solid transparent;
  font-size: 0.75rem;
  user-select: none;
  transition: background 0.1s, border-top-color 0.1s;
  cursor: pointer;

  &:last-child { border-bottom: none; }
  &.dp-atk-excl     { opacity: 0.35; }
  &.dp-atk-dragging { opacity: 0.35; background: a($accent, 0.04); }
  &.dp-atk-over     { border-top-color: $accent; background: a($accent, 0.06); }
}

.dp-atk-body  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.18rem; }
.dp-atk-main  { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
.dp-comp      { font-size: 0.62rem; color: $text-faint; white-space: normal; overflow: hidden; padding-left: 0.05rem; line-height: 1.4; }
.dp-drag      { color: $text-faint; cursor: grab; font-size: 1rem; line-height: 1; flex-shrink: 0; opacity: 0.5; margin-top: 1px; &:hover { opacity: 1; color: $text-dim; } &:active { cursor: grabbing; } }

.dp-excl-btn {
  background: none; border: none; color: $text-faint; cursor: pointer;
  font-size: 0.88rem; font-weight: 600; padding: 0 2px; line-height: 1; flex-shrink: 0;
  opacity: 0.5; transition: opacity 0.12s, color 0.12s;
  &:hover { opacity: 1; color: $orange; }
  .dp-atk-excl & { color: $accent; opacity: 0.8; }
}

.dp-badge  { font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.38rem; border-radius: 8px; border: 1px solid; white-space: nowrap; flex-shrink: 0; }
.dp-from   { color: $text-dim; flex-shrink: 0; }
.dp-player-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dp-arr    { color: $text-faint; margin-left: auto; white-space: nowrap; flex-shrink: 0; font-size: 0.72rem; }
.dp-warn       { color: $orange; font-size: 0.72rem; flex-shrink: 0; }
.dp-tower-hit  { font-size: 0.72rem; flex-shrink: 0; cursor: default; }
.dp-tower-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: #f38ba8;
  background: rgba(243,139,168,0.12);
  border: 1px solid rgba(243,139,168,0.3);
  border-radius: 8px;
  padding: 0.1rem 0.4rem;
  cursor: default;
  white-space: nowrap;
}

.dp-atk-editing { background: a($accent, 0.05); border-bottom: none; }

.dp-editor {
  padding: 0.55rem 0.7rem 0.6rem;
  background: a($accent, 0.04);
  border-bottom: 1px solid a($border, 0.5);
  border-left: 2px solid a($accent, 0.4);
  display: flex; flex-direction: column; gap: 0.45rem;
}

.dpe-row { display: flex; align-items: flex-start; gap: 0.5rem; }
.dpe-label {
  font-size: 0.65rem; color: $text-faint; text-transform: uppercase; letter-spacing: 0.04em;
  flex-shrink: 0; width: 42px; padding-top: 3px;
}

.dpe-time {
  flex: 1; padding: 0.18rem 0.3rem; font-size: 0.75rem;
  background: $bg-page; border: 1px solid $border; border-radius: 4px; color: $text;
  &:focus { outline: none; border-color: $accent; }
}

.dpe-types, .dpe-colors { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }

.dpe-color-btn, .dpe-type-btn {
  background: a($text-dim, 0.06); border: 1px solid $border; border-radius: 8px; color: $text-dim;
  cursor: pointer; font-size: 0.62rem; font-weight: 700; padding: 0.12rem 0.4rem; transition: all 0.12s;
  &:hover { border-color: $accent; color: $text; }
  &.active { font-weight: 800; }
}

.dpe-color-custom {
  width: 22px; height: 22px; padding: 0; border: 1px solid $border; border-radius: 4px;
  background: none; cursor: pointer; &:hover { border-color: $accent; }
}

.dpe-comp-row { align-items: flex-start; }
.dpe-comp     { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.25rem; flex: 1; }
.dpe-unit     { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dpe-unit-lbl { font-size: 0.58rem; color: $text-faint; text-align: center; }
.dpe-unit-input {
  width: 100%; padding: 0.12rem 0.2rem; font-size: 0.72rem; text-align: center;
  background: $bg-page; border: 1px solid $border; border-radius: 3px; color: $text;
  &:focus { outline: none; border-color: $accent; }
}

.dpe-actions  { display: flex; gap: 0.4rem; margin-top: 0.1rem; }
.dpe-del-btn  { margin-left: auto; background: none; border: 1px solid a($orange, 0.4); color: $orange; &:hover { background: a($orange, 0.12); border-color: $orange; } }
.dpe-coords-input {
  flex: 1; padding: 0.18rem 0.3rem; font-size: 0.75rem;
  background: $bg-page; border: 1px solid $border; border-radius: 4px;
  color: $text; font-family: monospace; &:focus { outline: none; border-color: $accent; }
}

.dp-troops { display: flex; flex-wrap: wrap; gap: 0.3rem 0.5rem; padding: 0.5rem 0.85rem; border-bottom: 1px solid $border; background: a($bg-page, 0.5); flex-shrink: 0; }
.dp-troop-cell { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 30px; }
.dp-troop-lbl  { font-size: 0.6rem; color: $text-faint; text-transform: uppercase; letter-spacing: 0.03em; }
.dp-troop-val  { font-size: 0.78rem; font-weight: 600; color: $text; font-variant-numeric: tabular-nums; }

.dp-head-actions { display: flex; align-items: center; gap: 0.4rem; }
.dp-add-btn {
  background: none; border: 1px solid a($accent, 0.4); border-radius: 50%; color: $accent;
  cursor: pointer; font-size: 1rem; font-weight: 700; width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center; line-height: 1; padding: 0;
  opacity: 0.65; transition: opacity 0.12s, background 0.12s;
  &:hover { opacity: 1; background: a($accent, 0.1); }
  &.active { opacity: 1; background: a($accent, 0.15); border-color: $accent; }
}

.dp-add-form {
  padding: 0.55rem 0.7rem 0.6rem;
  background: a($green, 0.04);
  border-bottom: 1px solid a($border, 0.5);
  border-left: 2px solid a($green, 0.4);
  display: flex; flex-direction: column; gap: 0.45rem;
  margin-top: 0.25rem;
}

.slide-panel-enter-active,
.slide-panel-leave-active { transition: width 0.2s ease, opacity 0.18s ease; }
.slide-panel-enter-from,
.slide-panel-leave-to     { width: 0; opacity: 0; overflow: hidden; }

// ── Legend ────────────────────────────────────────────────────────────
.map-legend {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 0.4rem 1rem;
  background: $bg-panel;
  border-top: 1px solid $border;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.leg-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: $text-dim; }
.leg-dot           { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.leg-dot-reserved  { background: rgba(0,229,255,0.2); outline: 2px dashed #00e5ff; outline-offset: 1px; opacity: 0.8; }
.leg-line { width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0; }
.leg-dash {
  width: 20px; height: 2px; flex-shrink: 0;
  background: repeating-linear-gradient(to right, $text-dim 0, $text-dim 5px, transparent 5px, transparent 9px);
}
</style>
