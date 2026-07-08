import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useWorldStore } from './worldStore'
import { useVillagesStore } from './villagesStore'
import type { Village, VillageTroops } from './villagesStore'
import type { UnitPop } from './worldStore'
import { useMassConfigStore } from './massConfigStore'
import { usePresetsStore } from './presetsStore'
import type { VillageRole } from './presetsStore'
import { defaultColorForRole } from './presetsStore'
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

export interface GenerationIssue {
  targetCoords: string
  type: GenerationIssueType
  requested: number
  generated: number
  offsReason?: OffsShortReason  // only for OFFS_SHORT with generated === 0
  slotName?: string
}

// ---------------------------------------------------------------------------
// Attack types
// ---------------------------------------------------------------------------

export type AttackType =
  | 'off'               // regular off (axes + LC + rams)
  | 'paladin_off'       // off with offensive paladin (wall-busting priority)
  | 'split_off_rams'    // split off part 1 — rams + half troops
  | 'split_off_rest'    // split off part 2 — rest of troops (faster, no rams)
  | 'noble_green_strong'  // noble + 999 escort (anti-cut)
  | 'noble_green_weak'    // noble + small escort (50 troops)
  | 'noble_orange'        // noble + 1001–5000 troops
  | 'noble_red'           // noble + full off (5001+)
  | 'spam'              // fake attack (min troops + 1 ram)
  | 'spam_noble'        // noble on decoy target

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
  level: number  // 0–20; equals detection radius in fields
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
  nobleVillageCoords?: string  // manual noble village assignment
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
  warnings: WarningCode[]
  excluded: boolean
  label?: string
  color?: string          // display color for badge + BB code
  buildNobles?: number    // player needs to build this many nobles in fromVillage before sending
  buildPaladin?: boolean  // player needs to recruit a paladin in fromVillage before sending
  trainGroupId?: string   // shared by all attacks of the same spam train run
}

// ---------------------------------------------------------------------------
// Player-level additional data (beyond CSV)
// ---------------------------------------------------------------------------

export interface PlayerData {
  player: string
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

// Determine speed unit for a composition (slowest meaningful unit for attack type)
function speedUnitForType(type: AttackType): keyof VillageTroops {
  switch (type) {
    case 'noble_green_strong':
    case 'noble_green_weak':
    case 'noble_orange':
    case 'noble_red':
    case 'spam_noble':
      return 'snob'
    case 'split_off_rest':
      return 'light'
    default:
      return 'ram'
  }
}

// Returns the slowest unit in the composition (highest unitTimes value among units with count > 0).
function slowestUnitInComp(comp: AttackComposition, unitTimes: Record<string, number>): keyof VillageTroops {
  const keys = (Object.keys(comp) as Array<keyof VillageTroops>).filter(k => comp[k] > 0)
  if (keys.length === 0) return 'spear'
  return keys.reduce((s, k) => (unitTimes[k] ?? 0) > (unitTimes[s] ?? 0) ? k : s)
}

// Build composition for a noble attack given type, available resources, escort unit
function buildNobleComposition(
  type: AttackType,
  available: AttackComposition,
  escortUnit: keyof AttackComposition,
  nobleCount: number,
): AttackComposition {
  const c = emptyComposition()
  c.snob = Math.min(nobleCount, available.snob)
  if (c.snob === 0) return c

  switch (type) {
    case 'noble_green_strong': {
      // noble(s) + fill escortUnit up to 999 per noble, max available
      const maxEscort = Math.min(available[escortUnit], 999 * c.snob)
      c[escortUnit] = maxEscort
      break
    }
    case 'noble_green_weak': {
      // noble + ~50 of escort unit
      const weakEscort = Math.min(available[escortUnit], 50 * c.snob)
      c[escortUnit] = weakEscort
      break
    }
    case 'noble_orange': {
      // noble + fill to reach ~1001 total (fill with escortUnit + overflow to axe/light)
      const target = 1001
      let fill = Math.min(available[escortUnit], target - c.snob)
      c[escortUnit] = fill
      if (totalUnits(c) < target) {
        const secondary: Array<keyof AttackComposition> = ['axe', 'light', 'sword', 'spear']
        for (const u of secondary) {
          if (u === escortUnit) continue
          const need = target - totalUnits(c)
          if (need <= 0) break
          c[u] = Math.min(available[u], need)
        }
      }
      break
    }
    case 'noble_red': {
      // noble + everything available (full off)
      c.axe = available.axe
      c.light = available.light
      c.heavy = available.heavy
      c.ram = available.ram
      break
    }
    case 'spam_noble': {
      // noble + minimal escort (20–50 spear/axe)
      c[escortUnit] = Math.min(available[escortUnit], 50)
      break
    }
    default:
      break
  }
  return c
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_TARGETS = 'vp_targets'
const LS_PLAYER_DATA = 'vp_player_data'
const LS_WATCHTOWER = 'vp_watchtower'
const LS_SPAM_NOBLE_TARGETS = 'vp_spam_noble_targets'
const LS_OFF_DISTRIBUTION = 'vp_off_distribution'
const LS_ATTACKS = 'vp_attacks'

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

function loadSpamNobleTargets(): Target[] {
  try {
    const raw = localStorage.getItem(LS_SPAM_NOBLE_TARGETS)
    if (raw) {
      const parsed = JSON.parse(raw) as Array<Omit<Target, 'arrivalTime'> & { arrivalTime: string }>
      return parsed.map((t) => ({ ...t, arrivalTime: new Date(t.arrivalTime) }))
    }
  } catch { /* ignore */ }
  return []
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlanStore = defineStore('plan', () => {
  const worldStore = useWorldStore()
  const villagesStore = useVillagesStore()

  // Persisted state
  const targets = ref<Target[]>(loadTargets())
  const spamNobleTargets = ref<Target[]>(loadSpamNobleTargets())
  const playerData = ref<PlayerData[]>(loadPlayerData())
  const watchtowerVillages = ref<WatchtowerVillage[]>(loadWatchtowerVillages())
  const offDistribution = ref<'default' | 'fair' | 'far_first'>(
    (localStorage.getItem(LS_OFF_DISTRIBUTION) as 'default' | 'fair' | 'far_first' | null) ?? 'far_first',
  )

  function setOffDistribution(mode: 'default' | 'fair' | 'far_first') {
    offDistribution.value = mode
    localStorage.setItem(LS_OFF_DISTRIBUTION, mode)
  }


  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function saveTargets() {
    localStorage.setItem(LS_TARGETS, JSON.stringify(targets.value))
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

  function saveSpamNobleTargets() {
    localStorage.setItem(LS_SPAM_NOBLE_TARGETS, JSON.stringify(spamNobleTargets.value))
  }

  // ---------------------------------------------------------------------------
  // Targets CRUD
  // ---------------------------------------------------------------------------

  function addTarget(coords: string, arrivalTime: Date, options?: Partial<Omit<Target, 'id' | 'coords' | 'arrivalTime' | 'x' | 'y'>>): Target | null {
    const xy = coordsToXY(coords)
    if (!xy) return null
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

  function updateTarget(id: string, patch: Partial<Omit<Target, 'id'>>) {
    const t = targets.value.find((t) => t.id === id)
    if (!t) return
    Object.assign(t, patch)
    if (patch.coords) {
      const xy = coordsToXY(patch.coords)
      if (xy) { t.x = xy.x; t.y = xy.y }
    }
    saveTargets()
  }

  // ---------------------------------------------------------------------------
  // Spam noble targets CRUD
  // ---------------------------------------------------------------------------

  function addEmptySpamNobleTarget(arrivalTime: Date): Target {
    const t: Target = { id: genId(), coords: '', x: 0, y: 0, arrivalTime }
    spamNobleTargets.value.push(t)
    saveSpamNobleTargets()
    return t
  }

  function addSpamNobleTarget(coords: string, arrivalTime: Date): Target | null {
    const xy = coordsToXY(coords)
    if (!xy) return null
    const t: Target = { id: genId(), coords, x: xy.x, y: xy.y, arrivalTime }
    spamNobleTargets.value.push(t)
    saveSpamNobleTargets()
    return t
  }

  function updateSpamNobleTarget(id: string, patch: Partial<Omit<Target, 'id'>>) {
    const t = spamNobleTargets.value.find((t) => t.id === id)
    if (!t) return
    Object.assign(t, patch)
    if (patch.coords) {
      const xy = coordsToXY(patch.coords)
      if (xy) { t.x = xy.x; t.y = xy.y }
    }
    saveSpamNobleTargets()
  }

  function removeSpamNobleTarget(id: string) {
    spamNobleTargets.value = spamNobleTargets.value.filter((t) => t.id !== id)
    saveSpamNobleTargets()
  }

  function clearSpamNobleTargets() {
    spamNobleTargets.value = []
    saveSpamNobleTargets()
  }

  // ---------------------------------------------------------------------------
  // Player data CRUD
  // ---------------------------------------------------------------------------

  function setPlayerData(player: string, data: Partial<Omit<PlayerData, 'player'>>) {
    const existing = playerData.value.find((p) => p.player === player)
    if (existing) {
      Object.assign(existing, data)
    } else {
      playerData.value.push({ player, totalNobles: 0, ...data })
    }
    savePlayerData()
  }

  function getPlayerData(player: string): PlayerData {
    return playerData.value.find((p) => p.player === player)
      ?? { player, totalNobles: 0 }
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
  ): { detected: boolean; chord: number } {
    const s = worldStore.settings
    if (!s.watchtowerEnabled || watchtowerVillages.value.length === 0) return { detected: false, chord: 0 }
    const dx = toX - fromX
    const dy = toY - fromY
    const segLen2 = dx * dx + dy * dy
    let totalChord = 0
    let detected   = false
    for (const wt of watchtowerVillages.value) {
      if (wt.level <= 0) continue
      if (targetPlayer && wt.player !== targetPlayer) continue
      const R  = wt.level
      const fx = fromX - wt.x
      const fy = fromY - wt.y
      if (segLen2 === 0) { if (fx * fx + fy * fy <= R * R) detected = true; continue }
      const a    = segLen2
      const b    = 2 * (fx * dx + fy * dy)
      const c    = fx * fx + fy * fy - R * R
      const disc = b * b - 4 * a * c
      if (disc < 0) continue
      const sqrtDisc = Math.sqrt(disc)
      const t1 = (-b - sqrtDisc) / (2 * a)
      const t2 = (-b + sqrtDisc) / (2 * a)
      const tEnter = Math.max(0, t1)
      const tExit  = Math.min(1, t2)
      if (tEnter >= tExit) continue
      totalChord += (tExit - tEnter) * Math.sqrt(segLen2)
      detected = true
    }
    return { detected, chord: totalChord }
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
    const cfg = mcStore.active
    if (!cfg) return

    const { settings } = worldStore
    const { villages } = villagesStore
    const now = new Date()
    const result: Attack[] = []
    const newNoblePlacements: NoblePlacement[] = []
    const genIssues: GenerationIssue[] = []

    // Pool: available troops per village (consumed as attacks are assigned)
    const pool = new Map<string, AttackComposition>()
    for (const v of villages) pool.set(v.coords, { ...v.troops })

    // Virtual noble pool keyed by player — capacity depends on noblePollMode:
    //   real:    sum of built snobs from CSV
    //   virtual: totalNobles only — fully trust the imported field, ignore CSV
    const noblePollMode = settings.noblePollMode ?? 'real'
    const virtualNoblePool = new Map<string, number>()
    for (const v of villages) {
      virtualNoblePool.set(v.player, (virtualNoblePool.get(v.player) ?? 0) + v.troops.snob)
    }
    if (noblePollMode === 'virtual') {
      for (const pd of playerData.value) {
        if (!pd.totalNobles) continue
        virtualNoblePool.set(pd.player, pd.totalNobles)
      }
    }

    // Attacker points per player (for morale)
    const attackerPoints = new Map<string, number>()
    if (settings.moraleEnabled) {
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
    // Prefers 1 ram or 1 catapult (siege deducted from pool), but sends without
    // siege if none available — player can build siege in ~5 min before sending.
    // Returns null only if not enough troops to meet minAttackSize.
    function buildSpamComp(a: AttackComposition): AttackComposition | null {
      const up = settings.unitPop
      const c = emptyComposition()
      if (a.ram >= 1) {
        c.ram = 1
      } else if (a.catapult >= 1) {
        c.catapult = 1
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
      _buildNobles?: number, trainGroupId?: string,
    ): boolean {
      const speedUnit   = slowestUnitInComp(composition, settings.unitTimes)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist        = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec   = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime    = calcSendTime(arrivalTime, travelSec)

      // Night exclude mode: skip this village if send time falls in night window
      if (settings.sendExcludeEnabled) {
        if (isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) return false
      }

      const total       = totalUnits(composition)
      const pop         = totalPop(composition, settings.unitPop)
      if (pop < settings.minAttackSize) return false
      const { color: wtColor, icon: wtIcon } = calcWatchtower(total, composition.snob > 0)

      const warnings: WarningCode[] = []
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(arrivalTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime,    settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_SEND')
      }
      if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
        const { detected } = calcWatchtowerExposure(village.x, village.y, target.x, target.y, target.enemyPlayer)
        if (detected) warnings.push('WATCHTOWER_HIT')
      }
      if (settings.moraleEnabled && target.enemyPlayer) {
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
        ...(buildNobles    ? { buildNobles    } : {}),
        ...(buildPaladin   ? { buildPaladin   } : {}),
        ...(trainGroupId   ? { trainGroupId   } : {}),
      })
      return true
    }

    // ── nightExcludes pre-check (call BEFORE pool mutation) ──────────────
    function nightExcludes(village: Village, target: Target, type: AttackType, arrivalTime: Date): boolean {
      if (!settings.sendExcludeEnabled) return false
      const unitBaseSec = settings.unitTimes[speedUnitForType(type)]
      const dist = calcDistance({ x: village.x, y: village.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      return isInNightWindow(calcSendTime(arrivalTime, travelSec), settings.nightFrom, settings.nightTo)
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
        if (nightExcludes(v, target, 'noble_green_strong', arrT)) continue
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
    const validTargets = targets.value.filter(t => !!t.coords)

    for (const target of validTargets) {
      const distMap = new Map<string, number>()
      const wtMap   = new Map<string, number>()
      for (const v of villages) {
        const d = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
        distMap.set(v.coords, d)
        if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
          const { detected, chord } = calcWatchtowerExposure(v.x, v.y, target.x, target.y, target.enemyPlayer)
          wtMap.set(v.coords, detected ? 1_000_000 + chord : 0)
        }
      }
      const byDist = [...villages].sort((a, b) => {
        const sa = (wtMap.get(a.coords) ?? 0) + (distMap.get(a.coords) ?? 0)
        const sb = (wtMap.get(b.coords) ?? 0) + (distMap.get(b.coords) ?? 0)
        return sa - sb
      })
      const byDistFar = [...byDist].reverse()
      const nobleVillages = byDist.filter(v => (distMap.get(v.coords) ?? 0) <= settings.snobMaxDist)
      targetDataMap.set(target.id, { byDist, byDistFar, nobleVillages, distMap, wtMap })
    }

    // Score for (village, target) pair used in global assignment
    function pairScore(vCoords: string, targetId: string): number {
      const td = targetDataMap.get(targetId)
      if (!td) return Infinity
      return (td.wtMap.get(vCoords) ?? 0) + (td.distMap.get(vCoords) ?? 0)
    }

    // ── Global sorted slots ───────────────────────────────────────────────
    const globalOrderedSlots = [...cfg.slots]
      .filter(s => s.enabled)
      .map((s, origIdx) => ({ s, origIdx }))
      .sort((a, b) => slotPoolPriority(a.s) - slotPoolPriority(b.s) || a.origIdx - b.origIdx)
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
        // ── Build per-target ordered candidate lists ───────────────────
        const candidatesByTarget = new Map<string, Village[]>()
        for (const target of gTargets) {
          const td = targetDataMap.get(target.id)!
          candidatesByTarget.set(target.id, offDistribution.value === 'far_first' ? td.byDistFar : td.byDist)
        }

        const pointers = new Map<string, number>()

        if (offDistribution.value !== 'default') {
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
                const v = candidates[ptr++]
                if (usedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                if (calcOffFarm(a, settings.unitPop) < presStore.fullOffMinOffFarm || a.ram === 0) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'off', slotArrT)) {
                  targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
                }
                const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
                const c = emptyComposition()
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                if (role.nobleIncluded && a.snob > 0) { c.snob = 1; a.snob -= 1 }
                a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                if (!pushAtk('off', v, target, c, slotArrT, preset.name, presetColor)) {
                  a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
                  if (role.nobleIncluded && c.snob > 0) a.snob += c.snob
                  continue
                }
                usedVillages.add(v.coords)
                targetFilled.set(target.id, (targetFilled.get(target.id) ?? 0) + 1)
                anyAssigned = true
                assigned = true
              }
              pointers.set(target.id, ptr)
            }
          }
        } else {
          // Default (greedy): globally sorted by score
          type Pair = { target: Target; village: Village; slotArrT: Date; score: number }
          const allPairs: Pair[] = []
          for (const target of gTargets) {
            const slotArrT = slotArrTMap.get(target.id)!
            for (const v of candidatesByTarget.get(target.id) ?? []) {
              allPairs.push({ target, village: v, slotArrT, score: pairScore(v.coords, target.id) })
            }
          }
          allPairs.sort((a, b) => a.score - b.score)

          for (const { target, village: v, slotArrT } of allPairs) {
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
            const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
            const c = emptyComposition()
            c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
            if (role.nobleIncluded && a.snob > 0) { c.snob = 1; a.snob -= 1 }
            a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
            if (!pushAtk('off', v, target, c, slotArrT, preset.name, presetColor)) {
              a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
              if (role.nobleIncluded && c.snob > 0) a.snob += c.snob
              continue
            }
            usedVillages.add(v.coords)
            targetFilled.set(target.id, filled + 1)
          }
        }

      } else if (role.type === 'half_off') {
        const midMin = presStore.halfOffMinOffFarm
        const midMax = presStore.fullOffMinOffFarm

        if (offDistribution.value !== 'default') {
          const pointers3 = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const td3 = targetDataMap.get(target.id)!
              const halfList = offDistribution.value === 'far_first' ? td3.byDistFar : td3.byDist
              let ptr = pointers3.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < halfList.length && !assigned) {
                const v = halfList[ptr++]
                if (usedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                const of = calcOffFarm(a, settings.unitPop)
                if (of < midMin || of >= midMax) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'split_off_rams', slotArrT)) {
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
                if (!pushAtk('split_off_rams', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
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
            const a = pool.get(v.coords)!
            const of = calcOffFarm(a, settings.unitPop)
            if (of < midMin || of >= midMax) {
              targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
            }
            if (nightExcludes(v, target, 'split_off_rams', slotArrT)) {
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
            if (!pushAtk('split_off_rams', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
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

        if (offDistribution.value !== 'default') {
          const pointersMini = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const tdMini = targetDataMap.get(target.id)!
              const miniList = offDistribution.value === 'far_first' ? tdMini.byDistFar : tdMini.byDist
              let ptr = pointersMini.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < miniList.length && !assigned) {
                const v = miniList[ptr++]
                if (usedVillages.has(v.coords)) continue
                const a = pool.get(v.coords)!
                const of = calcOffFarm(a, settings.unitPop)
                if (of < miniMin || of >= miniMax) {
                  targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
                }
                if (nightExcludes(v, target, 'split_off_rams', slotArrT)) {
                  targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
                }
                const c = emptyComposition()
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                if (!pushAtk('split_off_rams', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
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
            const a = pool.get(v.coords)!
            const of = calcOffFarm(a, settings.unitPop)
            if (of < miniMin || of >= miniMax) {
              targetSkippedD.set(target.id, (targetSkippedD.get(target.id) ?? 0) + 1); continue
            }
            if (nightExcludes(v, target, 'split_off_rams', slotArrT)) {
              targetSkippedN.set(target.id, (targetSkippedN.get(target.id) ?? 0) + 1); continue
            }
            const c = emptyComposition()
            c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
            a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
            if (!pushAtk('split_off_rams', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role))) {
              a.axe = c.axe; a.light = c.light; a.heavy = c.heavy; a.ram = c.ram
              continue
            }
            usedVillages.add(v.coords)
            targetFilled.set(target.id, filled + 1)
          }
        }

      } else if (role.type === 'custom_off') {
        const cMin     = role.customMin ?? 0
        const cMax     = role.customMax ?? 99999
        const units    = role.customUnits ?? {}
        const unitPct  = role.customUnitPct ?? {}
        const unitKeys: Array<keyof AttackComposition> = ['spear','sword','axe','spy','light','heavy','ram','catapult','knight','snob']
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

        if (offDistribution.value !== 'default') {
          const pointers4 = new Map<string, number>()
          let anyAssigned = true
          while (anyAssigned) {
            anyAssigned = false
            for (const target of gTargets) {
              const filled = targetFilled.get(target.id) ?? 0
              if (filled >= slot.count) continue
              const td4 = targetDataMap.get(target.id)!
              const customList = (offDistribution.value === 'far_first' && !isNobleSlot) ? td4.byDistFar : td4.byDist
              let ptr = pointers4.get(target.id) ?? 0
              const slotArrT = slotArrTMap.get(target.id)!
              let assigned = false
              while (ptr < customList.length && !assigned) {
                const v = customList[ptr++]
                if (!isNobleSlot && usedVillages.has(v.coords)) continue
                if (isNobleSlot && usedNobleVillages.has(v.coords)) continue
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
                if (!pushAtk('off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role), snobBuildNeeded || undefined)) {
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
            if (isNobleSlot && usedNobleVillages.has(v.coords)) continue
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
            if (!pushAtk('off', v, target, c, slotArrT, preset.name, preset.color ?? defaultColorForRole(preset.role.type, preset.role), snobBuildNeeded || undefined)) {
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
          genIssues.push({ targetCoords: target.coords, type: 'OFFS_SHORT', requested: slot.count, generated, offsReason, slotName: preset.name })
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

      if (role.type === 'spam') {
        // Sequential per target — preserve existing spam logic
        const presetColor = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
        for (const target of validTargets) {
          const { byDist, nobleVillages } = targetDataMap.get(target.id)!
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
              for (let i = 0; i < trainSize; i++) {
                if (a.snob <= 0) break
                const arrT = new Date(slotArrT.getTime() + i * settings.snobIntervalMs)
                if (nightExcludes(nv, target, 'spam_noble', arrT)) break
                const up = settings.unitPop
                const c = emptyComposition()
                c.snob = 1; a.snob -= 1
                let popLeft = settings.minAttackSize - up.snob
                const order: Array<keyof AttackComposition> = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy']
                for (const unit of order) {
                  if (popLeft <= 0) break
                  const upVal = up[unit] ?? 1
                  const needed = Math.ceil(popLeft / upVal)
                  c[unit] = Math.min(a[unit], needed)
                  popLeft -= c[unit] * upVal
                }
                if (popLeft > 0) { a.snob += 1; break }
                pushAtk('spam_noble', nv, target, c, arrT, preset.name, presetColor, undefined, tgId)
              }
              trainsLeft--
            }
          } else {
            // ── Regular spam preset ────────────────────────────────────
            const wBefore = slot.windowBeforeMin ?? 0
            const wAfter  = slot.windowAfterMin  ?? 0
            const useWindow = wBefore > 0 || wAfter > 0
            let left = slot.count
            for (const v of byDist) {
              if (left <= 0) break
              const a = pool.get(v.coords)!
              const c = buildSpamComp(a)
              if (!c) continue
              const arrT = useWindow
                ? randomSpamArrival(
                    new Date(slotArrT.getTime() - wBefore * 60_000),
                    new Date(slotArrT.getTime() + wAfter  * 60_000),
                  )
                : slotArrT
              if (nightExcludes(v, target, 'spam', arrT)) continue
              a.ram = Math.max(0, a.ram - c.ram); a.catapult = Math.max(0, a.catapult - c.catapult)
              pushAtk('spam', v, target, c, arrT, preset.name, presetColor)
              left--
            }
            if (left > 0) genIssues.push({ targetCoords: target.coords, type: 'SPAM_SHORT', requested: slot.count, generated: slot.count - left, slotName: preset.name })
          }
        }

      } else {
        // Global assignment: full_off, half_off, custom_off
        globalAssignSlot(slot, role, preset, validTargets, slotArrTMap)
      }
    }

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

  function clearSpamNobleTargetsAndSave(): void {
    spamNobleTargets.value = []
    saveSpamNobleTargets()
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
    spamNobleTargets.value = []
    playerData.value = []
    watchtowerVillages.value = []
    resetGenerated()
    saveTargets()
    saveSpamNobleTargets()
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
      if (atk.type === 'spam' || atk.type === 'spam_noble') continue
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

    // Eligible by threshold
    const { unitPop } = useWorldStore().settings
    const eligibleOffCoords = new Set<string>()
    for (const v of villages) {
      if (calcOffFarm(v.troops, unitPop) >= presStore.fullOffMinOffFarm && v.troops.ram > 0)
        eligibleOffCoords.add(v.coords)
    }

    let noblesTotal = 0
    for (const v of villages) noblesTotal += v.troops.snob

    const usedOffCoords = new Set<string>()
    let noblesUsed = 0
    for (const atk of attacks.value) {
      if (atk.excluded) continue
      if (atk.type === 'off' || atk.type === 'paladin_off') usedOffCoords.add(atk.fromVillage.coords)
      noblesUsed += atk.composition.snob
    }

    // Total = union of threshold-eligible and actually used (used may include custom_off villages)
    const offsTotalSet = new Set([...eligibleOffCoords, ...usedOffCoords])
    const offsTotal = offsTotalSet.size

    return {
      offsTotal,
      offsUsed: usedOffCoords.size,
      offsAvailable: offsTotal - usedOffCoords.size,
      noblesTotal,
      noblesUsed,
      noblesAvailable: noblesTotal - noblesUsed,
    }
  })

  // ── Fill remaining offs (second-pass: distribute unused off-capable villages) ─
  function fillRemainingOffs(): void {
    if (!attacks.value.length) return
    const presStore  = usePresetsStore()
    const enemyStore = useEnemyDataStore()
    const settings   = worldStore.settings
    const villages   = villagesStore.villages
    const validTargets = targets.value.filter(t => !!t.coords)
    if (!validTargets.length) return

    const now = new Date()

    // Accumulate already-assigned troops per village
    const assignedByVillage = new Map<string, AttackComposition>()
    const sentOffCoords     = new Set<string>()
    for (const atk of attacks.value) {
      const coords = atk.fromVillage.coords
      if (!assignedByVillage.has(coords)) assignedByVillage.set(coords, emptyComposition())
      const acc = assignedByVillage.get(coords)!
      const comp = atk.composition
      acc.axe += comp.axe; acc.light += comp.light; acc.heavy    += comp.heavy
      acc.ram += comp.ram; acc.snob  += comp.snob;  acc.knight   += comp.knight
      acc.spear += comp.spear; acc.sword += comp.sword
      acc.spy += comp.spy; acc.catapult += comp.catapult
      if (atk.type === 'off' || atk.type === 'paladin_off') sentOffCoords.add(coords)
    }

    // Find off-capable villages with remaining troops not yet sending an off
    type UnusedEntry = { v: Village; rem: AttackComposition }
    const unused: UnusedEntry[] = []
    for (const v of villages) {
      if (sentOffCoords.has(v.coords)) continue
      const used = assignedByVillage.get(v.coords)
      const rem  = emptyComposition()
      rem.axe      = v.troops.axe      - (used?.axe      ?? 0)
      rem.light    = v.troops.light    - (used?.light    ?? 0)
      rem.heavy    = v.troops.heavy    - (used?.heavy    ?? 0)
      rem.ram      = v.troops.ram      - (used?.ram      ?? 0)
      rem.snob     = v.troops.snob     - (used?.snob     ?? 0)
      rem.knight   = v.troops.knight   - (used?.knight   ?? 0)
      rem.spear    = v.troops.spear    - (used?.spear    ?? 0)
      rem.sword    = v.troops.sword    - (used?.sword    ?? 0)
      rem.spy      = v.troops.spy      - (used?.spy      ?? 0)
      rem.catapult = v.troops.catapult - (used?.catapult ?? 0)
      if (calcOffFarm(rem, settings.unitPop) < presStore.fullOffMinOffFarm) continue
      if (rem.ram <= 0) continue
      unused.push({ v, rem })
    }
    if (!unused.length) return

    const attackerPoints = new Map<string, number>()
    if (settings.moraleEnabled) {
      for (const v of villages) attackerPoints.set(v.player, (attackerPoints.get(v.player) ?? 0) + v.points)
    }

    // Pre-compute score per (village, target)
    const tdMap = new Map<string, Map<string, number>>()
    const twMap = new Map<string, Map<string, number>>()
    for (const target of validTargets) {
      const dm = new Map<string, number>()
      const wm = new Map<string, number>()
      for (const { v } of unused) {
        const d = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
        dm.set(v.coords, d)
        if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
          const { detected, chord } = calcWatchtowerExposure(v.x, v.y, target.x, target.y, target.enemyPlayer)
          wm.set(v.coords, detected ? 1_000_000 + chord : 0)
        }
      }
      tdMap.set(target.id, dm)
      twMap.set(target.id, wm)
    }

    function score(vCoords: string, targetId: string): number {
      return (twMap.get(targetId)?.get(vCoords) ?? 0) + (tdMap.get(targetId)?.get(vCoords) ?? 0)
    }

    const newAttacks: Attack[] = []
    function makeOff(v: Village, rem: AttackComposition, target: Target): boolean {
      const c = emptyComposition()
      c.axe = rem.axe; c.light = rem.light; c.heavy = rem.heavy; c.ram = rem.ram
      const speedUnit   = slowestUnitInComp(c, settings.unitTimes)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist        = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
      const travelSec   = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime    = calcSendTime(target.arrivalTime, travelSec)
      if (settings.sendExcludeEnabled && isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) return false
      const total = totalUnits(c)
      if (totalPop(c, settings.unitPop) < settings.minAttackSize) return false
      const { color, icon } = calcWatchtower(total, false)
      const warnings: WarningCode[] = []
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(target.arrivalTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_SEND')
      }
      if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
        const { detected } = calcWatchtowerExposure(v.x, v.y, target.x, target.y, target.enemyPlayer)
        if (detected) warnings.push('WATCHTOWER_HIT')
      }
      if (settings.moraleEnabled && target.enemyPlayer) {
        const defPoints = enemyStore.playerByName.get(target.enemyPlayer)?.points ?? 0
        const atkPoints = attackerPoints.get(v.player) ?? 0
        if (defPoints > 0 && atkPoints > 0) {
          const ratio = atkPoints / defPoints
          if (ratio < 1.0)      warnings.push('MORALE_HIGH_RISK')
          else if (ratio < 1.5) warnings.push('MORALE_MEDIUM')
        }
      }
      newAttacks.push({
        id: genId(), type: 'off', fromVillage: v, target, composition: c,
        speedUnit, totalUnits: total, watchtowerColor: color, watchtowerIcon: icon,
        distance: dist, travelSeconds: travelSec, arrivalTime: target.arrivalTime, sendTime,
        warnings, excluded: false,
      })
      return true
    }

    const usedVillages = new Set<string>()
    const orderedByTarget = new Map<string, UnusedEntry[]>()
    for (const target of validTargets) {
      const sorted = [...unused].sort((a, b) => score(a.v.coords, target.id) - score(b.v.coords, target.id))
      orderedByTarget.set(target.id, offDistribution.value === 'far_first' ? sorted.reverse() : sorted)
    }

    if (offDistribution.value !== 'default') {
      // Round-robin: each target picks its nearest available village per round
      const pointers = new Map<string, number>()
      let anyAssigned = true
      while (anyAssigned) {
        anyAssigned = false
        for (const target of validTargets) {
          const list = orderedByTarget.get(target.id) ?? []
          let ptr = pointers.get(target.id) ?? 0
          let assigned = false
          while (ptr < list.length && !assigned) {
            const { v, rem } = list[ptr++]
            if (usedVillages.has(v.coords)) continue
            if (!makeOff(v, rem, target)) continue
            usedVillages.add(v.coords)
            anyAssigned = true; assigned = true
          }
          pointers.set(target.id, ptr)
        }
      }
    } else {
      // Greedy: each village goes to its nearest target
      const orderedByVillage = [...unused].map(entry => {
        const best = validTargets.reduce<{ target: Target; s: number } | null>((acc, t) => {
          const s = score(entry.v.coords, t.id)
          return !acc || s < acc.s ? { target: t, s } : acc
        }, null)
        return { entry, target: best?.target ?? null }
      }).sort((a, b) => (a.entry.v.troops.axe + a.entry.v.troops.light) - (b.entry.v.troops.axe + b.entry.v.troops.light))

      for (const { entry: { v, rem }, target } of orderedByVillage) {
        if (!target || usedVillages.has(v.coords)) continue
        if (!makeOff(v, rem, target)) continue
        usedVillages.add(v.coords)
      }
    }

    if (!newAttacks.length) return
    attacks.value = [...attacks.value, ...newAttacks].sort((a, b) => a.sendTime.getTime() - b.sendTime.getTime())
  }

  // ---------------------------------------------------------------------------
  // Export / Import plan file
  // ---------------------------------------------------------------------------

  function exportPlan(): void {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      targets: targets.value.map(t => ({ ...t, arrivalTime: t.arrivalTime.toISOString() })),
      attacks: attacks.value.map(a => ({
        ...a,
        arrivalTime: a.arrivalTime.toISOString(),
        sendTime:    a.sendTime.toISOString(),
        target: { ...a.target, arrivalTime: a.target.arrivalTime.toISOString() },
      })),
      playerData: playerData.value,
      watchtowerVillages: watchtowerVillages.value,
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
  const coverageEstimate = computed<number | null>(() => {
    const cfg = useMassConfigStore().active
    if (!cfg) return null
    const presStore = usePresetsStore()
    const { settings } = worldStore
    const vils = villagesStore.villages
    if (!vils.length) return null

    const up = settings.unitPop

    // Pool sizes (based on original village data, not current pool state)
    const fullOffVils = vils.filter(v =>
      calcOffFarm(v.troops, up) >= presStore.fullOffMinOffFarm && v.troops.ram > 0
    ).length

    const halfOffVils = vils.filter(v => {
      const of = calcOffFarm(v.troops, up)
      return of >= presStore.halfOffMinOffFarm && of < presStore.fullOffMinOffFarm
    }).length

    const miniOffVils = vils.filter(v => {
      const of = calcOffFarm(v.troops, up)
      return of >= presStore.smallOffMinOffFarm && of < presStore.halfOffMinOffFarm
    }).length

    // Noble pool: built snobs + virtual budget from playerData
    const builtSnobs = vils.reduce((s, v) => s + v.troops.snob, 0)
    const noblePollMode = settings.noblePollMode ?? 'real'
    let totalNobles = builtSnobs
    if (noblePollMode !== 'real') {
      const perPlayer = new Map<string, number>()
      for (const v of vils) perPlayer.set(v.player, (perPlayer.get(v.player) ?? 0) + v.troops.snob)
      for (const pd of playerData.value) {
        if (!pd.totalNobles) continue
        const built = perPlayer.get(pd.player) ?? 0
        totalNobles += pd.totalNobles - built
      }
    }
    // Noble coverage: 1 village = 1 parovoz → count villages with snobs (not sum of snobs)
    const nobleVils = vils.filter(v => v.troops.snob > 0).length
    const nobleVilsVirtual = nobleVils + playerData.value.reduce((s, pd) => {
      if (!pd.totalNobles) return s
      const built = vils.filter(v => v.player === pd.player && v.troops.snob > 0).length
      return s + Math.max(0, pd.totalNobles - built)
    }, 0)

    let minTargets = Infinity
    for (const slot of cfg.slots) {
      if (!slot.enabled || slot.count <= 0) continue
      const preset = presStore.all.find(p => p.id === slot.presetId)
      if (!preset) continue
      const role = preset.role

      let poolSize = 0
      if (role.type === 'full_off')  poolSize = fullOffVils
      else if (role.type === 'half_off')  poolSize = halfOffVils
      else if (role.type === 'mini_off')  poolSize = miniOffVils
      else if (role.type === 'custom_off') {
        const snobSpec = (role.customUnits?.snob as number | undefined) ?? -1
        poolSize = snobSpec > 0 ? nobleVilsVirtual : fullOffVils + halfOffVils + miniOffVils
      } else continue  // spam: не ограничивает

      minTargets = Math.min(minTargets, Math.floor(poolSize / slot.count))
    }

    return minTargets === Infinity ? null : minTargets
  })

  return {
    // State
    targets,
    spamNobleTargets,
    playerData,
    watchtowerVillages,
    attacks,
    noblePlacements,
    paladinPlacements,
    // Targets
    addTarget,
    addEmptyTarget,
    removeTarget,
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
    // Spam noble targets
    addEmptySpamNobleTarget,
    addSpamNobleTarget,
    updateSpamNobleTarget,
    removeSpamNobleTarget,
    clearSpamNobleTargets: clearSpamNobleTargetsAndSave,
    // Plan
    generate,
    resolveAllFromMap,
    toggleExclude,
    clearTargets,
    resetGenerated,
    resetAll,
    offDistribution,
    setOffDistribution,
    nobleRecommendations,
    // Computed
    attacksByTarget,
    attacksByPlayer,
    openOrdersTo,
    generationIssues,
    uncoveredTargetCoords,
    poolUsageStats,
    coverageEstimate,
    fillRemainingOffs,
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
