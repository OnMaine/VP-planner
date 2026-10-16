import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useWorldStore } from './worldStore'
import { useVillagesStore } from './villagesStore'
import type { Village, VillageTroops } from './villagesStore'
import type { UnitPop } from './worldStore'
import { useMassConfigStore, type MassConfig } from './massConfigStore'
import { usePresetsStore } from './presetsStore'
import type { VillageRole, CatTarget } from './presetsStore'
import { defaultColorForRole, BUILDING_MAX_LEVEL, CATS_TO_DESTROY_LEVEL, catsToDestroyBuilding, catsToReachLevel } from './presetsStore'

export interface CatMassBuildingEntry {
  building: CatTarget
  targetLevel: number  // reduce to this level (0 = full destruction)
}
import { useEnemyDataStore } from './enemyDataStore'
import { calcDistance } from '@/utils/coords'
import { calcTravelSeconds, calcSendTime, isInNightWindow } from '@/utils/travelTime'

// ---------------------------------------------------------------------------
// Warning codes
// ---------------------------------------------------------------------------

export type WarningCode =
  | 'SEND_IN_PAST'
  | 'NIGHT_ARRIVAL'
  | 'NIGHT_SEND'
  | 'WATCHTOWER_HIT'
  | 'SNOB_TOO_FAR'
  | 'MORALE_HIGH_RISK'
  | 'MORALE_MEDIUM'

// ---------------------------------------------------------------------------
// Generation issues (per-target, populated after generate())
// ---------------------------------------------------------------------------

export type GenerationIssueType =
  | 'OFFS_SHORT'
  | 'NOBLES_SHORT'
  | 'SPAM_SHORT'

export type OffsShortReason = 'pool_depleted' | 'night_excluded' | 'no_eligible'

// Режим распределения офов по целям.
// default = жадно (лучшее совпадение), fair = справедливо (round-robin),
// far_first = дальние вперёд, max_coverage = максимум покрытых целей
// (самые зажатые цели обслуживаются первыми).
export type OffDistribution = 'default' | 'fair' | 'far_first' | 'max_coverage'

export interface GenerationIssue {
  targetCoords: string
  targetId?: string   // конкретная цель (важно при дублях кор между волнами)
  type: GenerationIssueType
  requested: number
  generated: number
  offsReason?: OffsShortReason  // only for OFFS_SHORT with generated === 0
  slotName?: string
}

export interface ShortageDiag {
  reason: 'no_eligible' | 'timing' | 'depleted' | 'no_noble' | 'nobles_short' | 'partial'
  label: string
  detail: string
  eligible: number         // всего полных оффов в пуле
  reachable: number        // из них укладываются по времени (ночь/старт)
  free: number             // легальных и ещё не использованных оффов
  nobleVirtual: boolean    // режим дворян: true = виртуальные (бюджет игрока), false = реальные (физ. дворы)
  // Реальный режим: деревень с физ. дворами в радиусе / суммарно дворов там.
  // Виртуальный режим: офф-дер-кандидатов в радиусе / из них свободных.
  nobleVilInRange: number
  nobleSnobInRange: number
  noblesUsed: number       // дворов уже разослано в плане
  noblesTotal: number      // пул дворов: реальный = физ.сумма, виртуальный = бюджет игроков
  needed: number
  generated: number
}

// ---------------------------------------------------------------------------
// Off-pool tagging
// ---------------------------------------------------------------------------

export type OffTag = 'breach+pal' | 'pal_off' | 'breach_off' | 'full_off'

export interface OffPoolStats {
  breachPal:   number   // breach + paladin
  palOnly:     number   // full off + paladin (no breach)
  breachOnly:  number   // breach, no paladin
  fullOnly:    number   // regular full off
}

// ---------------------------------------------------------------------------
// Attack types
// ---------------------------------------------------------------------------

export type AttackType =
  | 'off'               // regular off (axes + LC + rams)
  | 'paladin_off'       // off with offensive paladin (wall-busting priority)
  | 'mid_off'    // mid-off attack — all troops from a medium-strength village
  | 'mini_off'   // mini-off attack — all troops from a weak-off village
  | 'cat'               // catapult squad — cats only, independent pool
  | 'spam'              // fake attack (min troops + 1 ram)

// ---------------------------------------------------------------------------
// Watchtower
// ---------------------------------------------------------------------------

export type WatchtowerColor = 'green' | 'orange' | 'red'
export type WatchtowerIcon = 'axe' | 'snob'

export function calcWatchtower(
  totalUnits: number,
  hasSnob: boolean,
): { color: WatchtowerColor; icon: WatchtowerIcon } {
  const color: WatchtowerColor =
    totalUnits <= 1000 ? 'green' : totalUnits <= 5000 ? 'orange' : 'red'
  const icon: WatchtowerIcon = hasSnob ? 'snob' : 'axe'
  return { color, icon }
}

export interface WatchtowerVillage {
  id: string
  coords: string
  x: number
  y: number
  player: string
  level: number  // 0–20 уровень здания (НЕ равен радиусу — см. WATCHTOWER_RANGE)
}

// Реальный радиус засвета вахтурна по уровню (поля) — из вики Tribal Wars.
// Уровень ≠ радиус: lvl 20 = 15 полей, а не 20.
export const WATCHTOWER_RANGE: Record<number, number> = {
  1: 1.1, 2: 1.3, 3: 1.5, 4: 1.7, 5: 2.0, 6: 2.3, 7: 2.6, 8: 3.0, 9: 3.4, 10: 3.9,
  11: 4.4, 12: 5.1, 13: 5.8, 14: 6.7, 15: 7.6, 16: 8.7, 17: 10.0, 18: 11.5, 19: 13.1, 20: 15.0,
}
export function watchtowerRange(level: number): number {
  const lvl = Math.round(level)
  if (lvl <= 0) return 0
  if (lvl >= 20) return WATCHTOWER_RANGE[20]
  return WATCHTOWER_RANGE[lvl] ?? 0
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type AttackComposition = VillageTroops

export interface Target {
  id: string
  coords: string
  x: number
  y: number
  arrivalTime: Date
  villageId?: number
  enemyPlayer?: string   // owner player name (auto-filled from village map or manual)
  enemyAllyTag?: string  // owner tribe tag
  label?: string
  palOffCount?: number      // how many pal-offs (breach+pal / pal_off) to assign
  breachOffCount?: number   // how many breach-offs (breach_off) to assign separately
  bpOffCount?: number       // how many breach+pal (both) to assign explicitly
  nobleVillageCoords?: string  // manual noble village assignment
  massConfigId?: string  // DEPRECATED (старая модель «активный конфиг»); больше не читается
  waveId?: string        // к какой волне плана (planWaves[].id) относится цель; undefined = без волны
  muted?: boolean        // «заглушена» — остаётся в списке, но не участвует в генерации (войска свободны)
}

// Настройки генерации, индивидуальные для волны (остальное — глобально).
export interface WaveSettings {
  arrivalTime: string          // опорное время (datetime-local); «→ всем» применяет к целям волны
  sendExcludeEnabled: boolean  // Без ночных
  nightFrom: number
  nightTo: number
  earliestSendEnabled: boolean // Старт не ранее
  earliestSendTime: string
  moraleEnabled: boolean       // Мораль
  offDistribution: OffDistribution // Распределение
  watchtowerAvoidEnabled: boolean  // 🗼 Башни: обходить засвеченные маршруты (пер-волна)
  frontReserveEnabled: boolean     // 🛡 Резерв фронта: не брать деры у фронта этой волны
  frontReserveDist: number         // радиус фронта в полях (от целей этой волны)
}

// Волна плана: экземпляр масс-конфига в плане. Один конфиг может быть в нескольких
// волнах (разные id, одинаковый configId).
export interface PlanWave {
  id: string
  configId: string
  settings: WaveSettings
}

export interface Attack {
  id: string
  type: AttackType
  fromVillage: Village
  target: Target
  composition: AttackComposition
  speedUnit: keyof VillageTroops
  totalUnits: number
  watchtowerColor: WatchtowerColor
  watchtowerIcon: WatchtowerIcon
  distance: number
  travelSeconds: number
  arrivalTime: Date
  sendTime: Date
  watchtowerSeenSec?: number     // за сколько секунд ДО прихода атака впервые засветилась башней
  watchtowerInRadiusSec?: number // сколько секунд атака суммарно проведёт в радиусе башни
  warnings: WarningCode[]
  excluded: boolean
  label?: string
  color?: string          // display color for badge + BB code
  catTarget?: CatTarget
  buildNobles?: number    // player needs to build this many nobles in fromVillage before sending
  buildPaladin?: boolean  // player needs to recruit a paladin in fromVillage before sending
  trainGroupId?: string   // shared by all attacks of the same spam train run
  catMass?: boolean       // belongs to cat mass (secondary wave), not main mass
  countAsSpam?: boolean   // пресет помечен «считать как спам» — для подсчёта/фильтров
}

// ---------------------------------------------------------------------------
// Player-level additional data (beyond CSV)
// ---------------------------------------------------------------------------

export interface PlayerData {
  player: string
  offPaladins: number   // how many offensive paladin-offs player can send
  totalNobles: number   // total nobles player can build across all villages
}

// ---------------------------------------------------------------------------
// Build instructions (output to player)
// ---------------------------------------------------------------------------

export interface NoblePlacement {
  village: Village
  count: number
}

export interface PaladinPlacement {
  village: Village
  forTarget: Target
}

// ---------------------------------------------------------------------------
// Mass attack config (the "recipe")
// ---------------------------------------------------------------------------

export interface NobleCompositionConfig {
  greenStrongPct: number  // % of real noble attacks that are green_strong (noble + 999 escort)
  greenWeakPct: number    // % that are green_weak (noble + ~50 troops)
  orangePct: number       // % that are orange (noble + 1001–5000)
  redPct: number          // % that are red (noble + full off, 5001+)
  escortUnit: 'light' | 'axe' | 'sword' | 'spear'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyComposition(): AttackComposition {
  return { spear: 0, sword: 0, axe: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0 }
}

function totalUnits(c: AttackComposition): number {
  return c.spear + c.sword + c.axe + c.spy + c.light + c.heavy + c.ram + c.catapult + c.knight + c.snob
}

function totalPop(c: AttackComposition, pop: Record<string, number>): number {
  return (Object.keys(c) as Array<keyof AttackComposition>).reduce((sum, k) => sum + c[k] * (pop[k] ?? 1), 0)
}


function coordsToXY(coords: string): { x: number; y: number } | null {
  const m = coords.match(/^(\d+)\|(\d+)$/)
  if (!m) return null
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) }
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// offFarm: offensive farm power — axe + LC + ram (catapult is a separate mechanic)
function calcOffFarm(troops: { axe: number; light: number; ram: number }, pop: UnitPop): number {
  return troops.axe * pop.axe + troops.light * pop.light + troops.ram * pop.ram
}

// Assigns an OffTag to every full-off-capable village of each player.
// Paladins are assigned: first to breach-capable villages (strongest first),
// then to regular full-offs (strongest first).
function buildPoolTags(
  villages: Village[],
  pdList: PlayerData[],
  fullOffMinOffFarm: number,
  breachMinRams: number,
  unitPop: UnitPop,
): Map<string, OffTag> {
  const tags   = new Map<string, OffTag>()
  const palMap = new Map<string, number>()
  for (const pd of pdList) palMap.set(pd.player, pd.offPaladins)

  const byPlayer = new Map<string, Village[]>()
  for (const v of villages) {
    if (!byPlayer.has(v.player)) byPlayer.set(v.player, [])
    byPlayer.get(v.player)!.push(v)
  }

  const str = (v: Village) =>
    v.troops.axe + v.troops.light + v.troops.heavy + v.troops.ram

  for (const [player, pvils] of byPlayer) {
    let palsLeft = palMap.get(player) ?? 0
    const breach: Village[] = []
    const full:   Village[] = []

    for (const v of pvils) {
      if (calcOffFarm(v.troops, unitPop) >= fullOffMinOffFarm) {
        if (v.troops.ram >= breachMinRams) breach.push(v)
        else                               full.push(v)
      }
    }

    breach.sort((a, b) => str(b) - str(a) || b.troops.ram - a.troops.ram)
    full.sort((a, b)   => str(b) - str(a))

    for (const v of breach) tags.set(v.coords, palsLeft-- > 0 ? 'breach+pal' : 'breach_off')
    for (const v of full)   tags.set(v.coords, palsLeft-- > 0 ? 'pal_off'    : 'full_off')
  }
  return tags
}

// Determine speed unit for a composition (slowest meaningful unit for attack type)
function speedUnitForType(type: AttackType): keyof VillageTroops {
  switch (type) {
    case 'cat':            return 'catapult'
    default:               return 'ram'
  }
}

// Returns the slowest unit in the composition (highest unitTimes value among units with count > 0).
function slowestUnitInComp(comp: AttackComposition, unitTimes: Record<string, number>): keyof VillageTroops {
  const keys = (Object.keys(comp) as Array<keyof VillageTroops>).filter(k => comp[k] > 0)
  if (keys.length === 0) return 'spear'
  return keys.reduce((s, k) => (unitTimes[k] ?? 0) > (unitTimes[s] ?? 0) ? k : s)
}


// ---------------------------------------------------------------------------
// Default cat mass building priority (used when user hasn't configured a custom queue)
export const CAT_MASS_DEFAULT_QUEUE: import('./presetsStore').CatTarget[] = [
  'farm', 'main', 'smith', 'stable', 'iron', 'stone', 'wood', 'hide', 'market', 'storage',
]

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_TARGETS = 'vp_targets'
const LS_CAT_TARGETS = 'vp_cat_targets'
const LS_CAT_MASS_QUEUE = 'vp_cat_mass_queue'
const LS_PLAYER_DATA = 'vp_player_data'
const LS_WATCHTOWER = 'vp_watchtower'
const LS_OFF_DISTRIBUTION = 'vp_off_distribution'
const LS_PLAN_WAVES = 'vp_plan_waves'
const LS_ATTACKS = 'vp_attacks'
const LS_RESERVED = 'vp_reserved_villages'

// Every localStorage key that makes up a fully reproducible plan. A v2 plan
// export is a verbatim snapshot of these keys; importing one replaces them all.
// API keys (vp_ai_key_*) are intentionally excluded — they are secrets.
const PLAN_EXPORT_KEYS = [
  // planStore
  'vp_targets', 'vp_cat_targets', 'vp_cat_mass_queue', 'vp_reserved_villages',
  'vp_spam_noble_targets', 'vp_player_data', 'vp_watchtower', 'vp_off_distribution',
  'vp_attacks',
  // worldStore (settings — speeds, night window, morale, unit times/pop, …)
  'vp_world',
  // presetsStore (custom attack templates + thresholds)
  'vp_presets_v2', 'vp_breach_min_rams', 'vp_full_off_min_off_farm',
  'vp_half_off_min_off_farm', 'vp_small_off_min_off_farm', 'vp_cat_min', 'vp_cat_target',
  // massConfigStore (mass templates)
  'vp_mass_configs_v3', 'vp_mass_active_id', 'vp_mass_cat_active_id',
  // villagesStore (sender's own troops CSV)
  'vp_villages',
  // WorldMapView (tribe categories / hidden tribes)
  'vp_tribe_cats', 'vp_hidden_tribes',
] as const

function loadTargets(): Target[] {
  try {
    const raw = localStorage.getItem(LS_TARGETS)
    if (raw) {
      const parsed = JSON.parse(raw) as Array<Omit<Target, 'arrivalTime'> & { arrivalTime: string }>
      return parsed.map((t) => ({ ...t, arrivalTime: new Date(t.arrivalTime) }))
    }
  } catch { /* ignore */ }
  return []
}

function loadPlayerData(): PlayerData[] {
  try {
    const raw = localStorage.getItem(LS_PLAYER_DATA)
    if (raw) return JSON.parse(raw) as PlayerData[]
  } catch { /* ignore */ }
  return []
}

function loadWatchtowerVillages(): WatchtowerVillage[] {
  try {
    const raw = localStorage.getItem(LS_WATCHTOWER)
    if (raw) return JSON.parse(raw) as WatchtowerVillage[]
  } catch { /* ignore */ }
  return []
}

function loadCatTargets(): Target[] {
  try {
    const raw = localStorage.getItem(LS_CAT_TARGETS)
    if (raw) {
      const parsed = JSON.parse(raw) as Array<Omit<Target, 'arrivalTime'> & { arrivalTime: string }>
      return parsed.map((t) => ({ ...t, arrivalTime: new Date(t.arrivalTime) }))
    }
  } catch { /* ignore */ }
  return []
}

function loadReservedVillages(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_RESERVED)
    if (raw) return new Set<string>(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlanStore = defineStore('plan', () => {
  const worldStore = useWorldStore()
  const villagesStore = useVillagesStore()

  // Persisted state
  const targets = ref<Target[]>(loadTargets())
  const catTargets = ref<Target[]>(loadCatTargets())
  const catMassBuildingQueue = ref<CatMassBuildingEntry[]>((() => {
    try {
      const r = localStorage.getItem(LS_CAT_MASS_QUEUE)
      if (!r) return []
      const parsed = JSON.parse(r)
      // migrate old CatTarget[] format
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return (parsed as CatTarget[]).map(building => ({ building, targetLevel: 0 }))
      }
      return parsed as CatMassBuildingEntry[]
    } catch { return [] }
  })())
  const reservedVillages = ref<Set<string>>(loadReservedVillages())
  const playerData = ref<PlayerData[]>(loadPlayerData())
  const watchtowerVillages = ref<WatchtowerVillage[]>(loadWatchtowerVillages())
  const offDistribution = ref<OffDistribution>(
    (localStorage.getItem(LS_OFF_DISTRIBUTION) as OffDistribution | null) ?? 'max_coverage',
  )

  function setOffDistribution(mode: OffDistribution) {
    offDistribution.value = mode
    localStorage.setItem(LS_OFF_DISTRIBUTION, mode)
  }

  // ── Волны плана (явный упорядоченный список) ───────────────────────────────
  // Снимок текущих глобальных настроек как дефолт для новой/мигрируемой волны.
  function makeWaveSettings(): WaveSettings {
    const s = worldStore.settings
    return {
      arrivalTime: '',
      sendExcludeEnabled: s.sendExcludeEnabled,
      nightFrom: s.nightFrom,
      nightTo: s.nightTo,
      earliestSendEnabled: s.earliestSendEnabled,
      earliestSendTime: s.earliestSendTime,
      moraleEnabled: s.moraleEnabled,
      offDistribution: offDistribution.value,
      watchtowerAvoidEnabled: s.watchtowerAvoidEnabled ?? true,
      frontReserveEnabled: s.frontReserveEnabled ?? false,
      frontReserveDist: s.frontReserveDist ?? 10,
    }
  }

  const planWaves = ref<PlanWave[]>((() => {
    try {
      const raw = localStorage.getItem(LS_PLAN_WAVES)
      const parsed = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((w: unknown) => !!w && typeof (w as PlanWave).id === 'string' && typeof (w as PlanWave).configId === 'string')
        .map((w: Partial<PlanWave>): PlanWave => ({
          id: w.id!, configId: w.configId!,
          settings: { ...makeWaveSettings(), ...(w.settings ?? {}) },  // миграция старых волн
        }))
    } catch { return [] }
  })())

  function persistWaves(): void {
    localStorage.setItem(LS_PLAN_WAVES, JSON.stringify(planWaves.value))
  }

  function updateWaveSettings(waveId: string, partial: Partial<WaveSettings>): void {
    planWaves.value = planWaves.value.map(w =>
      w.id === waveId ? { ...w, settings: { ...w.settings, ...partial } } : w)
    persistWaves()
  }

  function addWave(configId: string): PlanWave {
    // Поэтапно: перед добавлением новой волны закрепляем все «плавающие» цели
    // (без явной волны) за текущей последней волной — чтобы они не осиротели.
    if (planWaves.value.length > 0) {
      const lastId = planWaves.value[planWaves.value.length - 1].id
      let changed = false
      for (const t of targets.value) {
        if (!t.waveId || !planWaves.value.some(w => w.id === t.waveId)) { t.waveId = lastId; changed = true }
      }
      if (changed) saveTargets()
    }
    const wave: PlanWave = { id: `w_${genId()}`, configId, settings: makeWaveSettings() }
    planWaves.value = [...planWaves.value, wave]
    selectedWaveId.value = wave.id   // новая волна сразу становится активной для конфигурации
    persistWaves()
    return wave
  }

  function removeWave(waveId: string): void {
    planWaves.value = planWaves.value.filter(w => w.id !== waveId)
    // Цели этой волны становятся «без волны».
    for (const t of targets.value) {
      if (t.waveId === waveId) t.waveId = undefined
    }
    if (selectedWaveId.value === waveId) selectedWaveId.value = planWaves.value[0]?.id ?? null
    saveTargets()
    persistWaves()
  }

  function moveWave(waveId: string, dir: -1 | 1): void {
    const arr = [...planWaves.value]
    const i = arr.findIndex(w => w.id === waveId)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    planWaves.value = arr
    persistWaves()
  }

  // Выбранная (активная для конфигурации) волна — под неё показываются «Цели»/настройки.
  const selectedWaveId = ref<string | null>(planWaves.value[0]?.id ?? null)
  function setSelectedWave(id: string | null): void { selectedWaveId.value = id }
  // Гарантируем, что выбор всегда валиден (или первая волна).
  function ensureSelectedWave(): string | null {
    if (!selectedWaveId.value || !planWaves.value.some(w => w.id === selectedWaveId.value)) {
      selectedWaveId.value = planWaves.value[0]?.id ?? null
    }
    return selectedWaveId.value
  }


  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function saveTargets() {
    localStorage.setItem(LS_TARGETS, JSON.stringify(targets.value))
  }

  function saveCatTargets() {
    localStorage.setItem(LS_CAT_TARGETS, JSON.stringify(catTargets.value))
  }

  function setReservedVillages(coords: string[]) {
    reservedVillages.value = new Set(coords)
    localStorage.setItem(LS_RESERVED, JSON.stringify(coords))
  }

  function clearReservedVillages() {
    reservedVillages.value = new Set()
    localStorage.removeItem(LS_RESERVED)
  }

  function savePlayerData() {
    localStorage.setItem(LS_PLAYER_DATA, JSON.stringify(playerData.value))
  }

  function saveWatchtowerVillages() {
    localStorage.setItem(LS_WATCHTOWER, JSON.stringify(watchtowerVillages.value))
  }

  function saveAttacks() {
    try {
      const serialized = attacks.value.map(a => ({
        ...a,
        arrivalTime: a.arrivalTime.toISOString(),
        sendTime:    a.sendTime.toISOString(),
        target: { ...a.target, arrivalTime: a.target.arrivalTime.toISOString() },
      }))
      localStorage.setItem(LS_ATTACKS, JSON.stringify(serialized))
    } catch { /* ignore quota errors */ }
  }

  function loadSavedAttacks(): Attack[] {
    try {
      const raw = localStorage.getItem(LS_ATTACKS)
      if (!raw) return []
      const parsed = JSON.parse(raw) as any[]
      return parsed.map(a => {
        const liveVillage = villagesStore.villages.find(v => v.coords === a.fromVillage?.coords)
        const liveTarget  = targets.value.find(t => t.id === a.target?.id)
        return {
          ...a,
          arrivalTime: new Date(a.arrivalTime),
          sendTime:    new Date(a.sendTime),
          fromVillage: liveVillage ?? a.fromVillage,
          target: liveTarget ?? { ...a.target, arrivalTime: new Date(a.target.arrivalTime) },
        } as Attack
      })
    } catch { return [] }
  }

  // Persisted attacks — loaded after stores are ready
  const attacks = ref<Attack[]>(loadSavedAttacks())
  watch(attacks, saveAttacks, { deep: true })

  const noblePlacements = ref<NoblePlacement[]>([])
  const paladinPlacements = ref<PaladinPlacement[]>([])
  const generationIssues = ref<GenerationIssue[]>([])
  const nobleRecommendations = ref<Map<string, number>>(new Map())

  interface UnusedVillageStats {
    noSlots: number        // eligible but no target needed them
    nightExcluded: number  // would be excluded by night window for all targets
    earliestExcluded: number // would be excluded by earliest send for all targets
  }
  const unusedOffStats = ref<UnusedVillageStats>({ noSlots: 0, nightExcluded: 0, earliestExcluded: 0 })
  const unusedCatStats = ref<UnusedVillageStats>({ noSlots: 0, nightExcluded: 0, earliestExcluded: 0 })

  // ---------------------------------------------------------------------------
  // Targets CRUD
  // ---------------------------------------------------------------------------

  function addTarget(coords: string, arrivalTime: Date, options?: Partial<Omit<Target, 'id' | 'coords' | 'arrivalTime' | 'x' | 'y'>>): Target | null {
    const xy = coordsToXY(coords)
    if (!xy) return null
    // Дедуп пер-волну: одни коры в одной волне — раз, но в разных волнах можно.
    const waveId = (options as { waveId?: string } | undefined)?.waveId
    if (targets.value.some(t => t.coords === coords && t.waveId === waveId)) return null
    const t: Target = {
      id: genId(),
      coords,
      x: xy.x,
      y: xy.y,
      arrivalTime,
      ...options,
    }
    targets.value.push(t)
    saveTargets()
    return t
  }

  function addEmptyTarget(arrivalTime: Date): Target {
    const t: Target = { id: genId(), coords: '', x: 0, y: 0, arrivalTime }
    targets.value.push(t)
    saveTargets()
    return t
  }

  function removeTarget(id: string) {
    const target = targets.value.find((t) => t.id === id)
    targets.value = targets.value.filter((t) => t.id !== id)
    attacks.value = attacks.value.filter((a) => a.target.id !== id)
    if (target?.coords) {
      generationIssues.value = generationIssues.value.filter((i) => i.targetCoords !== target.coords)
    }
    saveTargets()
  }

  // Обратимое заглушение цели: muted=true — цель остаётся в списке, но не
  // генерится (её войска свободны). Уже сгенерированные атаки на неё убираем,
  // чтобы они не висели до следующей генерации.
  function setTargetMuted(id: string, muted: boolean) {
    const target = targets.value.find((t) => t.id === id)
    if (!target) return
    target.muted = muted
    if (muted) {
      attacks.value = attacks.value.filter((a) => a.target.id !== id)
      if (target.coords) {
        generationIssues.value = generationIssues.value.filter((i) => i.targetId !== id)
      }
    }
    saveTargets()
  }

  function updateTarget(id: string, patch: Partial<Omit<Target, 'id'>>) {
    const t = targets.value.find((t) => t.id === id)
    if (!t) return
    // Дедуп кор пер-волну: одни коры дважды в ОДНОЙ волне нельзя, в разных — можно.
    const newWaveId = patch.waveId !== undefined ? patch.waveId : t.waveId
    if (patch.coords && targets.value.some(other => other.id !== id && other.coords === patch.coords && other.waveId === newWaveId)) return
    Object.assign(t, patch)
    if (patch.coords) {
      const xy = coordsToXY(patch.coords)
      if (xy) { t.x = xy.x; t.y = xy.y }
    }
    saveTargets()
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Cat targets CRUD
  // ---------------------------------------------------------------------------

  function addCatTarget(coords: string, arrivalTime: Date, options?: Partial<Omit<Target, 'id' | 'coords' | 'arrivalTime' | 'x' | 'y'>>): Target | null {
    const xy = coordsToXY(coords)
    if (!xy) return null
    const info = useEnemyDataStore().lookupCoords(coords)
    const t: Target = {
      id: genId(), coords, x: xy.x, y: xy.y, arrivalTime,
      ...(info?.player ? { enemyPlayer: info.player.name } : {}),
      ...(info?.ally   ? { enemyAllyTag: info.ally.tag }   : {}),
      ...options,
    }
    catTargets.value.push(t)
    saveCatTargets()
    return t
  }

  function addEmptyCatTarget(arrivalTime: Date): Target {
    const t: Target = { id: genId(), coords: '', x: 0, y: 0, arrivalTime }
    catTargets.value.push(t)
    saveCatTargets()
    return t
  }

  function removeCatTarget(id: string) {
    catTargets.value = catTargets.value.filter((t) => t.id !== id)
    attacks.value = attacks.value.filter((a) => a.target.id !== id)
    saveCatTargets()
  }

  function updateCatTarget(id: string, patch: Partial<Omit<Target, 'id'>>) {
    const t = catTargets.value.find((t) => t.id === id)
    if (!t) return
    Object.assign(t, patch)
    if (patch.coords) {
      const xy = coordsToXY(patch.coords)
      if (xy) { t.x = xy.x; t.y = xy.y }
      const info = useEnemyDataStore().lookupCoords(patch.coords)
      t.enemyPlayer  = info?.player?.name
      t.enemyAllyTag = info?.ally?.tag
    }
    saveCatTargets()
  }

  function clearCatTargets() {
    catTargets.value = []
    saveCatTargets()
  }

  function saveCatMassBuildingQueue() {
    localStorage.setItem(LS_CAT_MASS_QUEUE, JSON.stringify(catMassBuildingQueue.value))
  }
  function addCatMassBuilding(b: CatTarget): void {
    if (catMassBuildingQueue.value.some(e => e.building === b)) return
    catMassBuildingQueue.value = [...catMassBuildingQueue.value, { building: b, targetLevel: 0 }]
    saveCatMassBuildingQueue()
  }
  function removeCatMassBuilding(b: CatTarget): void {
    catMassBuildingQueue.value = catMassBuildingQueue.value.filter(x => x.building !== b)
    saveCatMassBuildingQueue()
  }
  function setCatMassBuildingTarget(b: CatTarget, targetLevel: number): void {
    const entry = catMassBuildingQueue.value.find(e => e.building === b)
    if (!entry) return
    entry.targetLevel = Math.max(0, targetLevel)
    saveCatMassBuildingQueue()
  }
  function moveCatMassBuilding(fromIdx: number, toIdx: number): void {
    const arr = [...catMassBuildingQueue.value]
    const [item] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, item)
    catMassBuildingQueue.value = arr
    saveCatMassBuildingQueue()
  }

  // ---------------------------------------------------------------------------
  // Player data CRUD
  // ---------------------------------------------------------------------------

  function setPlayerData(player: string, data: Partial<Omit<PlayerData, 'player'>>) {
    const existing = playerData.value.find((p) => p.player === player)
    if (existing) {
      Object.assign(existing, data)
    } else {
      playerData.value.push({ player, offPaladins: 0, totalNobles: 0, ...data })
    }
    savePlayerData()
  }

  function getPlayerData(player: string): PlayerData {
    return playerData.value.find((p) => p.player === player)
      ?? { player, offPaladins: 0, totalNobles: 0 }
  }

  const playerDataMap = computed(() => {
    const m = new Map<string, PlayerData>()
    for (const pd of playerData.value) m.set(pd.player, pd)
    return m
  })

  // ---------------------------------------------------------------------------
  // Watchtower villages
  // ---------------------------------------------------------------------------

  function importWatchtowerVillages(entries: Array<{ coords: string; player: string; level: number }>) {
    const newVillages: WatchtowerVillage[] = entries.map((e) => {
      const m = e.coords.match(/^(\d+)\|(\d+)$/)
      return {
        id: genId(),
        coords: e.coords,
        x: m ? parseInt(m[1], 10) : 0,
        y: m ? parseInt(m[2], 10) : 0,
        player: e.player,
        level: Math.max(0, Math.min(20, e.level)),
      }
    })
    watchtowerVillages.value.push(...newVillages)
    saveWatchtowerVillages()
  }

  function addWatchtowerVillage(coords = '', player = '', level = 20): WatchtowerVillage {
    const m = coords.match(/^(\d+)\|(\d+)$/)
    const wt: WatchtowerVillage = {
      id: genId(), coords,
      x: m ? parseInt(m[1], 10) : 0,
      y: m ? parseInt(m[2], 10) : 0,
      player,
      level: Math.max(0, Math.min(20, level)),
    }
    watchtowerVillages.value.push(wt)
    saveWatchtowerVillages()
    return wt
  }

  function updateWatchtowerVillage(id: string, patch: Partial<Omit<WatchtowerVillage, 'id'>>) {
    const wt = watchtowerVillages.value.find((w) => w.id === id)
    if (!wt) return
    if (patch.coords !== undefined) {
      wt.coords = patch.coords
      const m = patch.coords.match(/^(\d+)\|(\d+)$/)
      if (m) { wt.x = parseInt(m[1], 10); wt.y = parseInt(m[2], 10) }
    }
    if (patch.player !== undefined) wt.player = patch.player
    if (patch.level !== undefined) wt.level = Math.max(0, Math.min(20, patch.level))
    saveWatchtowerVillages()
  }

  function removeWatchtowerVillage(id: string) {
    watchtowerVillages.value = watchtowerVillages.value.filter((w) => w.id !== id)
    saveWatchtowerVillages()
  }

  function clearWatchtowerVillages() {
    watchtowerVillages.value = []
    saveWatchtowerVillages()
  }

  // ---------------------------------------------------------------------------
  // Watchtower detection helper (shared by generate() and fillRemainingOffs())
  // ---------------------------------------------------------------------------
  function calcWatchtowerExposure(
    fromX: number, fromY: number, toX: number, toY: number,
    targetPlayer: string | undefined,
  ): { detected: boolean; chord: number; firstEnterT: number } {
    const s = worldStore.settings
    if (!s.watchtowerEnabled || watchtowerVillages.value.length === 0) return { detected: false, chord: 0, firstEnterT: 1 }
    // Без игрока цели не считаем — непонятно, чьи башни учитывать.
    if (!targetPlayer) return { detected: false, chord: 0, firstEnterT: 1 }
    const dx = toX - fromX
    const dy = toY - fromY
    const segLen2 = dx * dx + dy * dy
    const segLen  = Math.sqrt(segLen2)
    const enemyStore = useEnemyDataStore()
    // Собираем интервалы [tEnter, tExit] засвета по башням ИГРОКА ЦЕЛИ.
    const intervals: Array<[number, number]> = []
    for (const wt of watchtowerVillages.value) {
      if (wt.level <= 0) continue
      const wtPlayer = wt.player || enemyStore.lookupCoords(wt.coords)?.player?.name || ''
      if (wtPlayer !== targetPlayer) continue
      const R  = watchtowerRange(wt.level)
      if (R <= 0) continue
      const fx = fromX - wt.x
      const fy = fromY - wt.y
      if (segLen2 === 0) { if (fx * fx + fy * fy <= R * R) intervals.push([0, 1]); continue }
      const a    = segLen2
      const b    = 2 * (fx * dx + fy * dy)
      const c    = fx * fx + fy * fy - R * R
      const disc = b * b - 4 * a * c
      if (disc < 0) continue
      const sqrtDisc = Math.sqrt(disc)
      const tEnter = Math.max(0, (-b - sqrtDisc) / (2 * a))
      const tExit  = Math.min(1, (-b + sqrtDisc) / (2 * a))
      if (tEnter >= tExit) continue
      intervals.push([tEnter, tExit])
    }
    if (intervals.length === 0) return { detected: false, chord: 0, firstEnterT: 1 }
    // Объединяем интервалы — перекрытия радиусов не считаем дважды.
    intervals.sort((p, q) => p[0] - q[0])
    const firstEnterT = intervals[0][0]
    let unionFrac = 0
    let curS = intervals[0][0]
    let curE = intervals[0][1]
    for (let i = 1; i < intervals.length; i++) {
      const [s2, e2] = intervals[i]
      if (s2 <= curE) { if (e2 > curE) curE = e2 }
      else { unionFrac += curE - curS; curS = s2; curE = e2 }
    }
    unionFrac += curE - curS
    return { detected: true, chord: unionFrac * segLen, firstEnterT }
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  function generate(): void {
    attacks.value = []
    noblePlacements.value = []
    paladinPlacements.value = []
    generationIssues.value = []

    const mcStore    = useMassConfigStore()
    const presStore  = usePresetsStore()
    const enemyStore = useEnemyDataStore()
    // Волны плана (только те, чей конфиг ещё существует). Без волн генерация запрещена.
    const planWaveList = planWaves.value.filter(w => mcStore.all.some(c => c.id === w.configId))
    if (planWaveList.length === 0) return
    // Настройки «текущей волны» — обновляются в начале каждой итерации цикла волн.
    // Их читают pushAtk / nightExcludes / код цикла (пер-волновые настройки).
    let ws: WaveSettings = planWaveList[0].settings

    const { settings } = worldStore
    const { villages } = villagesStore
    const now = new Date()
    const result: Attack[] = []
    const newNoblePlacements: NoblePlacement[] = []
    const genIssues: GenerationIssue[] = []

    // Pool: available troops per village (consumed as attacks are assigned)
    // Reserved villages are excluded — they stay visible in import but never get assigned.
    const pool = new Map<string, AttackComposition>()
    for (const v of villages) {
      if (!reservedVillages.value.has(v.coords)) pool.set(v.coords, { ...v.troops })
    }

    // Virtual noble pool keyed by player — capacity depends on noblePollMode:
    //   real:    sum of built snobs from CSV
    //   virtual: totalNobles only — fully trust the imported field, ignore CSV
    const noblePollMode = settings.noblePollMode ?? 'real'
    const virtualNoblePool = new Map<string, number>()
    for (const v of villages) {
      if (reservedVillages.value.has(v.coords)) continue
      virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) + v.troops.snob)
    }
    if (noblePollMode === 'virtual') {
      for (const pd of playerData.value) {
        if (!pd.totalNobles) continue
        virtualNoblePool.set(pd.player, pd.totalNobles)
      }
    }

    // Pool tags for pal/breach priority (based on original troop counts)
    const poolTags = buildPoolTags(
      villages, playerData.value,
      presStore.fullOffMinOffFarm, presStore.breachMinRams, settings.unitPop,
    )

    // Attacker points per player (for morale) — строим, если мораль включена в любой волне
    const attackerPoints = new Map<string, number>()
    if (planWaveList.some(w => w.settings.moraleEnabled)) {
      for (const v of villages) {
        attackerPoints.set(v.player, (attackerPoints.get(v.player) ?? 0) + v.points)
      }
    }

    // ── spam arrival randomizer ───────────────────────────────────────────
    function randomSpamArrival(windowStart: Date, windowEnd: Date): Date {
      const startMs = windowStart.getTime()
      const endMs   = windowEnd.getTime()
      if (endMs <= startMs) return windowStart
      return new Date(startMs + Math.random() * (endMs - startMs))
    }

    // ── buildSpamComp ─────────────────────────────────────────────────────
    // Requires 1 ram (or 1 catapult if no ram) — siege deducted from pool.
    // Returns null if the source village has no siege at all, or if not enough
    // troops to meet minAttackSize. This guarantees every spam carries siege so
    // it travels at ram/catapult speed and mimics a real off.
    function buildSpamComp(a: AttackComposition): AttackComposition | null {
      const up = settings.unitPop
      const c = emptyComposition()
      if (a.ram >= 1) {
        c.ram = 1
      } else if (a.catapult >= 1) {
        c.catapult = 1
      } else {
        return null
      }
      let popLeft = settings.minAttackSize - c.ram * up.ram - c.catapult * up.catapult
      const order: Array<keyof AttackComposition> = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy']
      for (const unit of order) {
        if (popLeft <= 0) break
        const upVal = up[unit] ?? 1
        const needed = Math.ceil(popLeft / upVal)
        c[unit] = Math.min(a[unit], needed)
        popLeft -= c[unit] * upVal
      }
      if (popLeft > 0) return null
      return c
    }

    // ── pushAtk ──────────────────────────────────────────────────────────
    function pushAtk(
      type: AttackType, village: Village, target: Target,
      composition: AttackComposition, arrivalTime: Date, label?: string, color?: string,
      _buildNobles?: number, trainGroupId?: string, catTarget?: CatTarget,
      countAsSpam?: boolean,
    ): boolean {
      const speedUnit   = slowestUnitInComp(composition, settings.unitTimes)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist        = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec   = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime    = calcSendTime(arrivalTime, travelSec)

      // Night exclude mode: skip this village if send time falls in night window
      if (ws.sendExcludeEnabled) {
        if (isInNightWindow(sendTime, ws.nightFrom, ws.nightTo)) return false
      }
      // Earliest send: never generate an attack that would launch before the floor.
      // (Belt-and-suspenders — most loops pre-check via nightExcludes(), but some
      //  paths like spam-train fakes push directly.)
      if (ws.earliestSendEnabled && ws.earliestSendTime) {
        const floor = new Date(ws.earliestSendTime)
        if (!isNaN(floor.getTime()) && sendTime < floor) return false
      }
      // Hard safety net: a noble can never travel beyond the world's snob max
      // distance — strip it if the loop didn't already filter it out, and flag
      // so the stripped двор is visible in the plan (не молчаливо).
      const snobStrippedFar = composition.snob > 0 && dist > settings.snobMaxDist
      if (snobStrippedFar) composition.snob = 0

      const total       = totalUnits(composition)
      const pop         = totalPop(composition, settings.unitPop)
      if (pop < settings.minAttackSize) return false
      const { color: wtColor, icon: wtIcon } = calcWatchtower(total, composition.snob > 0)

      const warnings: WarningCode[] = []
      if (snobStrippedFar) warnings.push('SNOB_TOO_FAR')
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(arrivalTime, ws.nightFrom, ws.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime,    ws.nightFrom, ws.nightTo)) warnings.push('NIGHT_SEND')
      }
      let wtSeenSec: number | undefined
      let wtInRadiusSec: number | undefined
      if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
        const { detected, chord, firstEnterT } = calcWatchtowerExposure(village.x, village.y, target.x, target.y, target.enemyPlayer)
        if (detected) {
          warnings.push('WATCHTOWER_HIT')
          // Засвет: от первой точки входа в радиус до прихода (1 - tEnter) доли пути.
          wtSeenSec = Math.round((1 - firstEnterT) * travelSec)
          // В радиусе: доля пути внутри круга (chord / полная дистанция).
          wtInRadiusSec = dist > 0 ? Math.round((chord / dist) * travelSec) : 0
        }
      }
      if (ws.moraleEnabled && target.enemyPlayer) {
        const defPoints = enemyStore.playerByName.get(target.enemyPlayer)?.points ?? 0
        const atkPoints = attackerPoints.get(village.player) ?? 0
        if (defPoints > 0 && atkPoints > 0) {
          const ratio = atkPoints / defPoints
          if (ratio < 1.0)       warnings.push('MORALE_HIGH_RISK')
          else if (ratio < 1.5)  warnings.push('MORALE_MEDIUM')
        }
      }

      const buildNobles  = composition.snob   > 0 ? composition.snob   : undefined
      const buildPaladin = composition.knight > 0 ? true               : undefined
      result.push({
        id: genId(), type, fromVillage: village, target, composition,
        speedUnit, totalUnits: total, watchtowerColor: wtColor, watchtowerIcon: wtIcon,
        distance: dist, travelSeconds: travelSec, arrivalTime, sendTime,
        warnings, excluded: false, label, color,
        ...(wtSeenSec     !== undefined ? { watchtowerSeenSec: wtSeenSec } : {}),
        ...(wtInRadiusSec !== undefined ? { watchtowerInRadiusSec: wtInRadiusSec } : {}),
        ...(catTarget      ? { catTarget      } : {}),
        ...(buildNobles    ? { buildNobles    } : {}),
        ...(buildPaladin   ? { buildPaladin   } : {}),
        ...(trainGroupId   ? { trainGroupId   } : {}),
        ...(countAsSpam    ? { countAsSpam    } : {}),
      })
      return true
    }

    // ── nightExcludes pre-check (call BEFORE pool mutation) ──────────────
    function nightExcludes(village: Village, target: Target, type: AttackType, arrivalTime: Date, comp?: AttackComposition): boolean {
      // Use the real composition speed when it's known (matches pushAtk), else
      // fall back to the type's assumed slowest unit.
      const speedUnit = comp ? slowestUnitInComp(comp, settings.unitTimes) : speedUnitForType(type)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime = calcSendTime(arrivalTime, travelSec)
      if (ws.sendExcludeEnabled && isInNightWindow(sendTime, ws.nightFrom, ws.nightTo)) return true
      if (ws.earliestSendEnabled && ws.earliestSendTime) {
        const floor = new Date(ws.earliestSendTime)
        if (!isNaN(floor.getTime()) && sendTime < floor) return true
      }
      return false
    }

    // A noble may only be sent within the world's snob max-distance.
    function nobleReaches(v: Village, t: Target): boolean {
      return calcDistance({ x: v.x, y: v.y }, { x: t.x, y: t.y }, settings.mapSize) <= settings.snobMaxDist
    }

    // ── trackNoble ───────────────────────────────────────────────────────
    function trackNoble(village: Village) {
      const ex = newNoblePlacements.find(p => p.village.coords === village.coords)
      if (ex) ex.count++
      else newNoblePlacements.push({ village, count: 1 })
    }

    // ── Virtual noble budget (used by pickNobleVillage) ──────────────────
    const virtualNobleBudget = new Map<string, number>()
    if (noblePollMode !== 'real') {
      for (const pd of playerData.value) {
        if (!pd.totalNobles) continue
        const builtSnob = villages
          .filter(v => v.player === pd.player)
          .reduce((s, v) => s + (pool.get(v.coords)?.snob ?? 0), 0)
        const budget = pd.totalNobles - builtSnob
        if (budget > 0) virtualNobleBudget.set(pd.player, budget)
      }
    }

    // Picks the best noble village from candidates (pre-sorted by distance).
    // Handles both already-built nobles and virtual assignment from totalNobles budget.
    // Sort key: (distanceRank * 2 + isVirtual) — closest built beats closest virtual,
    // but closest virtual beats farther built.
    function pickNobleVillage(
      need: number,
      candidates: Village[],
      target: Target,
      arrT: Date,
      checkArmy?: (coords: string) => boolean,
    ): Village | null {
      type Entry = { v: Village; isVirtual: boolean; rank: number }
      const entries: Entry[] = []

      for (let i = 0; i < candidates.length; i++) {
        const v = candidates[i]
        if (checkArmy && !checkArmy(v.coords)) continue
        const snob = pool.get(v.coords)?.snob ?? 0
        if (snob >= need) {
          entries.push({ v, isVirtual: false, rank: i * 2 })
        } else {
          const budgetNeeded = need - snob
          if ((virtualNobleBudget.get(v.player) ?? 0) >= budgetNeeded) {
            entries.push({ v, isVirtual: true, rank: i * 2 + 1 })
          }
        }
      }

      entries.sort((a, b) => a.rank - b.rank)

      for (const { v, isVirtual } of entries) {
        if (usedNobleVillages.has(v.coords)) continue
        // Ночная проверка по скорости двора (передаём comp с двором вместо типа).
        if (nightExcludes(v, target, 'off', arrT, { ...emptyComposition(), snob: 1 })) continue
        if (isVirtual) {
          const snob = pool.get(v.coords)?.snob ?? 0
          const budgetNeeded = need - snob
          pool.get(v.coords)!.snob += budgetNeeded
          virtualNobleBudget.set(v.player, (virtualNobleBudget.get(v.player) ?? 0) - budgetNeeded)
        }
        usedNobleVillages.add(v.coords)
        return v
      }
      return null
    }

    // Pal/breach-tagged villages are reserved exclusively for the full_off slot.
    // Pre-marked upfront so other slot types can't consume them first.
    const dedicatedVillages = new Set<string>()
    for (const [coords, tag] of poolTags) {
      if (tag !== 'full_off') dedicatedVillages.add(coords)
    }

    // Each noble village can be the source of at most one parovoz (one target).
    // Sending nobles from the same village to multiple targets reveals weakness to the enemy.
    const usedNobleVillages = new Set<string>()

    // ── Slot pool priority helper ─────────────────────────────────────────
    // Noble custom_off slots run FIRST — they partially reserve troops (escort+snob)
    // without consuming the village; if axe+light still ≥ fullOffMinAxe after the
    // reservation, the village remains available for the full_off slot.
    // full_off runs last and claims whatever is left.
    function slotPoolPriority(slot: import('@/stores/massConfigStore').MassSlot): number {
      const p = presStore.all.find(p => p.id === slot.presetId)
      if (!p) return 99
      const r = p.role
      if (r.type === 'custom_off') {
        const u = r.customUnits ?? {}
        const snobSpec = (u.snob as number | undefined) ?? -1
        if (snobSpec > 0) {
          // Noble slot — runs before full_off to reserve troops first
          const nonSnobFixed = (['axe','light','heavy','ram','spear','sword','spy','catapult','knight'] as const)
            .reduce((s, k) => s + (((u[k] as number | undefined) ?? 0) > 0 ? (u[k] as number) : 0), 0)
          return nonSnobFixed >= 100 ? 0 : 1  // off+noble before noble-only
        }
        return 6  // non-noble custom_off, after main slots
      }
      if (r.type === 'full_off')  return 2
      if (r.type === 'half_off')  return 3
      if (r.type === 'cat_squad') return 7  // own pool, runs after offs
      return 10  // spam — own pool, doesn't compete
    }

    // ── Pre-compute per-target data ───────────────────────────────────────
    // Only targets with valid coords participate in global assignment
    interface TargetData {
      byDist: Village[]
      byDistFar: Village[]
      nobleVillages: Village[]
      distMap: Map<string, number>
      wtMap: Map<string, number>
    }
    const targetDataMap = new Map<string, TargetData>()
    // Заглушённые цели (muted) не участвуют в генерации — их войска остаются в пуле.
    const validTargets = targets.value.filter(t => !!t.coords && !t.muted)
    // Базовый пул кандидатов — минус только РУЧНОЙ резерв (reservedVillages).
    // Резерв фронта считается отдельно, пер-волна (ниже).
    const baseNonReserved = villages.filter(v => !reservedVillages.value.has(v.coords))

    // Резерв фронта — пер-волна: для каждой волны со включённым резервом собираем
    // множество дер в радиусе frontReserveDist от ЕЁ целей; такие деры не берутся
    // как источники только в этой волне.
    const waveFrontSets = new Map<string, Set<string>>()
    for (const w of planWaveList) {
      if (!w.settings.frontReserveEnabled) continue
      const fdist = w.settings.frontReserveDist ?? 10
      const wTargets = validTargets.filter(t => (t.waveId ?? planWaveList[0].id) === w.id)
      if (wTargets.length === 0) continue
      const front = new Set<string>()
      for (const v of baseNonReserved) {
        for (const t of wTargets) {
          if (calcDistance({ x: v.x, y: v.y }, { x: t.x, y: t.y }, settings.mapSize) <= fdist) { front.add(v.coords); break }
        }
      }
      waveFrontSets.set(w.id, front)
    }

    for (const target of validTargets) {
      // Настройки волны этой цели — резерв фронта и обход башен индивидуальны для волны.
      const twave = planWaveList.find(w => w.id === target.waveId) ?? planWaveList[0]
      const avoidWt = twave.settings.watchtowerAvoidEnabled ?? true
      const front = waveFrontSets.get(twave.id)
      const candidates = front ? baseNonReserved.filter(v => !front.has(v.coords)) : baseNonReserved

      const distMap = new Map<string, number>()
      const wtMap   = new Map<string, number>()
      for (const v of villages) {
        const d = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
        distMap.set(v.coords, d)
        // wtMap считаем всегда при включённых башнях — применяем пер-волна (avoidWt).
        if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
          const { detected, chord } = calcWatchtowerExposure(v.x, v.y, target.x, target.y, target.enemyPlayer)
          wtMap.set(v.coords, detected ? 1_000_000 + chord : 0)
        }
      }
      const byDist = [...candidates].sort((a, b) => {
        const pa = avoidWt ? (wtMap.get(a.coords) ?? 0) : 0
        const pb = avoidWt ? (wtMap.get(b.coords) ?? 0) : 0
        return (pa + (distMap.get(a.coords) ?? 0)) - (pb + (distMap.get(b.coords) ?? 0))
      })
      const byDistFar = [...candidates].sort((a, b) => {
        const aDetected = avoidWt && (wtMap.get(a.coords) ?? 0) > 0
        const bDetected = avoidWt && (wtMap.get(b.coords) ?? 0) > 0
        if (aDetected !== bDetected) return aDetected ? 1 : -1
        return (distMap.get(b.coords) ?? 0) - (distMap.get(a.coords) ?? 0)
      })
      const nobleVillages = byDist.filter(v => (distMap.get(v.coords) ?? 0) <= settings.snobMaxDist)
      targetDataMap.set(target.id, { byDist, byDistFar, nobleVillages, distMap, wtMap })
    }

    // Score for (village, target) pair used in global assignment
    function pairScore(vCoords: string, targetId: string): number {
      const td = targetDataMap.get(targetId)
      if (!td) return Infinity
      return (td.wtMap.get(vCoords) ?? 0) + (td.distMap.get(vCoords) ?? 0)
    }

    // ── Waves: group targets by their mass-config ─────────────────────────
    // Each group is a "wave" run against the SHARED village pool, in mass-config
    // order (active config first). A target with no massConfigId uses the active
    // one, so a single-config plan behaves exactly as before.
    const waves: { id: string; cfg: MassConfig; tgts: Target[]; settings: WaveSettings }[] = (() => {
      // Одна волна в плане — все цели принадлежат ей (без явной привязки).
      if (planWaveList.length === 1) {
        const w = planWaveList[0]
        return [{ id: w.id, cfg: mcStore.all.find(c => c.id === w.configId)!, tgts: [...validTargets], settings: w.settings }]
      }
      const byWave = new Map<string, Target[]>()
      for (const t of validTargets) {
        // Цель без волны (или волна удалена) — в генерацию не идёт.
        if (!t.waveId || !planWaveList.some(w => w.id === t.waveId)) continue
        const arr = byWave.get(t.waveId) ?? []
        arr.push(t)
        byWave.set(t.waveId, arr)
      }
      return planWaveList
        .filter(w => byWave.has(w.id))
        .map(w => ({ id: w.id, cfg: mcStore.all.find(c => c.id === w.configId)!, tgts: byWave.get(w.id)!, settings: w.settings }))
    })()

    for (const __wave of waves) {
    const cfg = __wave.cfg
    let validTargets = __wave.tgts
    ws = __wave.settings   // настройки текущей волны (читают pushAtk / nightExcludes / цикл)
    // Деры фронта этой волны (пер-волновый резерв) — исключаем из источников.
    const waveFront = waveFrontSets.get(__wave.id)
    const waveNonReserved = waveFront ? baseNonReserved.filter(v => !waveFront.has(v.coords)) : baseNonReserved

    // ── Максимальное покрытие: самые «зажатые» цели обслуживаются первыми ──
    // Не меняем саму раздачу — только порядок целей. Для каждой цели считаем,
    // сколько у неё легальных дер-кандидатов под узкий слот (паравоз — офф в
    // радиусе двора; иначе — фулл-оффы по времени). Меньше → раздаём раньше.
    if (ws.offDistribution === 'max_coverage') {
      const presStore2 = usePresetsStore()
      const fullMin2 = presStore2.fullOffMinOffFarm
      const up2 = settings.unitPop
      // Любой двор в кастом-пресете (Всё = -1 или Кол-во > 0) включает механику
      // дальности хода двора → цели сортируем по числу носителей в радиусе.
      const hasNoble = cfg.slots.some(s => {
        if (!s.enabled) return false
        const r = presStore2.all.find(p => p.id === s.presetId)?.role
        if (r?.type !== 'custom_off') return false
        const snobVal = (r.customUnits?.snob as number | undefined) ?? 0
        return snobVal !== 0
      })
      const feasCount = (t: Target): number => {
        const td = targetDataMap.get(t.id)
        if (!td) return 0
        const list = hasNoble ? td.nobleVillages : td.byDist
        let n = 0, scanned = 0
        for (const v of list) {
          if (!hasNoble && scanned >= 400) break   // окно для перф в не-нобл конфиге
          if (calcOffFarm(v.troops, up2) < fullMin2 || v.troops.ram <= 0) continue
          scanned++
          if (nightExcludes(v, t, 'off', t.arrivalTime)) continue
          n++
        }
        return n
      }
      const diff = new Map(validTargets.map(t => [t.id, feasCount(t)]))
      validTargets = [...validTargets].sort((a, b) => (diff.get(a.id) ?? 0) - (diff.get(b.id) ?? 0))
    }

    // ── Global sorted slots ───────────────────────────────────────────────
    // Порядок заполнения пула: сперва явный приоритет слота (больше = раньше
    // исчерпывает пул по всем целям), затем авто-приоритет по роли, затем порядок.
    const globalOrderedSlots = [...cfg.slots]
      .filter(s => s.enabled)
      .map((s, origIdx) => ({ s, origIdx }))
      .sort((a, b) =>
        (b.s.fillPriority ?? 0) - (a.s.fillPriority ?? 0) ||
        slotPoolPriority(a.s) - slotPoolPriority(b.s) ||
        a.origIdx - b.origIdx)
      .map(({ s }) => s)

    // ── Global assignment for full_off / half_off / spike / custom_off ────
    function globalAssignSlot(
      slot: import('@/stores/massConfigStore').MassSlot,
      role: import('@/stores/presetsStore').VillageRole,
      preset: import('@/stores/presetsStore').AttackPreset,
      gTargets: Target[],
      slotArrTMap: Map<string, Date>,
    ): void {
      const usedVillages     = new Set<string>()
      const targetFilled     = new Map<string, number>()
      const targetSkippedD   = new Map<string, number>()
      const targetSkippedN   = new Map<string, number>()

      if (role.type === 'full_off') {
        // ── Build per-target ordered candidate lists (pal/breach priority) ──
        const strengthSort = (x: Village, y: Village) => {
          const sx = x.troops.axe + x.troops.light + x.troops.heavy + x.troops.ram
          const sy = y.troops.axe + y.troops.light + y.troops.heavy + y.troops.ram
          return sy - sx || y.troops.ram - x.troops.ram
        }

        type TaggedVillage = { village: Village; tag: OffTag | undefined }
        const candidatesByTarget = new Map<string, TaggedVillage[]>()
        const isAutoPaladin  = settings.paladinMode === 'auto'
        const isNonePaladin  = settings.paladinMode === 'none'

        for (const target of gTargets) {
          const { byDist, byDistFar } = targetDataMap.get(target.id)!
          const base = ws.offDistribution === 'far_first' ? byDistFar : byDist

          let ordered: TaggedVillage[]
          if (isNonePaladin) {
            // No paladin distribution — use base order, strip all tags so no knight is assigned
            ordered = base.map(v => ({ village: v, tag: undefined }))
            candidatesByTarget.set(target.id, ordered)
            continue
          }

          const bpList: Village[] = [], poList: Village[] = [], boList: Village[] = [], foList: Village[] = []
          for (const v of base) {
            const tag = poolTags.get(v.coords)
            if      (tag === 'breach+pal') bpList.push(v)
            else if (tag === 'pal_off')    poList.push(v)
            else if (tag === 'breach_off') boList.push(v)
            else if (tag === 'full_off')   foList.push(v)
          }

          if (isAutoPaladin) {
            // Auto: fixed priority breach+pal → breach_off → pal_off → full_off
            // Priority groups always use nearest-first (byDist) even in far_first mode
            // — breach/pal offs should arrive close in time; far_first applies only to foList
            const nearBase = targetDataMap.get(target.id)!.byDist
            const bpNear: Village[] = [], boNear: Village[] = [], poNear: Village[] = []
            for (const v of nearBase) {
              const tag = poolTags.get(v.coords)
              if      (tag === 'breach+pal') bpNear.push(v)
              else if (tag === 'breach_off') boNear.push(v)
              else if (tag === 'pal_off')    poNear.push(v)
            }
            ordered = [
              ...bpNear,
              ...boNear,
              ...poNear,
              ...foList,
            ].map(v => ({ village: v, tag: poolTags.get(v.coords) as OffTag | undefined }))
          } else {
            const tPal    = target.palOffCount    ?? 0
            const tBreach = target.breachOffCount ?? 0
            const tBp     = target.bpOffCount     ?? 0
            const bpPriCount   = Math.min(bpList.length, Math.max(tBp, tPal, tBreach))
            const palFromPo    = Math.max(0, tPal    - bpPriCount)
            const breachFromBo = Math.max(0, tBreach - bpPriCount)
            ordered = [
              // Priority section: these villages keep their tags (knight will be sent)
              ...bpList.slice(0, bpPriCount).sort(strengthSort).map(v => ({ village: v, tag: 'breach+pal' as OffTag })),
              ...poList.slice(0, palFromPo).sort(strengthSort).map(v => ({ village: v, tag: 'pal_off' as OffTag })),
              ...boList.slice(0, breachFromBo).sort(strengthSort).map(v => ({ village: v, tag: 'breach_off' as OffTag })),
              // Fallback section: strip paladin/breach tags → treated as full_off, no knight sent
              ...bpList.slice(bpPriCount).map(v => ({ village: v, tag: 'full_off' as OffTag })),
              ...poList.slice(palFromPo).map(v => ({ village: v, tag: 'full_off' as OffTag })),
              ...boList.slice(breachFromBo).map(v => ({ village: v, tag: 'full_off' as OffTag })),
              ...foList.map(v => ({ village: v, tag: 'full_off' as OffTag })),
            ]
          }

          // Tower avoidance: regardless of tag priority, move wt-detected villages to the end
          // so a non-detected full_off always beats a detected pal/breach village
          if (settings.watchtowerEnabled && ws.watchtowerAvoidEnabled) {
            const twm = targetDataMap.get(target.id)!.wtMap
            const nonDet = ordered.filter(({ village: v }) => (twm.get(v.coords) ?? 0) === 0)
            const det    = ordered.filter(({ village: v }) => (twm.get(v.coords) ?? 0) > 0)
            ordered = [...nonDet, ...det]
          }

          candidatesByTarget.set(target.id, ordered)
        }

        const pointers = new Map<string, number>()

        if (ws.offDistribution !== 'default') {
          // Round-robin: each round every unfulfilled target picks its next available candidate
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const candidates = candidatesByTarget.get(target.id) ?? []
              let ptr = pointers.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < candidates.length && !assigned) {
                const { village: v, tag } = candidates[ptr++]
                if (usedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                if (calcOffFarm(a, settings.unitPop) < presStore.fullOffMinOffFarm || a.ram === 0) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'off', slotArrT)) {
                  targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
                }
                const isPal = tag === 'breach+pal' || tag === 'pal_off'
                const label = tag === 'breach+pal' ? `${preset.name} (+Пал+Пробой)` : tag === 'pal_off' ? `${preset.name} (+Пал)` : tag === 'breach_off' ? `${preset.name} (+Пробой)` : preset.name
                const atkType: AttackType = isPal ? 'paladin_off' : 'off'
                const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
                const c = emptyComposition()
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                if (isPal) { c.knight = 1; a.knight = Math.max(0, a.knight - 1) }
                if (role.nobleIncluded && a.snob > 0 && nobleReaches(v, target)) { c.snob = 1; a.snob -= 1 }
                a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                if (!pushAtk(atkType, v, target, c, slotArrT, label, presetColor)) {
                  a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
                  if (isPal) a.knight = (a.knight ?? 0) + 1
                  if (role.nobleIncluded && c.snob > 0) a.snob += c.snob
                  continue
                }
                usedVillages.add(v.coords)
                if (isPal) paladinPlacements.value.push({ village: v, forTarget: target })
                targetFilled.set(target.id, (targetFilled.get(target.id) ?? 0) + 1)
                anyAssigned = true
                assigned = true
              }
              pointers.set(target.id, ptr)
            }
          }
        } else {
          // Default (greedy): globally sorted by score
          type Pair = { target: Target; village: Village; tag: OffTag | undefined; slotArrT: Date; score: number }
          const allPairs: Pair[] = []
          for (const target of gTargets) {
            const slotArrT = slotArrTMap.get(target.id)!
            for (const { village: v, tag } of candidatesByTarget.get(target.id) ?? []) {
              allPairs.push({ target, village: v, tag, slotArrT, score: pairScore(v.coords, target.id) })
            }
          }
          allPairs.sort((a, b) => a.score - b.score)

          for (const { target, village: v, tag, slotArrT } of allPairs) {
            const filled = targetFilled.get(target.id) ?? 0
            if (filled >= slot.count) continue
            if (usedVillages.has(v.coords)) continue
            const a = pool.get(v.coords)!
            if (calcOffFarm(a, settings.unitPop) < presStore.fullOffMinOffFarm || a.ram === 0) {
              targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
            }
            if (nightExcludes(v, target, 'off', slotArrT)) {
              targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
            }
            const isPal = tag === 'breach+pal' || tag === 'pal_off'
            const label = tag === 'breach+pal' ? `${preset.name} (+Пал+Пробой)` : tag === 'pal_off' ? `${preset.name} (+Пал)` : tag === 'breach_off' ? `${preset.name} (+Пробой)` : preset.name
            const atkType: AttackType = isPal ? 'paladin_off' : 'off'
            const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
            const c = emptyComposition()
            c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
            if (isPal) { c.knight = 1; a.knight = Math.max(0, a.knight - 1) }
            if (role.nobleIncluded && a.snob > 0 && nobleReaches(v, target)) { c.snob = 1; a.snob -= 1 }
            a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
            if (!pushAtk(atkType, v, target, c, slotArrT, label, presetColor)) {
              a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
              if (isPal) a.knight = (a.knight ?? 0) + 1
              if (role.nobleIncluded && c.snob > 0) a.snob += c.snob
              continue
            }
            usedVillages.add(v.coords)
            if (isPal) paladinPlacements.value.push({ village: v, forTarget: target })
            targetFilled.set(target.id, filled + 1)
          }
        }

      } else if (role.type === 'half_off') {
        const midMin = presStore.halfOffMinOffFarm
        const midMax = presStore.fullOffMinOffFarm

        if (ws.offDistribution !== 'default') {
          const pointers3 = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const td3 = targetDataMap.get(target.id)!
              const halfList = ws.offDistribution === 'far_first' ? td3.byDistFar : td3.byDist
              let ptr = pointers3.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < halfList.length && !assigned) {
                const v = halfList[ptr++]
                if (usedVillages.has(v.coords)) continue
                if (dedicatedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                const of = calcOffFarm(a, settings.unitPop)
                if (of < midMin || of >= midMax) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'mid_off', slotArrT)) {
                  targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
                }
                const c = emptyComposition()
                if (role.halfFixedComp) {
                  c.axe   = Math.min(a.axe,   role.halfFixedAxe   ?? 0)
                  c.light = Math.min(a.light, role.halfFixedLight ?? 0)
                  c.heavy = Math.min(a.heavy, role.halfFixedHeavy ?? 0)
                  c.ram   = Math.min(a.ram,   role.halfFixedRam   ?? 0)
                  a.axe -= c.axe; a.light -= c.light; a.heavy -= c.heavy; a.ram -= c.ram
                } else {
                  c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                  a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                }
                if (!pushAtk('mid_off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
                  a.axe += c.axe; a.light += c.light; a.heavy += c.heavy; a.ram += c.ram
                  continue
                }
                if (!role.halfFixedComp) usedVillages.add(v.coords)
                targetFilled.set(target.id, (targetFilled.get(target.id) ?? 0) + 1)
                anyAssigned = true
                assigned = true
              }
              pointers3.set(target.id, ptr)
            }
          }
        } else {
          // Default (greedy)
          type HalfPair = { target: Target; village: Village; slotArrT: Date; score: number }
          const allPairs: HalfPair[] = []
          for (const target of gTargets) {
            const { byDist } = targetDataMap.get(target.id)!
            const slotArrT = slotArrTMap.get(target.id)!
            for (const v of byDist) {
              allPairs.push({ target, village: v, slotArrT, score: pairScore(v.coords, target.id) })
            }
          }
          allPairs.sort((a, b) => a.score - b.score)
          for (const { target, village: v, slotArrT } of allPairs) {
            const filled = targetFilled.get(target.id) ?? 0
            if (filled >= slot.count) continue
            if (usedVillages.has(v.coords)) continue
            if (dedicatedVillages.has(v.coords)) continue
            const a = pool.get(v.coords)!
            const of = calcOffFarm(a, settings.unitPop)
            if (of < midMin || of >= midMax) {
              targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
            }
            if (nightExcludes(v, target, 'mid_off', slotArrT)) {
              targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
            }
            const c = emptyComposition()
            if (role.halfFixedComp) {
              c.axe   = Math.min(a.axe,   role.halfFixedAxe   ?? 0)
              c.light = Math.min(a.light, role.halfFixedLight ?? 0)
              c.heavy = Math.min(a.heavy, role.halfFixedHeavy ?? 0)
              c.ram   = Math.min(a.ram,   role.halfFixedRam   ?? 0)
              a.axe -= c.axe; a.light -= c.light; a.heavy -= c.heavy; a.ram -= c.ram
            } else {
              c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
              a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
            }
            if (!pushAtk('mid_off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
              a.axe += c.axe; a.light += c.light; a.heavy += c.heavy; a.ram += c.ram
              continue
            }
            if (!role.halfFixedComp) usedVillages.add(v.coords)
            targetFilled.set(target.id, filled + 1)
          }
        }

      } else if (role.type === 'mini_off') {
        const miniMin = presStore.smallOffMinOffFarm
        const miniMax = presStore.halfOffMinOffFarm

        if (ws.offDistribution !== 'default') {
          const pointersMini = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const tdMini = targetDataMap.get(target.id)!
              const miniList = ws.offDistribution === 'far_first' ? tdMini.byDistFar : tdMini.byDist
              let ptr = pointersMini.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < miniList.length && !assigned) {
                const v = miniList[ptr++]
                if (usedVillages.has(v.coords)) continue
                if (dedicatedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                const of = calcOffFarm(a, settings.unitPop)
                if (of < miniMin || of >= miniMax) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'mini_off', slotArrT)) {
                  targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
                }
                const c = emptyComposition()
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                if (!pushAtk('mini_off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
                  a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
                  continue
                }
                usedVillages.add(v.coords)
                targetFilled.set(target.id, (targetFilled.get(target.id) ?? 0) + 1)
                anyAssigned = true
                assigned = true
              }
              pointersMini.set(target.id, ptr)
            }
          }
        } else {
          type MiniPair = { target: Target; village: Village; slotArrT: Date; score: number }
          const allPairs: MiniPair[] = []
          for (const target of gTargets) {
            const { byDist } = targetDataMap.get(target.id)!
            const slotArrT = slotArrTMap.get(target.id)!
            for (const v of byDist) {
              allPairs.push({ target, village: v, slotArrT, score: pairScore(v.coords, target.id) })
            }
          }
          allPairs.sort((a, b) => a.score - b.score)
          for (const { target, village: v, slotArrT } of allPairs) {
            const filled = targetFilled.get(target.id) ?? 0
            if (filled >= slot.count) continue
            if (usedVillages.has(v.coords)) continue
            if (dedicatedVillages.has(v.coords)) continue
            const a = pool.get(v.coords)!
            const of = calcOffFarm(a, settings.unitPop)
            if (of < miniMin || of >= miniMax) {
              targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
            }
            if (nightExcludes(v, target, 'mini_off', slotArrT)) {
              targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
            }
            const c = emptyComposition()
            c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
            a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
            if (!pushAtk('mini_off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
              a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
              continue
            }
            usedVillages.add(v.coords)
            targetFilled.set(target.id, filled + 1)
          }
        }

      } else if (role.type === 'cat_squad') {
        const minCats         = preset.builtIn ? presStore.catMinSize : (role.catMinCats ?? 50)
        const effectiveCatTarget: CatTarget | undefined = role.catTarget ?? presStore.catDefaultTarget
        const presetColor     = preset.color ?? defaultColorForRole('cat_squad')
        const usedCatVillages = new Set<string>()

        function buildCatComp(v: Village): AttackComposition | null {
          const cats = villagesStore.villages.find(x => x.coords === v.coords)?.troops.catapult ?? 0
          if (cats < minCats) return null
          const c = emptyComposition()
          c.catapult = cats
          return c
        }

        // Group cat villages by player — round-robin across players per target
        const catByPlayer = new Map<string, Village[]>()
        for (const v of waveNonReserved) {
          const cats = villagesStore.villages.find(x => x.coords === v.coords)?.troops.catapult ?? 0
          if (cats < minCats) continue
          if (!catByPlayer.has(v.player)) catByPlayer.set(v.player, [])
          catByPlayer.get(v.player)!.push(v)
        }
        const catPlayers = [...catByPlayer.keys()]
        let pIdx = 0  // rotating player pointer

        let anyAssigned = true
        while (anyAssigned) {
          anyAssigned = false
          for (const target of gTargets) {
            const filled = targetFilled.get(target.id) ?? 0
            if (filled >= slot.count) continue
            const slotArrT = slotArrTMap.get(target.id)!

            // Try each player starting from current pIdx (round-robin)
            let assigned = false
            for (let pi = 0; pi < catPlayers.length && !assigned; pi++) {
              const player = catPlayers[(pIdx + pi) % catPlayers.length]
              const pvs = catByPlayer.get(player)!
              for (const v of pvs) {
                if (usedCatVillages.has(v.coords)) continue
                if (nightExcludes(v, target, 'cat', slotArrT)) continue
                const c = buildCatComp(v)
                if (!c) continue
                if (!pushAtk('cat', v, target, c, slotArrT, preset.name, presetColor, undefined, undefined, effectiveCatTarget)) continue
                usedCatVillages.add(v.coords)
                targetFilled.set(target.id, filled + 1)
                pIdx = (pIdx + pi + 1) % catPlayers.length
                anyAssigned = true
                assigned = true
                break
              }
            }
          }
        }

      } else if (role.type === 'custom_off') {
        const cMin     = role.customMin ?? 0
        const cMax     = role.customMax ?? 99999
        const units    = role.customUnits ?? {}
        const unitPct  = role.customUnitPct ?? {}
        const unitMinReq = role.customUnitMin ?? {}
        const unitMaxReq = role.customUnitMax ?? {}
        const customCatTarget: CatTarget | undefined = (units.catapult ?? 0) !== 0
          ? (role.catTarget ?? presStore.catDefaultTarget)
          : undefined
        const unitKeys: Array<keyof AttackComposition> = ['spear','sword','axe','spy','light','heavy','ram','catapult','knight','snob']
        // Check per-unit min/max requirements against village's original troops
        const haveOf = (v: Village, k: string): number =>
          k === 'snob'
            ? (noblePollMode === 'real' ? v.troops[k as keyof VillageTroops] : (virtualNoblePool.get(v.player) ?? 0))
            : v.troops[k as keyof VillageTroops]
        const meetsUnitMin = (v: Village): boolean => {
          for (const [k, minVal] of Object.entries(unitMinReq)) {
            if (!minVal) continue
            // В виртуальном режиме дворы берутся из общего пула, а не из деры —
            // фильтр «мин/макс дворов в дере» для них не применяем.
            if (k === 'snob' && noblePollMode !== 'real') continue
            if (haveOf(v, k) < minVal) return false
          }
          for (const [k, maxVal] of Object.entries(unitMaxReq)) {
            if (!maxVal) continue
            if (k === 'snob' && noblePollMode !== 'real') continue
            if (haveOf(v, k) > maxVal) return false
          }
          return true
        }
        // Returns how many of unit k to take from available pool value av
        const resolveUnit = (k: keyof AttackComposition, av: number): number => {
          const pct = (unitPct[k] as number | undefined) ?? 0
          if (pct > 0) return Math.floor(av * pct / 100)
          const spec = (units[k] as number | undefined) ?? -1
          if (spec === 0) return 0
          return spec === -1 ? av : Math.min(av, spec)
        }
        const snobSpec = (units.snob as number | undefined) ?? -1
        // Noble custom_off: village is exclusively assigned to one target (usedNobleVillages)
        const isNobleSlot = snobSpec > 0

        if (ws.offDistribution !== 'default') {
          const pointers4 = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const td4 = targetDataMap.get(target.id)!
              const customList = (ws.offDistribution === 'far_first' && !isNobleSlot) ? td4.byDistFar : td4.byDist
              let ptr = pointers4.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < customList.length && !assigned) {
                const v = customList[ptr++]
                if (!isNobleSlot && usedVillages.has(v.coords)) continue
                if (!isNobleSlot && dedicatedVillages.has(v.coords)) continue
                if (isNobleSlot && usedNobleVillages.has(v.coords)) continue
                if (!meetsUnitMin(v)) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
                const a = pool.get(v.coords)!
                {
                  let hasEnough = true
                  for (const k of unitKeys) {
                    const pct  = (unitPct[k] as number | undefined) ?? 0
                    const spec = (units[k] as number | undefined) ?? -1
                    if (pct > 0) continue
                    if (spec <= 0) continue
                    const av = k === 'snob' ? (noblePollMode === 'real' ? a[k] : (virtualNoblePool.get(v.player) ?? 0)) : a[k]
                    if (av < spec) { hasEnough = false; break }
                  }
                  if (!hasEnough) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
                }
                const c = emptyComposition()
                for (const k of unitKeys) {
                  if (k === 'snob') continue
                  c[k] = resolveUnit(k, a[k])
                }
                let snobBuildNeeded = 0
                if (snobSpec > 0) {
                  c.snob = snobSpec
                  snobBuildNeeded = snobSpec
                } else if (snobSpec === -1) {
                  c.snob = a.snob
                  snobBuildNeeded = a.snob
                }
                // Noble can't reach beyond snob max distance → skip this village.
                if (c.snob > 0 && !nobleReaches(v, target)) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
                const total = totalUnits(c)
                const escortSpecified = isNobleSlot && unitKeys.some(k => {
                  if (k === 'snob') return false
                  const spec = units[k] as number | undefined
                  return spec !== undefined && spec !== 0
                })
                const escortInPool = escortSpecified && unitKeys.some(k => {
                  if (k === 'snob') return false
                  const spec = units[k] as number | undefined
                  if (spec === undefined || spec === 0) return false
                  return a[k as keyof AttackComposition] > 0
                })
                // If escort is required but pool is depleted → skip this village
                if (escortSpecified && !escortInPool) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
                const effectiveCMin = (isNobleSlot && escortInPool) ? 0 : cMin
                if (total < effectiveCMin || total > cMax) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
                if (nightExcludes(v, target, 'off', slotArrT)) { targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue }
                if (snobSpec > 0) virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) - snobSpec)
                for (const k of unitKeys) { if (k !== 'snob') a[k] -= c[k] }
                if (snobSpec === -1) a.snob -= c.snob
                if (!pushAtk('off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role), snobBuildNeeded || undefined, undefined, customCatTarget, role.countAsSpam)) {
                  if (snobSpec > 0) virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) + snobSpec)
                  for (const k of unitKeys) { if (k !== 'snob') a[k] += c[k] }
                  if (snobSpec === -1) a.snob += c.snob
                  continue
                }
                if (isNobleSlot) usedNobleVillages.add(v.coords)
                targetFilled.set(target.id, (targetFilled.get(target.id) ?? 0) + 1)
                anyAssigned = true
                assigned = true
              }
              pointers4.set(target.id, ptr)
            }
          }
        } else {
          // Default (greedy)
          type CustomPair = { target: Target; village: Village; slotArrT: Date; score: number }
          const allPairs: CustomPair[] = []
          for (const target of gTargets) {
            const { byDist } = targetDataMap.get(target.id)!
            const slotArrT = slotArrTMap.get(target.id)!
            for (const v of byDist) {
              allPairs.push({ target, village: v, slotArrT, score: pairScore(v.coords, target.id) })
            }
          }
          allPairs.sort((a, b) => a.score - b.score)
          for (const { target, village: v, slotArrT } of allPairs) {
            const filled = targetFilled.get(target.id) ?? 0
            if (filled >= slot.count) continue
            if (!isNobleSlot && usedVillages.has(v.coords)) continue
            if (!isNobleSlot && dedicatedVillages.has(v.coords)) continue
            if (isNobleSlot && usedNobleVillages.has(v.coords)) continue
            if (!meetsUnitMin(v)) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
            const a = pool.get(v.coords)!
            {
              let hasEnough = true
              for (const k of unitKeys) {
                const pct  = (unitPct[k] as number | undefined) ?? 0
                const spec = (units[k] as number | undefined) ?? -1
                if (pct > 0) continue
                if (spec <= 0) continue
                const av = k === 'snob' ? (virtualNoblePool.get(v.player) ?? 0) : a[k]
                if (av < spec) { hasEnough = false; break }
              }
              if (!hasEnough) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
            }
            const c = emptyComposition()
            for (const k of unitKeys) {
              if (k === 'snob') continue
              c[k] = resolveUnit(k, a[k])
            }
            let snobBuildNeeded = 0
            if (snobSpec > 0) {
              c.snob = snobSpec
              snobBuildNeeded = Math.max(0, snobSpec - a.snob)
            } else if (snobSpec === -1) {
              c.snob = a.snob
            }
            // Noble can't reach beyond snob max distance → skip this village.
            if (c.snob > 0 && !nobleReaches(v, target)) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
            const total = totalUnits(c)
            const escortSpecified2 = isNobleSlot && unitKeys.some(k => {
              if (k === 'snob') return false
              const spec = units[k] as number | undefined
              return spec !== undefined && spec !== 0
            })
            const escortInPool2 = escortSpecified2 && unitKeys.some(k => {
              if (k === 'snob') return false
              const spec = units[k] as number | undefined
              if (spec === undefined || spec === 0) return false
              return a[k as keyof AttackComposition] > 0
            })
            if (escortSpecified2 && !escortInPool2) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
            const effectiveCMin = (isNobleSlot && escortInPool2) ? 0 : cMin
            if (total < effectiveCMin || total > cMax) { targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue }
            if (nightExcludes(v, target, 'off', slotArrT)) { targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue }
            if (snobSpec > 0) virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) - snobSpec)
            for (const k of unitKeys) { if (k !== 'snob') a[k] -= c[k] }
            if (snobSpec === -1) a.snob -= c.snob
            if (!pushAtk('off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role), snobBuildNeeded || undefined, undefined, undefined, role.countAsSpam)) {
              if (snobSpec > 0) virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) + snobSpec)
              for (const k of unitKeys) { if (k !== 'snob') a[k] += c[k] }
              if (snobSpec === -1) a.snob += c.snob
              continue
            }
            if (isNobleSlot) usedNobleVillages.add(v.coords)
            targetFilled.set(target.id, filled + 1)
          }
        }
      }

      // ── Issue tracking for all global slot types ───────────────────────
      for (const target of gTargets) {
        const generated = targetFilled.get(target.id) ?? 0
        if (generated < slot.count) {
          const skippedD = targetSkippedD.get(target.id) ?? 0
          const skippedN = targetSkippedN.get(target.id) ?? 0
          let offsReason: OffsShortReason | undefined
          if (generated === 0) {
            if      (skippedD > 0 && skippedN === 0) offsReason = 'pool_depleted'
            else if (skippedN > 0 && skippedD === 0) offsReason = 'night_excluded'
            else if (skippedD === 0 && skippedN === 0) offsReason = 'no_eligible'
          }
          genIssues.push({ targetCoords: target.coords, targetId: target.id, type: 'OFFS_SHORT', requested: slot.count, generated, offsReason, slotName: preset.name })
        }
      }
    }

    // ── Main slot loop ────────────────────────────────────────────────────
    for (const slot of globalOrderedSlots) {
      const preset = presStore.all.find(p => p.id === slot.presetId)
      if (!preset) continue
      const role = preset.role

      // Per-target arrival time for this slot
      const slotArrTMap = new Map<string, Date>()
      for (const t of validTargets) {
        slotArrTMap.set(t.id, new Date(t.arrivalTime.getTime() + slot.offsetMs))
      }

      if (role.type === 'spam' || (role.type === 'custom_off' && role.countAsSpam)) {
        // Spam-style distribution. Балансировка по РАЗНЫМ игрокам маскирует
        // источник: каждая атака отдаётся игроку с наименьшим числом отправок.
        // Сюда же попадают кастомные пресеты с галочкой «считать как спам» —
        // они раздаются по тем же законам, но со своим составом.
        const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
        const isCustomSpam = role.type === 'custom_off'

        // ── Стратегия состава ──────────────────────────────────────────────
        // Реальный спам → мелкий фейк (buildSpamComp). Кастом «как спам» →
        // собственный состав пресета, но раздаётся по спам-правилам.
        const csUnits  = role.customUnits ?? {}
        const csPct    = role.customUnitPct ?? {}
        const csMinReq = role.customUnitMin ?? {}
        const csMaxReq = role.customUnitMax ?? {}
        const csMin    = role.customMin ?? 0
        const csMax    = role.customMax ?? 99999
        // knight/snob исключены — спам не возит ни паладинов, ни дворян
        const csKeys: Array<keyof AttackComposition> = ['spear','sword','axe','spy','light','heavy','ram','catapult']
        const csCatTarget: CatTarget | undefined = (csUnits.catapult ?? 0) !== 0
          ? (role.catTarget ?? presStore.catDefaultTarget) : undefined
        const csResolve = (k: keyof AttackComposition, av: number): number => {
          const pct = (csPct[k] as number | undefined) ?? 0
          if (pct > 0) return Math.floor(av * pct / 100)
          const spec = (csUnits[k] as number | undefined) ?? -1
          if (spec === 0) return 0
          return spec === -1 ? av : Math.min(av, spec)
        }
        const csMeetsMin = (v: Village): boolean => {
          for (const [k, mn] of Object.entries(csMinReq)) { if (mn && v.troops[k as keyof VillageTroops] < mn) return false }
          for (const [k, mx] of Object.entries(csMaxReq)) { if (mx && v.troops[k as keyof VillageTroops] > mx) return false }
          return true
        }
        const buildComp: (v: Village, a: AttackComposition) => AttackComposition | null = isCustomSpam
          ? (v, a) => {
              if (!csMeetsMin(v)) return null
              const c = emptyComposition()
              for (const k of csKeys) c[k] = csResolve(k, a[k])
              const total = totalUnits(c)
              if (total < csMin || total > csMax) return null
              return c
            }
          : (_v, a) => buildSpamComp(a)
        // Вычитаем из общего пула ВЕСЬ состав (а не только ram/cat) — иначе
        // наполнитель спама (топоры/копья/… до minAttackSize) не списывался и мог
        // быть потрачен повторно настоящим оффом. Касается любого юнита.
        const allCompKeys = Object.keys(emptyComposition()) as Array<keyof AttackComposition>
        const consumeComp: (a: AttackComposition, c: AttackComposition) => void =
          (a, c) => { for (const k of allCompKeys) a[k] = Math.max(0, a[k] - c[k]) }
        const deraEligible: (v: Village, a: AttackComposition) => boolean = isCustomSpam
          ? (v) => csMeetsMin(v)
          : (_v, a) => a.ram > 0 || a.catapult > 0
        const spamAtkType: AttackType = isCustomSpam ? 'off' : 'spam'
        const spamCountFlag: boolean | undefined = isCustomSpam ? true : undefined
        const spamPushCat: CatTarget | undefined = isCustomSpam ? csCatTarget : undefined
        // Маскировка: лимит на деру + балансировка спама по игрокам (аккаунтам).
        // Счётчики живут на весь слот, между всеми целями.
        const spamByVillage = new Map<string, number>()
        const spamByPlayer  = new Map<string, number>()
        // Игроки со спам-способными дерами (есть хоть 1 таран/кат).
        const spamPlayers: string[] = (() => {
          const seen = new Set<string>()
          const order: string[] = []
          for (const v of villages) {
            if (reservedVillages.value.has(v.coords)) continue
            if (v.troops.ram <= 0 && v.troops.catapult <= 0) continue
            if (!seen.has(v.player)) { seen.add(v.player); order.push(v.player); spamByPlayer.set(v.player, 0) }
          }
          return order
        })()
        // Небольшой штраф деф-дерам при подборе спама — офф-деры предпочтительнее
        // (спам с офф-деры правдоподобнее), но близкая деф всё равно обгонит дальнюю офф.
        const SPAM_DEF_PENALTY = 15
        const offMin = presStore.smallOffMinOffFarm
        for (const target of validTargets) {
          const { byDist, nobleVillages, distMap, wtMap } = targetDataMap.get(target.id)!
          const slotArrT = slotArrTMap.get(target.id)!

          if ((role.spamTrainSize ?? 0) > 0) {
            // ── Spam train preset ──────────────────────────────────────
            const trainSize = role.spamTrainSize ?? 5
            const spamCount = role.spamCount ?? 5
            let trainsLeft = slot.count
            while (trainsLeft > 0) {
              const nv = pickNobleVillage(trainSize, nobleVillages, target, slotArrT)
              if (!nv) break
              const a = pool.get(nv.coords)!
              const tgId = genId()
              for (let i = 0; i < spamCount; i++) {
                const c = buildSpamComp(a)
                if (!c) break
                a.ram = Math.max(0, a.ram - c.ram); a.catapult = Math.max(0, a.catapult - c.catapult)
                pushAtk('spam', nv, target, c, slotArrT, preset.name, presetColor, undefined, tgId)
              }
              trainsLeft--
            }
          } else {
            // ── Regular spam preset ────────────────────────────────────
            // Балансировка: каждый спам отдаётся игроку с наименьшим числом
            // спама (у кого есть пригодная дера), его ближайшей деры. Радиусного
            // лимита нет — рассматриваются ВСЕ деры игрока (фильтрует лишь
            // ночь/старт). Лимит на деру — maxPerVil.
            const wBefore = slot.windowBeforeMin ?? 0
            const wAfter  = slot.windowAfterMin  ?? 0
            const useWindow = wBefore > 0 || wAfter > 0
            const maxPerVil = (slot.spamMaxPerVillage ?? 0) > 0 ? slot.spamMaxPerVillage! : Infinity

            // Все деры игроков к этой цели (siege-способные), с мягким предпочтением
            // офф-дер: сортируем по расстоянию + штраф деф-дерам. При «Дальние вперёд»
            // инвертируем расстояние — спам уходит с ДАЛЬНИХ дер (ближние/сильные
            // оставляем под реальный офф). Балансировка по игрокам (маскировка) — всегда.
            // При включённых «Башнях» волны — засвеченные деры уходят в конец (как у оффов):
            // засвеченный фейк бесполезен (видно, что армия мелкая).
            const spamFarFirst = ws.offDistribution === 'far_first'
            const spamAvoidWt = settings.watchtowerEnabled && ws.watchtowerAvoidEnabled
            const spamScore = (v: Village): number => {
              const dist = distMap.get(v.coords) ?? 0
              const isOff = calcOffFarm(v.troops, settings.unitPop) >= offMin
              const wtPenalty = spamAvoidWt ? (wtMap.get(v.coords) ?? 0) : 0
              return wtPenalty + (spamFarFirst ? -dist : dist) + (isOff ? 0 : SPAM_DEF_PENALTY)
            }
            const derasByPlayer = new Map<string, Village[]>()
            for (const v of byDist) {
              const a = pool.get(v.coords)!
              if (!deraEligible(v, a)) continue
              const arr = derasByPlayer.get(v.player)
              if (arr) arr.push(v); else derasByPlayer.set(v.player, [v])
            }
            for (const list of derasByPlayer.values()) list.sort((x, y) => spamScore(x) - spamScore(y))

            const usedThisTarget = new Set<string>()
            const ptr = new Map<string, number>()
            // Ближайшая ещё доступная дера игрока (двигает указатель мимо занятых/лимитных)
            const nextDera = (player: string): Village | null => {
              const list = derasByPlayer.get(player)
              if (!list) return null
              let i = ptr.get(player) ?? 0
              while (i < list.length) {
                const v = list[i]
                if (!usedThisTarget.has(v.coords) && (spamByVillage.get(v.coords) ?? 0) < maxPerVil) { ptr.set(player, i); return v }
                i++
              }
              ptr.set(player, i)
              return null
            }

            let left = slot.count
            while (left > 0) {
              // игрок с минимальным счётчиком, у кого есть доступная дера
              let bestPlayer: string | null = null
              let bestCnt = Infinity
              for (const p of spamPlayers) {
                const cnt = spamByPlayer.get(p) ?? 0
                if (cnt >= bestCnt) continue
                if (nextDera(p)) { bestPlayer = p; bestCnt = cnt }
              }
              if (!bestPlayer) break
              const v = nextDera(bestPlayer)!
              const a = pool.get(v.coords)!
              const c = buildComp(v, a)
              // Вырожденный состав (истощённая деревня: населения меньше minAttackSize)
              // — не тратим слот, помечаем деру использованной и пробуем следующую.
              if (!c || totalPop(c, settings.unitPop) < settings.minAttackSize) { usedThisTarget.add(v.coords); continue }
              const arrT = useWindow
                ? randomSpamArrival(
                    new Date(slotArrT.getTime() - wBefore * 60_000),
                    new Date(slotArrT.getTime() + wAfter  * 60_000),
                  )
                : slotArrT
              if (nightExcludes(v, target, spamAtkType, arrT, c)) { usedThisTarget.add(v.coords); continue }
              // pushAtk может отклонить (ночь/старт/минимум) — тогда слот не тратим.
              if (!pushAtk(spamAtkType, v, target, c, arrT, preset.name, presetColor, undefined, undefined, spamPushCat, spamCountFlag)) {
                usedThisTarget.add(v.coords); continue
              }
              consumeComp(a, c)
              usedThisTarget.add(v.coords)
              spamByVillage.set(v.coords, (spamByVillage.get(v.coords) ?? 0) + 1)
              spamByPlayer.set(bestPlayer, bestCnt + 1)
              left--
            }
            if (left > 0) genIssues.push({ targetCoords: target.coords, targetId: target.id, type: 'SPAM_SHORT', requested: slot.count, generated: slot.count - left, slotName: preset.name })
          }
        }

      } else {
        // Global assignment: full_off, half_off, custom_off
        globalAssignSlot(slot, role, preset, validTargets, slotArrTMap)
      }
    }

    } // ── end wave loop ──────────────────────────────────────────────────

    result.sort((a, b) => a.sendTime.getTime() - b.sendTime.getTime())
    attacks.value = result
    noblePlacements.value = newNoblePlacements
    generationIssues.value = genIssues

    // Noble recommendations: how many nobles each player needs to execute the plan
    const recs = new Map<string, number>()
    for (const [player, remaining] of virtualNoblePool) {
      const initial = [...villages]
        .filter(v => v.player === player)
        .reduce((s, v) => s + v.troops.snob, 0)
      const used = initial - remaining
      if (used > 0) recs.set(player, used)
    }
    nobleRecommendations.value = recs

    // ── Post-generation analysis: why are offs unused? ────────────────────
    {
      const { settings } = worldStore
      const presStore2 = usePresetsStore()
      const usedCoords = new Set(attacks.value.filter(a => !a.excluded).map(a => a.fromVillage.coords))
      const unusedVils = villages.filter(v =>
        !reservedVillages.value.has(v.coords) &&
        !usedCoords.has(v.coords) &&
        calcOffFarm(v.troops, settings.unitPop) >= presStore2.fullOffMinOffFarm &&
        v.troops.ram > 0
      )
      // Use the target with the latest arrival time as the most permissive check
      const latestTarget = [...targets.value].sort((a, b) => b.arrivalTime.getTime() - a.arrivalTime.getTime())[0]
      let noSlots = 0, nightExcluded = 0, earliestExcluded = 0
      for (const v of unusedVils) {
        if (latestTarget) {
          const unitBaseSec = settings.unitTimes[speedUnitForType('off')]
          const dist = calcDistance({ x: v.x, y: v.y }, { x: latestTarget.x, y: latestTarget.y }, settings.mapSize)
          const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
          const sendTime = calcSendTime(latestTarget.arrivalTime, travelSec)
          if (settings.earliestSendEnabled && settings.earliestSendTime) {
            const floor = new Date(settings.earliestSendTime)
            if (!isNaN(floor.getTime()) && sendTime < floor) { earliestExcluded++; continue }
          }
          if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) { nightExcluded++; continue }
        }
        noSlots++
      }
      unusedOffStats.value = { noSlots, nightExcluded, earliestExcluded }
    }
  }

  // ---------------------------------------------------------------------------
  // Cat mass (secondary wave: leftover offs + cat squads on cat targets)
  // ---------------------------------------------------------------------------

  function generateCatMass(): void {
    const presStore  = usePresetsStore()
    const { settings } = worldStore
    const { villages } = villagesStore
    const now = new Date()

    // Remove previous cat mass, keep main mass
    attacks.value = attacks.value.filter(a => !a.catMass)

    // Coords already used in main mass
    const usedCoords = new Set(
      attacks.value.filter(a => !a.excluded).map(a => a.fromVillage.coords)
    )

    if (catTargets.value.length === 0) return

    const catMinSize = presStore.catMinSize

    // Off candidates: not reserved, not in main mass, at least mini_off threshold.
    // Priority: full_off first (largest), then mid_off, then mini_off
    const offCandidates = (() => {
      const full = presStore.fullOffMinOffFarm
      const half = presStore.halfOffMinOffFarm
      const mini = presStore.smallOffMinOffFarm
      function offRank(v: Village): number {
        const of = calcOffFarm(v.troops, settings.unitPop)
        if (of >= full) return 0               // full_off — first
        if (of >= half && of < full) return 1  // mid_off — second
        return 2                               // mini_off — last
      }
      return villages
        .filter(v =>
          !reservedVillages.value.has(v.coords) &&
          !usedCoords.has(v.coords) &&
          calcOffFarm(v.troops, settings.unitPop) >= mini &&
          v.troops.ram > 0
        )
        .sort((a, b) => {
          const ra = offRank(a), rb = offRank(b)
          if (ra !== rb) return ra - rb
          return calcOffFarm(b.troops, settings.unitPop) - calcOffFarm(a.troops, settings.unitPop)
        })
    })()

    // Cat candidates grouped by player (not reserved, not in main mass)
    const catByPlayer = new Map<string, Village[]>()
    for (const v of villages) {
      if (reservedVillages.value.has(v.coords)) continue
      if (usedCoords.has(v.coords)) continue
      if (v.troops.catapult < catMinSize) continue
      if (!catByPlayer.has(v.player)) catByPlayer.set(v.player, [])
      catByPlayer.get(v.player)!.push(v)
    }
    const catPlayers = [...catByPlayer.keys()]

    const effectiveCatTarget: CatTarget | undefined = presStore.catDefaultTarget

    // Night exclusion helper (mirrors the one in generate())
    function nightExclCat(v: Village, target: Target, type: AttackType, arrT: Date): boolean {
      const unitBaseSec = settings.unitTimes[speedUnitForType(type)]
      const dist = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime = calcSendTime(arrT, travelSec)
      if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) return true
      if (settings.earliestSendEnabled && settings.earliestSendTime) {
        const floor = new Date(settings.earliestSendTime)
        if (!isNaN(floor.getTime()) && sendTime < floor) return true
      }
      return false
    }

    // Push a single cat-mass attack directly into attacks.value
    function pushCatMassAtk(
      type: AttackType, village: Village, target: Target,
      composition: AttackComposition, catTarget?: CatTarget,
    ): boolean {
      const speedUnit   = slowestUnitInComp(composition, settings.unitTimes)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist        = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec   = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime    = calcSendTime(target.arrivalTime, travelSec)

      if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) return false
      if (settings.earliestSendEnabled && settings.earliestSendTime) {
        const floor = new Date(settings.earliestSendTime)
        if (!isNaN(floor.getTime()) && sendTime < floor) return false
      }

      const total = totalUnits(composition)
      if (totalPop(composition, settings.unitPop) < settings.minAttackSize) return false

      const { color: wtColor, icon: wtIcon } = calcWatchtower(total, false)
      const warnings: WarningCode[] = []
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(target.arrivalTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_SEND')
      }

      attacks.value.push({
        id: genId(), type, fromVillage: village, target, composition,
        speedUnit, totalUnits: total, watchtowerColor: wtColor, watchtowerIcon: wtIcon,
        distance: dist, travelSeconds: travelSec,
        arrivalTime: target.arrivalTime, sendTime,
        warnings, excluded: false, catMass: true,
        color: defaultColorForRole('cat_squad'),
        ...(catTarget ? { catTarget } : {}),
      })
      return true
    }

    const usedOffInCatMass = new Set<string>()
    const usedCatInCatMass = new Set<string>()

    // 1 off per cat target (weakest first, night-excluded skipped)
    for (const target of catTargets.value) {
      for (const v of offCandidates) {
        if (usedOffInCatMass.has(v.coords)) continue
        if (nightExclCat(v, target, 'off', target.arrivalTime)) continue
        const c = emptyComposition()
        c.axe   = v.troops.axe
        c.light = v.troops.light
        c.heavy = v.troops.heavy
        c.ram   = v.troops.ram
        if (!pushCatMassAtk('off', v, target, c)) continue
        usedOffInCatMass.add(v.coords)
        break
      }
    }

    // ── Cat squads with building-queue logic ──────────────────────────────────
    // Per-target state: tracks remaining cats needed for each building in queue
    type TgtState = { queue: CatMassBuildingEntry[]; remaining: number[]; buildingIdx: number }

    const userQueue = catMassBuildingQueue.value

    // Default fallback buildings (used to extend user queue or as full queue when user has none)
    const DEFAULT_BUILDINGS: CatTarget[] = [
      'farm', 'main', 'smith', 'stable', 'iron', 'stone', 'wood', 'hide', 'market', 'storage',
    ]
    const watchtowerCoords = new Set(watchtowerVillages.value.map(w => w.coords))

    // Effective queue = user-configured buildings (priority) + default buildings not already in user queue.
    // This ensures targets never "run out" of buildings after the short user list is satisfied.
    function queueForTarget(target: Target): CatMassBuildingEntry[] {
      const userBuildings = new Set(userQueue.map(e => e.building))
      const defaultExtras: CatMassBuildingEntry[] = DEFAULT_BUILDINGS
        .filter(b => !userBuildings.has(b))
        .map(b => ({ building: b, targetLevel: 0 }))

      if (userQueue.length === 0) {
        // No user config — use defaults with optional watchtower prepend
        const base: CatMassBuildingEntry[] = defaultExtras
        return watchtowerCoords.has(target.coords)
          ? [{ building: 'watchtower', targetLevel: 0 }, ...base]
          : base
      }

      // User has configured priorities — user first, then remaining defaults
      return [...userQueue, ...defaultExtras]
    }

    const tgtState = new Map<string, TgtState>()
    for (const t of catTargets.value) {
      const q = queueForTarget(t)
      tgtState.set(t.id, { queue: q, remaining: q.map(e => catsToReachLevel(e.building, e.targetLevel)), buildingIdx: 0 })
    }

    // Returns the current catTarget for a given target (which building slot we're filling)
    function currentCatTarget(targetId: string): CatTarget | undefined {
      const s = tgtState.get(targetId)!
      if (s.buildingIdx >= s.queue.length) return undefined
      return s.queue[s.buildingIdx].building
    }

    // After assigning `cats` cats to a target, advance its building slot.
    function registerCats(targetId: string, cats: number): void {
      const s = tgtState.get(targetId)!
      s.remaining[s.buildingIdx] -= cats
      while (s.buildingIdx < s.queue.length && s.remaining[s.buildingIdx] <= 0) {
        s.buildingIdx++
      }
    }

    function targetDone(targetId: string): boolean {
      return (tgtState.get(targetId)?.buildingIdx ?? 0) >= (tgtState.get(targetId)?.queue.length ?? 0)
    }

    function resetAllTargets(): void {
      for (const s of tgtState.values()) {
        s.buildingIdx = 0
        s.remaining = s.queue.map(e => catsToReachLevel(e.building, e.targetLevel))
      }
    }

    let pIdx = 0
    let anyAssigned = true
    while (anyAssigned) {
      anyAssigned = false

      // When ALL targets have filled their queue, reset all together and cycle
      if (catTargets.value.every(t => targetDone(t.id))) {
        resetAllTargets()
      }

      for (const target of catTargets.value) {
        if (targetDone(target.id)) continue
        const catTarget = currentCatTarget(target.id)
        if (!catTarget) continue

        let assigned = false
        for (let pi = 0; pi < catPlayers.length && !assigned; pi++) {
          const player = catPlayers[(pIdx + pi) % catPlayers.length]
          const pvs = catByPlayer.get(player)!
          for (const v of pvs) {
            if (usedCatInCatMass.has(v.coords)) continue
            if (nightExclCat(v, target, 'cat', target.arrivalTime)) continue
            const c = emptyComposition()
            c.catapult = v.troops.catapult
            if (!pushCatMassAtk('cat', v, target, c, catTarget)) continue
            usedCatInCatMass.add(v.coords)
            registerCats(target.id, v.troops.catapult)
            pIdx = (pIdx + pi + 1) % catPlayers.length
            anyAssigned = true
            assigned = true
            break
          }
        }
      }
    }

    // ── Post-generation analysis: why are cat squads unused? ─────────────
    {
      const { settings } = worldStore
      const usedCoords = new Set(attacks.value.filter(a => a.catMass && a.type === 'cat').map(a => a.fromVillage.coords))
      const mainMassCoords = new Set(attacks.value.filter(a => !a.catMass && !usedCoords.has(a.fromVillage.coords)).map(a => a.fromVillage.coords))
      const unusedCats = villages.filter(v =>
        !reservedVillages.value.has(v.coords) &&
        !mainMassCoords.has(v.coords) &&
        !usedCoords.has(v.coords) &&
        v.troops.catapult >= presStore.catMinSize
      )
      const latestTarget = [...catTargets.value].sort((a, b) => b.arrivalTime.getTime() - a.arrivalTime.getTime())[0]
      let noSlots = 0, nightExcluded = 0, earliestExcluded = 0
      for (const v of unusedCats) {
        if (latestTarget) {
          const unitBaseSec = settings.unitTimes[speedUnitForType('cat')]
          const dist = calcDistance({ x: v.x, y: v.y }, { x: latestTarget.x, y: latestTarget.y }, settings.mapSize)
          const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
          const sendTime = calcSendTime(latestTarget.arrivalTime, travelSec)
          if (settings.earliestSendEnabled && settings.earliestSendTime) {
            const floor = new Date(settings.earliestSendTime)
            if (!isNaN(floor.getTime()) && sendTime < floor) { earliestExcluded++; continue }
          }
          if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) { nightExcluded++; continue }
        }
        noSlots++
      }
      unusedCatStats.value = { noSlots, nightExcluded, earliestExcluded }
    }
  }

  function clearCatMass(): void {
    attacks.value = attacks.value.filter(a => !a.catMass)
  }

  // ---------------------------------------------------------------------------
  // Manual overrides
  // ---------------------------------------------------------------------------

  function toggleExclude(id: string): void {
    const row = attacks.value.find((r) => r.id === id)
    if (row) row.excluded = !row.excluded
  }

  function patchAttack(id: string, patch: {
    type?:              AttackType
    label?:             string
    color?:             string | null
    composition?:       Partial<AttackComposition>
    arrivalTime?:       Date
    fromVillageCoords?: string
    targetCoords?:      string
  }): void {
    const idx = attacks.value.findIndex(a => a.id === id)
    if (idx === -1) return
    const atk = { ...attacks.value[idx] }
    const s = worldStore.settings

    if (patch.type  !== undefined) atk.type  = patch.type
    if (patch.label !== undefined) atk.label = patch.label || undefined
    if (patch.color !== undefined) atk.color = patch.color ?? undefined

    if (patch.fromVillageCoords !== undefined) {
      const newVillage = villagesStore.villages.find(v => v.coords === patch.fromVillageCoords)
      if (newVillage) {
        atk.fromVillage = newVillage
        atk.distance = calcDistance({ x: newVillage.x, y: newVillage.y }, { x: atk.target.x, y: atk.target.y }, s.mapSize)
        const baseSec = s.unitTimes[atk.speedUnit] ?? s.unitTimes.spear
        atk.travelSeconds = calcTravelSeconds(atk.distance, baseSec, s.worldSpeed, s.unitSpeed)
        atk.sendTime = calcSendTime(atk.arrivalTime, atk.travelSeconds)
      }
    }

    if (patch.targetCoords !== undefined) {
      const newTarget = targets.value.find(t => t.coords === patch.targetCoords)
      if (newTarget) {
        atk.target = newTarget
        atk.distance = calcDistance({ x: atk.fromVillage.x, y: atk.fromVillage.y }, { x: newTarget.x, y: newTarget.y }, s.mapSize)
        const baseSec = s.unitTimes[atk.speedUnit] ?? s.unitTimes.spear
        atk.travelSeconds = calcTravelSeconds(atk.distance, baseSec, s.worldSpeed, s.unitSpeed)
        atk.sendTime = calcSendTime(atk.arrivalTime, atk.travelSeconds)
      }
    }

    if (patch.composition) {
      atk.composition   = { ...atk.composition, ...patch.composition }
      atk.speedUnit     = slowestUnitInComp(atk.composition, s.unitTimes)
      atk.totalUnits    = totalUnits(atk.composition)
      const baseSec     = s.unitTimes[atk.speedUnit] ?? s.unitTimes.spear
      atk.travelSeconds = calcTravelSeconds(atk.distance, baseSec, s.worldSpeed, s.unitSpeed)
      atk.sendTime      = calcSendTime(atk.arrivalTime, atk.travelSeconds)
      const { color, icon } = calcWatchtower(atk.totalUnits, atk.composition.snob > 0)
      atk.watchtowerColor = color
      atk.watchtowerIcon  = icon
      if (patch.composition.snob !== undefined) {
        atk.buildNobles = atk.composition.snob > 0 ? atk.composition.snob : undefined
      }
      if (patch.composition.knight !== undefined) {
        atk.buildPaladin = atk.composition.knight > 0 ? true : undefined
      }
    }

    if (patch.arrivalTime) {
      atk.arrivalTime = patch.arrivalTime
      atk.sendTime    = calcSendTime(atk.arrivalTime, atk.travelSeconds)
    }

    // Refresh SEND_IN_PAST warning
    const now = new Date()
    atk.warnings = atk.warnings.filter(w => w !== 'SEND_IN_PAST')
    if (atk.sendTime < now) atk.warnings.push('SEND_IN_PAST')

    // Replace element to trigger Vue reactivity on computed properties
    attacks.value = attacks.value.map((a, i) => i === idx ? atk : a)
  }

  function addManualAttack(
    targetId:    string,
    fromCoords:  string,
    type:        AttackType,
    comp:        AttackComposition,
    arrivalTime: Date,
  ): boolean {
    const target  = targets.value.find(t => t.id === targetId)
    const village = villagesStore.villages.find(v => v.coords === fromCoords)
    if (!target || !village) return false
    const s = worldStore.settings
    const dist = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, s.mapSize)
    const comp2 = { ...comp }
    const speed   = slowestUnitInComp(comp2, s.unitTimes)
    const baseSec = s.unitTimes[speed] ?? s.unitTimes.spear
    const travelSec = calcTravelSeconds(dist, baseSec, s.worldSpeed, s.unitSpeed)
    const sendTime  = calcSendTime(arrivalTime, travelSec)
    const tu = totalUnits(comp2)
    const { color, icon } = calcWatchtower(tu, comp2.snob > 0)
    const warnings: WarningCode[] = []
    if (sendTime < new Date()) warnings.push('SEND_IN_PAST')
    const buildNobles  = comp2.snob   > 0 ? comp2.snob   : undefined
    const buildPaladin = comp2.knight > 0 ? true         : undefined
    attacks.value.push({
      id: genId(),
      type,
      fromVillage: village,
      target,
      composition: comp2,
      speedUnit: speed,
      totalUnits: tu,
      watchtowerColor: color,
      watchtowerIcon: icon,
      distance: dist,
      travelSeconds: travelSec,
      arrivalTime,
      sendTime,
      warnings,
      excluded: false,
      ...(buildNobles  ? { buildNobles  } : {}),
      ...(buildPaladin ? { buildPaladin } : {}),
    })
    return true
  }

  function swapAttackTimes(idA: string, idB: string): void {
    const a = attacks.value.find(x => x.id === idA)
    const b = attacks.value.find(x => x.id === idB)
    if (!a || !b) return
    const tmpArr = a.arrivalTime
    a.arrivalTime = b.arrivalTime
    b.arrivalTime = tmpArr
    a.sendTime = calcSendTime(a.arrivalTime, a.travelSeconds)
    b.sendTime = calcSendTime(b.arrivalTime, b.travelSeconds)
  }

  function removeAttack(id: string): void {
    attacks.value = attacks.value.filter(a => a.id !== id)
  }

  function clearTargets(): void {
    targets.value = []
    attacks.value = []
    noblePlacements.value = []
    paladinPlacements.value = []
    generationIssues.value = []
    saveTargets()
  }

  function resetGenerated(): void {
    attacks.value = []
    noblePlacements.value = []
    paladinPlacements.value = []
    generationIssues.value = []
  }

  function resolveAllFromMap(): number {
    const enemyStore = useEnemyDataStore()
    let count = 0
    for (const t of targets.value) {
      const info = enemyStore.lookupCoords(t.coords)
      if (!info?.player && !info?.ally) continue
      const patch: Parameters<typeof updateTarget>[1] = {}
      if (info.player) patch.enemyPlayer = info.player.name
      if (info.ally)   patch.enemyAllyTag = info.ally.tag
      updateTarget(t.id, patch)
      const tower = watchtowerVillages.value.find((w) => w.coords === t.coords)
      if (tower && info.player) updateWatchtowerVillage(tower.id, { player: info.player.name })
      count++
    }
    for (const t of catTargets.value) {
      const info = enemyStore.lookupCoords(t.coords)
      if (!info?.player && !info?.ally) continue
      const patch: Parameters<typeof updateCatTarget>[1] = {}
      if (info.player) patch.enemyPlayer = info.player.name
      if (info.ally)   patch.enemyAllyTag = info.ally.tag
      updateCatTarget(t.id, patch)
      count++
    }
    for (const wt of watchtowerVillages.value) {
      const info = enemyStore.lookupCoords(wt.coords)
      if (!info?.player) continue
      if (!targets.value.find((t) => t.coords === wt.coords)) {
        updateWatchtowerVillage(wt.id, { player: info.player.name })
        count++
      }
    }
    return count
  }

  function resetAll(): void {
    targets.value = []
    playerData.value = []
    watchtowerVillages.value = []
    resetGenerated()
    saveTargets()
    savePlayerData()
    saveWatchtowerVillages()
  }

  // ---------------------------------------------------------------------------
  // Computed summaries
  // ---------------------------------------------------------------------------

  // openOrdersTo[player] = set of friendly players that `player` must open orders to
  // (all other tribe members who are also attacking the same target villages with real attacks)
  const openOrdersTo = computed(() => {
    // Step 1: per target → set of players with real (non-spam) attacks on it
    const targetPlayers = new Map<string, Set<string>>()
    for (const atk of attacks.value) {
      if (atk.excluded) continue
      if (atk.type === 'spam') continue
      const tid = atk.target.id
      if (!targetPlayers.has(tid)) targetPlayers.set(tid, new Set())
      targetPlayers.get(tid)!.add(atk.fromVillage.player)
    }
    // Step 2: for each player, collect all co-attackers across all shared targets
    const m = new Map<string, Set<string>>()
    for (const players of targetPlayers.values()) {
      if (players.size < 2) continue
      for (const p of players) {
        if (!m.has(p)) m.set(p, new Set())
        for (const other of players) {
          if (other !== p) m.get(p)!.add(other)
        }
      }
    }
    return m
  })

  const attacksByTarget = computed(() => {
    const m = new Map<string, Attack[]>()
    for (const a of attacks.value) {
      const list = m.get(a.target.id) ?? []
      list.push(a)
      m.set(a.target.id, list)
    }
    return m
  })

  // Targets that have at least one critical issue (no offs at all)
  const uncoveredTargetCoords = computed(() => {
    const s = new Set<string>()
    for (const issue of generationIssues.value) {
      if (issue.type === 'OFFS_SHORT' && issue.generated === 0) {
        s.add(issue.targetCoords)
      }
    }
    return s
  })

  // ── Диагностика недобитых целей: ПОЧЕМУ не хватило оффов ─────────────────
  // Пост-анализ по финальному состоянию: для каждой цели с нехваткой оффов
  // классифицируем доминирующую причину, перепроверяя исходный пул.
  const targetShortageDiagnosis = computed<Map<string, ShortageDiag>>(() => {
    const settings  = useWorldStore().settings
    const presStore = usePresetsStore()
    const villages  = villagesStore.villages
    const map = new Map<string, ShortageDiag>()

    // Полные оффы в пуле (не зарезервированные)
    const eligible = villages.filter(v =>
      !reservedVillages.value.has(v.coords) &&
      calcOffFarm(v.troops, settings.unitPop) >= presStore.fullOffMinOffFarm && v.troops.ram > 0)
    const nobleVirtual = (settings.noblePollMode ?? 'real') !== 'real'
    // Деревни с физ. дворами в пуле
    const nobleVils = villages.filter(v => !reservedVillages.value.has(v.coords) && v.troops.snob > 0)
    // Пул дворов: реальный = сумма физ. дворов; виртуальный = бюджет игроков
    // (pd.totalNobles, иначе физ. дворы игрока — как строится virtualNoblePool).
    let noblesTotal: number
    if (!nobleVirtual) {
      noblesTotal = nobleVils.reduce((s, v) => s + v.troops.snob, 0)
    } else {
      const physPerPlayer = new Map<string, number>()
      for (const v of villages) {
        if (reservedVillages.value.has(v.coords)) continue
        physPerPlayer.set(v.player, (physPerPlayer.get(v.player) ?? 0) + v.troops.snob)
      }
      noblesTotal = 0
      for (const player of new Set(villages.map(v => v.player))) {
        const pd = playerData.value.find(p => p.player === player)
        noblesTotal += pd?.totalNobles ?? (physPerPlayer.get(player) ?? 0)
      }
    }
    // Дворов уже разослано в плане (сумма snob по всем атакам)
    const noblesUsed = attacks.value.reduce((s, a) => s + (a.composition.snob ?? 0), 0)
    // Деревни, уже задействованные под офф-атаки в плане
    const usedCoords = new Set(
      attacks.value.filter(a => a.type === 'off' || a.type === 'paladin_off').map(a => a.fromVillage.coords))

    // Отправка укладывается по ночным/старту для пары (деревня, цель)?
    const offSpeed = settings.unitTimes[speedUnitForType('off')]
    const floor = settings.earliestSendEnabled && settings.earliestSendTime ? new Date(settings.earliestSendTime) : null
    const legalSend = (v: Village, t: Target): boolean => {
      const dist = calcDistance({ x: v.x, y: v.y }, { x: t.x, y: t.y }, settings.mapSize)
      const travelSec = calcTravelSeconds(dist, offSpeed, settings.worldSpeed, settings.unitSpeed)
      const sendTime = calcSendTime(t.arrivalTime, travelSec)
      if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) return false
      if (floor && !isNaN(floor.getTime()) && sendTime < floor) return false
      return true
    }

    const targetByCoords = new Map(targets.value.filter(t => t.coords).map(t => [t.coords, t]))
    // Агрегируем по цели (у цели несколько слотов → несколько issue)
    const shortByTarget = new Map<string, { requested: number; generated: number }>()
    for (const issue of generationIssues.value) {
      if (issue.type !== 'OFFS_SHORT') continue
      const ex = shortByTarget.get(issue.targetCoords) ?? { requested: 0, generated: 0 }
      ex.requested += issue.requested; ex.generated += issue.generated
      shortByTarget.set(issue.targetCoords, ex)
    }

    for (const [coords, agg] of shortByTarget) {
      const t = targetByCoords.get(coords)
      if (!t) continue

      const reachable = eligible.filter(v => legalSend(v, t))
      const free = reachable.filter(v => !usedCoords.has(v.coords))
      const inRange = (v: Village) =>
        calcDistance({ x: v.x, y: v.y }, { x: t.x, y: t.y }, settings.mapSize) <= settings.snobMaxDist

      // Кандидаты-носители двора в радиусе хода дворян:
      //  реальный режим — деревни с физ. дворами; виртуальный — любые офф-деры.
      let nobleVilInRange: number
      let nobleSnobInRange: number
      if (!nobleVirtual) {
        const nir = nobleVils.filter(inRange)
        nobleVilInRange = nir.length
        nobleSnobInRange = nir.reduce((s, v) => s + v.troops.snob, 0)
      } else {
        nobleVilInRange = eligible.filter(inRange).length      // офф-дер-кандидатов в радиусе
        nobleSnobInRange = free.filter(inRange).length          // из них свободных
      }

      let reason: ShortageDiag['reason']
      let label: string
      let detail: string
      if (eligible.length === 0) {
        reason = 'no_eligible'; label = 'Нет полных оффов в пуле'
        detail = 'Импортированные деревни не дотягивают до порога Full_OFF или без таранов.'
      } else if (reachable.length === 0) {
        reason = 'timing'; label = 'Не укладываются по времени'
        detail = `Все ${eligible.length} оффов отправлялись бы в ночь или раньше «Старт не ранее». Разнесите время прихода или ослабьте ограничения.`
      } else if (free.length === 0) {
        reason = 'depleted'; label = 'Оффы разобраны другими целями'
        detail = `${reachable.length} легальных оффов были, но ушли на другие цели. Пул оффов исчерпан под эти параметры.`
      } else if (nobleVilInRange === 0) {
        reason = 'no_noble'; label = 'Дворы не достают'
        detail = nobleVirtual
          ? `Оффы свободны (${free.length}), но нет офф-деры в ${settings.snobMaxDist} клетках от цели — виртуальным дворам неоткуда стартовать (двор всё равно ограничен ходом). Дальняя для дворов цель.`
          : `Оффы свободны (${free.length}), но нет деревни с дворами в ${settings.snobMaxDist} клетках. Дальняя для дворов цель.`
      } else if (noblesTotal - noblesUsed <= 0) {
        reason = 'nobles_short'; label = 'Дворы кончились'
        detail = nobleVirtual
          ? `Оффы свободны (${free.length}), но весь виртуальный бюджет дворов (${noblesTotal}) уже распределён.`
          : `Оффы свободны (${free.length}), но все дворы (${noblesTotal}) уже разошлись по другим целям.`
      } else {
        reason = 'nobles_short'; label = 'Не хватило дворов'
        detail = nobleVirtual
          ? `Оффы свободны (${free.length}). Офф-дер в радиусе: ${nobleVilInRange} (свободных ${nobleSnobInRange}) — ближние цели разобрали и деры-носители, и бюджет дворов.`
          : `Оффы свободны (${free.length}). Дворов в радиусе: ${nobleSnobInRange} (деревень ${nobleVilInRange}) — их разобрали ближние цели.`
      }

      map.set(coords, {
        reason, label, detail,
        eligible: eligible.length, reachable: reachable.length, free: free.length,
        nobleVirtual, nobleVilInRange, nobleSnobInRange, noblesUsed, noblesTotal,
        needed: agg.requested, generated: agg.generated,
      })
    }
    return map
  })

  const attacksByPlayer = computed(() => {
    const m = new Map<string, Attack[]>()
    for (const a of attacks.value) {
      const list = m.get(a.fromVillage.player) ?? []
      list.push(a)
      m.set(a.fromVillage.player, list)
    }
    return m
  })

  // ── Pool usage stats (total vs used after generation) ────────────────────
  const poolUsageStats = computed(() => {
    const presStore = usePresetsStore()
    const villages  = villagesStore.villages

    // Eligible by threshold (reserved villages excluded from pool)
    const { unitPop } = useWorldStore().settings
    const eligibleOffCoords = new Set<string>()
    let reservedOffCount = 0
    for (const v of villages) {
      if (calcOffFarm(v.troops, unitPop) >= presStore.fullOffMinOffFarm && v.troops.ram > 0) {
        if (reservedVillages.value.has(v.coords)) { reservedOffCount++; continue }
        eligibleOffCoords.add(v.coords)
      }
    }

    let noblesTotal = 0
    for (const v of villages) {
      if (!reservedVillages.value.has(v.coords)) noblesTotal += v.troops.snob
    }

    const usedOffCoords = new Set<string>()
    const usedCatCoords = new Set<string>()
    let noblesUsed = 0
    for (const atk of attacks.value) {
      if (atk.excluded) continue
      if (atk.type === 'off' || atk.type === 'paladin_off') usedOffCoords.add(atk.fromVillage.coords)
      if (atk.type === 'cat') usedCatCoords.add(atk.fromVillage.coords)
      if (!reservedVillages.value.has(atk.fromVillage.coords)) noblesUsed += atk.composition.snob
    }

    // Total = union of threshold-eligible and actually used (used may include custom_off villages)
    const offsTotalSet = new Set([...eligibleOffCoords, ...usedOffCoords])
    const offsTotal = offsTotalSet.size

    const nobleVillagesTotal = villages.filter(v => v.troops.snob > 0).length

    // Cat squads: villages with enough cats (not reserved, not already used in main mass)
    const catMinSize = presStore.catMinSize
    const mainMassCoords = new Set(
      attacks.value.filter(a => !a.excluded && !a.catMass).map(a => a.fromVillage.coords)
    )
    const catEligibleCoords = villages.filter(v =>
      !reservedVillages.value.has(v.coords) &&
      !mainMassCoords.has(v.coords) &&
      v.troops.catapult >= catMinSize
    ).map(v => v.coords)
    const catSquadsTotal = catEligibleCoords.length

    // Coordinates of eligible villages that were NOT used in the plan — for copy.
    const unusedOffCoords = [...offsTotalSet].filter(c => !usedOffCoords.has(c)).sort()
    const unusedCatCoords = catEligibleCoords.filter(c => !usedCatCoords.has(c)).sort()

    return {
      offsTotal,
      offsUsed: usedOffCoords.size,
      offsAvailable: offsTotal - usedOffCoords.size,
      reservedOffCount,
      unusedOffCoords,

      noblesTotal,
      noblesUsed,
      noblesAvailable: noblesTotal - noblesUsed,
      nobleVillagesTotal,

      catSquadsTotal,
      catSquadsUsed: usedCatCoords.size,
      catSquadsLeft: catSquadsTotal - usedCatCoords.size,
      unusedCatCoords,
    }
  })

  const catMassStats = computed(() => {
    const presStore = usePresetsStore()
    const { unitPop } = useWorldStore().settings
    const { villages } = villagesStore

    const usedCoords = new Set(
      attacks.value.filter(a => !a.excluded).map(a => a.fromVillage.coords)
    )
    const catMinSize = presStore.catMinSize

    const availableOffs = villages.filter(v =>
      !reservedVillages.value.has(v.coords) &&
      !usedCoords.has(v.coords) &&
      calcOffFarm(v.troops, unitPop) >= presStore.smallOffMinOffFarm &&
      v.troops.ram > 0
    ).length

    const availableCats = villages.filter(v =>
      !reservedVillages.value.has(v.coords) &&
      !usedCoords.has(v.coords) &&
      v.troops.catapult >= catMinSize
    ).length

    const catMassAtks = attacks.value.filter(a => a.catMass)
    return {
      availableOffs,
      availableCats,
      catMassOffs: catMassAtks.filter(a => a.type === 'off').length,
      catMassCats: catMassAtks.filter(a => a.type === 'cat').length,
      catTargetsCount: catTargets.value.length,
      isGenerated: catMassAtks.length > 0,
    }
  })


  // ---------------------------------------------------------------------------
  // Export / Import plan file
  // ---------------------------------------------------------------------------

  function exportPlan(): void {
    // Flush planStore in-memory refs so the localStorage snapshot is current.
    saveTargets(); saveCatTargets(); savePlayerData()
    saveWatchtowerVillages(); saveAttacks()

    // v2: verbatim snapshot of every plan-defining localStorage key, so loading
    // reproduces the sender's entire configuration (presets, mass templates,
    // player data, reserves, world settings, villages, …).
    const storage: Record<string, string> = {}
    for (const key of PLAN_EXPORT_KEYS) {
      const val = localStorage.getItem(key)
      if (val !== null) storage[key] = val
    }
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      storage,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date()
    const stamp = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}_${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`
    a.href = url
    a.download = `vp_plan_${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importPlan(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target!.result as string)

          // v2: full-config snapshot — replace every plan-defining localStorage
          // key and reload so all stores re-init from the imported state.
          if (data.storage && typeof data.storage === 'object') {
            for (const key of PLAN_EXPORT_KEYS) localStorage.removeItem(key)
            for (const [key, val] of Object.entries(data.storage as Record<string, unknown>)) {
              if (PLAN_EXPORT_KEYS.includes(key as typeof PLAN_EXPORT_KEYS[number]) && typeof val === 'string') {
                localStorage.setItem(key, val)
              }
            }
            resolve()
            window.location.reload()
            return
          }

          // v1 (legacy): partial plan — targets/attacks/playerData/watchtower only.
          if (!data.version || !Array.isArray(data.targets) || !Array.isArray(data.attacks)) {
            reject(new Error('Неверный формат файла'))
            return
          }
          // Restore targets
          targets.value = (data.targets as any[]).map(t => ({
            ...t, arrivalTime: new Date(t.arrivalTime),
          }))
          saveTargets()
          // Restore player data
          if (Array.isArray(data.playerData)) {
            playerData.value = data.playerData
            savePlayerData()
          }
          // Restore watchtower villages
          if (Array.isArray(data.watchtowerVillages)) {
            watchtowerVillages.value = data.watchtowerVillages
            saveWatchtowerVillages()
          }
          // Restore attacks — re-link live village/target where possible
          attacks.value = (data.attacks as any[]).map(a => {
            const liveVillage = villagesStore.villages.find(v => v.coords === a.fromVillage?.coords)
            const liveTarget  = targets.value.find(t => t.id === a.target?.id)
            return {
              ...a,
              arrivalTime: new Date(a.arrivalTime),
              sendTime:    new Date(a.sendTime),
              fromVillage: liveVillage ?? a.fromVillage,
              target: liveTarget ?? { ...a.target, arrivalTime: new Date(a.target.arrivalTime) },
            } as Attack
          })
          resolve()
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Ошибка чтения файла'))
      reader.readAsText(file)
    })
  }

  // ── Coverage estimate: max targets the current mass config can cover ────────
  const offPoolStats = computed<OffPoolStats>(() => {
    const presStore = usePresetsStore()
    const ws = useWorldStore().settings
    const tags = buildPoolTags(
      villagesStore.villages, playerData.value,
      presStore.fullOffMinOffFarm, presStore.breachMinRams, ws.unitPop,
    )
    const stats: OffPoolStats = { breachPal: 0, palOnly: 0, breachOnly: 0, fullOnly: 0 }
    for (const tag of tags.values()) {
      if      (tag === 'breach+pal') stats.breachPal++
      else if (tag === 'pal_off')    stats.palOnly++
      else if (tag === 'breach_off') stats.breachOnly++
      else                           stats.fullOnly++
    }
    return stats
  })

  const poolStatsByPlayer = computed<Map<string, { pal: number; breach: number; breachPal: number }>>(() => {
    const presStore = usePresetsStore()
    const ws = useWorldStore().settings
    const tags = buildPoolTags(
      villagesStore.villages, playerData.value,
      presStore.fullOffMinOffFarm, presStore.breachMinRams, ws.unitPop,
    )
    const m = new Map<string, { pal: number; breach: number; breachPal: number }>()
    const get = (p: string) => { if (!m.has(p)) m.set(p, { pal: 0, breach: 0, breachPal: 0 }); return m.get(p)! }
    for (const v of villagesStore.villages) {
      const tag = tags.get(v.coords)
      if      (tag === 'breach+pal') { get(v.player).breachPal++ }
      else if (tag === 'pal_off')    { get(v.player).pal++ }
      else if (tag === 'breach_off') { get(v.player).breach++ }
    }
    return m
  })
  const breachPalByPlayer = computed(() => new Map([...poolStatsByPlayer.value].map(([p, s]) => [p, s.breachPal])))

  const palVillageCoords = computed<Set<string>>(() => {
    const presStore = usePresetsStore()
    const ws = useWorldStore().settings
    const tags = buildPoolTags(
      villagesStore.villages, playerData.value,
      presStore.fullOffMinOffFarm, presStore.breachMinRams, ws.unitPop,
    )
    const s = new Set<string>()
    for (const [coords, tag] of tags) {
      if (tag === 'pal_off' || tag === 'breach+pal') s.add(coords)
    }
    return s
  })

  return {
    // State
    targets,
    catTargets,
    playerData,
    watchtowerVillages,
    reservedVillages,
    attacks,
    noblePlacements,
    paladinPlacements,
    // Targets
    addTarget,
    addEmptyTarget,
    removeTarget,
    setTargetMuted,
    updateTarget,
    // Player data
    setPlayerData,
    getPlayerData,
    playerDataMap,
    // Watchtower villages
    importWatchtowerVillages,
    addWatchtowerVillage,
    updateWatchtowerVillage,
    removeWatchtowerVillage,
    clearWatchtowerVillages,
    // Plan
    generate,
    generateCatMass,
    clearCatMass,
    resolveAllFromMap,
    toggleExclude,
    clearTargets,
    resetGenerated,
    resetAll,
    offDistribution,
    setOffDistribution,
    planWaves,
    addWave,
    removeWave,
    moveWave,
    updateWaveSettings,
    selectedWaveId,
    setSelectedWave,
    ensureSelectedWave,
    nobleRecommendations,
    // Computed
    attacksByTarget,
    attacksByPlayer,
    openOrdersTo,
    generationIssues,
    unusedOffStats,
    unusedCatStats,
    uncoveredTargetCoords,
    targetShortageDiagnosis,
    offPoolStats,
    breachPalByPlayer,
    palVillageCoords,
    poolStatsByPlayer,
    poolUsageStats,
    catMassStats,

    // Reserved villages
    setReservedVillages,
    clearReservedVillages,
    // Cat targets CRUD
    addCatTarget,
    addEmptyCatTarget,
    removeCatTarget,
    updateCatTarget,
    clearCatTargets,
    // Cat mass building queue
    catMassBuildingQueue,
    addCatMassBuilding,
    removeCatMassBuilding,
    setCatMassBuildingTarget,
    moveCatMassBuilding,

    patchAttack,
    swapAttackTimes,
    removeAttack,
    addManualAttack,
    exportPlan,
    importPlan,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlanStore, import.meta.hot))
}
