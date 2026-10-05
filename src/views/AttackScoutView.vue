<template>
  <div class="scout-page">

    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div class="scout-toolbar">
      <div class="tb-group">
        <span class="tb-label">Анализатор атак</span>
        <label class="btn btn-primary btn-sm file-btn" :class="{ 'is-loading': importing }">
          <span v-if="importing" class="btn-spinner" />
          {{ importing ? 'Обработка…' : (store.attacks.length ? 'Загрузить другой' : 'Импорт .xlsx') }}
          <input type="file" accept=".xlsx,.xls" @change="onFile" :disabled="importing" hidden />
        </label>
        <span v-if="store.lastFile" class="tb-file" :title="store.lastFile">{{ store.lastFile }}</span>
      </div>

      <template v-if="store.attacks.length">
        <span class="vsep" />
        <div class="tb-group">
          <span class="tb-stat"><b>{{ store.filteredAttacks.length }}</b> засвеченных офф-атак</span>
          <span class="tb-stat"><b>{{ store.targets.length }}</b> целей</span>
          <span class="tb-stat"><b>{{ store.origins.length }}</b> точек выхода</span>
        </div>
        <span class="vsep" />
        <div class="tb-group">
          <span class="tb-label">Атакующий</span>
          <select class="scout-select" v-model="store.filterAttacker">
            <option value="">Все ({{ store.attacks.length }})</option>
            <option v-for="a in store.attackers" :key="a.name" :value="a.name">{{ a.name }} ({{ a.count }})</option>
          </select>
          <span class="tb-label">Терпила</span>
          <select class="scout-select" v-model="store.filterVictim">
            <option value="">Все ({{ store.attacks.length }})</option>
            <option v-for="v in store.victims" :key="v.name" :value="v.name">{{ v.name }} ({{ v.count }})</option>
          </select>
        </div>
        <span class="vsep" />
        <div class="tb-group">
          <label class="tog" :title="enemyStore.hasVillageData ? `${enemyStore.villages.length.toLocaleString()} деревень мира` : 'Сначала загрузите карту мира'">
            <input type="checkbox" v-model="showWorld" :disabled="!enemyStore.hasVillageData" /> Карта мира
          </label>
          <button v-if="!enemyStore.hasVillageData" class="btn btn-sm btn-primary" :disabled="autoLoading" @click="autoLoadWorld">
            {{ autoLoading ? 'Загрузка…' : '↓ Загрузить мир' }}
          </button>
          <label class="tog"><input type="checkbox" v-model="showLines" /> Линии</label>
          <label class="tog"><input type="checkbox" v-model="showLabels" /> Подписи</label>
          <button class="btn btn-sm btn-secondary" @click="fitToData">⊹ Центрировать</button>
          <button class="btn btn-sm btn-secondary" @click="store.clear()">Очистить</button>
        </div>
        <span v-if="autoLoadError" class="tb-error">{{ autoLoadError }}</span>
      </template>
      <span v-if="parseError" class="tb-error">{{ parseError }}</span>
    </div>

    <!-- ── Map + side list ──────────────────────────────────────────────── -->
    <div class="scout-body">
      <div class="scout-map" ref="containerEl">
        <canvas
          ref="canvasEl"
          class="scout-canvas"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseLeave"
        />
        <div v-if="importing" class="scout-loading">
          <span class="scout-spinner" />
          <span>Парсим анализатор…</span>
        </div>
        <div v-if="!store.attacks.length && !importing" class="scout-empty">
          <div class="se-title">Карта засветов атак</div>
          <div class="se-text">
            Импортируй <b>«шаблон анализатора атак»</b> (.xlsx).<br />
            Беру офф-атаки с красным/коричневым засветом: <span class="dot-blue">●</span> точки выхода,
            <span class="dot-red">●</span> цели (ярче — больше атак).
          </div>
        </div>
        <div v-if="tooltip" class="scout-tt" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
          <div class="tt-head">{{ tooltip.head }}</div>
          <div v-for="(l, i) in tooltip.lines" :key="i" class="tt-line">{{ l }}</div>
        </div>

        <!-- ── Детальная панель по выбранной точке ─────────────────────── -->
        <div v-if="selectedDetail" class="scout-detail">
          <div class="sd-head">
            <span class="sd-dot" :style="{ background: selectedDetail.type === 'target' ? targetColor(selectedDetail.count) : C_ORIGIN }" />
            <span class="sd-title">{{ selectedDetail.type === 'target' ? 'Цель' : 'Точка выхода' }} {{ selectedDetail.coords }}</span>
            <button class="sd-close" @click="selected = null">✕</button>
          </div>

          <!-- инфа по деревне из выгрузки мира -->
          <div v-if="villageInfo(selectedDetail.coords)" class="sd-world">
            <template v-if="villageInfo(selectedDetail.coords)!.player">
              <span class="sd-chip">👤 {{ villageInfo(selectedDetail.coords)!.player }}</span>
            </template>
            <span v-if="villageInfo(selectedDetail.coords)!.tribe" class="sd-chip">🛡 {{ villageInfo(selectedDetail.coords)!.tribe }}</span>
            <span v-if="villageInfo(selectedDetail.coords)!.points" class="sd-chip">★ {{ villageInfo(selectedDetail.coords)!.points.toLocaleString() }}</span>
            <a class="sd-link" :href="villageLink(selectedDetail.coords)" target="_blank" rel="noopener" title="Открыть в игре">↗</a>
          </div>
          <div v-else class="sd-world sd-world-empty">нет данных мира (загрузите карту мира)</div>

          <div class="sd-stats">
            <span v-if="selectedDetail.type === 'target' && selectedDetail.victim">🎯 Терпила: <b>{{ selectedDetail.victim }}</b></span>
            <span v-if="selectedDetail.type === 'origin' && selectedDetail.attacker">⚔ Атакующий: <b>{{ selectedDetail.attacker }}</b></span>
            <span>Атак: <b>{{ selectedDetail.count }}</b></span>
            <span>Засветы: <b class="red">{{ selectedDetail.reds }}</b> крас. / <b class="brown">{{ selectedDetail.brown }}</b> корич.</span>
          </div>

          <div class="sd-rows-head">{{ selectedDetail.type === 'target' ? 'Атаки на эту деревню' : 'Цели этой деревни' }}</div>
          <div class="sd-rows">
            <div
              v-for="(row, i) in selectedDetail.rows" :key="i"
              class="sd-row"
              @mouseenter="hoverCoords = row.coords"
              @mouseleave="hoverCoords = null"
              @click="selectCoords(selectedDetail.type === 'target' ? 'origin' : 'target', row.coords)"
            >
              <span class="sd-row-coords">{{ row.coords }}</span>
              <span v-if="'attacker' in row && row.attacker" class="sd-row-player">⚔ {{ row.attacker }}</span>
              <span v-else-if="villageInfo(row.coords)?.player" class="sd-row-player">{{ villageInfo(row.coords)!.player }}</span>
              <span v-if="'victim' in row && row.victim" class="sd-row-player">🎯 {{ row.victim }}</span>
              <span v-if="row.unit" class="sd-row-unit">{{ row.unit }}</span>
              <span class="sd-row-flags">
                <span v-if="row.reds" class="red">●{{ row.reds }}</span>
                <span v-if="row.brown" class="brown">●{{ row.brown }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Targets list ─────────────────────────────────────────────────── -->
      <aside v-if="store.attacks.length" class="scout-side">
        <div class="side-head">
          <span>Цели по числу атак</span>
          <button class="btn btn-sm btn-secondary" @click="copyTargets" :title="`Скопировать ${store.targets.length} координат целей`">
            {{ copied ? '✓' : `⧉ ${store.targets.length}` }}
          </button>
        </div>
        <div class="side-list">
          <div
            v-for="t in store.targets" :key="t.coords"
            class="side-row" :class="{ hot: hoverCoords === t.coords }"
            @mouseenter="hoverCoords = t.coords"
            @mouseleave="hoverCoords = null"
            @click="selectCoords('target', t.coords)"
          >
            <span class="sr-dot" :style="{ background: targetColor(t.count) }" />
            <span class="sr-coords">{{ t.coords }}</span>
            <span class="sr-victim">{{ t.victim }}</span>
            <span class="sr-count">{{ t.count }}</span>
          </div>
        </div>
      </aside>
    </div>

    <!-- ── Legend ───────────────────────────────────────────────────────── -->
    <div v-if="store.attacks.length" class="scout-legend">
      <span class="leg-item"><span class="leg-dot" :style="{ background: C_ORIGIN }" /> Точка выхода (откуда)</span>
      <span class="vsep" />
      <span class="leg-item">Цель — число атак:</span>
      <span class="leg-grad">
        <span v-for="n in legendStops" :key="n" class="leg-chip" :style="{ background: targetColor(n) }">{{ n }}</span>
      </span>
      <template v-if="showWorld && enemyStore.hasPlayerData && topTribes.length">
        <span class="vsep" />
        <span class="leg-item">Племена:</span>
        <span v-for="t in topTribes" :key="t.tag" class="leg-tribe" :class="{ own: t.own }">
          <span class="leg-dot" :style="{ background: t.color }" /> {{ t.tag }}
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useScoutStore } from '@/stores/scoutStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useWorldStore } from '@/stores/worldStore'
import { useVillagesStore } from '@/stores/villagesStore'

const store         = useScoutStore()
const enemyStore    = useEnemyDataStore()
const worldStore    = useWorldStore()
const villagesStore = useVillagesStore()

const C_ORIGIN = '#38bdf8'          // синий — точка выхода
const C_BARB   = '#1c2230'          // фон — деревни без племени (варвары)
const C_OWN    = '#c8a840'          // своё племя — золотой

// Палитра для окраски племён по размеру
const TRIBE_PALETTE = [
  '#e06666', '#6fa8dc', '#93c47d', '#c27ba0', '#ffd966',
  '#76a5af', '#8e7cc3', '#f6b26b', '#a2c4c9', '#d5a6bd',
  '#6e48a4', '#8a2244', '#4a6e3e', '#7a4e2a', '#2e6878',
]

// ── Display toggles ───────────────────────────────────────────────────
const showWorld  = ref(true)
const showLines  = ref(true)
const showLabels = ref(true)
const parseError = ref('')
const importing  = ref(false)
const copied     = ref(false)

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
const hoverCoords = ref<string | null>(null)

// ── Карта мира (village.txt) — подложка для контекста ─────────────────
const autoLoading = ref(false)
const autoLoadError = ref('')
async function autoLoadWorld() {
  const code = worldStore.settings.worldCode
  if (!code) { autoLoadError.value = 'Укажите код мира в настройках'; return }
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
    const [vBlob, pBlob, aBlob] = await Promise.all([vRes.blob(), pRes.ok ? pRes.blob() : null, aRes.ok ? aRes.blob() : null])
    await enemyStore.loadVillageFile(new File([vBlob], 'village.txt.gz'))
    if (pBlob) await enemyStore.loadPlayerFile(new File([pBlob], 'player.txt.gz'))
    if (aBlob) await enemyStore.loadAllyFile(new File([aBlob], 'ally.txt.gz'))
    scheduleFrame()
  } catch (err) {
    autoLoadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    autoLoading.value = false
  }
}

// ── File import ───────────────────────────────────────────────────────
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  parseError.value = ''
  importing.value = true
  await nextPaint()                 // дать лоадеру отрисоваться до синхронного парсинга
  try {
    const res = await store.importFile(file)
    if (res.attacks === 0) parseError.value = 'Не найдено офф-атак с красным/коричневым засветом'
    else requestAnimationFrame(fitToData)
  } catch (err) {
    parseError.value = (err as Error).message
  } finally {
    importing.value = false
  }
  input.value = ''
}

// ── Target color: yellow → orange → red by attack count ──────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function targetColor(count: number): string {
  const max = store.maxTargetCount
  const t = max <= 1 ? 1 : Math.min(1, (count - 1) / (max - 1))
  // yellow (250,204,21) → orange (249,115,22) → red (220,38,38)
  let r, g, b
  if (t < 0.5) {
    const k = t / 0.5
    r = lerp(250, 249, k); g = lerp(204, 115, k); b = lerp(21, 22, k)
  } else {
    const k = (t - 0.5) / 0.5
    r = lerp(249, 220, k); g = lerp(115, 38, k); b = lerp(22, 38, k)
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

const legendStops = computed(() => {
  const max = store.maxTargetCount
  if (max <= 1) return [1]
  if (max <= 4) return Array.from({ length: max }, (_, i) => i + 1)
  return [1, Math.round(max / 3), Math.round((2 * max) / 3), max]
})

// ── Copy target coords ────────────────────────────────────────────────
async function copyTargets() {
  try {
    await navigator.clipboard.writeText(store.targets.map((t) => t.coords).join(' '))
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch { /* no clipboard */ }
}

// ── Окраска деревень мира по племенам ─────────────────────────────────
const ownAllyId = computed(() => {
  if (!villagesStore.villages.length || !enemyStore.hasPlayerData) return 0
  const myName = villagesStore.villages[0].player
  return enemyStore.playerByName.get(myName)?.allyId ?? 0
})

const allyColorMap = computed((): Map<number, string> => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players) if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)
  const sorted = [...allyCount.entries()].sort((a, b) => b[1] - a[1])
  const map = new Map<number, string>()
  let idx = 0
  for (const [allyId] of sorted) {
    if (allyId === ownAllyId.value) map.set(allyId, C_OWN)
    else { map.set(allyId, TRIBE_PALETTE[idx % TRIBE_PALETTE.length]); idx++ }
  }
  return map
})

const playerColorMap = computed((): Map<number, string> => {
  const map = new Map<number, string>()
  for (const p of enemyStore.players)
    map.set(p.id, p.allyId ? (allyColorMap.value.get(p.allyId) ?? C_BARB) : C_BARB)
  return map
})

// Топ племён для легенды
const topTribes = computed(() => {
  const allyCount = new Map<number, number>()
  for (const p of enemyStore.players) if (p.allyId) allyCount.set(p.allyId, (allyCount.get(p.allyId) ?? 0) + p.villages)
  return [...allyCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => ({
    tag: enemyStore.allyById.get(id)?.tag ?? `#${id}`,
    color: allyColorMap.value.get(id) ?? C_BARB,
    own: id === ownAllyId.value,
  }))
})

// ─────────────────────────────────────────────────────────────────────
// Canvas pan/zoom map
// ─────────────────────────────────────────────────────────────────────
const containerEl = ref<HTMLElement | null>(null)
const canvasEl    = ref<HTMLCanvasElement | null>(null)
let _scale = 1, _panX = 0, _panY = 0
let _rafId: number | null = null

function scheduleFrame() {
  if (_rafId !== null) return
  _rafId = requestAnimationFrame(() => { _rafId = null; drawFrame() })
}

const bbox = computed(() => {
  const pts = [
    ...store.origins.map((p) => ({ x: p.x, y: p.y })),
    ...store.targets.map((p) => ({ x: p.x, y: p.y })),
  ]
  if (!pts.length) return { minX: 400, minY: 400, maxX: 600, maxY: 600 }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
})

function fitToData() {
  const c = canvasEl.value
  const cW = c?.clientWidth || 800, cH = c?.clientHeight || 600
  const pad = 50, bx = bbox.value
  const bW = (bx.maxX - bx.minX) || 50, bH = (bx.maxY - bx.minY) || 50
  const s = Math.min(cW / (bW + pad * 2), cH / (bH + pad * 2))
  _scale = s
  _panX = (cW - bW * s) / 2 - bx.minX * s
  _panY = (cH - bH * s) / 2 - bx.minY * s
  scheduleFrame()
}

function focusCoords(x: number, y: number) {
  const c = canvasEl.value
  const cW = c?.clientWidth || 800, cH = c?.clientHeight || 600
  _panX = cW / 2 - x * _scale
  _panY = cH / 2 - y * _scale
  scheduleFrame()
}

function drawFrame() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const dw = canvas.clientWidth || canvas.width, dh = canvas.clientHeight || canvas.height
  const pw = Math.round(dw * dpr), ph = Math.round(dh * dpr)
  if (canvas.width !== pw) canvas.width = pw
  if (canvas.height !== ph) canvas.height = ph
  ctx.clearRect(0, 0, pw, ph)
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.translate(_panX, _panY)
  ctx.scale(_scale, _scale)

  if (showWorld.value && enemyStore.hasVillageData) drawWorld(ctx)
  drawGrid(ctx)
  if (showLines.value) drawLines(ctx)
  drawOrigins(ctx)
  drawTargets(ctx)

  ctx.restore()
}

function drawWorld(ctx: CanvasRenderingContext2D) {
  const c = canvasEl.value!
  const W = c.clientWidth, H = c.clientHeight
  // visible world-coord range (ctx is already pan/zoom transformed)
  const gx0 = (0 - _panX) / _scale - 1, gy0 = (0 - _panY) / _scale - 1
  const gx1 = (W - _panX) / _scale + 1, gy1 = (H - _panY) / _scale + 1
  const r = Math.max(0.35, Math.min(1.4, 0.5 / _scale))
  const colorMap = playerColorMap.value
  const hasTribes = enemyStore.hasPlayerData
  // батчим по цвету — один path на цвет
  const batches = new Map<string, Array<[number, number]>>()
  for (const v of enemyStore.villages) {
    if (v.x < gx0 || v.x > gx1 || v.y < gy0 || v.y > gy1) continue
    const color = hasTribes ? (colorMap.get(v.playerId) ?? C_BARB) : C_BARB
    let b = batches.get(color)
    if (!b) { b = []; batches.set(color, b) }
    b.push([v.x, v.y])
  }
  // варвары — снизу и тусклее, племена — ярче сверху
  const order = [...batches.keys()].sort((a) => (a === C_BARB ? -1 : 1))
  for (const color of order) {
    ctx.fillStyle = color
    ctx.globalAlpha = color === C_BARB ? 0.6 : 0.9
    ctx.beginPath()
    for (const [x, y] of batches.get(color)!) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  const bx = bbox.value, pad = 30, step = 20
  const x0 = Math.floor((bx.minX - pad) / step) * step
  const x1 = Math.ceil((bx.maxX + pad) / step) * step
  const y0 = Math.floor((bx.minY - pad) / step) * step
  const y1 = Math.ceil((bx.maxY + pad) / step) * step
  ctx.beginPath()
  ctx.strokeStyle = '#2a3a4a'
  ctx.lineWidth = 0.4 / _scale
  ctx.globalAlpha = 0.4
  for (let x = x0; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
  for (let y = y0; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawLines(ctx: CanvasRenderingContext2D) {
  const hc = hoverCoords.value
  for (const a of store.filteredAttacks) {
    const isHL = hc !== null && (a.tCoords === hc || a.oCoords === hc)
    ctx.globalAlpha = hc !== null ? (isHL ? 0.9 : 0.05) : 0.22
    ctx.strokeStyle = isHL ? '#ffffff' : C_ORIGIN
    ctx.lineWidth = (isHL ? 1.6 : 0.8) / _scale
    ctx.beginPath()
    ctx.moveTo(a.ox, a.oy)
    ctx.lineTo(a.tx, a.ty)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawOrigins(ctx: CanvasRenderingContext2D) {
  const r = 3.2 / _scale
  const sel = selected.value
  for (const o of store.origins) {
    const isHL = hoverCoords.value === o.coords
    const isSel = sel?.type === 'origin' && sel.coords === o.coords
    ctx.beginPath()
    ctx.arc(o.x, o.y, isHL || isSel ? r * 1.5 : r, 0, Math.PI * 2)
    ctx.fillStyle = C_ORIGIN
    ctx.globalAlpha = 0.95
    ctx.fill()
    ctx.strokeStyle = isSel ? '#ffffff' : '#0b1220'
    ctx.lineWidth = (isSel ? 1.6 : 0.6) / _scale
    ctx.stroke()
    ctx.globalAlpha = 1
    if (isSel) {
      ctx.beginPath()
      ctx.arc(o.x, o.y, r * 2.4, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 / _scale
      ctx.setLineDash([2 / _scale, 2 / _scale]); ctx.globalAlpha = 0.7; ctx.stroke()
      ctx.setLineDash([]); ctx.globalAlpha = 1
    }
    if (showLabels.value && _scale > 1.2) {
      ctx.fillStyle = '#7dd3fc'
      ctx.font = `${6 / _scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(o.coords, o.x, o.y - r - 1 / _scale)
    }
  }
}

function drawTargets(ctx: CanvasRenderingContext2D) {
  const sel = selected.value
  for (const t of store.targets) {
    const isHL = hoverCoords.value === t.coords
    const isSel = sel?.type === 'target' && sel.coords === t.coords
    const col = targetColor(t.count)
    const r = (4 + Math.min(6, t.count)) / _scale
    // glow
    ctx.beginPath()
    ctx.arc(t.x, t.y, r * 1.6, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.globalAlpha = 0.15
    ctx.fill()
    // core
    ctx.beginPath()
    ctx.arc(t.x, t.y, isHL || isSel ? r * 1.3 : r, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.globalAlpha = 0.95
    ctx.fill()
    ctx.strokeStyle = isHL || isSel ? '#ffffff' : '#0b1220'
    ctx.lineWidth = (isHL || isSel ? 1.6 : 0.8) / _scale
    ctx.globalAlpha = 1
    ctx.stroke()
    if (isSel) {
      ctx.beginPath()
      ctx.arc(t.x, t.y, r * 1.9, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 / _scale
      ctx.setLineDash([2 / _scale, 2 / _scale]); ctx.globalAlpha = 0.7; ctx.stroke()
      ctx.setLineDash([]); ctx.globalAlpha = 1
    }
    // count
    ctx.fillStyle = '#1a0a00'
    ctx.font = `bold ${5.5 / _scale}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(t.count), t.x, t.y + 0.3 / _scale)
    if (showLabels.value) {
      ctx.fillStyle = '#fca5a5'
      ctx.font = `bold ${7 / _scale}px sans-serif`
      ctx.textBaseline = 'bottom'
      ctx.fillText(t.coords, t.x, t.y - r - 1.5 / _scale)
      if (t.victim && _scale > 1) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = `${6 / _scale}px sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(t.victim, t.x, t.y + r + 1.5 / _scale)
      }
    }
  }
}

// ── Mouse ─────────────────────────────────────────────────────────────
let _dragging = false, _moved = false, _dsx = 0, _dsy = 0, _pox = 0, _poy = 0
const tooltip = ref<{ x: number; y: number; head: string; lines: string[] } | null>(null)

// ── Выбранная точка — детальная панель ────────────────────────────────
const selected = ref<{ type: 'target' | 'origin'; coords: string } | null>(null)

const selectedDetail = computed(() => {
  const sel = selected.value
  if (!sel) return null
  if (sel.type === 'target') {
    const t = store.targets.find((p) => p.coords === sel.coords)
    if (!t) return null
    const atks = store.filteredAttacks.filter((a) => a.tCoords === sel.coords)
    return {
      type: 'target' as const,
      coords: t.coords, x: t.x, y: t.y, victim: t.victim ?? '', attacker: '',
      count: t.count, reds: t.reds, brown: t.brown,
      rows: atks.map((a) => ({ coords: a.oCoords, unit: a.unit, attacker: a.attacker, reds: a.reds, brown: a.brown })),
    }
  }
  const o = store.origins.find((p) => p.coords === sel.coords)
  if (!o) return null
  const atks = store.filteredAttacks.filter((a) => a.oCoords === sel.coords)
  return {
    type: 'origin' as const,
    coords: o.coords, x: o.x, y: o.y, victim: '', attacker: o.attacker ?? '',
    count: o.count, reds: o.reds, brown: o.brown,
    rows: atks.map((a) => ({ coords: a.tCoords, unit: a.unit, victim: a.victim, reds: a.reds, brown: a.brown })),
  }
})

/** Инфа по деревне из village.txt + player.txt + ally.txt (если загружены). */
function villageInfo(coords: string): { player: string; tribe: string; points: number } | null {
  const info = enemyStore.lookupCoords(coords)
  if (!info) return null
  return {
    player: info.player?.name ?? '',
    tribe: info.ally?.tag ?? '',
    points: info.village.points ?? 0,
  }
}

/** Ссылка на деревню в игре. */
function villageLink(coords: string): string {
  const code = worldStore.settings.worldCode || 'ru100'
  const [x, y] = coords.split('|')
  return `https://${code}.voynaplemyon.com/game.php?screen=map&x=${x}&y=${y}`
}

/** Выбрать точку из списка в детальной панели и подлететь к ней. */
function selectCoords(type: 'target' | 'origin', coords: string) {
  selected.value = { type, coords }
  const p = (type === 'target' ? store.targets : store.origins).find((v) => v.coords === coords)
  if (p) focusCoords(p.x, p.y)
  scheduleFrame()
}

function screenToWorld(cx: number, cy: number) {
  return { wx: (cx - _panX) / _scale, wy: (cy - _panY) / _scale }
}

/** Хит-тест по экранным координатам → цель/выход под курсором. */
function hitTestAt(cx: number, cy: number): { type: 'target' | 'origin'; coords: string } | null {
  const { wx, wy } = screenToWorld(cx, cy)
  const hr2 = (10 / _scale) ** 2
  for (const t of store.targets) {
    const dx = wx - t.x, dy = wy - t.y
    if (dx * dx + dy * dy <= hr2) return { type: 'target', coords: t.coords }
  }
  for (const o of store.origins) {
    const dx = wx - o.x, dy = wy - o.y
    if (dx * dx + dy * dy <= hr2) return { type: 'origin', coords: o.coords }
  }
  return null
}

function onWheel(e: WheelEvent) {
  const rect = containerEl.value!.getBoundingClientRect()
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top
  const { wx, wy } = screenToWorld(cx, cy)
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  _scale = Math.max(0.2, Math.min(40, _scale * factor))
  _panX = cx - wx * _scale
  _panY = cy - wy * _scale
  scheduleFrame()
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  _dragging = true; _moved = false
  _dsx = e.clientX; _dsy = e.clientY; _pox = _panX; _poy = _panY
}

function onMouseMove(e: MouseEvent) {
  if (_dragging) {
    if (Math.abs(e.clientX - _dsx) > 3 || Math.abs(e.clientY - _dsy) > 3) _moved = true
    _panX = _pox + (e.clientX - _dsx)
    _panY = _poy + (e.clientY - _dsy)
    scheduleFrame()
  }
  const rect = containerEl.value!.getBoundingClientRect()
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top
  const { wx, wy } = screenToWorld(cx, cy)
  const hr2 = (10 / _scale) ** 2
  let hit: { head: string; lines: string[]; coords: string } | null = null
  for (const t of store.targets) {
    const dx = wx - t.x, dy = wy - t.y
    if (dx * dx + dy * dy <= hr2) {
      const wi = villageInfo(t.coords)
      hit = { coords: t.coords, head: `🎯 Цель ${t.coords}`, lines: [
        t.victim ? `Терпила: ${t.victim}` : '',
        wi?.tribe ? `Племя: ${wi.tribe}` : '',
        wi?.points ? `Очки: ${wi.points.toLocaleString()}` : '',
        `Атак: ${t.count}`,
        `Засветы: ${t.reds} крас. / ${t.brown} корич.`,
      ].filter(Boolean) }
      break
    }
  }
  if (!hit) {
    for (const o of store.origins) {
      const dx = wx - o.x, dy = wy - o.y
      if (dx * dx + dy * dy <= hr2) {
        const wi = villageInfo(o.coords)
        hit = { coords: o.coords, head: `🏹 Выход ${o.coords}`, lines: [
          o.attacker ? `Атакующий: ${o.attacker}` : (wi?.player ? `Игрок: ${wi.player}` : ''),
          wi?.tribe ? `Племя: ${wi.tribe}` : '',
          `Атак отсюда: ${o.count}`,
          `Целей: ${o.targets?.size ?? 0}`,
        ].filter(Boolean) }
        break
      }
    }
  }
  if (hit) {
    tooltip.value = { x: cx + 14, y: cy + 14, head: hit.head, lines: hit.lines }
    hoverCoords.value = hit.coords
    scheduleFrame()
  } else if (tooltip.value) {
    tooltip.value = null
    hoverCoords.value = null
    scheduleFrame()
  }
}

function onMouseUp(e: MouseEvent) {
  const wasClick = _dragging && !_moved
  _dragging = false
  if (!wasClick) return
  const rect = containerEl.value!.getBoundingClientRect()
  const hit = hitTestAt(e.clientX - rect.left, e.clientY - rect.top)
  selected.value = hit && !(selected.value && selected.value.coords === hit.coords && selected.value.type === hit.type)
    ? hit : null
  scheduleFrame()
}
function onMouseLeave() { _dragging = false; tooltip.value = null; hoverCoords.value = null; scheduleFrame() }

watch(hoverCoords, scheduleFrame)
watch([showLines, showLabels, showWorld], scheduleFrame)
watch(() => enemyStore.villages.length, scheduleFrame)
watch(() => enemyStore.players.length, scheduleFrame)
watch(() => [store.filterVictim, store.filterAttacker], () => { selected.value = null; requestAnimationFrame(fitToData) })
watch(() => store.attacks.length, () => { selected.value = null; requestAnimationFrame(fitToData) })

let _ro: ResizeObserver | null = null
onMounted(() => {
  if (store.attacks.length) requestAnimationFrame(fitToData)
  else scheduleFrame()
  _ro = new ResizeObserver(() => scheduleFrame())
  if (containerEl.value) _ro.observe(containerEl.value)
})
onUnmounted(() => { _ro?.disconnect() })
</script>

<style scoped lang="scss">
.scout-page { display: flex; flex-direction: column; height: calc(100vh - 60px); }

.scout-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 14px; background: $bg-deep; border-bottom: 1px solid $border;
}
.tb-group { display: flex; align-items: center; gap: 8px; }
.tb-label { font-size: 12px; color: $text-dim; text-transform: uppercase; letter-spacing: .04em; }
.tb-file { font-size: 12px; color: $text-dim; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-stat { font-size: 13px; color: $text-dim; b { color: $text; } }
.scout-select { background: $bg-deep; color: $text; border: 1px solid $border; border-radius: 5px; padding: 3px 7px; font-size: 13px; max-width: 220px; }
.tb-error { font-size: 12px; color: #f87171; }
.file-btn { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; &.is-loading { opacity: .85; pointer-events: none; } }
.btn-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
  animation: scout-spin .7s linear infinite;
}

.scout-loading {
  position: absolute; inset: 0; z-index: 15; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
  background: rgba(7,11,18,.7); backdrop-filter: blur(1px);
  color: $text; font-size: 14px;
}
.scout-spinner {
  width: 38px; height: 38px; border-radius: 50%;
  border: 3px solid rgba(56,189,248,.25); border-top-color: #38bdf8;
  animation: scout-spin .7s linear infinite;
}
@keyframes scout-spin { to { transform: rotate(360deg); } }
.vsep { width: 1px; align-self: stretch; background: $border; margin: 0 2px; }
.tog { display: flex; align-items: center; gap: 4px; font-size: 13px; color: $text-dim; cursor: pointer; }

.scout-body { flex: 1; display: flex; min-height: 0; }
.scout-map { flex: 1; position: relative; background: radial-gradient(circle at 50% 40%, #0f1826, #070b12); overflow: hidden; }
.scout-canvas { width: 100%; height: 100%; display: block; cursor: grab; &:active { cursor: grabbing; } }

.scout-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center; pointer-events: none;
  .se-title { font-size: 20px; font-weight: 700; color: $text; }
  .se-text { font-size: 14px; color: $text-dim; line-height: 1.6; }
  .dot-blue { color: #38bdf8; } .dot-red { color: #ef4444; }
}

.scout-tt {
  position: absolute; z-index: 10; pointer-events: none;
  background: rgba(10,16,26,.95); border: 1px solid $border; border-radius: 6px;
  padding: 6px 9px; font-size: 12px; color: $text; box-shadow: 0 4px 16px rgba(0,0,0,.5);
  .tt-head { font-weight: 700; margin-bottom: 3px; }
  .tt-line { color: $text-dim; }
}

.scout-detail {
  position: absolute; left: 12px; bottom: 12px; z-index: 12; width: 320px; max-height: 70%;
  display: flex; flex-direction: column;
  background: rgba(10,16,26,.96); border: 1px solid $border; border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,.6); overflow: hidden;
  .sd-head {
    display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-bottom: 1px solid $border;
    .sd-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
    .sd-title { font-weight: 700; color: $text; font-size: 14px; flex: 1; }
    .sd-close { background: none; border: none; color: $text-dim; cursor: pointer; font-size: 14px; &:hover { color: $text; } }
  }
  .sd-world {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 11px; border-bottom: 1px solid rgba(255,255,255,.05);
    .sd-chip { background: rgba(255,255,255,.06); border-radius: 5px; padding: 2px 7px; font-size: 12px; color: $text; }
    .sd-link { margin-left: auto; color: #38bdf8; text-decoration: none; font-size: 14px; }
    &.sd-world-empty { color: $text-dim; font-size: 11px; font-style: italic; }
  }
  .sd-stats {
    display: flex; flex-direction: column; gap: 3px; padding: 8px 11px; font-size: 12px; color: $text-dim;
    border-bottom: 1px solid rgba(255,255,255,.05);
    b { color: $text; } .red { color: #f87171; } .brown { color: #c08457; }
  }
  .sd-rows-head { padding: 7px 11px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: $text-dim; }
  .sd-rows { overflow-y: auto; }
  .sd-row {
    display: flex; align-items: center; gap: 7px; padding: 5px 11px; cursor: pointer; font-size: 12px;
    border-top: 1px solid rgba(255,255,255,.03);
    &:hover { background: rgba(56,189,248,.08); }
    .sd-row-coords { font-weight: 600; color: $text; }
    .sd-row-player { color: $text-dim; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
    .sd-row-unit { color: #94a3b8; }
    .sd-row-flags { margin-left: auto; display: flex; gap: 5px; .red { color: #f87171; } .brown { color: #c08457; } }
  }
}

.scout-side {
  width: 300px; display: flex; flex-direction: column; background: $bg-deep; border-left: 1px solid $border;
  .side-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-size: 13px; font-weight: 600; color: $text; border-bottom: 1px solid $border; }
  .side-list { flex: 1; overflow-y: auto; }
  .side-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px;
    border-bottom: 1px solid rgba(255,255,255,.03);
    &:hover, &.hot { background: rgba(56,189,248,.08); }
    .sr-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .sr-coords { font-weight: 600; color: $text; }
    .sr-victim { flex: 1; color: $text-dim; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .sr-count { font-weight: 700; color: #fca5a5; }
  }
}

.scout-legend {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 7px 14px; background: $bg-deep; border-top: 1px solid $border; font-size: 12px; color: $text-dim;
  .leg-item { display: flex; align-items: center; gap: 5px; }
  .leg-dot { width: 11px; height: 11px; border-radius: 50%; }
  .leg-grad { display: flex; gap: 3px; }
  .leg-chip { min-width: 20px; text-align: center; padding: 1px 5px; border-radius: 4px; color: #1a0a00; font-weight: 700; font-size: 11px; }
  .leg-tribe { display: flex; align-items: center; gap: 4px; font-size: 11px; &.own { color: #e9c75a; font-weight: 600; } }
}
</style>
