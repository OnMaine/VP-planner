<template>
  <div class="ap-page">
    <div class="ap-head">
      <h2>Аналитика по врагам</h2>
      <span class="ap-sub" v-if="store.hasData">{{ rows.length }} игроков · обновляется с каждой выгрузкой на «Карте дефа»</span>
      <RouterLink to="/def-map" class="btn btn-sm btn-secondary">← Карта дефа</RouterLink>
    </div>

    <div v-if="!store.hasData" class="ap-empty">
      Нет данных. Загрузите .xlsx‑выгрузку на странице <RouterLink to="/def-map">Карта дефа</RouterLink>.
    </div>

    <template v-else>
      <div class="ap-note" v-if="!anyOwned">
        ⚠ Нет листа «Войска» в текущих данных — «свой деф / отдал / хабы / раздетые / офф» считаются приблизительно.
        Перезалейте полную выгрузку на «Карте дефа».
      </div>

      <div class="ap-table-wrap">
        <table class="ap-table">
          <thead>
            <tr>
              <th v-for="c in COLS" :key="c.key"
                :class="{ num: c.num, active: sortKey === c.key }"
                @click="sortBy(c.key)">
                {{ c.label }}<span v-if="sortKey === c.key" class="arr">{{ sortDir === 'desc' ? '▾' : '▴' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in sortedRows" :key="r.name">
              <td class="pname"><span class="dot" :style="{ background: r.color }" />{{ r.name }}</td>
              <td class="num">{{ r.villages }}</td>
              <td class="num">{{ fmtK(r.ownDef) }}</td>
              <td class="num">{{ fmtK(r.standDef) }}</td>
              <td class="num">{{ fmtK(r.away) }}</td>
              <td class="num" :style="pctStyle(r.awayPct)">{{ r.awayPct.toFixed(0) }}%</td>
              <td class="num">{{ fmtK(r.recv) }}</td>
              <td class="num hub" :class="{ z: !r.hubs }">{{ r.hubs }}</td>
              <td class="num strip" :class="{ z: !r.stripped }">{{ r.stripped }}</td>
              <td class="num">{{ fmtK(r.off) }}</td>
              <td class="num">{{ r.offVil }}</td>
              <td class="num">{{ r.nobles }}</td>
              <td class="num">{{ fmtK(r.cats) }}</td>
              <td class="num">{{ r.towers }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Донор-деры (цели) ─────────────────────────────────────────── -->
      <div class="ap-donors">
        <div class="dl-head">
          <h3>Донор-деры (цели)</h3>
          <span class="dl-count"><b>{{ effectiveCoords.length }}</b> / {{ totalDonorVil }} дер</span>
          <div class="dl-presets">
            <span>стоит</span>
            <button v-for="p in DONOR_PRESETS" :key="p.l" :class="{ active: donorMax === p.v }" @click="donorMax = p.v">{{ p.l }}</button>
          </div>
          <label class="dl-sep">разделитель
            <select v-model="sepMode">
              <option value="newline">строка</option>
              <option value="space">пробел</option>
              <option value="comma">запятая</option>
            </select>
          </label>
          <button class="btn btn-sm btn-primary" @click="copyAll">{{ copiedKey === '__all__' ? 'Скопировано ✓' : 'Копировать все' }}</button>
        </div>

        <div class="dl-conts" v-if="donorContinents.length">
          <span class="dl-conts-label">Континенты:</span>
          <button class="dl-mode" :class="{ on: contMode === 'only' }" @click="contMode = 'only'">только</button>
          <button class="dl-mode" :class="{ on: contMode === 'except' }" @click="contMode = 'except'">кроме</button>
          <button v-for="c in donorContinents" :key="c" class="dl-cont-chip"
            :class="{ active: selectedConts.has(c) }" @click="toggleCont(c)">K{{ c }}</button>
          <button v-if="selectedConts.size" class="dl-cont-clear" @click="selectedConts = new Set()">сброс</button>
        </div>
        <div class="dl-hint">
          Деревни, отдавшие деф в подкреп (свой деф ушёл). Внутри игрока — сначала где меньше всего стоит.
          Можно исключить игрока целиком или отдельную деру; «стоит» подсвечено (много дефа = красный → скорее убрать).
        </div>

        <div class="dl-empty" v-if="!donorGroups.length">
          Нет донор-дер. Нужна свежая выгрузка с листом «Войска» на «Карте дефа».
        </div>

        <div class="dl-groups">
          <div class="dl-group" v-for="g in donorGroups" :key="g.name" :class="{ excluded: excludedPlayers.has(g.name) }">
            <div class="dl-gh">
              <button class="dl-exp" @click="toggleExpand(g.name)">{{ expanded.has(g.name) ? '▾' : '▸' }}</button>
              <span class="dot" :style="{ background: g.color }" />
              <b class="dl-gname">{{ g.name }}</b>
              <span class="dl-gcount">{{ activeCoords(g).length }}/{{ g.villages.length }} дер · ушло {{ fmtK(g.totalAway) }}</span>
              <button class="btn btn-xs" @click="copyPlayer(g)">{{ copiedKey === g.name ? '✓' : 'копир.' }}</button>
              <button class="dl-excl" :class="{ on: excludedPlayers.has(g.name) }" @click="togglePlayer(g.name)">
                {{ excludedPlayers.has(g.name) ? 'вернуть' : 'исключить' }}
              </button>
            </div>
            <div class="dl-vils" v-if="expanded.has(g.name) && !excludedPlayers.has(g.name)">
              <div class="dl-vil" v-for="v in g.villages" :key="v.coords" :class="{ off: excludedVillages.has(v.coords) }">
                <span class="dl-coords">{{ v.coords }}</span>
                <span class="dl-cont">K{{ v.cont }}</span>
                <span class="dl-chip" :style="{ background: standColor(v.stand) }">стоит {{ fmtK(v.stand) }}</span>
                <span class="dl-away">ушло {{ fmtK(v.away) }}</span>
                <span class="dl-b">🧱{{ v.wall ?? '?' }} · 🗼{{ v.tower ?? '?' }}</span>
                <button class="dl-vx" :title="excludedVillages.has(v.coords) ? 'Вернуть' : 'Исключить деру'" @click="toggleVillage(v.coords)">
                  {{ excludedVillages.has(v.coords) ? '↺' : '✕' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Сравнение выгрузок ────────────────────────────────────────── -->
      <div class="ap-diff" v-if="store.hasBaseline">
        <div class="dl-head">
          <h3>Сравнение выгрузок — {{ diffDir === 'loss' ? 'где сняли деф' : 'где набрали деф' }}</h3>
          <span class="dl-count"><b>{{ diffShown.length }}</b> дер</span>
          <div class="dl-presets">
            <button :class="{ active: diffDir === 'loss' }" @click="diffDir = 'loss'">оголились ↓</button>
            <button :class="{ active: diffDir === 'gain' }" @click="diffDir = 'gain'">набрали ↑</button>
          </div>
          <button class="btn btn-sm btn-primary" @click="copyDiff">{{ copiedKey === 'diff' ? 'Скопировано ✓' : 'Копировать все' }}</button>
        </div>
        <div class="dl-hint">Изменение дефа «в деревне» относительно базовой (старой) выгрузки. Сначала — где сильнее всего {{ diffDir === 'loss' ? 'сняли' : 'набрали' }}.</div>
        <div class="dl-empty" v-if="!diffShown.length">Нет изменений в эту сторону.</div>
        <div class="ap-diff-list">
          <div class="ap-diff-row" v-for="r in diffShown" :key="r.coords" :class="r.d >= 0 ? 'up' : 'dn'">
            <div class="apd-id">
              <span class="dl-coords">{{ r.coords }}</span>
              <span class="dl-cont">K{{ r.cont }}</span>
            </div>
            <span class="apd-player">{{ r.player }}</span>
            <span class="apd-was">{{ fmtK(r.was) }} → {{ fmtK(r.now) }}</span>
            <span class="apd-d">{{ r.d >= 0 ? '+' : '−' }}{{ fmtK(Math.abs(r.d)) }}</span>
            <div class="apd-bar"><div class="apd-bar-fill" :style="{ width: (Math.abs(r.d) / diffMaxAbs * 100) + '%' }"></div></div>
            <div class="apd-units">
              <span v-for="(u, i) in r.parts" :key="i" class="apd-chip" :class="u.d >= 0 ? 'plus' : 'minus'">{{ u.label }} {{ u.d >= 0 ? '+' : '−' }}{{ fmtK(Math.abs(u.d)) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useDefMapStore, calcDefScore, UNIT_KEYS, type UnitKey } from '@/stores/defMapStore'

const store = useDefMapStore()
onMounted(() => { if (!store.hasData) store.load() })

type Row = typeof store.analytics extends readonly (infer T)[] ? T : never
type Key = keyof Row

const COLS: { key: Key; label: string; num: boolean }[] = [
  { key: 'name', label: 'Игрок', num: false },
  { key: 'villages', label: 'Дер', num: true },
  { key: 'ownDef', label: 'Свой деф', num: true },
  { key: 'standDef', label: 'Стоит', num: true },
  { key: 'away', label: 'Донор', num: true },
  { key: 'awayPct', label: 'Донор %', num: true },
  { key: 'recv', label: 'Получил', num: true },
  { key: 'hubs', label: '⚓ Хабы', num: true },
  { key: 'stripped', label: '🗡 Раздет.', num: true },
  { key: 'off', label: 'Офф', num: true },
  { key: 'offVil', label: 'Офф-дер', num: true },
  { key: 'nobles', label: 'Нобли', num: true },
  { key: 'cats', label: 'Каты', num: true },
  { key: 'towers', label: '🗼 Башни', num: true },
]

const sortKey = ref<Key>('standDef')
const sortDir = ref<'asc' | 'desc'>('desc')
function sortBy(k: Key) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  else { sortKey.value = k; sortDir.value = k === 'name' ? 'asc' : 'desc' }
}

const rows = computed(() => store.analytics)
const anyOwned = computed(() => rows.value.some(r => r.hasOwned))

const sortedRows = computed(() => {
  const k = sortKey.value, dir = sortDir.value === 'desc' ? -1 : 1
  return [...rows.value].sort((a, b) => {
    const av = a[k], bv = b[k]
    if (typeof av === 'string' || typeof bv === 'string')
      return String(av).localeCompare(String(bv)) * dir
    return (((av as number) ?? 0) - ((bv as number) ?? 0)) * dir
  })
})

function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n))
}

// ── Донор-деры (цели): villages that sent their def out as support ────
const DONOR_MIN_AWAY = 2000
const donorMax = ref<number>(Infinity)   // include villages currently holding < this def
const DONOR_PRESETS = [
  { v: 1000, l: '<1k' }, { v: 3000, l: '<3k' }, { v: 5000, l: '<5k' },
  { v: 10000, l: '<10k' }, { v: Infinity, l: 'все' },
]

interface DonorVil { coords: string; cont: string; stand: number; away: number; owned: number; wall?: number; tower?: number }

function contOf(x: number, y: number): string {
  return `${Math.floor(y / 100)}${Math.floor(x / 100)}`
}

const selectedConts = ref<Set<string>>(new Set())
const contMode = ref<'only' | 'except'>('only')
function toggleCont(c: string) {
  const s = new Set(selectedConts.value); s.has(c) ? s.delete(c) : s.add(c); selectedConts.value = s
}
function contPass(cont: string): boolean {
  if (!selectedConts.value.size) return true
  const has = selectedConts.value.has(cont)
  return contMode.value === 'only' ? has : !has
}
const excludedPlayers = ref<Set<string>>(new Set())
const excludedVillages = ref<Set<string>>(new Set())
const expanded = ref<Set<string>>(new Set())

function togglePlayer(name: string) {
  const s = new Set(excludedPlayers.value); s.has(name) ? s.delete(name) : s.add(name); excludedPlayers.value = s
}
function toggleVillage(coords: string) {
  const s = new Set(excludedVillages.value); s.has(coords) ? s.delete(coords) : s.add(coords); excludedVillages.value = s
}
function toggleExpand(name: string) {
  const s = new Set(expanded.value); s.has(name) ? s.delete(name) : s.add(name); expanded.value = s
}

function isDonor(v: { ownedDef?: number; defScore: number }): boolean {
  return v.ownedDef != null && v.ownedDef - v.defScore > DONOR_MIN_AWAY && v.defScore < donorMax.value
}

// Continents present among donor villages (ignores the continent filter itself).
const donorContinents = computed(() => {
  const set = new Set<string>()
  for (const p of store.players)
    for (const v of p.villages) if (isDonor(v)) set.add(contOf(v.x, v.y))
  return [...set].sort()
})

const donorGroups = computed(() => {
  const groups: { name: string; color: string; villages: DonorVil[]; totalAway: number }[] = []
  for (const p of store.players) {
    const vs: DonorVil[] = []
    let totalAway = 0
    for (const v of p.villages) {
      if (!isDonor(v)) continue
      const cont = contOf(v.x, v.y)
      if (!contPass(cont)) continue
      vs.push({ coords: v.coords, cont, stand: v.defScore, away: v.ownedDef! - v.defScore, owned: v.ownedDef!, wall: v.wall, tower: v.watchtower })
      totalAway += v.ownedDef! - v.defScore
    }
    if (vs.length) { vs.sort((a, b) => a.stand - b.stand); groups.push({ name: p.name, color: p.color, villages: vs, totalAway }) }
  }
  groups.sort((a, b) => b.totalAway - a.totalAway)
  return groups
})

const totalDonorVil = computed(() => donorGroups.value.reduce((s, g) => s + g.villages.length, 0))

function activeCoords(g: { name: string; villages: DonorVil[] }): string[] {
  if (excludedPlayers.value.has(g.name)) return []
  return g.villages.filter(v => !excludedVillages.value.has(v.coords)).map(v => v.coords)
}
const effectiveCoords = computed(() => donorGroups.value.flatMap(g => activeCoords(g)))

const copiedKey = ref('')
async function copyText(text: string, key: string) {
  try { await navigator.clipboard.writeText(text); copiedKey.value = key; setTimeout(() => (copiedKey.value = ''), 1500) }
  catch { /* clipboard unavailable */ }
}
const sepMode = ref<'space' | 'newline' | 'comma'>('newline')
const SEP: Record<string, string> = { space: ' ', newline: '\n', comma: ', ' }
const copyAll = () => copyText(effectiveCoords.value.join(SEP[sepMode.value]), '__all__')
const copyPlayer = (g: { name: string; villages: DonorVil[] }) => copyText(activeCoords(g).join(SEP[sepMode.value]), g.name)

// Green (little standing = good target) → red (a lot standing = maybe exclude).
function standColor(stand: number): string {
  const r = Math.min(1, stand / 15000)
  return `hsl(${Math.round(140 * (1 - r))}, 65%, 42%)`
}
// Redder as more def is given away.
function pctStyle(pct: number) {
  if (pct < 20) return {}
  const t = Math.min(1, (pct - 20) / 60)
  return { color: `hsl(${Math.round(40 - 40 * t)}, 85%, 62%)`, fontWeight: 700 }
}

// ── Сравнение выгрузок: изменение дефа по деревням ────────────────────
const UNIT_LABEL: Record<UnitKey, string> = {
  spear: 'копьё', sword: 'меч', axe: 'топор', spy: 'развед', light: 'ЛК', heavy: 'ТК',
  ram: 'таран', catapult: 'кат', knight: 'пал', snob: 'двор', militia: 'опол',
}
const diffDir = ref<'loss' | 'gain'>('loss')

interface DiffPart { label: string; d: number }
interface DiffVil { coords: string; cont: string; player: string; was: number; now: number; d: number; parts: DiffPart[] }
const diffRows = computed<DiffVil[]>(() => {
  if (!store.hasBaseline) return []
  const out: DiffVil[] = []
  for (const p of store.players) {
    for (const v of p.villages) {
      const base = store.baselineUnits.get(v.coords)
      if (!base) continue
      const was = calcDefScore(base)
      const d = v.defScore - was
      if (d === 0) continue
      const parts = UNIT_KEYS
        .map(k => ({ label: UNIT_LABEL[k], d: (v.units[k] ?? 0) - (base[k] ?? 0) }))
        .filter(u => u.d !== 0)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 4)
      out.push({ coords: v.coords, cont: contOf(v.x, v.y), player: p.name, was, now: v.defScore, d, parts })
    }
  }
  return out
})
const diffShown = computed(() =>
  diffRows.value
    .filter(r => (diffDir.value === 'loss' ? r.d < 0 : r.d > 0))
    .sort((a, b) => (diffDir.value === 'loss' ? a.d - b.d : b.d - a.d)),
)
const diffMaxAbs = computed(() => Math.max(1, ...diffShown.value.map(r => Math.abs(r.d))))
function copyDiff() { copyText(diffShown.value.map(r => r.coords).join(SEP[sepMode.value]), 'diff') }
</script>

<style lang="scss" scoped>
.ap-page { padding: 0.5rem 0; }
.ap-head {
  display: flex; align-items: center; gap: 1rem; margin-bottom: 0.8rem;
  h2 { font-size: 1.1rem; margin: 0; color: $text; }
  .ap-sub { font-size: 0.8rem; color: $text-dim; }
  .btn { margin-left: auto; }
}
.ap-empty { color: $text-dim; padding: 2rem; text-align: center; a { color: $accent; } }
.ap-note {
  font-size: 0.8rem; color: #f5a623; background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.3); border-radius: 6px; padding: 0.5rem 0.7rem; margin-bottom: 0.7rem;
}

.ap-table-wrap { overflow-x: auto; border: 1px solid $border; border-radius: 8px; }
.ap-table {
  border-collapse: collapse; width: 100%; font-size: 0.82rem;
  th, td { padding: 0.4rem 0.6rem; text-align: left; white-space: nowrap; }
  th {
    position: sticky; top: 0; background: $bg-panel; color: $text-dim; font-weight: 600;
    cursor: pointer; user-select: none; border-bottom: 1px solid $border;
    &.num { text-align: right; }
    &:hover { color: $text; }
    &.active { color: $accent; }
    .arr { margin-left: 0.2rem; }
  }
  td { border-bottom: 1px solid rgba(255, 255, 255, 0.04); color: $text; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:hover { background: rgba(255, 255, 255, 0.03); }
  .pname { display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .hub { color: #89b4fa; font-weight: 700; }
  .strip { color: #ff9e3d; font-weight: 700; }
  .z { color: $text-faint; font-weight: 400; }
}

// ── Сравнение выгрузок ────────────────────────────────────────────────
.ap-diff { margin-top: 1.6rem; }
.ap-diff-list {
  display: flex; flex-direction: column; gap: 3px; margin-top: 0.5rem; max-height: 520px; overflow-y: auto;
  border: 1px solid $border; border-radius: 10px; padding: 6px;
}
.ap-diff-row {
  display: grid; align-items: center; gap: 0.7rem;
  grid-template-columns: 118px 150px 118px 60px 90px 1fr;
  font-size: 0.8rem; padding: 0.32rem 0.55rem; border-radius: 7px;
  background: $bg-deep; border-left: 3px solid transparent;
  &.up { border-left-color: rgba(47, 191, 135, 0.65); }
  &.dn { border-left-color: rgba(240, 85, 61, 0.65); }
  &:hover { background: rgba(255, 255, 255, 0.04); }

  .apd-id { display: flex; align-items: center; gap: 0.35rem; }
  .dl-coords { font-weight: 700; color: $text; font-variant-numeric: tabular-nums; }
  .dl-cont { font-size: 0.68rem; color: $text-dim; background: rgba(255,255,255,0.06); border-radius: 3px; padding: 0.05rem 0.3rem; }
  .apd-player { color: $text-dim; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .apd-was { color: $text-faint; font-variant-numeric: tabular-nums; font-size: 0.76rem; text-align: right; }
  .apd-d { font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; font-size: 0.9rem; }
  &.up .apd-d { color: #2fbf87; } &.dn .apd-d { color: #f0553d; }
  .apd-bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,0.06); overflow: hidden; }
  .apd-bar-fill { height: 100%; border-radius: 4px; }
  &.up .apd-bar-fill { background: linear-gradient(90deg, #2fbf87aa, #2fbf87); }
  &.dn .apd-bar-fill { background: linear-gradient(90deg, #f0553daa, #f0553d); }
  .apd-units { display: flex; flex-wrap: wrap; gap: 0.25rem; overflow: hidden; }
  .apd-chip {
    font-size: 0.7rem; padding: 0.05rem 0.4rem; border-radius: 4px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums;
    &.plus { background: rgba(47, 191, 135, 0.14); color: #4dd6a0; }
    &.minus { background: rgba(240, 85, 61, 0.14); color: #f0553d; }
  }
}
@media(max-width: 820px){ .ap-diff-row{ grid-template-columns: 100px 1fr 70px; .apd-was,.apd-bar,.apd-units{ display:none; } } }

// ── Донор-деры ────────────────────────────────────────────────────────
.ap-donors { margin-top: 1.4rem; }
.dl-head {
  display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.4rem;
  h3 { font-size: 0.98rem; margin: 0; color: $text; }
  .dl-count { font-size: 0.82rem; color: $text-dim; b { color: $accent; } }
  .dl-sep {
    margin-left: auto; font-size: 0.76rem; color: $text-dim; display: flex; align-items: center; gap: 0.3rem;
    select { background: $bg-deep; border: 1px solid $border; border-radius: 4px; color: $text; font-size: 0.76rem; padding: 0.15rem 0.3rem; }
  }
}
.dl-presets {
  display: flex; align-items: center; gap: 0.25rem; font-size: 0.76rem; color: $text-dim;
  button {
    background: $bg-deep; border: 1px solid $border; border-radius: 4px; color: $text-dim;
    font-size: 0.74rem; padding: 0.15rem 0.4rem; cursor: pointer;
    &.active { background: $accent; border-color: $accent; color: #fff; }
  }
}
.dl-conts {
  display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem;
  .dl-conts-label { font-size: 0.76rem; color: $text-dim; margin-right: 0.2rem; }
  .dl-mode {
    font-size: 0.72rem; padding: 0.12rem 0.45rem; border-radius: 4px; cursor: pointer;
    background: $bg-deep; border: 1px solid $border; color: $text-dim;
    &.on { background: $accent; border-color: $accent; color: #fff; }
  }
  .dl-cont-chip {
    font-size: 0.72rem; padding: 0.12rem 0.4rem; border-radius: 4px; cursor: pointer;
    background: $bg-deep; border: 1px solid $border; color: $text-dim; font-variant-numeric: tabular-nums;
    &.active { background: rgba(233, 69, 96, 0.18); border-color: $accent; color: $text; font-weight: 700; }
  }
  .dl-cont-clear { font-size: 0.72rem; padding: 0.12rem 0.4rem; background: none; border: none; color: $accent; cursor: pointer; text-decoration: underline; }
}
.dl-hint { font-size: 0.76rem; color: $text-dim; margin-bottom: 0.6rem; line-height: 1.4; }
.dl-empty { color: $text-dim; padding: 1rem; font-style: italic; }

.btn-xs {
  background: $bg-deep; border: 1px solid $border; border-radius: 4px; color: $text-dim;
  font-size: 0.72rem; padding: 0.1rem 0.4rem; cursor: pointer; &:hover { color: $text; }
}

.dl-groups { display: flex; flex-direction: column; gap: 0.3rem; }
.dl-group {
  border: 1px solid $border; border-radius: 6px; overflow: hidden;
  &.excluded { opacity: 0.5; }
}
.dl-gh {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; background: $bg-panel;
  .dl-exp { background: none; border: none; color: $text-dim; cursor: pointer; font-size: 0.8rem; padding: 0; width: 14px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dl-gname { color: $text; font-size: 0.86rem; }
  .dl-gcount { font-size: 0.76rem; color: $text-dim; margin-right: auto; }
  .dl-excl {
    background: none; border: 1px solid $border; border-radius: 4px; color: $text-dim;
    font-size: 0.72rem; padding: 0.1rem 0.45rem; cursor: pointer;
    &:hover { color: #f38ba8; border-color: #f38ba8; }
    &.on { color: #f38ba8; border-color: #f38ba8; background: rgba(243, 139, 168, 0.12); }
  }
}
.dl-vils { padding: 0.2rem 0.4rem 0.4rem; display: flex; flex-direction: column; gap: 0.1rem; }
.dl-vil {
  display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; padding: 0.15rem 0.3rem; border-radius: 4px;
  &:hover { background: rgba(255, 255, 255, 0.03); }
  &.off { opacity: 0.4; text-decoration: line-through; }
  .dl-coords { font-weight: 700; color: $text; font-variant-numeric: tabular-nums; min-width: 66px; }
  .dl-cont { font-size: 0.7rem; color: $text-dim; background: rgba(255,255,255,0.05); border-radius: 3px; padding: 0.05rem 0.3rem; }
  .dl-chip { color: #fff; font-weight: 600; font-size: 0.72rem; padding: 0.05rem 0.4rem; border-radius: 4px; }
  .dl-away { color: $text-dim; }
  .dl-b { color: $text-faint; margin-left: auto; }
  .dl-vx { background: none; border: 1px solid $border; border-radius: 4px; color: $text-dim; cursor: pointer; font-size: 0.72rem; padding: 0.05rem 0.35rem; &:hover { color: $accent; } }
}
</style>
