<template>
  <div class="map-page">

    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div class="map-toolbar">
      <button class="btn btn-sm btn-secondary" @click="fitWorld">Весь мир</button>
      <button class="btn btn-sm btn-secondary" @click="fitToAttacks">↔ По атакам</button>
      <span class="vsep" />
      <label class="tog"><input type="checkbox" v-model="showWorld" /> Карта мира</label>
      <label class="tog"><input type="checkbox" v-model="showAttacks" /> Атаки</label>
      <label class="tog"><input type="checkbox" v-model="showTowers"
        :title="worldStore.settings.watchtowerEnabled ? '' : 'Башни отключены в настройках'"
      /> Башни</label>
      <label class="tog"><input type="checkbox" v-model="showSpam" /> Спам</label>
      <label class="tog"><input type="checkbox" v-model="showLabels" /> Подписи</label>
      <span class="vsep" />
      <button
        class="btn btn-sm" :class="showTribePanel ? 'btn-primary' : 'btn-secondary'"
        :disabled="!enemyStore.hasVillageData"
        @click="showTribePanel = !showTribePanel"
      >Племена{{ enemyStore.hasAllyData ? ` (${allTribes.length})` : '' }}</button>
      <span class="vsep" />
      <span class="toolbar-info" v-if="enemyStore.hasVillageData">
        {{ enemyStore.villages.length.toLocaleString() }} деревень
        <template v-if="ownTribeName">· Вы: <b>{{ ownTribeName }}</b></template>
        <template v-if="planStore.attacks.length"> · {{ planStore.attacks.length }} атак</template>
      </span>
      <span class="toolbar-info dim" v-else>
        Загрузите village.txt в Импорте для отображения карты мира
      </span>
    </div>

    <!-- ── Map body ──────────────────────────────────────────────────────── -->
    <div class="map-body">

      <!-- Map container -->
      <div
        class="map-container" ref="containerEl"
        @wheel.prevent="onWheel"
        @mousedown.prevent="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <!-- Canvas: world village dots -->
        <canvas ref="canvasEl" class="map-canvas" :width="svgW" :height="svgH" />

        <!-- SVG overlay: grid, towers, arrows, own villages, targets -->
        <svg ref="svgEl" class="map-svg" :width="svgW" :height="svgH">
          <defs>
            <marker
              v-for="m in MARKERS" :key="m.id" :id="m.id"
              :markerWidth="arrowSz" :markerHeight="arrowSz"
              :refX="arrowSz * 0.85" :refY="arrowSz * 0.5"
              markerUnits="userSpaceOnUse" orient="auto"
            >
              <path :d="`M0,0 L0,${arrowSz} L${arrowSz},${arrowSz * 0.5} z`" :fill="m.color" />
            </marker>
          </defs>

          <g :transform="gTransform">

            <!-- Grid -->
            <g :opacity="showWorld && enemyStore.hasVillageData ? 0.08 : 0.2">
              <line v-for="gl in gridLines" :key="gl.k"
                :x1="gl.x1" :y1="gl.y1" :x2="gl.x2" :y2="gl.y2"
                stroke="#45475a" :stroke-width="0.5 / scale"
              />
            </g>

            <!-- Tower radii -->
            <template v-if="showTowers && worldStore.settings.watchtowerEnabled">
              <circle
                v-for="tw in planStore.watchtowerVillages" :key="`tr-${tw.id}`"
                :cx="tw.x" :cy="tw.y" :r="tw.level"
                fill="#f38ba8" fill-opacity="0.07"
                stroke="#f38ba8" :stroke-width="0.8 / scale"
                :stroke-dasharray="`${2 / scale} ${1.5 / scale}`" opacity="0.7"
              />
              <circle
                v-for="tw in planStore.watchtowerVillages" :key="`tc-${tw.id}`"
                :cx="tw.x" :cy="tw.y" :r="2 / scale"
                fill="#f38ba8" opacity="0.9"
              />
              <text
                v-for="tw in planStore.watchtowerVillages" :key="`tl-${tw.id}`"
                :x="tw.x" :y="tw.y + 3.5 / scale"
                text-anchor="middle" :font-size="3.5 / scale"
                fill="#f38ba8" opacity="0.75"
              >R={{ tw.level }}</text>
            </template>

            <!-- Attack arrows -->
            <template v-if="showAttacks">
              <line
                v-for="p in visiblePairs" :key="p.key"
                :x1="p.fx" :y1="p.fy" :x2="p.tx" :y2="p.ty"
                :stroke="p.color" :stroke-width="lineW"
                :opacity="p.isSpam ? 0.55 : 0.95"
                :marker-end="`url(#${p.markerId})`"
              />
              <template v-for="p in pairsWithCount" :key="`cnt-${p.key}`">
                <circle
                  :cx="(p.fx + p.tx) / 2" :cy="(p.fy + p.ty) / 2"
                  :r="4 / scale" :fill="p.color" opacity="0.9"
                />
                <text
                  :x="(p.fx + p.tx) / 2" :y="(p.fy + p.ty) / 2 + 1.5 / scale"
                  text-anchor="middle" :font-size="4 / scale"
                  fill="#0d0e14" font-weight="bold"
                >{{ p.count }}</text>
              </template>
            </template>

            <!-- Attacking villages -->
            <template v-if="showAttacks">
              <circle
                v-for="v in attackingVillages" :key="`av-${v.coords}`"
                :cx="v.x" :cy="v.y" :r="3 / scale"
                fill="#1e2030" stroke="#89b4fa" :stroke-width="0.8 / scale"
                style="cursor: pointer"
                @mouseenter="onHoverVillage(v, $event)"
                @mouseleave="clearHover"
              />
              <text
                v-if="showLabels"
                v-for="v in attackingVillages" :key="`vl-${v.coords}`"
                :x="v.x" :y="v.y - 4 / scale"
                text-anchor="middle" :font-size="3 / scale"
                fill="#89b4fa" opacity="0.85"
              >{{ v.coords }}</text>
            </template>

            <!-- Targets -->
            <rect
              v-for="t in planStore.targets.filter(t => t.coords)" :key="`tgt-${t.id}`"
              :x="t.x - 3.5 / scale" :y="t.y - 3.5 / scale"
              :width="7 / scale" :height="7 / scale"
              fill="#1e2030" :stroke="targetBorderColor(t.id)" :stroke-width="0.9 / scale"
              style="cursor: pointer"
              @mouseenter="onHoverTarget(t, $event)"
              @mouseleave="clearHover"
            />
            <text
              v-if="showLabels"
              v-for="t in planStore.targets.filter(t => t.coords)" :key="`tgl-${t.id}`"
              :x="t.x" :y="t.y + 6.5 / scale"
              text-anchor="middle" :font-size="3 / scale"
              fill="#cdd6f4" opacity="0.75"
            >{{ t.coords }}</text>

          </g>
        </svg>

        <!-- Tooltip -->
        <div v-if="tooltip" class="map-tt"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="tt-head">{{ tooltip.head }}</div>
          <div v-for="l in tooltip.lines" :key="l" class="tt-row">{{ l }}</div>
        </div>
      </div>

      <!-- ── Tribe panel ──────────────────────────────────────────────────── -->
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
            :class="{ 'tp-row-own': t.cat === 1, 'tp-row-ally': t.cat === 2, 'tp-row-enemy': t.cat === 3 }"
          >
            <span class="tp-dot" :style="{ background: t.color }" />
            <span class="tp-tag" :title="t.name">{{ t.tag }}</span>
            <span class="tp-cnt">{{ t.count }}</span>
            <div class="tp-btns">
              <button
                v-for="(lbl, idx) in CAT_LABEL.slice(1)" :key="idx"
                :class="['tp-cat', `tp-cat-${idx + 1}`, { on: t.cat === idx + 1 }]"
                :title="lbl"
                @click="setCategory(t.id, t.cat === idx + 1 ? 0 : (idx + 1) as TribeCategory)"
              >{{ lbl[0] }}</button>
            </div>
          </div>
          <div class="tp-empty" v-if="!filteredTribes.length">
            {{ enemyStore.hasAllyData ? 'Ничего не найдено' : 'Загрузите ally.txt для списка племён' }}
          </div>
        </div>
      </div>

    </div><!-- /map-body -->

    <!-- ── Legend ────────────────────────────────────────────────────────── -->
    <div class="map-legend">
      <div class="leg-item" v-for="l in ATTACK_LEGEND" :key="l.label">
        <span class="leg-swatch" :style="{ background: l.color, borderRadius: l.square ? '2px' : '50%' }" />
        <span>{{ l.label }}</span>
      </div>
      <span class="vsep" v-if="topTribes.length" />
      <span class="leg-label" v-if="topTribes.length">Топ племён:</span>
      <div class="leg-item" v-for="t in topTribes" :key="t.id">
        <span class="leg-swatch" :style="{ background: t.color }" />
        <span :class="{ 'leg-own': t.cat > 0 }">{{ t.tag }}</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect, watch } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useVillagesStore } from '@/stores/villagesStore'
import { useWorldStore } from '@/stores/worldStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import type { Village } from '@/stores/villagesStore'
import type { Target, Attack } from '@/stores/planStore'

const planStore     = usePlanStore()
const villagesStore = useVillagesStore()
const worldStore    = useWorldStore()
const enemyStore    = useEnemyDataStore()

// ── Toggles ──────────────────────────────────────────────────────────
const showWorld      = ref(true)
const showAttacks    = ref(true)
const showTowers     = ref(true)
const showSpam       = ref(false)
const showLabels     = ref(false)
const showTribePanel = ref(false)

// ── DOM refs + size ───────────────────────────────────────────────────
const containerEl = ref<HTMLElement | null>(null)
const canvasEl    = ref<HTMLCanvasElement | null>(null)
const svgEl       = ref<SVGSVGElement | null>(null)
const svgW        = ref(800)
const svgH        = ref(600)

// ── Zoom / Pan ────────────────────────────────────────────────────────
const scale = ref(1)
const panX  = ref(0)
const panY  = ref(0)

const gTransform = computed(() => `translate(${panX.value},${panY.value}) scale(${scale.value})`)
const arrowSz    = computed(() => 8 / scale.value)
const lineW      = computed(() => 2 / scale.value)

let isDragging = false
let drag = { startX: 0, startY: 0, originPanX: 0, originPanY: 0 }

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging = true
  drag = { startX: e.clientX, startY: e.clientY, originPanX: panX.value, originPanY: panY.value }
}
function onMouseMove(e: MouseEvent) {
  if (isDragging) {
    panX.value = drag.originPanX + (e.clientX - drag.startX)
    panY.value = drag.originPanY + (e.clientY - drag.startY)
  }
  if (tooltip.value) {
    const rect = containerEl.value!.getBoundingClientRect()
    tooltip.value = { ...tooltip.value, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 14 }
  }
}
function onMouseUp() { isDragging = false }

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const rect   = containerEl.value!.getBoundingClientRect()
  const cx     = e.clientX - rect.left
  const cy     = e.clientY - rect.top
  const gx     = (cx - panX.value) / scale.value
  const gy     = (cy - panY.value) / scale.value
  const ns     = Math.max(0.05, Math.min(200, scale.value * factor))
  panX.value   = cx - gx * ns
  panY.value   = cy - gy * ns
  scale.value  = ns
}

// ── Fit functions ─────────────────────────────────────────────────────
function fitWorld() {
  const size = worldStore.settings.mapSize || 1000
  const pad  = 10
  const s    = Math.min(svgW.value / (size + pad * 2), svgH.value / (size + pad * 2))
  scale.value = s
  panX.value  = (svgW.value - size * s) / 2
  panY.value  = (svgH.value - size * s) / 2
}

function fitToAttacks() {
  const pts = [
    ...villagesStore.villages.map(v => ({ x: v.x, y: v.y })),
    ...planStore.targets.filter(t => t.coords).map(t => ({ x: t.x, y: t.y })),
  ]
  if (pts.length === 0) { fitWorld(); return }
  const xs  = pts.map(p => p.x)
  const ys  = pts.map(p => p.y)
  const pad = 50
  const bW  = Math.max(50, Math.max(...xs) - Math.min(...xs))
  const bH  = Math.max(50, Math.max(...ys) - Math.min(...ys))
  const s   = Math.min(svgW.value / (bW + pad * 2), svgH.value / (bH + pad * 2))
  scale.value = s
  panX.value  = (svgW.value - bW * s) / 2 - Math.min(...xs) * s
  panY.value  = (svgH.value - bH * s) / 2 - Math.min(...ys) * s
}

// ── Grid ──────────────────────────────────────────────────────────────
const gridLines = computed(() => {
  const size = worldStore.settings.mapSize || 1000
  const step = scale.value < 0.5 ? 100 : 50
  const lines: { k: string; x1: number; y1: number; x2: number; y2: number }[] = []
  for (let x = 0; x <= size; x += step)
    lines.push({ k: `vx${x}`, x1: x, y1: 0, x2: x, y2: size })
  for (let y = 0; y <= size; y += step)
    lines.push({ k: `hy${y}`, x1: 0, y1: y, x2: size, y2: y })
  return lines
})

// ── Tribe categories ──────────────────────────────────────────────────
type TribeCategory = 0 | 1 | 2 | 3

const CAT_LABEL = ['Нейтральные', 'Мы', 'Союзники', 'Враги']
const CAT_COLOR = ['', '#89b4fa', '#74c7ec', '#f38ba8']

const tribeCategories = ref<Record<number, TribeCategory>>({})

function loadCategories() {
  try {
    const raw = localStorage.getItem('vp_tribe_cats')
    if (raw) tribeCategories.value = JSON.parse(raw) as Record<number, TribeCategory>
  } catch { /* ignore */ }
}

function setCategory(allyId: number, cat: TribeCategory) {
  const next = { ...tribeCategories.value }
  if (cat === 0) delete next[allyId]
  else next[allyId] = cat
  tribeCategories.value = next
}

watch(tribeCategories, val => {
  localStorage.setItem('vp_tribe_cats', JSON.stringify(val))
}, { deep: true })

// ── Tribe colors ──────────────────────────────────────────────────────
// Muted palette: ~45% lightness, ~55% saturation — visible but not garish
const PALETTE = [
  '#4878a8', '#3d8852', '#9e4040', '#8a6320', '#3d7878',
  '#7a4a8a', '#8a3a5a', '#4a7264', '#6a4e3a', '#38607a',
  '#6e48a4', '#8a2244', '#4a506a', '#4a6e3e', '#7a4e2a',
  '#2e6878', '#5a3e82', '#325a44', '#7a5040', '#4e6040',
]
const C_OWN_TRIBE = '#c8a840'  // muted gold — own tribe (auto-detected)
const C_BARB      = '#1c1c2a'

const ownAllyId = computed(() => {
  if (!villagesStore.villages.length || !enemyStore.hasPlayerData) return 0
  const myName = villagesStore.villages[0].player
  return enemyStore.playerByName.get(myName)?.allyId ?? 0
})

const ownTribeName = computed(() => {
  const id = ownAllyId.value
  return id ? (enemyStore.allyById.get(id)?.tag ?? '') : ''
})

const allyColorMap = computed((): Map<number, string> => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players)
    if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)

  const sorted = [...allyCount.entries()].sort((a, b) => b[1] - a[1])
  const map    = new Map<number, string>()
  let palIdx   = 0

  for (const [allyId] of sorted) {
    const cat = tribeCategories.value[allyId] ?? 0
    if (cat !== 0) {
      map.set(allyId, CAT_COLOR[cat])
    } else if (allyId === ownAllyId.value) {
      map.set(allyId, C_OWN_TRIBE)
    } else {
      map.set(allyId, PALETTE[palIdx % PALETTE.length])
      palIdx++
    }
  }
  return map
})

const playerColorMap = computed((): Map<number, string> => {
  const map = new Map<number, string>()
  for (const p of enemyStore.players)
    map.set(p.id, p.allyId ? (allyColorMap.value.get(p.allyId) ?? C_BARB) : C_BARB)
  return map
})

// Full tribe list for panel
const allTribes = computed(() => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players)
    if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)
  return [...allyCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id, count,
      name: enemyStore.allyById.get(id)?.name ?? `#${id}`,
      tag:  enemyStore.allyById.get(id)?.tag  ?? `#${id}`,
      color: allyColorMap.value.get(id) ?? '#888',
      cat: (tribeCategories.value[id] ?? 0) as TribeCategory,
    }))
})

const tribeSearch   = ref('')
const filteredTribes = computed(() => {
  const q = tribeSearch.value.toLowerCase()
  return q ? allTribes.value.filter(t => t.tag.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
           : allTribes.value
})

// Top tribes for legend bar
const topTribes = computed(() =>
  allTribes.value.slice(0, 10).map(t => ({ ...t, cat: (tribeCategories.value[t.id] ?? 0) as TribeCategory }))
)

// ── Canvas rendering ──────────────────────────────────────────────────
function redrawCanvas() {
  const canvas = canvasEl.value
  if (!canvas) return
  void svgW.value; void svgH.value  // track size for reactivity
  const ctx = canvas.getContext('2d')!
  const W   = canvas.width
  const H   = canvas.height
  const s   = scale.value
  const px  = panX.value
  const py  = panY.value

  ctx.fillStyle = '#0a0b10'
  ctx.fillRect(0, 0, W, H)

  if (!showWorld.value || !enemyStore.hasVillageData) return

  const gx0  = (0 - px) / s - 1
  const gy0  = (0 - py) / s - 1
  const gx1  = (W - px) / s + 1
  const gy1  = (H - py) / s + 1
  // clamp dot radius: small at world view, grows when zoomed in — never blobs
  const dotR = Math.max(0.4, Math.min(1.8, s * 0.55))

  const colorMap = playerColorMap.value
  const batches  = new Map<string, Array<[number, number]>>()

  for (const v of enemyStore.villages) {
    if (v.x < gx0 || v.x > gx1 || v.y < gy0 || v.y > gy1) continue
    const color = colorMap.get(v.playerId) ?? C_BARB
    let batch = batches.get(color)
    if (!batch) { batch = []; batches.set(color, batch) }
    batch.push([v.x * s + px, v.y * s + py])
  }

  ctx.globalAlpha = 0.7
  for (const [color, pts] of batches) {
    ctx.fillStyle = color
    ctx.beginPath()
    for (const [sx, sy] of pts) {
      ctx.moveTo(sx + dotR, sy)
      ctx.arc(sx, sy, dotR, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

watchEffect(redrawCanvas, { flush: 'post' })

// ── Attack coloring ───────────────────────────────────────────────────
const C_SAFE  = '#a6e3a1'
const C_TOWER = '#fab387'
const C_WARN  = '#f9e2af'
const C_CRIT  = '#f38ba8'
const C_EXCL  = '#585b70'

const PRIORITY: Record<string, number> = {
  [C_EXCL]: -1, [C_SAFE]: 0, [C_WARN]: 1, [C_TOWER]: 2, [C_CRIT]: 3,
}

const MARKERS = [
  { id: 'wm-safe',  color: C_SAFE  },
  { id: 'wm-tower', color: C_TOWER },
  { id: 'wm-warn',  color: C_WARN  },
  { id: 'wm-crit',  color: C_CRIT  },
  { id: 'wm-excl',  color: C_EXCL  },
]

function atkColor(atk: Attack): string {
  if (atk.excluded) return C_EXCL
  const w = atk.warnings
  if (w.includes('MORALE_HIGH_RISK')) return C_CRIT
  if (w.includes('WATCHTOWER_HIT') && w.some(x => x !== 'WATCHTOWER_HIT')) return C_CRIT
  if (w.includes('WATCHTOWER_HIT')) return C_TOWER
  if (w.length > 0) return C_WARN
  return C_SAFE
}

function colorMarkerId(c: string): string {
  if (c === C_SAFE)  return 'wm-safe'
  if (c === C_TOWER) return 'wm-tower'
  if (c === C_WARN)  return 'wm-warn'
  if (c === C_CRIT)  return 'wm-crit'
  return 'wm-excl'
}

interface Pair {
  key: string
  fx: number; fy: number; tx: number; ty: number
  count: number; color: string; markerId: string; isSpam: boolean
}

const uniquePairs = computed<Pair[]>(() => {
  const map = new Map<string, Pair>()
  for (const atk of planStore.attacks) {
    const key    = `${atk.fromVillage.coords}→${atk.target.coords}`
    const color  = atkColor(atk)
    const isSpam = atk.type === 'spam' || atk.type === 'spam_noble'
    const ex     = map.get(key)
    if (!ex) {
      map.set(key, {
        key, count: 1, color, markerId: colorMarkerId(color), isSpam,
        fx: atk.fromVillage.x, fy: atk.fromVillage.y,
        tx: atk.target.x, ty: atk.target.y,
      })
    } else {
      ex.count++
      if ((PRIORITY[color] ?? 0) > (PRIORITY[ex.color] ?? 0)) {
        ex.color = color; ex.markerId = colorMarkerId(color)
      }
      if (!isSpam) ex.isSpam = false
    }
  }
  return [...map.values()]
})

const visiblePairs   = computed(() => uniquePairs.value.filter(p => !p.isSpam || showSpam.value))
const pairsWithCount = computed(() => visiblePairs.value.filter(p => p.count > 1))

const attackingVillages = computed(() => {
  const s = new Set(planStore.attacks.map(a => a.fromVillage.coords))
  return villagesStore.villages.filter(v => s.has(v.coords))
})

const attacksByTarget = computed(() => planStore.attacksByTarget)

function targetBorderColor(id: string): string {
  const atks = attacksByTarget.value.get(id)
  if (!atks?.length) return '#585b70'
  return atks.reduce((best, atk) => {
    const c = atkColor(atk)
    return (PRIORITY[c] ?? 0) > (PRIORITY[best] ?? 0) ? c : best
  }, C_SAFE)
}

// ── Tooltip ───────────────────────────────────────────────────────────
interface Tooltip { head: string; lines: string[]; x: number; y: number }
const tooltip = ref<Tooltip | null>(null)

function onHoverVillage(v: Village, e: MouseEvent) {
  const rect  = containerEl.value!.getBoundingClientRect()
  const count = planStore.attacks.filter(a => a.fromVillage.coords === v.coords).length
  tooltip.value = {
    head: v.coords,
    lines: [`Игрок: ${v.player}`, `Атак: ${count}`],
    x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 14,
  }
}

function onHoverTarget(t: Target, e: MouseEvent) {
  const rect = containerEl.value!.getBoundingClientRect()
  const atks = attacksByTarget.value.get(t.id) ?? []
  const wt   = atks.filter(a => a.warnings.includes('WATCHTOWER_HIT')).length
  const lines = [`Игрок: ${t.enemyPlayer ?? '—'}`, `Атак: ${atks.length}`]
  if (wt > 0) lines.push(`Засвечено башней: ${wt}`)
  tooltip.value = {
    head: t.coords, lines,
    x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 14,
  }
}

function clearHover() { tooltip.value = null }

// ── Legend items ──────────────────────────────────────────────────────
const ATTACK_LEGEND = [
  { color: C_SAFE,    label: 'Без предупреждений', square: false },
  { color: C_TOWER,   label: 'Засвет башни',        square: false },
  { color: C_WARN,    label: 'Предупреждение',      square: false },
  { color: C_CRIT,    label: 'Критично',            square: false },
  { color: '#89b4fa', label: '● Атакующие',         square: false },
  { color: '#f38ba8', label: '■ Цели',              square: true  },
]

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
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
  fitWorld()
  onUnmounted(() => ro?.disconnect())
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

// ── Toolbar ───────────────────────────────────────────────────────────
.map-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: $bg-panel;
  border-bottom: 1px solid $border;
  flex-shrink: 0;
  flex-wrap: wrap;
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

.toolbar-info {
  font-size: 0.78rem;
  color: $text-faint;
  &.dim { font-style: italic; }
  b { color: $text; font-weight: 600; }
}

// ── Map body ──────────────────────────────────────────────────────────
.map-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ── Map ───────────────────────────────────────────────────────────────
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0a0b10;
  cursor: grab;

  &:active { cursor: grabbing; }
}

.map-canvas {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
}

.map-svg {
  position: absolute;
  inset: 0;
  display: block;
  background: transparent;
  user-select: none;
}

// ── Tooltip ───────────────────────────────────────────────────────────
.map-tt {
  position: absolute;
  pointer-events: none;
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.4rem 0.65rem;
  font-size: 0.78rem;
  z-index: 20;
  max-width: 220px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);

  .tt-head { font-weight: 700; color: $text; margin-bottom: 0.2rem; font-size: 0.82rem; }
  .tt-row  { color: $text-dim; line-height: 1.5; }
}

// ── Tribe panel ───────────────────────────────────────────────────────
.tribe-panel {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border-left: 1px solid $border;
  overflow: hidden;
}

.tp-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid $border;
  font-size: 0.82rem;
  font-weight: 600;
  color: $text;
  flex-shrink: 0;
}

.tp-legend-mini {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  font-size: 0.7rem;
  color: $text-faint;
}

.tpl-item {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.tpl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tp-close {
  background: none;
  border: none;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 0.2rem;
  line-height: 1;
  margin-left: auto;

  &:hover { color: $text; }
}

.tp-search {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid $border;
  flex-shrink: 0;
}

.tp-input {
  width: 100%;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  font-size: 0.78rem;
  padding: 0.3rem 0.5rem;
  box-sizing: border-box;

  &::placeholder { color: $text-faint; }
  &:focus { outline: none; border-color: $accent; }
}

.tp-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.tp-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.78rem;
  transition: background 0.1s;

  &:hover { background: rgba(255,255,255,0.04); }
  &.tp-row-own    { background: rgba(137,180,250,0.07); }
  &.tp-row-ally   { background: rgba(116,199,236,0.07); }
  &.tp-row-enemy  { background: rgba(243,139,168,0.07); }
}

.tp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tp-tag {
  flex: 1;
  color: $text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.tp-cnt {
  color: $text-faint;
  font-size: 0.72rem;
  min-width: 28px;
  text-align: right;
}

.tp-btns {
  display: flex;
  gap: 2px;
}

.tp-cat {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  border: 1px solid $border;
  background: transparent;
  color: $text-dim;
  font-size: 0.65rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover { border-color: $text-dim; color: $text; }

  &-1.on { background: #89b4fa; border-color: #89b4fa; color: #0d0e14; }
  &-2.on { background: #74c7ec; border-color: #74c7ec; color: #0d0e14; }
  &-3.on { background: #f38ba8; border-color: #f38ba8; color: #0d0e14; }
}

.tp-empty {
  padding: 1rem 0.75rem;
  font-size: 0.78rem;
  color: $text-faint;
  font-style: italic;
}

// ── Legend ────────────────────────────────────────────────────────────
.map-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 1rem;
  background: $bg-panel;
  border-top: 1px solid $border;
  flex-shrink: 0;
  flex-wrap: wrap;
  overflow-x: auto;
}

.leg-label {
  font-size: 0.73rem;
  color: $text-faint;
  font-style: italic;
  white-space: nowrap;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.73rem;
  color: $text-dim;
  white-space: nowrap;
}

.leg-swatch {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.leg-own {
  color: $text;
  font-weight: 600;
}
</style>
