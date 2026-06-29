import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed } from 'vue'
import { useWorldStore } from './worldStore'
import { useVillagesStore } from './villagesStore'
import type { Village, VillageTroops } from './villagesStore'
import { useMassConfigStore } from './massConfigStore'
import { usePresetsStore } from './presetsStore'
import type { VillageRole } from './presetsStore'
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
  | 'NOBLE_TRAIN_MISSING'
  | 'NOBLE_TRAIN_PARTIAL'
  | 'NOBLES_SHORT'
  | 'SPAM_SHORT'

export interface GenerationIssue {
  targetCoords: string
  type: GenerationIssueType
  requested: number
  generated: number
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
  palOffCount?: number   // how many paladin-offs to send to this target
  nobleVillageCoords?: string  // manual noble train assignment
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
  customColor?: string    // custom badge color for custom_off attacks
  trainGroupId?: string   // shared by all attacks of the same noble train
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

// Flexible green escort: fill axe/light to targets, then heavy/spear/sword up to max.
// Returns null (without mutating pool) if total escort < greenMin.
function buildFlexGreen(a: VillageTroops, role: VillageRole): AttackComposition | null {
  const max         = role.greenMax        ?? 999
  const targetAxe   = role.greenTargetAxe  ?? 500
  const targetLight = role.greenTargetLight ?? 250
  const minEscort   = role.greenMin        ?? 0

  const axeTake   = Math.min(a.axe,   targetAxe,   max)
  const lightTake = Math.min(a.light, targetLight,  max - axeTake)

  if (axeTake + lightTake < minEscort) return null

  a.axe -= axeTake; a.light -= lightTake; a.snob -= 1

  const c = emptyComposition()
  c.snob = 1; c.axe = axeTake; c.light = lightTake
  return c
}

function coordsToXY(coords: string): { x: number; y: number } | null {
  const m = coords.match(/^(\d+)\|(\d+)$/)
  if (!m) return null
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) }
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
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

// Assign noble types to train slots based on composition percentages
function assignNobleTypes(
  count: number,
  comp: NobleCompositionConfig,
): AttackType[] {
  const types: AttackType[] = []
  const pcts: Array<{ type: AttackType; pct: number }> = [
    { type: 'noble_green_strong', pct: comp.greenStrongPct },
    { type: 'noble_green_weak',   pct: comp.greenWeakPct },
    { type: 'noble_orange',       pct: comp.orangePct },
    { type: 'noble_red',          pct: comp.redPct },
  ]
  for (let i = 0; i < count; i++) {
    const pick = Math.floor((i / count) * 100)
    let cumulative = 0
    let chosen: AttackType = 'noble_green_strong'
    for (const { type, pct } of pcts) {
      cumulative += pct
      if (pick < cumulative) { chosen = type; break }
    }
    types.push(chosen)
  }
  return types
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

  // Generated (not persisted)
  const attacks = ref<Attack[]>([])
  const noblePlacements = ref<NoblePlacement[]>([])
  const paladinPlacements = ref<PaladinPlacement[]>([])
  const generationIssues = ref<GenerationIssue[]>([])

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
    targets.value = targets.value.filter((t) => t.id !== id)
    attacks.value = attacks.value.filter((a) => a.target.id !== id)
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
    const newPaladinPlacements: PaladinPlacement[] = []
    const genIssues: GenerationIssue[] = []

    // Pool: available troops per village (consumed as attacks are assigned)
    const pool = new Map<string, AttackComposition>()
    for (const v of villages) pool.set(v.coords, { ...v.troops })

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
    // Must include at least 1 ram or 1 catapult (siege weapon required).
    // Siege unit IS deducted from pool. Infantry fills remaining pop but is NOT deducted.
    // Returns null if no siege weapon available or not enough troops for minAttackSize.
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
      composition: AttackComposition, arrivalTime: Date, label?: string, customColor?: string,
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
      const { color, icon } = calcWatchtower(total, composition.snob > 0)

      const warnings: WarningCode[] = []
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(arrivalTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime,    settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_SEND')
      }
      if (settings.watchtowerEnabled && watchtowerVillages.value.length > 0) {
        const hit = watchtowerVillages.value.some((wt) => {
          if (wt.level <= 0) return false
          return calcDistance({ x: village.x, y: village.y }, { x: wt.x, y: wt.y }, settings.mapSize) <= wt.level
        })
        if (hit) warnings.push('WATCHTOWER_HIT')
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

      result.push({
        id: genId(), type, fromVillage: village, target, composition,
        speedUnit, totalUnits: total, watchtowerColor: color, watchtowerIcon: icon,
        distance: dist, travelSeconds: travelSec, arrivalTime, sendTime,
        warnings, excluded: false, label, customColor,
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

    // ── Virtual noble budget ──────────────────────────────────────────────
    // Per player: totalNobles (from playerData) minus nobles already in pool
    const virtualNobleBudget = new Map<string, number>()
    for (const pd of playerData.value) {
      if (!pd.totalNobles) continue
      const builtSnob = villages
        .filter(v => v.player === pd.player)
        .reduce((s, v) => s + (pool.get(v.coords)?.snob ?? 0), 0)
      const budget = pd.totalNobles - builtSnob
      if (budget > 0) virtualNobleBudget.set(pd.player, budget)
    }

    const noblePriority = cfg.noblePriority ?? 'distance'

    // Picks the best noble village from candidates (pre-sorted by distance).
    // Handles both already-built nobles and virtual assignment from totalNobles budget.
    //
    // 'distance' mode — sort key: (distanceRank * 2 + isVirtual)
    //   → closest built beats closest virtual, but closest virtual beats farther built
    //
    // 'built' mode — sort key: (isVirtual, distanceRank)
    //   → all built (nearest first) before any virtual (nearest first)
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
          const rank = noblePriority === 'distance' ? i * 2 : i
          entries.push({ v, isVirtual: false, rank })
        } else {
          const budgetNeeded = need - snob
          if ((virtualNobleBudget.get(v.player) ?? 0) >= budgetNeeded) {
            const rank = noblePriority === 'distance' ? i * 2 + 1 : candidates.length + i
            entries.push({ v, isVirtual: true, rank })
          }
        }
      }

      entries.sort((a, b) => a.rank - b.rank)

      for (const { v, isVirtual } of entries) {
        if (nightExcludes(v, target, 'noble_green_strong', arrT)) continue
        if (isVirtual) {
          const snob = pool.get(v.coords)?.snob ?? 0
          const budgetNeeded = need - snob
          pool.get(v.coords)!.snob += budgetNeeded
          virtualNobleBudget.set(v.player, (virtualNobleBudget.get(v.player) ?? 0) - budgetNeeded)
        }
        return v
      }
      return null
    }

    // ── Per-target loop ───────────────────────────────────────────────────
    for (const target of targets.value) {
      const byDist = [...villages].sort((a, b) =>
        calcDistance({ x: a.x, y: a.y }, { x: target.x, y: target.y }, settings.mapSize) -
        calcDistance({ x: b.x, y: b.y }, { x: target.x, y: target.y }, settings.mapSize),
      )
      const nobleVillages = byDist.filter(v =>
        calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize) <= settings.snobMaxDist
      )
      const baseArrT = target.arrivalTime

      for (const slot of cfg.slots) {
        if (!slot.enabled) continue
        const preset = presStore.all.find(p => p.id === slot.presetId)
        if (!preset) continue
        const role = preset.role

        const slotArrT = new Date(baseArrT.getTime() + slot.offsetMs)

        // ── Train preset ──────────────────────────────────────────────
        if (role.type === 'train') {
          const trainAttacks = role.trainAttacks ?? []
          const manualCoords = target.nobleVillageCoords
          let trainsGenerated = 0
          const trainNeedsFullOff = trainAttacks.some(a => a.type === 'full_off')

          for (let trainIdx = 0; trainIdx < slot.count; trainIdx++) {
            const firstArrT = slotArrT
            const candidatePool = manualCoords ? byDist : (nobleVillages.length > 0 ? nobleVillages : byDist)
            const hasArmy = (coords: string) => {
              if (!trainNeedsFullOff) return true
              const a = pool.get(coords)
              return !!a && (a.axe + a.light) >= presStore.fullOffMinAxe && a.ram > 0
            }
            const trainCandidates = manualCoords
              ? candidatePool.filter(v => v.coords === manualCoords)
              : (nobleVillages.length > 0 ? nobleVillages : byDist)
            const nv = pickNobleVillage(trainAttacks.length, trainCandidates, target, firstArrT, trainNeedsFullOff ? hasArmy : undefined)
            if (!nv) break

            const a = pool.get(nv.coords)!
            const passOrder = [
              ...trainAttacks.map((atk, i) => ({ atk, i })).filter(({ atk }) => atk.type !== 'full_off'),
              ...trainAttacks.map((atk, i) => ({ atk, i })).filter(({ atk }) => atk.type === 'full_off'),
            ]
            const builtSlots: Array<{ type: AttackType; comp: AttackComposition; origIdx: number }> = []

            for (const { atk, i: origIdx } of passOrder) {
              const c = emptyComposition()
              let type: AttackType = 'noble_green_strong'

              if (atk.type === 'full_off') {
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram; c.snob = 1
                a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0; a.snob -= 1
                type = 'noble_red'
              } else if (atk.type === 'green_off') {
                if (atk.greenVariant === 'flexible') {
                  const fakeRole: VillageRole = { type: 'green_off', greenVariant: 'flexible', greenMin: atk.greenMin, greenMax: atk.greenMax ?? 999, greenTargetAxe: atk.greenTargetAxe ?? 500, greenTargetLight: atk.greenTargetLight ?? 250 }
                  const fc = buildFlexGreen(a, fakeRole)
                  if (fc) { Object.assign(c, fc) } else { c.snob = 1; a.snob -= 1 }
                } else {
                  const eu = atk.greenVariant === 'axes' ? 'axe' : 'light'
                  c.snob = 1; c[eu] = Math.min(a[eu], 999)
                  if (atk.greenWithRams !== false) c.ram = Math.min(a.ram, Math.max(0, 999 - c.snob - c[eu]))
                  a.snob -= 1; a[eu] -= c[eu]; a.ram = Math.max(0, a.ram - c.ram)
                }
                type = 'noble_green_strong'
              } else if (atk.type === 'split') {
                c.axe = Math.ceil(a.axe / 2); c.light = Math.ceil(a.light / 2)
                c.heavy = Math.ceil(a.heavy / 2); c.snob = 1
                a.axe -= c.axe; a.light -= c.light; a.heavy -= c.heavy; a.snob -= 1
                type = 'noble_orange'
              } else if (atk.type === 'half_off') {
                c.axe = Math.ceil(a.axe / 2); c.light = Math.ceil(a.light / 2)
                c.heavy = Math.ceil(a.heavy / 2); c.ram = a.ram; c.snob = 1
                a.axe -= c.axe; a.light -= c.light; a.heavy -= c.heavy; a.ram = 0; a.snob -= 1
                type = 'split_off_rams'
              } else if (atk.type === 'custom_off') {
                const cp = atk.customPresetId ? presStore.all.find(p => p.id === atk.customPresetId) : null
                const cu = cp?.role.type === 'custom_off' ? cp.role.customUnits ?? {} : {}
                const unitKeys = Object.keys(cu) as Array<keyof VillageTroops>
                if (unitKeys.length > 0) {
                  for (const k of unitKeys) {
                    const spec = cu[k] as number
                    if (spec === 0) continue
                    const take = spec === -1 ? a[k] : Math.min(spec, a[k])
                    c[k] = take; a[k] -= take
                  }
                } else {
                  c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
                  a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
                }
                c.snob = 1; a.snob -= 1
                type = 'off'
              } else {
                c.snob = 1; c.light = Math.min(a.light, 999)
                a.snob -= 1; a.light -= c.light
              }
              builtSlots.push({ type, comp: c, origIdx })
            }

            builtSlots.sort((x, y) => x.origIdx - y.origIdx)
            const trainGroupId = genId()
            for (const { type, comp, origIdx } of builtSlots) {
              const arrT = new Date(firstArrT.getTime() + origIdx * settings.snobIntervalMs)
              const pushed = pushAtk(type, nv, target, comp, arrT)
              if (pushed) {
                result[result.length - 1].trainGroupId = trainGroupId
                trackNoble(nv)
              }
            }
            trainsGenerated++
          }
          if (slot.count > 0 && trainsGenerated < slot.count) {
            genIssues.push({
              targetCoords: target.coords,
              type: trainsGenerated === 0 ? 'NOBLE_TRAIN_MISSING' : 'NOBLE_TRAIN_PARTIAL',
              requested: slot.count,
              generated: trainsGenerated,
            })
          }

        // ── Spam train preset ─────────────────────────────────────────
        } else if (role.type === 'spam' && (role.spamTrainSize ?? 0) > 0) {
          const trainSize = role.spamTrainSize ?? 5
          const spamCount = role.spamCount ?? 5
          let trainsLeft = slot.count
          while (trainsLeft > 0) {
            const nv = pickNobleVillage(trainSize, nobleVillages, target, slotArrT)
            if (!nv) break
            const a = pool.get(nv.coords)!
            for (let i = 0; i < spamCount; i++) {
              const c = buildSpamComp(a)
              if (!c) break
              a.ram = Math.max(0, a.ram - c.ram); a.catapult = Math.max(0, a.catapult - c.catapult)
              pushAtk('spam', nv, target, c, slotArrT, 'Спам-паровоз')
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
              pushAtk('spam_noble', nv, target, c, arrT, 'Спам-двор')
            }
            trainsLeft--
          }

        // ── Spam preset ───────────────────────────────────────────────
        } else if (role.type === 'spam') {
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
            pushAtk('spam', v, target, c, arrT, 'Спам')
            left--
          }
          if (left > 0) genIssues.push({ targetCoords: target.coords, type: 'SPAM_SHORT', requested: slot.count, generated: slot.count - left })

        // ── Green off preset ──────────────────────────────────────────
        } else if (role.type === 'green_off') {
          let left = slot.count
          while (left > 0) {
            const idx  = slot.count - left
            const arrT = new Date(slotArrT.getTime() + idx * settings.snobIntervalMs)
            const nv = pickNobleVillage(1, nobleVillages, target, arrT)
            if (!nv) break
            const a = pool.get(nv.coords)!
            let c: AttackComposition | null
            if (role.greenVariant === 'flexible') {
              c = buildFlexGreen(a, role)
            } else {
              const eu = role.greenVariant === 'axes' ? 'axe' : 'light'
              c = emptyComposition()
              c.snob = 1; c[eu] = Math.min(a[eu], 999)
              if (role.greenWithRams !== false) c.ram = Math.min(a.ram, Math.max(0, 999 - c.snob - c[eu]))
              a.snob -= 1; a[eu] -= c[eu]; a.ram = Math.max(0, a.ram - c.ram)
            }
            if (!c) continue
            pushAtk('noble_green_strong', nv, target, c, arrT)
            trackNoble(nv)
            left--
          }
          if (slot.count > 0 && left > 0) genIssues.push({ targetCoords: target.coords, type: 'NOBLES_SHORT', requested: slot.count, generated: slot.count - left })

        // ── Spike preset ──────────────────────────────────────────────
        } else if (role.type === 'spike') {
          const sRams  = role.spikeRams  ?? 100
          const sSpy   = role.spikeSpy   ?? 1
          const sAxe   = role.spikeAxe   ?? 0
          const sLc    = role.spikeLight ?? 899
          const sHeavy = role.spikeHeavy ?? 0
          const sCat   = role.spikeCat   ?? 0
          let left = slot.count
          for (const v of byDist) {
            if (left <= 0) break
            if (nightExcludes(v, target, 'off', slotArrT)) continue
            const a = pool.get(v.coords)!
            if (sRams > 0 && a.ram < Math.min(sRams, 10)) continue
            const c = emptyComposition()
            c.ram      = Math.min(a.ram,      sRams)
            c.spy      = Math.min(a.spy,      sSpy)
            c.axe      = Math.min(a.axe,      sAxe)
            c.light    = Math.min(a.light,    sLc)
            c.heavy    = Math.min(a.heavy,    sHeavy)
            c.catapult = Math.min(a.catapult, sCat)
            a.ram -= c.ram; a.spy -= c.spy; a.axe -= c.axe
            a.light -= c.light; a.heavy -= c.heavy; a.catapult -= c.catapult
            pushAtk('off', v, target, c, slotArrT, 'Колючка')
            left--
          }

        // ── Off presets (full_off / half_off / breach_off / pal_off / custom_off) ──
        } else {
          let left = slot.count
          for (const v of byDist) {
            if (left <= 0) break
            const a = pool.get(v.coords)!

            if (role.type === 'breach_off') {
              const minRams = role.minRams ?? presStore.breachMinRams
              if (a.ram < minRams || a.axe + a.light < presStore.halfOffMinAxe) continue
              if (nightExcludes(v, target, 'off', slotArrT)) continue
              const c = emptyComposition()
              c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
              a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
              pushAtk('off', v, target, c, slotArrT, 'Пробой')

            } else if (role.type === 'pal_off') {
              if (a.axe + a.light < presStore.fullOffMinAxe || a.ram === 0) continue
              if (nightExcludes(v, target, 'off', slotArrT)) continue
              const c = emptyComposition()
              c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
              a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
              newPaladinPlacements.push({ village: v, forTarget: target })
              pushAtk('paladin_off', v, target, c, slotArrT, 'Пал-Офф')

            } else if (role.type === 'full_off') {
              if (a.axe + a.light < presStore.fullOffMinAxe || a.ram === 0) continue
              if (nightExcludes(v, target, 'off', slotArrT)) continue
              const c = emptyComposition()
              c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
              if (role.nobleIncluded && a.snob > 0) { c.snob = 1; a.snob -= 1 }
              a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
              pushAtk('off', v, target, c, slotArrT)

            } else if (role.type === 'half_off') {
              const halfMin   = role.halfMin ?? 1001
              const halfMax   = role.halfMax ?? 5000
              const totalArmy = a.axe + a.light + a.heavy + a.ram
              if (totalArmy < halfMin || totalArmy > halfMax) continue
              if (nightExcludes(v, target, 'split_off_rams', slotArrT)) continue
              const c = emptyComposition()
              if (role.halfFixedComp) {
                c.axe   = Math.min(a.axe,   role.halfFixedAxe   ?? 0)
                c.light = Math.min(a.light, role.halfFixedLight ?? 0)
                c.heavy = Math.min(a.heavy, role.halfFixedHeavy ?? 0)
                c.ram   = Math.min(a.ram,   role.halfFixedRam   ?? 0)
              } else {
                c.axe = a.axe; c.light = a.light; c.heavy = a.heavy; c.ram = a.ram
              }
              a.axe = 0; a.light = 0; a.heavy = 0; a.ram = 0
              pushAtk('split_off_rams', v, target, c, slotArrT, 'Медиум')

            } else if (role.type === 'custom_off') {
              const cMin = role.customMin ?? 0
              const cMax = role.customMax ?? 99999
              const units = role.customUnits ?? {}
              const unitKeys: Array<keyof AttackComposition> = ['spear','sword','axe','spy','light','heavy','ram','catapult','knight','snob']
              const c = emptyComposition()
              for (const k of unitKeys) {
                const spec = (units[k] as number | undefined) ?? -1
                if (spec === 0) continue
                c[k] = spec === -1 ? a[k] : Math.min(a[k], spec)
              }
              const total = totalUnits(c)
              if (total < cMin || total > cMax) continue
              if (nightExcludes(v, target, 'off', slotArrT)) continue
              for (const k of unitKeys) a[k] -= c[k]
              pushAtk('off', v, target, c, slotArrT, preset.name, role.customColor)

            } else { continue }

            left--
          }
          if (left > 0 && slot.count > 0) {
            genIssues.push({ targetCoords: target.coords, type: 'OFFS_SHORT', requested: slot.count, generated: slot.count - left })
          }
        }
      }
    }

    result.sort((a, b) => a.sendTime.getTime() - b.sendTime.getTime())
    attacks.value = result
    noblePlacements.value = newNoblePlacements
    paladinPlacements.value = newPaladinPlacements
    generationIssues.value = genIssues
  }

  // ---------------------------------------------------------------------------
  // Manual overrides
  // ---------------------------------------------------------------------------

  function toggleExclude(id: string): void {
    const row = attacks.value.find((r) => r.id === id)
    if (row) row.excluded = !row.excluded
  }

  function clearTargets(): void {
    targets.value = []
    attacks.value = []
    noblePlacements.value = []
    paladinPlacements.value = []
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

  // Targets that have at least one critical issue (no offs or no noble train at all)
  const uncoveredTargetCoords = computed(() => {
    const s = new Set<string>()
    for (const issue of generationIssues.value) {
      if (
        (issue.type === 'OFFS_SHORT' && issue.generated === 0) ||
        issue.type === 'NOBLE_TRAIN_MISSING'
      ) {
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
    // Computed
    attacksByTarget,
    attacksByPlayer,
    openOrdersTo,
    generationIssues,
    uncoveredTargetCoords,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlanStore, import.meta.hot))
}
