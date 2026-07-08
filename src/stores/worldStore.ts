import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface UnitTimes {
  spear: number
  sword: number
  axe: number
  spy: number
  light: number
  heavy: number
  ram: number
  catapult: number
  knight: number
  snob: number
}

export type UnitPop = UnitTimes  // same shape — population (farm space) per unit

export type NoblePollMode = 'real' | 'virtual'

export interface WorldSettings {
  worldCode: string
  worldSpeed: number
  unitSpeed: number
  mapSize: number
  nightActive: boolean
  nightFrom: number
  nightTo: number
  sendExcludeEnabled: boolean
  moraleEnabled: boolean
  snobMaxDist: number
  snobIntervalMs: number
  minAttackSize: number   // minimum farm-space sum for any attack
  watchtowerEnabled: boolean
  noblePollMode: NoblePollMode
  unitTimes: UnitTimes
  unitPop: UnitPop
}

export const DEFAULT_UNIT_TIMES: UnitTimes = {
  spear: 1080,
  sword: 1320,
  axe: 1080,
  spy: 540,
  light: 600,
  heavy: 660,
  ram: 1800,
  catapult: 1800,
  knight: 600,
  snob: 2100,
}

export const DEFAULT_UNIT_POP: UnitPop = {
  spear: 1,
  sword: 1,
  axe: 1,
  spy: 2,
  light: 4,
  heavy: 6,
  ram: 5,
  catapult: 8,
  knight: 10,
  snob: 100,
}

export const KNOWN_WORLDS: Record<string, Partial<WorldSettings>> = {
  ru100: {
    worldCode: 'ru100',
    worldSpeed: 2,
    unitSpeed: 0.5,
    mapSize: 1000,
    nightActive: true,
    nightFrom: 1,
    nightTo: 8,
    snobMaxDist: 100,
    snobIntervalMs: 100,
    watchtowerEnabled: true,
    unitTimes: { spear:1080, sword:1320, axe:1080, spy:540, light:600, heavy:660, ram:1800, catapult:1800, knight:600, snob:2100 },
    unitPop: { ...DEFAULT_UNIT_POP },
  },
}

const LS_KEY = 'vp_world'

function defaultSettings(): WorldSettings {
  return {
    worldCode: '',
    worldSpeed: 1,
    unitSpeed: 1,
    mapSize: 1000,
    nightActive: false,
    nightFrom: 0,
    nightTo: 8,
    sendExcludeEnabled: false,
    moraleEnabled: false,
    snobMaxDist: 60,
    snobIntervalMs: 100,
    minAttackSize: 100,
    watchtowerEnabled: false,
    noblePollMode: 'real' as NoblePollMode,
    unitTimes: { ...DEFAULT_UNIT_TIMES },
    unitPop: { ...DEFAULT_UNIT_POP },
  }
}

function loadFromLS(): WorldSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorldSettings
      const mergedTimes = { ...DEFAULT_UNIT_TIMES, ...parsed.unitTimes }
      for (const key of Object.keys(mergedTimes) as (keyof UnitTimes)[]) {
        if (mergedTimes[key] <= 60) mergedTimes[key] = mergedTimes[key] * 60
      }
      const mergedPop = { ...DEFAULT_UNIT_POP, ...parsed.unitPop }
      return { ...defaultSettings(), ...parsed, unitTimes: mergedTimes, unitPop: mergedPop }
    }
  } catch {
    // ignore
  }
  return defaultSettings()
}

const API_UNIT_MAP: Record<string, keyof UnitTimes> = {
  spear: 'spear',
  sword: 'sword',
  axe: 'axe',
  spy: 'spy',
  light: 'light',
  heavy: 'heavy',
  ram: 'ram',
  catapult: 'catapult',
  knight: 'knight',
  snob: 'snob',
}

export const useWorldStore = defineStore('world', () => {
  const settings = ref<WorldSettings>(loadFromLS())
  const fetchStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
  const fetchError = ref<string>('')

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(settings.value))
  }

  function updateSettings(partial: Partial<WorldSettings>) {
    settings.value = { ...settings.value, ...partial }
    save()
  }

  function applyPreset(worldCode: string): boolean {
    const preset = KNOWN_WORLDS[worldCode]
    if (!preset) return false
    settings.value = {
      ...defaultSettings(),
      ...preset,
      minAttackSize: settings.value.minAttackSize,
      sendExcludeEnabled: settings.value.sendExcludeEnabled,
      moraleEnabled: settings.value.moraleEnabled,
    } as WorldSettings
    save()
    return true
  }

  async function fetchFromApi(worldCode: string): Promise<void> {
    fetchStatus.value = 'loading'
    fetchError.value = ''
    const base = `/game-proxy/${worldCode}/interface.php`

    try {
      const [unitRes, configRes] = await Promise.all([
        fetch(`${base}?func=get_unit_info`),
        fetch(`${base}?func=get_config`),
      ])

      const [unitText, configText] = await Promise.all([unitRes.text(), configRes.text()])

      const parser = new DOMParser()
      const unitDoc = parser.parseFromString(unitText, 'text/xml')
      const configDoc = parser.parseFromString(configText, 'text/xml')

      const unitTimes: UnitTimes = { ...DEFAULT_UNIT_TIMES }
      const unitPop: UnitPop = { ...DEFAULT_UNIT_POP }

      for (const [apiKey, storeKey] of Object.entries(API_UNIT_MAP)) {
        const speedEl = unitDoc.querySelector(`${apiKey} speed`)
        if (speedEl?.textContent) {
          const val = parseFloat(speedEl.textContent)
          if (!isNaN(val) && val > 0) unitTimes[storeKey] = Math.round(val * 60)
        }
        const popEl = unitDoc.querySelector(`${apiKey} pop`)
        if (popEl?.textContent) {
          const val = parseInt(popEl.textContent, 10)
          if (!isNaN(val) && val > 0) unitPop[storeKey] = val
        }
      }

      const getConfig = (tag: string): string => {
        const el = configDoc.querySelector(tag)
        return el?.textContent ?? ''
      }

      const worldSpeed = parseFloat(getConfig('speed')) || 1
      const unitSpeed = parseFloat(getConfig('unit_speed')) || 1
      const mapSize = parseInt(getConfig('coord map_size'), 10) || 1000
      const nightActive = getConfig('night active') === '1'
      const nightFrom = parseInt(getConfig('night start_hour'), 10) || 1
      const nightTo = parseInt(getConfig('night end_hour'), 10) || 8
      const snobMaxDist = parseInt(getConfig('snob max_dist'), 10) || 60
      const snobIntervalMs = parseInt(getConfig('commands attack_gap'), 10) || 100
      const watchtowerEnabled = getConfig('game watchtower') === '1'

      settings.value = {
        worldCode,
        worldSpeed,
        unitSpeed,
        mapSize,
        nightActive,
        nightFrom,
        nightTo,
        snobMaxDist,
        snobIntervalMs,
        watchtowerEnabled,
        unitTimes,
        unitPop,
        minAttackSize: settings.value.minAttackSize,
        sendExcludeEnabled: settings.value.sendExcludeEnabled,
        moraleEnabled: settings.value.moraleEnabled,
      }
      save()
      fetchStatus.value = 'success'
    } catch (err) {
      fetchStatus.value = 'error'
      fetchError.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  return {
    settings,
    fetchStatus,
    fetchError,
    updateSettings,
    fetchFromApi,
    applyPreset,
    save,
  }
})
