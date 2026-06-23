import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorldStore } from './worldStore'
import { useVillagesStore } from './villagesStore'
import type { Village, VillageTroops } from './villagesStore'
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
  watchtowerLevel: number
  label?: string
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

export interface MassConfig {
  paladinOffsPerTarget: number
  regularOffsPerTarget: number
  splitOff: boolean
  nobleTrainSize: number
  nobleComposition: NobleCompositionConfig
  maxNoblesPerVillage: number
  offsetAfterOffMs: number    // ms gap: last off arrival → first noble arrival
  useSpamAttacks: boolean
  spamCountPerTarget: number
  useSpamNobles: boolean
  spamNobleCountPerTarget: number
}

export const DEFAULT_MASS_CONFIG: MassConfig = {
  paladinOffsPerTarget: 0,
  regularOffsPerTarget: 3,
  splitOff: false,
  nobleTrainSize: 4,
  nobleComposition: {
    greenStrongPct: 100,
    greenWeakPct: 0,
    orangePct: 0,
    redPct: 0,
    escortUnit: 'light',
  },
  maxNoblesPerVillage: 6,
  offsetAfterOffMs: 500,
  useSpamAttacks: false,
  spamCountPerTarget: 0,
  useSpamNobles: false,
  spamNobleCountPerTarget: 0,
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
      return 'light'  // no rams — LC determines speed
    default:
      return 'ram'    // offs and spams always have rams
  }
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
const LS_MASS_CONFIG = 'vp_mass_config'

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

function loadMassConfig(): MassConfig {
  try {
    const raw = localStorage.getItem(LS_MASS_CONFIG)
    if (raw) return { ...DEFAULT_MASS_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_MASS_CONFIG }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlanStore = defineStore('plan', () => {
  const worldStore = useWorldStore()
  const villagesStore = useVillagesStore()

  // Persisted state
  const targets = ref<Target[]>(loadTargets())
  const playerData = ref<PlayerData[]>(loadPlayerData())
  const massConfig = ref<MassConfig>(loadMassConfig())

  // Generated (not persisted)
  const attacks = ref<Attack[]>([])
  const noblePlacements = ref<NoblePlacement[]>([])
  const paladinPlacements = ref<PaladinPlacement[]>([])

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function saveTargets() {
    localStorage.setItem(LS_TARGETS, JSON.stringify(targets.value))
  }

  function savePlayerData() {
    localStorage.setItem(LS_PLAYER_DATA, JSON.stringify(playerData.value))
  }

  function saveMassConfig() {
    localStorage.setItem(LS_MASS_CONFIG, JSON.stringify(massConfig.value))
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
      watchtowerLevel: 0,
      ...options,
    }
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
  // Mass config
  // ---------------------------------------------------------------------------

  function updateMassConfig(patch: Partial<MassConfig>) {
    massConfig.value = { ...massConfig.value, ...patch }
    saveMassConfig()
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  function generate(): void {
    const { settings } = worldStore
    const { villages } = villagesStore
    const config = massConfig.value
    const now = new Date()
    const result: Attack[] = []
    const newNoblePlacements: NoblePlacement[] = []
    const newPaladinPlacements: PaladinPlacement[] = []

    // Track available troops per village (consumed as attacks are assigned)
    const pool = new Map<string, AttackComposition>()
    for (const v of villages) {
      pool.set(v.coords, { ...v.troops })
    }

    // Track used noble slots per village
    const nobleUsed = new Map<string, number>()

    // Track paladin budget per player (decrements as paladin offs are assigned)
    const paladinBudget = new Map<string, number>()
    for (const pd of playerData.value) {
      paladinBudget.set(pd.player, pd.offPaladins)
    }

    // Helper: build and push one attack
    function pushAttack(
      type: AttackType,
      village: Village,
      target: Target,
      composition: AttackComposition,
      arrivalTime: Date,
      label?: string,
    ) {
      const speedUnit = speedUnitForType(type)
      const unitBaseSec = settings.unitTimes[speedUnit]
      const dist = calcDistance(
        { x: village.x, y: village.y },
        { x: target.x, y: target.y },
        settings.mapSize,
      )
      const travelSec = calcTravelSeconds(dist, unitBaseSec, settings.worldSpeed, settings.unitSpeed)
      const sendTime = calcSendTime(arrivalTime, travelSec)

      const total = totalUnits(composition)
      const { color, icon } = calcWatchtower(total, composition.snob > 0)

      const warnings: WarningCode[] = []
      if (sendTime < now) warnings.push('SEND_IN_PAST')
      if (settings.nightActive) {
        if (isInNightWindow(arrivalTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_ARRIVAL')
        if (isInNightWindow(sendTime, settings.nightFrom, settings.nightTo)) warnings.push('NIGHT_SEND')
      }
      if (settings.watchtowerEnabled && target.watchtowerLevel > 0) {
        // Simplified: if target has a tower, all attacks get the warning (radius check is V1)
        warnings.push('WATCHTOWER_HIT')
      }

      result.push({
        id: genId(),
        type,
        fromVillage: village,
        target,
        composition,
        speedUnit,
        totalUnits: total,
        watchtowerColor: color,
        watchtowerIcon: icon,
        distance: dist,
        travelSeconds: travelSec,
        arrivalTime,
        sendTime,
        warnings,
        excluded: false,
        label,
      })
    }

    for (const target of targets.value) {
      // Candidate villages sorted by distance to this target
      const byDist = [...villages].sort((a, b) =>
        calcDistance({ x: a.x, y: a.y }, { x: target.x, y: target.y }, settings.mapSize) -
        calcDistance({ x: b.x, y: b.y }, { x: target.x, y: target.y }, settings.mapSize),
      )

      // ---- Paladin offs ----
      let paladinOffsLeft = config.paladinOffsPerTarget
      for (const v of byDist) {
        if (paladinOffsLeft <= 0) break
        const avail = pool.get(v.coords)!
        if (avail.ram <= 0) continue
        const budget = paladinBudget.get(v.player) ?? 0
        if (budget <= 0) continue

        const comp = emptyComposition()
        comp.axe = avail.axe
        comp.light = avail.light
        comp.heavy = avail.heavy
        comp.ram = avail.ram
        // Consume troops
        avail.axe = 0; avail.light = 0; avail.heavy = 0; avail.ram = 0

        paladinBudget.set(v.player, budget - 1)
        newPaladinPlacements.push({ village: v, forTarget: target })

        if (config.splitOff) {
          const comp2 = emptyComposition()
          comp2.axe = Math.floor(comp.axe / 2)
          comp2.light = Math.floor(comp.light / 2)
          comp2.heavy = Math.floor(comp.heavy / 2)
          const comp1 = { ...comp, axe: comp.axe - comp2.axe, light: comp.light - comp2.light, heavy: comp.heavy - comp2.heavy }
          pushAttack('split_off_rams', v, target, comp1, target.arrivalTime, 'Пал-Офф (тарани)')
          pushAttack('split_off_rest', v, target, comp2, target.arrivalTime, 'Пал-Офф (решта)')
        } else {
          pushAttack('paladin_off', v, target, comp, target.arrivalTime, 'Пал-Офф')
        }
        paladinOffsLeft--
      }

      // ---- Regular offs ----
      let offsLeft = config.regularOffsPerTarget
      for (const v of byDist) {
        if (offsLeft <= 0) break
        const avail = pool.get(v.coords)!
        if (avail.ram <= 0) continue

        const comp = emptyComposition()
        comp.axe = avail.axe
        comp.light = avail.light
        comp.heavy = avail.heavy
        comp.ram = avail.ram
        avail.axe = 0; avail.light = 0; avail.heavy = 0; avail.ram = 0

        if (config.splitOff) {
          const comp2 = emptyComposition()
          comp2.axe = Math.floor(comp.axe / 2)
          comp2.light = Math.floor(comp.light / 2)
          comp2.heavy = Math.floor(comp.heavy / 2)
          const comp1 = { ...comp, axe: comp.axe - comp2.axe, light: comp.light - comp2.light, heavy: comp.heavy - comp2.heavy }
          pushAttack('split_off_rams', v, target, comp1, target.arrivalTime, 'Офф (тарани)')
          pushAttack('split_off_rest', v, target, comp2, target.arrivalTime, 'Офф (решта)')
        } else {
          pushAttack('off', v, target, comp, target.arrivalTime)
        }
        offsLeft--
      }

      // ---- Noble train ----
      const nobleTypes = assignNobleTypes(config.nobleTrainSize, config.nobleComposition)
      const escortUnit = config.nobleComposition.escortUnit

      // Noble villages: within snobMaxDist, sorted by distance
      const nobleVillages = byDist.filter((v) => {
        const dist = calcDistance({ x: v.x, y: v.y }, { x: target.x, y: target.y }, settings.mapSize)
        return dist <= settings.snobMaxDist
      })

      for (let i = 0; i < nobleTypes.length; i++) {
        const nobleType = nobleTypes[i]
        const arrivalTime = new Date(
          target.arrivalTime.getTime() + config.offsetAfterOffMs + i * settings.snobIntervalMs,
        )

        // Find a village with available snob within distance
        const nv = nobleVillages.find((v) => {
          const avail = pool.get(v.coords)!
          const used = nobleUsed.get(v.coords) ?? 0
          return avail.snob > 0 && used < config.maxNoblesPerVillage
        })

        if (!nv) break  // no more noble villages available

        const avail = pool.get(nv.coords)!
        const dist = calcDistance({ x: nv.x, y: nv.y }, { x: target.x, y: target.y }, settings.mapSize)
        if (dist > settings.snobMaxDist) {
          result.push({
            id: genId(), type: nobleType, fromVillage: nv, target,
            composition: emptyComposition(), speedUnit: 'snob',
            totalUnits: 0, watchtowerColor: 'green', watchtowerIcon: 'snob',
            distance: dist, travelSeconds: 0, arrivalTime, sendTime: arrivalTime,
            warnings: ['SNOB_TOO_FAR'], excluded: true, label: 'Двір (далеко)',
          })
          continue
        }

        const comp = buildNobleComposition(nobleType, avail, escortUnit, 1)
        if (comp.snob === 0) break

        // Consume used resources
        avail.snob -= comp.snob
        avail[escortUnit] = Math.max(0, avail[escortUnit] - comp[escortUnit])
        nobleUsed.set(nv.coords, (nobleUsed.get(nv.coords) ?? 0) + 1)

        // Track noble placements for build instructions
        const existing = newNoblePlacements.find((p) => p.village.coords === nv.coords)
        if (existing) {
          existing.count++
        } else {
          newNoblePlacements.push({ village: nv, count: 1 })
        }

        pushAttack(nobleType, nv, target, comp, arrivalTime)
      }

      // ---- Spams ----
      if (config.useSpamAttacks) {
        let spamsLeft = config.spamCountPerTarget
        for (const v of byDist) {
          if (spamsLeft <= 0) break
          const avail = pool.get(v.coords)!
          if (avail.ram <= 0) continue

          const comp = emptyComposition()
          comp.spear = Math.min(avail.spear, 50)
          comp.ram = 1
          avail.ram = Math.max(0, avail.ram - 1)

          pushAttack('spam', v, target, comp, target.arrivalTime, 'Спам')
          spamsLeft--
        }
      }

      // ---- Spam nobles ----
      if (config.useSpamNobles) {
        let spamNoblesLeft = config.spamNobleCountPerTarget
        for (const v of nobleVillages) {
          if (spamNoblesLeft <= 0) break
          const avail = pool.get(v.coords)!
          if (avail.snob <= 0) continue

          const arrivalTime = new Date(
            target.arrivalTime.getTime() + config.offsetAfterOffMs,
          )
          const comp = buildNobleComposition('spam_noble', avail, escortUnit, 1)
          if (comp.snob === 0) continue

          avail.snob -= comp.snob
          pushAttack('spam_noble', v, target, comp, arrivalTime, 'Спам-двір')
          spamNoblesLeft--
        }
      }
    }

    // Sort all attacks by sendTime ascending
    result.sort((a, b) => a.sendTime.getTime() - b.sendTime.getTime())

    attacks.value = result
    noblePlacements.value = newNoblePlacements
    paladinPlacements.value = newPaladinPlacements
  }

  // ---------------------------------------------------------------------------
  // Manual overrides
  // ---------------------------------------------------------------------------

  function toggleExclude(id: string): void {
    const row = attacks.value.find((r) => r.id === id)
    if (row) row.excluded = !row.excluded
  }

  function resetGenerated(): void {
    attacks.value = []
    noblePlacements.value = []
    paladinPlacements.value = []
  }

  function resetAll(): void {
    targets.value = []
    playerData.value = []
    massConfig.value = { ...DEFAULT_MASS_CONFIG }
    resetGenerated()
    saveTargets()
    savePlayerData()
    saveMassConfig()
  }

  // ---------------------------------------------------------------------------
  // Computed summaries
  // ---------------------------------------------------------------------------

  const attacksByTarget = computed(() => {
    const m = new Map<string, Attack[]>()
    for (const a of attacks.value) {
      const list = m.get(a.target.id) ?? []
      list.push(a)
      m.set(a.target.id, list)
    }
    return m
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
    playerData,
    massConfig,
    attacks,
    noblePlacements,
    paladinPlacements,
    // Targets
    addTarget,
    removeTarget,
    updateTarget,
    // Player data
    setPlayerData,
    getPlayerData,
    playerDataMap,
    // Config
    updateMassConfig,
    // Plan
    generate,
    toggleExclude,
    resetGenerated,
    resetAll,
    // Computed
    attacksByTarget,
    attacksByPlayer,
  }
})
