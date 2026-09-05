<template>
  <div class="def-page">

    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div class="def-toolbar">
      <button class="btn btn-sm btn-secondary" @click="fitVillages">↔ По деревням</button>
      <button class="btn btn-sm btn-secondary" @click="fitWorld">Весь мир</button>
      <span class="vsep" />
      <label class="tog"><input type="checkbox" v-model="showWorld" /> Карта мира</label>
      <button
        class="btn btn-sm" :class="showTribePanel ? 'btn-primary' : 'btn-secondary'"
        :disabled="!enemyStore.hasVillageData"
        @click="showTribePanel = !showTribePanel"
      >Племена{{ enemyStore.hasAllyData ? ` (${allTribes.length})` : '' }}</button>
      <button v-if="!enemyStore.hasVillageData && worldStore.settings.worldCode"
        class="btn btn-sm btn-primary" :disabled="autoLoading" @click="autoLoadMapData">
        {{ autoLoading ? 'Загрузка…' : 'Загрузить карту мира' }}
      </button>
      <span v-if="autoLoadError" class="toolbar-info" style="color:#f38ba8">{{ autoLoadError }}</span>
      <template v-if="enemyStore.hasVillageData">
        <input class="hl-input" list="hl-players" v-model="highlightName"
          placeholder="⭘ Подсветить деры игрока"
          :title="highlightName ? `${highlightVillages.length} дер подсвечено` : 'Жёлтые кольца на дерах игрока (напр. своего племени)'" />
        <datalist id="hl-players">
          <option v-for="p in highlightablePlayers" :key="p.id" :value="p.name" />
        </datalist>
        <button v-if="highlightName" class="btn btn-sm btn-secondary" title="Сбросить подсветку" @click="highlightName = ''">✕</button>
        <button v-if="highlightVillages.length" class="btn btn-sm btn-secondary" title="Подогнать к подсвеченным" @click="fitToPoints(highlightVillages, 12)">⤢</button>
      </template>
      <span class="vsep" />
      <template v-if="store.stats.length">
        <span class="tlabel">Фокус:</span>
        <select class="focus-select" :value="selectedPlayer ?? ''" @change="focusFromSelect">
          <option value="">Все игроки ({{ store.stats.length }})</option>
          <option v-for="s in store.stats" :key="s.name" :value="s.name">{{ s.name }} · деф {{ fmtK(s.def) }}</option>
        </select>
        <button v-if="selectedPlayer" class="btn btn-sm btn-secondary" title="Снять фокус" @click="clearSelection">✕</button>
        <span class="vsep" />
      </template>
      <label class="tog" title="Показать только оффы"><input type="checkbox" v-model="isolateOff" /> Оффы</label>
      <label class="tog" title="Показать только пустые (цели для масса)"><input type="checkbox" v-model="isolateEmpty" /> Пустые</label>
      <label class="tog"><input type="checkbox" v-model="showTowers" /> Башни</label>
      <label class="tog" title="Деревни с паладинами"><input type="checkbox" v-model="showPalas" /> Палы</label>
      <label class="tog"><input type="checkbox" v-model="showHeat" /> Тепло‑сетка</label>
      <span class="vsep" />
      <label class="tog" title="Деревни-опорники: стоит чужой поддержки много (бить бесполезно)">
        <input type="checkbox" v-model="showHubs" /> ⚓ Хабы <b v-if="showHubs" style="color:#89b4fa">{{ hubVillages.length }}</b>
      </label>
      <label class="tog" title="Свой деф ушёл — деревня сейчас голая (цель)">
        <input type="checkbox" v-model="showStripped" /> 🗡 Раздетые <b v-if="showStripped" style="color:#ff9e3d">{{ strippedVillages.length }}</b>
      </label>
      <span class="vsep" />
      <label class="tog"><input type="checkbox" v-model="showLabels" /> Подписи</label>
      <span class="vsep" />
      <span class="toolbar-info" v-if="store.hasData">
        {{ shownVillages.length }} дер · деф {{ fmtK(totalDef) }}
      </span>
      <button class="btn btn-sm" :class="showPanel ? 'btn-primary' : 'btn-secondary'" @click="showPanel = !showPanel" style="margin-left:auto">
        {{ showPanel ? '▸ Скрыть ввод' : '◂ Данные' }}
      </button>
    </div>

    <div class="def-body">
      <!-- ── Map ─────────────────────────────────────────────────────────── -->
      <div
        class="map-container" ref="containerEl"
        @wheel.prevent="onWheel"
        @mousedown.prevent="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <canvas ref="canvasEl" class="map-canvas" :width="svgW" :height="svgH" />

        <svg ref="svgEl" class="map-svg" :width="svgW" :height="svgH">
          <g :transform="gTransform">
            <!-- Grid -->
            <g opacity="0.18">
              <line v-for="gl in gridLines" :key="gl.k"
                :x1="gl.x1" :y1="gl.y1" :x2="gl.x2" :y2="gl.y2"
                stroke="#45475a" :stroke-width="0.5 / scale" />
            </g>

            <!-- Def heat grid -->
            <template v-if="showHeat">
              <rect v-for="c in heatCells" :key="c.k"
                :x="c.x" :y="c.y" :width="HEAT" :height="HEAT"
                :fill="c.color" :opacity="c.alpha" />
            </template>

            <!-- Watchtower vision-radius rings (radius = tower level) -->
            <template v-if="showTowers">
              <circle v-for="v in towerVillages" :key="`twr-${v.coords}`"
                :cx="v.x" :cy="v.y" :r="(v.watchtower || 0)"
                fill="#f38ba8" fill-opacity="0.06"
                stroke="#f38ba8" :stroke-width="1 / scale"
                :stroke-dasharray="`${2 / scale} ${1.5 / scale}`" opacity="0.8" />
            </template>

            <!-- Layer 1: def heat -->
            <circle
              v-for="v in defVillagesShown" :key="v.coords"
              :cx="v.x" :cy="v.y" :r="radiusOf(v)"
              :fill="fillOf(v)" fill-opacity="0.85"
              :stroke="strokeOf(v)" :stroke-width="strokeWidthOf(v)"
              style="cursor:pointer"
              @mouseenter="onHover(v, $event)" @mouseleave="clearHover"
              @click="onCircleClick(v)" />

            <!-- Layer 2: offs — purple halo + core, above def -->
            <template v-for="v in offVillages" :key="`o-${v.coords}`">
              <circle :cx="v.x" :cy="v.y" :r="radiusOf(v) + 2.6 / scale" :fill="C_OFF" opacity="0.28" />
              <circle
                :cx="v.x" :cy="v.y" :r="radiusOf(v)"
                :fill="C_OFF" fill-opacity="0.95"
                stroke="rgba(0,0,0,0.55)" :stroke-width="0.6 / scale"
                style="cursor:pointer"
                @mouseenter="onHover(v, $event)" @mouseleave="clearHover"
                @click="onCircleClick(v)" />
            </template>

            <!-- Layer 3: targets (empty / undefended) — on very top, pulsing halo -->
            <template v-for="v in targetVillages" :key="`t-${v.coords}`">
              <circle class="tgt-halo" :cx="v.x" :cy="v.y" :r="7 / scale" :fill="C_TARGET" />
              <circle
                :cx="v.x" :cy="v.y" :r="3.4 / scale"
                :fill="C_TARGET" fill-opacity="0.98"
                stroke="#ffffff" :stroke-width="1 / scale"
                style="cursor:pointer"
                @mouseenter="onHover(v, $event)" @mouseleave="clearHover"
                @click="onCircleClick(v)" />
            </template>

            <!-- Highlighted player's villages (from world dump, no troops) -->
            <template v-if="highlightVillages.length">
              <circle v-for="v in highlightVillages" :key="`hl-${v.id}`"
                :cx="v.x" :cy="v.y" :r="4.5 / scale"
                fill="none" stroke="#ffffff" :stroke-width="1.6 / scale" opacity="0.95" />
            </template>

            <!-- Watchtower markers: ring + 🗼 icon on villages that have a tower -->
            <template v-if="showTowers">
              <template v-for="v in towerVillages" :key="`twm-${v.coords}`">
                <circle
                  :cx="v.x" :cy="v.y" :r="radiusOf(v) + 1.8 / scale"
                  fill="none" stroke="#f38ba8" :stroke-width="1.4 / scale" opacity="0.95" />
                <text
                  :x="v.x + radiusOf(v) + 1 / scale" :y="v.y - radiusOf(v) - 1 / scale"
                  :font-size="8 / scale" text-anchor="start">🗼</text>
              </template>
            </template>

            <!-- Paladin markers: gold ring + ⚔ icon on villages that have a paladin -->
            <template v-if="showPalas">
              <template v-for="v in palaVillages" :key="`plm-${v.coords}`">
                <circle
                  :cx="v.x" :cy="v.y" :r="radiusOf(v) + 1.8 / scale"
                  fill="none" stroke="#f5a623" :stroke-width="1.4 / scale" opacity="0.95" />
                <text
                  :x="v.x - radiusOf(v) - 1 / scale" :y="v.y - radiusOf(v) - 1 / scale"
                  :font-size="8 / scale" text-anchor="end">⚔️</text>
              </template>
            </template>

            <!-- Support hubs: blue ring + ⚓ (receiving foreign def) -->
            <template v-if="showHubs">
              <template v-for="v in hubVillages" :key="`hub-${v.coords}`">
                <circle :cx="v.x" :cy="v.y" :r="radiusOf(v) + 2.6 / scale"
                  fill="none" stroke="#89b4fa" :stroke-width="1.4 / scale" opacity="0.95" />
                <text :x="v.x" :y="v.y + radiusOf(v) + 5 / scale"
                  :font-size="7 / scale" text-anchor="middle">⚓</text>
              </template>
            </template>

            <!-- Stripped villages: orange ring + 🗡 (own def away → target) -->
            <template v-if="showStripped">
              <template v-for="v in strippedVillages" :key="`str-${v.coords}`">
                <circle :cx="v.x" :cy="v.y" :r="radiusOf(v) + 2.6 / scale"
                  fill="none" stroke="#ff9e3d" :stroke-width="1.6 / scale" opacity="0.95" />
                <text :x="v.x" :y="v.y + radiusOf(v) + 5 / scale"
                  :font-size="7 / scale" text-anchor="middle">🗡️</text>
              </template>
            </template>

            <!-- Labels -->
            <template v-if="showLabels">
              <text v-for="v in shownVillages" :key="`l-${v.coords}`"
                :x="v.x" :y="v.y - radiusOf(v) - 2 / scale"
                text-anchor="middle" :font-size="9 / scale" font-weight="700"
                fill="#ffffff" stroke="#0a0b10" :stroke-width="2.6 / scale"
                style="paint-order: stroke">{{ fmtK(v.defScore) }}</text>
            </template>
          </g>
        </svg>

        <!-- Tooltip -->
        <div v-if="tooltip" class="map-tt" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
          <div class="tt-head">{{ tooltip.head }}</div>
          <div v-for="l in tooltip.lines" :key="l" class="tt-row">{{ l }}</div>
        </div>

        <!-- Village mini-card (pinned on click) -->
        <div v-if="selectedVillage" class="village-card">
          <div class="vc-head">
            <span class="vc-coords">{{ selectedVillage.coords }}</span>
            <span class="vc-kind" :class="`k-${selectedVillage.kind}`">{{ kindLabel(selectedVillage.kind) }}</span>
            <button class="vc-x" @click="selectedVillage = null">✕</button>
          </div>
          <div class="vc-player">{{ selectedVillage.playerName }}</div>
          <div class="vc-meta">
            Очки {{ selectedVillage.points.toLocaleString('ru-RU') }}
            <template v-if="selectedVillage.wall != null"> · 🧱 {{ selectedVillage.wall }}</template>
            <template v-if="selectedVillage.watchtower != null"> · 🗼 {{ selectedVillage.watchtower }}</template>
          </div>
          <div class="vc-metrics">
            <span class="vc-chip def">Деф {{ selectedVillage.defScore.toLocaleString('ru-RU') }}</span>
            <span class="vc-chip off">Офф {{ selectedVillage.offScore.toLocaleString('ru-RU') }}</span>
          </div>
          <div v-if="supportInfo(selectedVillage)" class="vc-support" :class="supportInfo(selectedVillage)!.tag || ''">
            <div class="vcs-line">
              Свой деф {{ (selectedVillage.ownedDef ?? 0).toLocaleString('ru-RU') }} → стоит {{ selectedVillage.defScore.toLocaleString('ru-RU') }}
              <span v-if="supportInfo(selectedVillage)!.tag" class="vcs-tag">{{ SUPPORT_TAG[supportInfo(selectedVillage)!.tag!] }}</span>
            </div>
            <div class="vcs-delta" :class="supportInfo(selectedVillage)!.delta >= 0 ? 'plus' : 'minus'">
              {{ supportInfo(selectedVillage)!.delta >= 0
                ? '+' + fmtK(supportInfo(selectedVillage)!.delta) + ' чужой поддержки'
                : fmtK(-supportInfo(selectedVillage)!.delta) + ' своего дефа в отходе' }}
            </div>
          </div>
          <div class="vc-units">
            <div v-for="u in unitRows(selectedVillage)" :key="u.key" class="vc-unit" :class="u.role">
              <span class="vc-uname">{{ u.label }}</span>
              <span class="vc-uval">{{ u.val.toLocaleString('ru-RU') }}</span>
            </div>
            <div v-if="!unitRows(selectedVillage).length" class="vc-empty">Войск нет</div>
          </div>
          <div class="vc-actions">
            <button class="btn btn-sm btn-primary" @click="selectPlayer(selectedVillage.playerName)">Только его деф</button>
            <button class="btn btn-sm btn-secondary" @click="highlightName = selectedVillage.playerName">Подсветить деры</button>
          </div>
        </div>

        <!-- Empty hint -->
        <div v-if="!store.hasData" class="map-empty">
          Нет данных. Откройте панель <b>«Данные»</b> и загрузите .xlsx‑выгрузку по врагам.
        </div>

        <!-- Legend -->
        <div class="map-legend">
          <span class="leg-label">Деф:</span>
          <span class="leg-item"><span class="leg-sw" :style="{ background: defColor(0.05) }" />мало</span>
          <span class="leg-item"><span class="leg-sw" :style="{ background: defColor(0.5) }" />средне</span>
          <span class="leg-item"><span class="leg-sw" :style="{ background: defColor(1) }" />стек</span>
          <span class="leg-item"><span class="leg-sw" :style="{ background: C_OFF }" />офф</span>
          <span class="leg-item"><span class="leg-sw tgt" :style="{ background: C_TARGET }" />пусто</span>
          <template v-if="showWorld && topTribes.length">
            <span class="leg-sep" />
            <span class="leg-label">Племена:</span>
            <span class="leg-item" v-for="t in topTribes" :key="t.id"><span class="leg-sw" :style="{ background: t.color }" /><span :class="{ 'leg-own': t.cat > 0 }">{{ t.tag }}</span></span>
          </template>
        </div>
      </div>

      <!-- ── Tribe panel ─────────────────────────────────────────────────── -->
      <div class="tribe-panel" v-if="showTribePanel">
        <div class="tp-head">
          <span>Племена</span>
          <div class="tp-legend-mini">
            <span class="tpl-item" v-for="(lbl, i) in CAT_LABEL.slice(1)" :key="i">
              <span class="tpl-dot" :style="{ background: CAT_COLOR[i + 1] }" />{{ lbl }}
            </span>
          </div>
          <button class="tp-close" @click="showTribePanel = false">✕</button>
        </div>
        <div class="tp-search">
          <input v-model="tribeSearch" placeholder="Поиск по тэгу..." class="tp-input" />
        </div>
        <div class="tp-list">
          <div
            class="tp-row" v-for="t in filteredTribes" :key="t.id"
            :class="{ 'tp-row-own': t.cat === 1, 'tp-row-ally': t.cat === 2, 'tp-row-enemy': t.cat === 3, 'tp-row-hidden': t.hidden }"
          >
            <span class="tp-dot" :style="{ background: t.color }" />
            <span class="tp-tag" :title="t.name">{{ t.tag }}</span>
            <span class="tp-cnt">{{ t.count }}</span>
            <div class="tp-btns">
              <button
                :class="['tp-hide-btn', { on: t.hidden }]"
                :title="t.hidden ? 'Показать на карте' : 'Скрыть с карты'"
                @click="toggleHideTribe(t.id)"
              >{{ t.hidden ? '○' : '●' }}</button>
              <button
                v-for="(lbl, idx) in CAT_LABEL.slice(1)" :key="idx"
                :class="['tp-cat', `tp-cat-${idx + 1}`, { on: t.cat === idx + 1 }]"
                :title="lbl"
                @click="setCategory(t.id, t.cat === idx + 1 ? 0 : (idx + 1) as TribeCategory)"
              >{{ lbl[0] }}</button>
            </div>
          </div>
          <div class="tp-empty" v-if="!filteredTribes.length">
            {{ enemyStore.hasAllyData ? 'Ничего не найдено' : 'Загрузите карту мира для списка племён' }}
          </div>
        </div>
      </div>

      <!-- ── Input / players panel ───────────────────────────────────────── -->
      <div class="def-panel" v-if="showPanel">
        <div class="dp-section">
          <div class="dp-title">Загрузить выгрузку</div>
          <label class="dp-drop" :class="{ busy: loading }">
            <input type="file" accept=".xlsx,.xls" @change="onFile" hidden />
            {{ loading ? 'Читаю файл…' : '📄 Выбрать .xlsx (Защита / Войска / Здания)' }}
          </label>
          <div v-if="feedback" class="dp-feedback" :class="feedbackErr ? 'err' : 'ok'">{{ feedback }}</div>
          <div class="dp-hint">Деф берётся из листа <b>«Защита»</b> (статус «в деревне» — что реально стоит). Стена и башни — из листа <b>«Здания»</b>. Загрузка заменяет текущие данные.</div>
        </div>

        <div class="dp-section" v-if="store.stats.length">
          <div class="dp-title">Игроки ({{ store.stats.length }})</div>
          <div class="dp-hint" style="margin:0 0 0.4rem">Клик по игроку — показать только его деф (фокус).</div>
          <div class="dp-player" v-for="s in store.stats" :key="s.name"
            :class="{ hidden: s.hidden, active: selectedPlayer === s.name }"
            @click="selectPlayer(s.name)">
            <span class="dp-color" :style="{ background: s.color }" />
            <div class="dp-pinfo">
              <div class="dp-pname">{{ s.name }} <span class="dp-src">{{ s.source === 'present' ? 'в деревне' : 'принадлеж.' }}</span></div>
              <div class="dp-pmeta">{{ s.villages }} дер · деф <b>{{ fmtK(s.def) }}</b> · офф {{ fmtK(s.off) }}<template v-if="s.towers"> · 🗼{{ s.towers }}</template></div>
            </div>
            <button class="dp-btn" :title="s.hidden ? 'Показать' : 'Скрыть'" @click.stop="store.toggleHidden(s.name)">{{ s.hidden ? '○' : '●' }}</button>
            <button class="dp-btn del" title="Удалить" @click.stop="store.removePlayer(s.name)">✕</button>
          </div>
          <button class="btn btn-sm btn-secondary dp-clear" @click="confirmClear">Очистить всё</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, watchEffect } from 'vue'
import { useDefMapStore, type DefVillage, UNIT_KEYS, type UnitKey } from '@/stores/defMapStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useVillagesStore } from '@/stores/villagesStore'
import { useWorldStore } from '@/stores/worldStore'

const store         = useDefMapStore()
const enemyStore    = useEnemyDataStore()
const villagesStore = useVillagesStore()
const worldStore    = useWorldStore()

// ── Toolbar state ─────────────────────────────────────────────────────
const selectedPlayer = ref<string | null>(null)
const selectedVillage = ref<DefVillage | null>(null)
// Isolation filters: unchecked → show everything; checking one shows ONLY that
// category (def hidden). Offs and empties are otherwise always visible.
const isolateOff   = ref(false)
const isolateEmpty = ref(false)
const showTowers  = ref(false)
const showPalas   = ref(false)
const showHubs     = ref(false)
const showStripped = ref(false)
const showHeat    = ref(false)
const showLabels  = ref(false)
const showPanel   = ref(true)
const showWorld      = ref(true)
const showTribePanel = ref(false)
const autoLoading    = ref(false)
const autoLoadError  = ref('')

// ── Input state ───────────────────────────────────────────────────────
const loading     = ref(false)
const feedback    = ref('')
const feedbackErr = ref(false)

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loading.value = true
  feedback.value = ''
  try {
    const buf = await file.arrayBuffer()
    const res = store.importWorkbook(buf)
    if (res.error) {
      feedback.value = res.error
      feedbackErr.value = true
    } else {
      feedbackErr.value = false
      const src = res.source === 'present' ? 'в деревне' : 'принадлежащие'
      feedback.value = `Загружено: ${res.playerCount} игроков, ${res.villageCount} дер (${src})` +
        (res.buildingCount ? `, зданий у ${res.buildingCount} дер` : '') + '.'
      fitVillages()
    }
  } catch (err) {
    feedback.value = `Ошибка: ${String(err)}`
    feedbackErr.value = true
  } finally {
    loading.value = false
    input.value = '' // allow re-upload of same file
  }
}

function confirmClear() {
  if (confirm('Удалить все загруженные данные по дефу?')) store.clearAll()
}

// ── Colors ────────────────────────────────────────────────────────────
const C_OFF    = '#c678dd'
const C_TARGET = '#38e1ff' // empty / undefended = lucrative mass target

/** Def heat: green (low) → yellow → red (stack). */
function defColor(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio))
  return `hsl(${Math.round(140 * (1 - r))}, 72%, 52%)`
}

// ── Selection / focus ─────────────────────────────────────────────────
function selectPlayer(name: string) {
  selectedPlayer.value = selectedPlayer.value === name ? null : name
  if (selectedPlayer.value) fitPlayer(selectedPlayer.value)
}
function clearSelection() { selectedPlayer.value = null }
function focusFromSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  selectedPlayer.value = v || null
  if (v) fitPlayer(v)
}

// ── Highlight a world player's villages (no troop data needed) ─────────
const highlightName = ref('')

// Suggestions: own tribe first, then everyone else, by village count.
const highlightablePlayers = computed(() => {
  const own = ownAllyId.value
  return [...enemyStore.players]
    .sort((a, b) =>
      (a.allyId === own ? 0 : 1) - (b.allyId === own ? 0 : 1) || b.villages - a.villages)
    .slice(0, 400)
})

const highlightVillages = computed(() => {
  const name = highlightName.value.trim()
  if (!name || !enemyStore.hasVillageData) return []
  const p = enemyStore.playerByName.get(name)
  if (!p) return []
  return enemyStore.villages.filter(v => v.playerId === p.id)
})

let dragMoved = false
function onCircleClick(v: DefVillage) {
  if (dragMoved) return           // ignore clicks that ended a pan
  selectedVillage.value = v       // open the pinned mini-card
}

// ── Visible villages ──────────────────────────────────────────────────
// When a player is focused, show only their villages (even if the player row
// is hidden); otherwise all visible players.
const scopedVillages = computed(() =>
  selectedPlayer.value
    ? store.players.filter(p => p.name === selectedPlayer.value).flatMap(p => p.villages)
    : store.visibleVillages,
)

const shownVillages = computed(() => {
  const iso = isolateOff.value || isolateEmpty.value
  return scopedVillages.value.filter(v => {
    if (!iso) return true                       // nothing checked → show all
    if (v.kind === 'off') return isolateOff.value
    if (v.kind === 'empty') return isolateEmpty.value
    return false                                // def hidden while isolating
  })
})

// Render layers (bottom → top): def heat, offs, targets.
const defVillagesShown = computed(() => shownVillages.value.filter(v => v.kind === 'def'))
const offVillages      = computed(() => shownVillages.value.filter(v => v.kind === 'off'))
const targetVillages   = computed(() => shownVillages.value.filter(v => v.kind === 'empty'))

const totalDef = computed(() => shownVillages.value.reduce((s, v) => s + v.defScore, 0))

// Scale reference: 90th-percentile-ish def among def villages of the current
// scope (adapts when a single player is focused).
const defMax = computed(() => {
  const scores = scopedVillages.value.filter(v => v.kind === 'def').map(v => v.defScore).sort((a, b) => a - b)
  if (!scores.length) return 1
  const p = scores[Math.floor(scores.length * 0.9)] ?? scores[scores.length - 1]
  return Math.max(p, 1000)
})

const offMax = computed(() => {
  const scores = scopedVillages.value.filter(v => v.kind === 'off').map(v => v.offScore)
  return Math.max(1, ...scores)
})

function scoreRatio(v: DefVillage): number {
  return v.kind === 'off' ? v.offScore / offMax.value : v.defScore / defMax.value
}

function radiusOf(v: DefVillage): number {
  // Empty = mass target → fixed, clearly visible size.
  if (v.kind === 'empty') return 3.2 / scale.value
  return (2.4 + 5.5 * Math.sqrt(Math.min(1, scoreRatio(v)))) / scale.value
}

function fillOf(v: DefVillage): string {
  if (v.kind === 'empty') return C_TARGET // undefended = always highlighted
  if (v.kind === 'off') return C_OFF
  return defColor(scoreRatio(v))
}

function strokeOf(v: DefVillage): string {
  if (v.kind === 'empty') return 'rgba(255,255,255,0.85)'
  return v.kind === 'off' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)'
}

function strokeWidthOf(v: DefVillage): number {
  return (v.kind === 'empty' ? 0.9 : 0.5) / scale.value
}

// Towers are an independent overlay — shown for all villages in scope,
// regardless of the off/empty isolation filters.
const towerVillages = computed(() => scopedVillages.value.filter(v => (v.watchtower ?? 0) > 0))
const palaVillages  = computed(() => scopedVillages.value.filter(v => (v.units.knight ?? 0) > 0))

// ── Heat grid ─────────────────────────────────────────────────────────
const HEAT = 10
const heatCells = computed(() => {
  const acc = new Map<string, { x: number; y: number; def: number }>()
  for (const v of store.visibleVillages) {
    if (v.kind !== 'def') continue
    const cx = Math.floor(v.x / HEAT) * HEAT
    const cy = Math.floor(v.y / HEAT) * HEAT
    const k = `${cx}|${cy}`
    const cell = acc.get(k) ?? { x: cx, y: cy, def: 0 }
    cell.def += v.defScore
    acc.set(k, cell)
  }
  const cells = [...acc.values()]
  const max = Math.max(1, ...cells.map(c => c.def))
  return cells.map(c => {
    const r = c.def / max
    return { k: `${c.x}|${c.y}`, x: c.x, y: c.y, color: defColor(r), alpha: 0.15 + 0.45 * r }
  })
})

// ── Zoom / Pan ────────────────────────────────────────────────────────
const containerEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const svgW = ref(800)
const svgH = ref(600)
const scale = ref(4)
const panX = ref(0)
const panY = ref(0)
const gTransform = computed(() => `translate(${panX.value},${panY.value}) scale(${scale.value})`)

let isDragging = false
let drag = { startX: 0, startY: 0, ox: 0, oy: 0 }

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging = true
  dragMoved = false
  drag = { startX: e.clientX, startY: e.clientY, ox: panX.value, oy: panY.value }
}
function onMouseMove(e: MouseEvent) {
  if (isDragging) {
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 3) dragMoved = true
    panX.value = drag.ox + (e.clientX - drag.startX)
    panY.value = drag.oy + (e.clientY - drag.startY)
  }
  if (tooltip.value) {
    const rect = containerEl.value!.getBoundingClientRect()
    tooltip.value = { ...tooltip.value, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 14 }
  }
}
function onMouseUp() { isDragging = false }

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const rect = containerEl.value!.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const gx = (cx - panX.value) / scale.value
  const gy = (cy - panY.value) / scale.value
  const ns = Math.max(0.5, Math.min(60, scale.value * factor))
  panX.value = cx - gx * ns
  panY.value = cy - gy * ns
  scale.value = ns
}

function fitVillages() {
  const pts = store.visibleVillages
  if (!pts.length) { if (enemyStore.hasVillageData) fitWorld(); return }
  fitToPoints(pts, 10)
}

function fitPlayer(name: string) {
  const pts = store.players.find(p => p.name === name)?.villages ?? []
  fitToPoints(pts, 8)
}

function fitToPoints(pts: { x: number; y: number }[], pad = 10) {
  if (!pts.length) return
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const bW = Math.max(20, Math.max(...xs) - minX)
  const bH = Math.max(20, Math.max(...ys) - minY)
  const s = Math.min(svgW.value / (bW + pad * 2), svgH.value / (bH + pad * 2))
  scale.value = s
  panX.value = (svgW.value - bW * s) / 2 - minX * s
  panY.value = (svgH.value - bH * s) / 2 - minY * s
}

function fitWorld() {
  const size = worldStore.settings.mapSize || 1000
  const pad = 10
  const s = Math.min(svgW.value / (size + pad * 2), svgH.value / (size + pad * 2))
  scale.value = s
  panX.value = (svgW.value - size * s) / 2
  panY.value = (svgH.value - size * s) / 2
}

// ── Grid ──────────────────────────────────────────────────────────────
const gridLines = computed(() => {
  const pts = store.visibleVillages
  if (!pts.length) return []
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x0 = Math.floor((Math.min(...xs) - 5) / 10) * 10
  const x1 = Math.ceil((Math.max(...xs) + 5) / 10) * 10
  const y0 = Math.floor((Math.min(...ys) - 5) / 10) * 10
  const y1 = Math.ceil((Math.max(...ys) + 5) / 10) * 10
  const lines: { k: string; x1: number; y1: number; x2: number; y2: number }[] = []
  for (let x = x0; x <= x1; x += 10) lines.push({ k: `vx${x}`, x1: x, y1: y0, x2: x, y2: y1 })
  for (let y = y0; y <= y1; y += 10) lines.push({ k: `hy${y}`, x1: x0, y1: y, x2: x1, y2: y })
  return lines
})

// ── Tooltip ───────────────────────────────────────────────────────────
interface Tooltip { head: string; lines: string[]; x: number; y: number }
const tooltip = ref<Tooltip | null>(null)

function onHover(v: DefVillage, e: MouseEvent) {
  const rect = containerEl.value!.getBoundingClientRect()
  const u = v.units
  const lines = [
    `${v.playerName}${v.name ? ' · ' + v.name : ''}`,
    `Тип: ${v.kind === 'def' ? 'деф' : v.kind === 'off' ? 'офф' : 'пусто'} · очки ${v.points.toLocaleString('ru-RU')}`,
    `Деф: ${v.defScore.toLocaleString('ru-RU')}  (копьё ${u.spear} · меч ${u.sword} · ТК ${u.heavy})`,
    `Офф: ${v.offScore.toLocaleString('ru-RU')}  (топор ${u.axe} · ЛК ${u.light})`,
  ]
  if (v.wall != null || v.watchtower != null)
    lines.push(`Стена ${v.wall ?? '?'} · Башня ${v.watchtower ?? '?'}`)
  tooltip.value = { head: v.coords, lines, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 14 }
}
function clearHover() { tooltip.value = null }

// ── Format ────────────────────────────────────────────────────────────
function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
}

// ── Village mini-card helpers ─────────────────────────────────────────
const UNIT_LABEL: Record<UnitKey, string> = {
  spear: 'Копьё', sword: 'Меч', axe: 'Топор', spy: 'Развед', light: 'ЛК', heavy: 'ТК',
  ram: 'Таран', catapult: 'Кат', knight: 'Пал', snob: 'Двор', militia: 'Опол',
}
const UNIT_ROLE: Record<UnitKey, 'def' | 'off' | 'other'> = {
  spear: 'def', sword: 'def', heavy: 'def', militia: 'def',
  axe: 'off', light: 'off', ram: 'off', catapult: 'off',
  spy: 'other', knight: 'other', snob: 'other',
}
function unitRows(v: DefVillage) {
  return UNIT_KEYS.map(k => ({ key: k, label: UNIT_LABEL[k], val: v.units[k], role: UNIT_ROLE[k] }))
    .filter(u => u.val > 0)
}
function kindLabel(k: DefVillage['kind']): string {
  return k === 'def' ? 'деф' : k === 'off' ? 'офф' : 'пусто'
}

// Support analysis: compare owned def («Войска») with what stands now («в деревне»).
//   delta > 0  → receiving foreign support (hub-ish)
//   delta < 0  → own def is away → village stripped right now (target)
function supportTag(v: DefVillage): 'hub' | 'stripped' | null {
  if (v.ownedDef == null) return null
  const delta = v.defScore - v.ownedDef
  if (delta > 5000 && v.defScore > v.ownedDef * 1.4) return 'hub'
  if (-delta > 3000 && v.defScore < 3000) return 'stripped'
  return null
}
function supportInfo(v: DefVillage): { delta: number; tag: 'hub' | 'stripped' | null } | null {
  if (v.ownedDef == null) return null
  return { delta: v.defScore - v.ownedDef, tag: supportTag(v) }
}
const hubVillages      = computed(() => scopedVillages.value.filter(v => supportTag(v) === 'hub'))
const strippedVillages = computed(() => scopedVillages.value.filter(v => supportTag(v) === 'stripped'))
const SUPPORT_TAG: Record<'hub' | 'stripped', string> = { hub: '⚓ хаб', stripped: '🗡 раздета' }

// ══════════════════════════════════════════════════════════════════════
// World map + tribes overlay (ported from WorldMapView)
// ══════════════════════════════════════════════════════════════════════

type TribeCategory = 0 | 1 | 2 | 3
const CAT_LABEL = ['Нейтральные', 'Мы', 'Союзники', 'Враги']
const CAT_COLOR = ['', '#89b4fa', '#74c7ec', '#f38ba8']

const TRIBE_PALETTE = [
  '#4878a8', '#3d8852', '#9e4040', '#8a6320', '#3d7878',
  '#7a4a8a', '#8a3a5a', '#4a7264', '#6a4e3a', '#38607a',
  '#6e48a4', '#8a2244', '#4a506a', '#4a6e3e', '#7a4e2a',
  '#2e6878', '#5a3e82', '#325a44', '#7a5040', '#4e6040',
]
const C_OWN_TRIBE = '#c8a840'
const C_BARB = '#1c1c2a'
const C_SKIP = '__skip__'

const tribeCategories = ref<Record<number, TribeCategory>>({})
const hiddenTribes = ref<Set<number>>(new Set())

function loadCategories() {
  try {
    const raw = localStorage.getItem('vp_tribe_cats')
    if (raw) tribeCategories.value = JSON.parse(raw) as Record<number, TribeCategory>
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem('vp_hidden_tribes')
    if (raw) hiddenTribes.value = new Set(JSON.parse(raw) as number[])
  } catch { /* ignore */ }
}
function setCategory(allyId: number, cat: TribeCategory) {
  const next = { ...tribeCategories.value }
  if (cat === 0) delete next[allyId]
  else next[allyId] = cat
  tribeCategories.value = next
}
function toggleHideTribe(allyId: number) {
  const next = new Set(hiddenTribes.value)
  if (next.has(allyId)) next.delete(allyId)
  else next.add(allyId)
  hiddenTribes.value = next
}
watch(tribeCategories, val => localStorage.setItem('vp_tribe_cats', JSON.stringify(val)), { deep: true })
watch(hiddenTribes, val => localStorage.setItem('vp_hidden_tribes', JSON.stringify([...val])))

const ownAllyId = computed(() => {
  if (!villagesStore.villages.length || !enemyStore.hasPlayerData) return 0
  const myName = villagesStore.villages[0].player
  return enemyStore.playerByName.get(myName)?.allyId ?? 0
})

const allyColorMap = computed((): Map<number, string> => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players)
    if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)
  const sorted = [...allyCount.entries()].sort((a, b) => b[1] - a[1])
  const map = new Map<number, string>()
  let palIdx = 0
  for (const [allyId] of sorted) {
    const cat = tribeCategories.value[allyId] ?? 0
    if (cat !== 0) map.set(allyId, CAT_COLOR[cat])
    else if (allyId === ownAllyId.value) map.set(allyId, C_OWN_TRIBE)
    else { map.set(allyId, TRIBE_PALETTE[palIdx % TRIBE_PALETTE.length]); palIdx++ }
  }
  return map
})

const playerColorMap = computed((): Map<number, string> => {
  const map = new Map<number, string>()
  const hidden = hiddenTribes.value
  const own = ownAllyId.value
  for (const p of enemyStore.players) {
    // Own tribe is always drawn — the whole point is to see our own villages.
    if (p.allyId && p.allyId !== own && hidden.has(p.allyId)) map.set(p.id, C_SKIP)
    else map.set(p.id, p.allyId ? (allyColorMap.value.get(p.allyId) ?? C_BARB) : C_BARB)
  }
  return map
})

const allTribes = computed(() => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players)
    if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)
  return [...allyCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id, count,
      name: enemyStore.allyById.get(id)?.name ?? `#${id}`,
      tag: enemyStore.allyById.get(id)?.tag ?? `#${id}`,
      color: allyColorMap.value.get(id) ?? '#888',
      cat: (tribeCategories.value[id] ?? 0) as TribeCategory,
      hidden: hiddenTribes.value.has(id),
    }))
})

let hiddenTribesDefaultApplied = false
watch(allTribes, tribes => {
  if (hiddenTribesDefaultApplied || tribes.length === 0) return
  hiddenTribesDefaultApplied = true
  if (localStorage.getItem('vp_hidden_tribes') !== null) return
  hiddenTribes.value = new Set(tribes.slice(5).map(t => t.id))
})

const tribeSearch = ref('')
const filteredTribes = computed(() => {
  const q = tribeSearch.value.toLowerCase()
  return q ? allTribes.value.filter(t => t.tag.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
           : allTribes.value
})
const topTribes = computed(() =>
  allTribes.value.slice(0, 10).map(t => ({ ...t, cat: (tribeCategories.value[t.id] ?? 0) as TribeCategory })),
)

async function autoLoadMapData(): Promise<void> {
  const code = worldStore.settings.worldCode
  if (!code) return
  autoLoading.value = true
  autoLoadError.value = ''
  try {
    const base = `/game-proxy/${code}/map`
    const [vRes, pRes, aRes] = await Promise.all([
      fetch(`${base}/village.txt.gz`),
      fetch(`${base}/player.txt.gz`),
      fetch(`${base}/ally.txt.gz`),
    ])
    if (!vRes.ok) throw new Error(`village.txt: HTTP ${vRes.status}`)
    if (!pRes.ok) throw new Error(`player.txt: HTTP ${pRes.status}`)
    if (!aRes.ok) throw new Error(`ally.txt: HTTP ${aRes.status}`)
    const [vBlob, pBlob, aBlob] = await Promise.all([vRes.blob(), pRes.blob(), aRes.blob()])
    await Promise.all([
      enemyStore.loadVillageFile(new File([vBlob], 'village.txt.gz')),
      enemyStore.loadPlayerFile(new File([pBlob], 'player.txt.gz')),
      enemyStore.loadAllyFile(new File([aBlob], 'ally.txt.gz')),
    ])
    if (!store.hasData) fitWorld()
  } catch (err) {
    autoLoadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    autoLoading.value = false
  }
}

// ── World-dots canvas ─────────────────────────────────────────────────
function redrawCanvas() {
  const canvas = canvasEl.value
  if (!canvas) return
  void svgW.value; void svgH.value
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const s = scale.value, px = panX.value, py = panY.value

  ctx.clearRect(0, 0, W, H)
  if (!showWorld.value || !enemyStore.hasVillageData) return

  const gx0 = (0 - px) / s - 1, gy0 = (0 - py) / s - 1
  const gx1 = (W - px) / s + 1, gy1 = (H - py) / s + 1
  const dotR = Math.max(0.4, Math.min(1.8, s * 0.4))

  const colorMap = playerColorMap.value
  const batches = new Map<string, Array<[number, number]>>()
  for (const v of enemyStore.villages) {
    if (v.x < gx0 || v.x > gx1 || v.y < gy0 || v.y > gy1) continue
    const color = colorMap.get(v.playerId) ?? C_BARB
    if (color === C_SKIP) continue
    let batch = batches.get(color)
    if (!batch) { batch = []; batches.set(color, batch) }
    batch.push([v.x * s + px, v.y * s + py])
  }
  ctx.globalAlpha = 0.7
  for (const [color, pts] of batches) {
    ctx.fillStyle = color
    ctx.beginPath()
    for (const [sx, sy] of pts) { ctx.moveTo(sx + dotR, sy); ctx.arc(sx, sy, dotR, 0, Math.PI * 2) }
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
watchEffect(redrawCanvas, { flush: 'post' })

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  store.load()
  loadCategories()
  let ro: ResizeObserver | null = null
  if (containerEl.value) {
    svgW.value = containerEl.value.clientWidth
    svgH.value = containerEl.value.clientHeight
    ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      svgW.value = r.width
      svgH.value = r.height
    })
    ro.observe(containerEl.value)
  }
  if (store.hasData) fitVillages()
  onUnmounted(() => ro?.disconnect())
})
</script>

<style lang="scss" scoped>
.def-page {
  margin: -1.5rem;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 52px);
  overflow: hidden;
}

.def-toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: $bg-panel;
  border-bottom: 1px solid $border;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.vsep { width: 1px; height: 18px; background: $border; flex-shrink: 0; }
.tlabel { font-size: 0.8rem; color: $text-dim; }
.tog {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.82rem; color: $text-dim;
  input[type='range'] { width: 90px; }
}
.toolbar-info { font-size: 0.82rem; color: $text-dim; }
.focus-select {
  background: $bg-deep; border: 1px solid $border; border-radius: 5px; color: $text;
  font-size: 0.8rem; padding: 0.25rem 0.4rem; max-width: 220px;
  &:focus { outline: none; border-color: $accent; }
}
.hl-input {
  background: $bg-deep; border: 1px solid $border; border-radius: 5px; color: $text;
  font-size: 0.8rem; padding: 0.25rem 0.5rem; width: 210px;
  &::placeholder { color: $text-faint; }
  &:focus { outline: none; border-color: #ffffff; }
}

.def-body { flex: 1; display: flex; min-height: 0; }

.map-container {
  flex: 1; position: relative; overflow: hidden;
  background: #0a0b10; cursor: grab;
  &:active { cursor: grabbing; }
}
.map-canvas { position: absolute; inset: 0; display: block; pointer-events: none; }
.map-svg { position: absolute; inset: 0; display: block; background: transparent; user-select: none; }

// Pulsing halo behind "цель (пусто)" markers so they pop over the def mass.
.tgt-halo {
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: tgt-pulse 1.8s ease-in-out infinite;
}
@keyframes tgt-pulse {
  0%, 100% { opacity: 0.18; }
  50%      { opacity: 0.45; }
}

.map-empty {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  color: $text-dim; font-size: 0.95rem; text-align: center; pointer-events: none;
}

// ── Village mini-card ─────────────────────────────────────────────────
.village-card {
  position: absolute; top: 10px; left: 10px; z-index: 15; width: 220px;
  background: rgba(20, 22, 34, 0.97); border: 1px solid $border; border-radius: 8px;
  padding: 0.55rem 0.65rem; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.vc-head { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem; }
.vc-coords { font-weight: 700; color: $text; font-size: 0.9rem; }
.vc-kind {
  font-size: 0.68rem; padding: 0.05rem 0.35rem; border-radius: 10px; color: #0a0b10; font-weight: 700;
  &.k-def { background: #e0a83e; } &.k-off { background: #c678dd; } &.k-empty { background: #38e1ff; }
}
.vc-x { margin-left: auto; background: none; border: none; color: $text-dim; cursor: pointer; font-size: 0.85rem; &:hover { color: $accent; } }
.vc-player { font-size: 0.82rem; color: $text; font-weight: 600; }
.vc-meta { font-size: 0.72rem; color: $text-dim; margin: 0.15rem 0 0.4rem; }
.vc-metrics { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
.vc-chip {
  font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;
  &.def { background: rgba(166, 227, 161, 0.15); color: #a6e3a1; }
  &.off { background: rgba(198, 120, 221, 0.15); color: #c678dd; }
}
.vc-support {
  font-size: 0.72rem; border-radius: 5px; padding: 0.3rem 0.4rem; margin-bottom: 0.45rem;
  background: rgba(255, 255, 255, 0.04); border: 1px solid transparent;
  &.hub { background: rgba(137, 180, 250, 0.12); border-color: rgba(137, 180, 250, 0.4); }
  &.stripped { background: rgba(243, 139, 168, 0.12); border-color: rgba(243, 139, 168, 0.45); }
  .vcs-line { color: $text-dim; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .vcs-tag { margin-left: auto; font-weight: 700; color: $text; }
  .vcs-delta { margin-top: 0.15rem; font-weight: 600; &.plus { color: #89b4fa; } &.minus { color: #f38ba8; } }
}
.vc-units {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.1rem 0.5rem;
  max-height: 150px; overflow-y: auto; margin-bottom: 0.5rem;
}
.vc-unit {
  display: flex; justify-content: space-between; font-size: 0.72rem; padding: 0.05rem 0.2rem; border-radius: 3px;
  .vc-uname { color: $text-dim; } .vc-uval { color: $text; font-weight: 600; }
  &.def { background: rgba(166, 227, 161, 0.08); }
  &.off { background: rgba(198, 120, 221, 0.08); }
}
.vc-empty { grid-column: 1 / -1; font-size: 0.72rem; color: $text-faint; font-style: italic; }
.vc-actions { display: flex; gap: 0.35rem; }

.map-tt {
  position: absolute; z-index: 20; pointer-events: none;
  background: rgba(20, 22, 34, 0.96); border: 1px solid $border; border-radius: 6px;
  padding: 0.4rem 0.6rem; font-size: 0.76rem; color: $text; max-width: 320px;
  .tt-head { font-weight: 700; color: $accent; margin-bottom: 0.2rem; }
  .tt-row { color: $text-dim; line-height: 1.35; }
}

.map-legend {
  position: absolute; left: 10px; bottom: 10px;
  display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap;
  background: rgba(20, 22, 34, 0.85); border: 1px solid $border; border-radius: 6px;
  padding: 0.35rem 0.6rem; font-size: 0.74rem; color: $text-dim; max-width: 70%;
  .leg-label { font-weight: 600; }
  .leg-item { display: flex; align-items: center; gap: 0.3rem; }
  .leg-sw { width: 11px; height: 11px; border-radius: 50%; display: inline-block;
    &.tgt { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.85); }
  }
  .leg-sep { width: 1px; height: 14px; background: $border; }
  .leg-own { color: $accent; font-weight: 600; }
}

// ── Tribe panel (ported from WorldMapView) ────────────────────────────
.tribe-panel {
  width: 260px; flex-shrink: 0; display: flex; flex-direction: column;
  background: $bg-panel; border-left: 1px solid $border; overflow: hidden;
}
.tp-head {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
  border-bottom: 1px solid $border; font-size: 0.82rem; font-weight: 600; color: $text; flex-shrink: 0;
}
.tp-legend-mini { display: flex; gap: 0.5rem; flex: 1; font-size: 0.7rem; color: $text-faint; }
.tpl-item { display: flex; align-items: center; gap: 0.2rem; }
.tpl-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tp-close { background: none; border: none; color: $text-dim; cursor: pointer; font-size: 0.85rem; padding: 0 0.2rem; line-height: 1; margin-left: auto; &:hover { color: $text; } }
.tp-search { padding: 0.5rem 0.75rem; border-bottom: 1px solid $border; flex-shrink: 0; }
.tp-input {
  width: 100%; background: $bg-page; border: 1px solid $border; border-radius: 4px;
  color: $text; font-size: 0.78rem; padding: 0.3rem 0.5rem; box-sizing: border-box;
  &::placeholder { color: $text-faint; }
  &:focus { outline: none; border-color: $accent; }
}
.tp-list { flex: 1; overflow-y: auto; padding: 0.25rem 0; }
.tp-row {
  display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.75rem; font-size: 0.78rem; transition: background 0.1s;
  &:hover { background: rgba(255,255,255,0.04); }
  &.tp-row-own { background: rgba(137,180,250,0.07); }
  &.tp-row-ally { background: rgba(116,199,236,0.07); }
  &.tp-row-enemy { background: rgba(243,139,168,0.07); }
  &.tp-row-hidden { opacity: 0.45; }
}
.tp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tp-tag { flex: 1; color: $text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.tp-cnt { color: $text-faint; font-size: 0.72rem; min-width: 28px; text-align: right; }
.tp-btns { display: flex; gap: 2px; }
.tp-hide-btn {
  width: 18px; height: 18px; border-radius: 3px; border: 1px solid $border; background: transparent;
  color: $text-dim; font-size: 0.6rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0;
  &:hover { border-color: #e07b39; color: #e07b39; }
  &.on { background: rgba(224,123,57,0.15); border-color: #e07b39; color: #e07b39; }
}
.tp-cat {
  width: 18px; height: 18px; border-radius: 3px; border: 1px solid $border; background: transparent;
  color: $text-dim; font-size: 0.65rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  &:hover { border-color: $text-dim; color: $text; }
  &-1.on { background: #89b4fa; border-color: #89b4fa; color: #0d0e14; }
  &-2.on { background: #74c7ec; border-color: #74c7ec; color: #0d0e14; }
  &-3.on { background: #f38ba8; border-color: #f38ba8; color: #0d0e14; }
}
.tp-empty { padding: 1rem 0.75rem; font-size: 0.78rem; color: $text-faint; font-style: italic; }

.def-panel {
  width: 340px; flex-shrink: 0; background: $bg-panel; border-left: 1px solid $border;
  overflow-y: auto; padding: 0.8rem;
}
.dp-section { margin-bottom: 1.2rem; }
.dp-title { font-size: 0.85rem; font-weight: 700; color: $text; margin-bottom: 0.5rem; }
.dp-drop {
  display: block; width: 100%; text-align: center; cursor: pointer;
  background: $bg-deep; border: 1px dashed $border; border-radius: 6px;
  color: $text-md; padding: 1rem 0.6rem; font-size: 0.82rem;
  transition: border-color 0.15s, color 0.15s;
  &:hover { border-color: $accent; color: $text; }
  &.busy { opacity: 0.6; pointer-events: none; }
}
.dp-feedback { margin-top: 0.4rem; font-size: 0.76rem; padding: 0.3rem 0.4rem; border-radius: 4px;
  &.ok { color: #a6e3a1; background: rgba(166, 227, 161, 0.1); }
  &.err { color: #f38ba8; background: rgba(243, 139, 168, 0.1); }
}
.dp-hint { margin-top: 0.5rem; font-size: 0.72rem; color: $text-dim; line-height: 1.4; }

.dp-player {
  display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.3rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; border-radius: 4px;
  &:hover { background: rgba(255, 255, 255, 0.04); }
  &.hidden { opacity: 0.45; }
  &.active { background: rgba(233, 69, 96, 0.14); box-shadow: inset 2px 0 0 $accent; }
}
.dp-color { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.dp-pinfo { flex: 1; min-width: 0; }
.dp-pname { font-size: 0.8rem; color: $text; font-weight: 600; }
.dp-src { font-size: 0.66rem; color: $text-dim; font-weight: 400; }
.dp-pmeta { font-size: 0.72rem; color: $text-dim; }
.dp-btn {
  background: none; border: 1px solid $border; border-radius: 4px; color: $text-dim;
  cursor: pointer; width: 24px; height: 24px; font-size: 0.8rem; flex-shrink: 0;
  &:hover { color: $text; }
  &.del:hover { color: #f38ba8; border-color: #f38ba8; }
}
.dp-clear { margin-top: 0.6rem; width: 100%; }
</style>
