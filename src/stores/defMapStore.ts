import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const UNIT_KEYS = [
  'spear', 'sword', 'axe', 'spy', 'light', 'heavy',
  'ram', 'catapult', 'knight', 'snob', 'militia',
] as const
export type UnitKey = (typeof UNIT_KEYS)[number]

export type VillageKind = 'def' | 'off' | 'empty'

/** Which sheet the troop numbers came from. */
export type TroopSource = 'present' | 'owned'

export interface DefVillage {
  villageId: number
  name: string
  coords: string
  x: number
  y: number
  points: number
  units: Record<UnitKey, number>
  defScore: number
  offScore: number
  kind: VillageKind
  playerName: string
  /** Building levels from the «Здания» sheet (undefined if not present). */
  wall?: number
  watchtower?: number
  /** Def population the village OWNS (from «Войска»), regardless of where it
   *  currently stands. Compare with defScore (what stands here now) to spot
   *  support hubs (defScore ≫ ownedDef) and stripped villages (ownedDef ≫ defScore). */
  ownedDef?: number
  /** Full owned troop set from «Войска» (for off / nobles / cats analytics). */
  ownedUnits?: Record<UnitKey, number>
}

export interface DefPlayer {
  name: string
  color: string
  hidden: boolean
  source: TroopSource
  villages: DefVillage[]
}

interface PersistShape {
  players: DefPlayer[]
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Defensive population proxy: spear + sword + heavy·6 + militia
export function calcDefScore(u: Record<UnitKey, number>): number {
  return u.spear + u.sword + u.heavy * 6 + u.militia
}

// Offensive population proxy: axe + light·4 + ram·5 + catapult·8
export function calcOffScore(u: Record<UnitKey, number>): number {
  return u.axe + u.light * 4 + u.ram * 5 + u.catapult * 8
}

const MIN_MEANINGFUL = 1000

function classify(defScore: number, offScore: number): VillageKind {
  if (defScore >= MIN_MEANINGFUL && defScore >= offScore) return 'def'
  if (offScore >= MIN_MEANINGFUL && offScore > defScore) return 'off'
  return 'empty'
}

// ---------------------------------------------------------------------------
// Excel workbook parser
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

// Russian sheet column → internal unit key. «Ополчение» (militia) is not exported.
const UNIT_COL: Partial<Record<UnitKey, string>> = {
  spear: 'Копья', sword: 'Мечи', axe: 'Топоры', spy: 'Лазы', light: 'ЛК',
  heavy: 'ТК', ram: 'Тараны', catapult: 'Каты', knight: 'Пал', snob: 'Двор',
}

function num(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function parseCoords(v: unknown): { x: number; y: number } | null {
  const m = String(v ?? '').match(/(\d+)\s*\|\s*(\d+)/)
  return m ? { x: parseInt(m[1], 10), y: parseInt(m[2], 10) } : null
}

function unitsFromRow(row: Row): Record<UnitKey, number> {
  const u = {} as Record<UnitKey, number>
  for (const k of UNIT_KEYS) {
    const col = UNIT_COL[k]
    u[k] = col ? num(row[col]) : 0
  }
  return u
}

// Muted base palette; players beyond it get deterministic HSL colors.
const PALETTE = [
  '#4878a8', '#3d8852', '#9e4040', '#8a6320', '#3d7878',
  '#7a4a8a', '#8a3a5a', '#4a7264', '#6a4e3a', '#38607a',
  '#6e48a4', '#8a2244', '#4a506a', '#4a6e3e', '#7a4e2a',
]

function colorFor(i: number): string {
  if (i < PALETTE.length) return PALETTE[i]
  const hue = Math.round((i * 137.508) % 360) // golden-angle spread
  return `hsl(${hue}, 42%, 46%)`
}

export interface WorkbookResult {
  players: DefPlayer[]
  source: TroopSource
  playerCount: number
  villageCount: number
  buildingCount: number
  error: string
}

/**
 * Parse the enemy export workbook (sheets «Защита», «Войска», «Здания»).
 * Troops are taken from «Защита» rows with Статус = «в деревне» (what actually
 * stands in the village), falling back to «Войска» (troops the village owns).
 * Wall / watchtower levels are merged from «Здания» by coordinates.
 */
export function parseWorkbook(buf: ArrayBuffer): WorkbookResult {
  const empty: WorkbookResult = {
    players: [], source: 'present', playerCount: 0, villageCount: 0, buildingCount: 0, error: '',
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array' })
  } catch (e) {
    return { ...empty, error: `Не удалось прочитать файл: ${String(e)}` }
  }

  const sheet = (name: string): Row[] | null => {
    const ws = wb.Sheets[name]
    return ws ? (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Row[]) : null
  }

  const zah = sheet('Защита')
  const voi = sheet('Войска')

  // Choose troop basis: «Защита / в деревне» preferred, else «Войска».
  let source: TroopSource = 'present'
  let troopRows: Row[] = []
  if (zah && zah.length) {
    troopRows = zah.filter(r => String(r['Статус'] ?? '').trim() === 'в деревне')
    if (!troopRows.length) troopRows = zah.filter(r => String(r['Статус'] ?? '').trim() === 'всего')
  }
  if (!troopRows.length && voi && voi.length) {
    source = 'owned'
    troopRows = voi
  }
  if (!troopRows.length) {
    return { ...empty, error: 'В книге нет листов «Защита» или «Войска» с данными по войскам.' }
  }

  // Owned troops per village (from «Войска») → coords → unit set.
  const ownedByCoords = new Map<string, Record<UnitKey, number>>()
  if (voi) {
    for (const r of voi) {
      const c = parseCoords(r['Координаты'])
      if (!c) continue
      ownedByCoords.set(`${c.x}|${c.y}`, unitsFromRow(r))
    }
  }

  // Buildings → coords → { wall, watchtower }
  const buildings = new Map<string, { wall?: number; watchtower?: number }>()
  const zd = sheet('Здания')
  if (zd) {
    for (const r of zd) {
      const c = parseCoords(r['Координаты'])
      if (!c) continue
      buildings.set(`${c.x}|${c.y}`, {
        wall: 'Стена' in r ? num(r['Стена']) : undefined,
        watchtower: 'Сторожевая Башня' in r ? num(r['Сторожевая Башня']) : undefined,
      })
    }
  }

  // Group villages by player.
  const byPlayer = new Map<string, DefVillage[]>()
  let villageCount = 0
  for (const r of troopRows) {
    const c = parseCoords(r['Координаты'])
    if (!c) continue
    const name = String(r['Игрок'] ?? '').trim() || '—'
    const units = unitsFromRow(r)
    const defScore = calcDefScore(units)
    const offScore = calcOffScore(units)
    const coords = `${c.x}|${c.y}`
    const b = buildings.get(coords)
    const owned = ownedByCoords.get(coords)
    const v: DefVillage = {
      villageId: 0, name: '', coords, x: c.x, y: c.y, points: num(r['Очки']),
      units, defScore, offScore, kind: classify(defScore, offScore), playerName: name,
      wall: b?.wall, watchtower: b?.watchtower,
      ownedDef: owned ? calcDefScore(owned) : undefined,
      ownedUnits: owned,
    }
    const arr = byPlayer.get(name) ?? []
    arr.push(v)
    byPlayer.set(name, arr)
    villageCount++
  }

  // Order players by total def (biggest threats first) and assign colors.
  const playersRaw = [...byPlayer.entries()].map(([name, villages]) => ({
    name, villages, totalDef: villages.reduce((s, v) => s + v.defScore, 0),
  }))
  playersRaw.sort((a, b) => b.totalDef - a.totalDef)

  const players: DefPlayer[] = playersRaw.map((p, i) => ({
    name: p.name, color: colorFor(i), hidden: false, source, villages: p.villages,
  }))

  return {
    players, source,
    playerCount: players.length, villageCount, buildingCount: buildings.size, error: '',
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vp_def_map'

export const useDefMapStore = defineStore('defMap', () => {
  const players = ref<DefPlayer[]>([])

  function persist() {
    try {
      const data: PersistShape = { players: players.value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* ignore quota errors */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as PersistShape
      players.value = (data.players ?? []).map(p => ({
        name: p.name,
        color: p.color,
        hidden: p.hidden ?? false,
        source: p.source ?? 'present',
        villages: p.villages ?? [],
      }))
    } catch { /* ignore */ }
  }

  /**
   * Import a full enemy export workbook. Replaces all current players while
   * preserving per-player color / hidden state for names already loaded.
   */
  function importWorkbook(buf: ArrayBuffer): WorkbookResult {
    const res = parseWorkbook(buf)
    if (res.error) return res

    const prev = new Map(players.value.map(p => [p.name, p]))
    for (const p of res.players) {
      const old = prev.get(p.name)
      if (old) { p.color = old.color; p.hidden = old.hidden }
    }
    players.value = res.players
    persist()
    return res
  }

  function removePlayer(name: string) {
    players.value = players.value.filter(p => p.name !== name)
    persist()
  }

  function toggleHidden(name: string) {
    const p = players.value.find(pl => pl.name === name)
    if (p) { p.hidden = !p.hidden; persist() }
  }

  function setColor(name: string, color: string) {
    const p = players.value.find(pl => pl.name === name)
    if (p) { p.color = color; persist() }
  }

  function clearAll() {
    players.value = []
    persist()
  }

  // ── Derived ──────────────────────────────────────────────────────────

  const colorByPlayer = computed(() => {
    const m = new Map<string, string>()
    for (const p of players.value) m.set(p.name, p.color)
    return m
  })

  const visibleVillages = computed(() =>
    players.value.filter(p => !p.hidden).flatMap(p => p.villages),
  )

  const stats = computed(() =>
    players.value.map(p => {
      let def = 0, off = 0, defVil = 0, offVil = 0, towers = 0
      for (const v of p.villages) {
        def += v.defScore
        off += v.offScore
        if (v.kind === 'def') defVil++
        else if (v.kind === 'off') offVil++
        if ((v.watchtower ?? 0) > 0) towers++
      }
      return { name: p.name, color: p.color, hidden: p.hidden, source: p.source,
        villages: p.villages.length, def, off, defVil, offVil, towers }
    }),
  )

  const hasData = computed(() => players.value.some(p => p.villages.length > 0))

  // Per-player analytics table (recomputed on every import).
  const analytics = computed(() =>
    players.value.map(p => {
      let ownDef = 0, standDef = 0, away = 0, recv = 0, hubs = 0, stripped = 0
      let off = 0, offVil = 0, nobles = 0, cats = 0, rams = 0
      let towers = 0, hasOwned = false
      for (const v of p.villages) {
        standDef += v.defScore
        const own = v.ownedDef ?? v.defScore
        ownDef += own
        const delta = v.defScore - own
        away += Math.max(0, -delta)   // own def not standing at home
        recv += Math.max(0, delta)    // foreign support received
        if (v.ownedDef != null) {
          hasOwned = true
          if (delta > 5000 && v.defScore > own * 1.4) hubs++
          else if (-delta > 3000 && v.defScore < 3000) stripped++
        }
        const ou = v.ownedUnits
        const o = ou ? calcOffScore(ou) : v.offScore
        off += o
        if (o >= 1000) offVil++
        nobles += ou ? ou.snob : v.units.snob
        cats += ou ? ou.catapult : v.units.catapult
        rams += ou ? ou.ram : v.units.ram
        if ((v.watchtower ?? 0) > 0) towers++
      }
      return {
        name: p.name, color: p.color, hidden: p.hidden, villages: p.villages.length,
        ownDef, standDef, away, awayPct: ownDef ? (away / ownDef) * 100 : 0, recv,
        hubs, stripped, hasOwned,
        off, offVil, nobles, cats, rams, towers,
      }
    }),
  )

  return {
    players,
    load, persist,
    importWorkbook, removePlayer, toggleHidden, setColor, clearAll,
    colorByPlayer, visibleVillages, stats, hasData, analytics,
  }
})
