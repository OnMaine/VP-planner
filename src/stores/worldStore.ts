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

export interface WorldSettings {
  worldCode: string
  worldSpeed: number
  unitSpeed: number
  mapSize: number
  nightActive: boolean
  nightFrom: number
  nightTo: number
  snobMaxDist: number
  snobIntervalMs: number
  watchtowerEnabled: boolean
  unitTimes: UnitTimes
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
    snobMaxDist: 60,
    snobIntervalMs: 100,
    watchtowerEnabled: false,
    unitTimes: { ...DEFAULT_UNIT_TIMES },
  }
}

function loadFromLS(): WorldSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorldSettings
      return { ...defaultSettings(), ...parsed, unitTimes: { ...DEFAULT_UNIT_TIMES, ...parsed.unitTimes } }
    }
  } catch {
    // ignore
  }
  return defaultSettings()
}

// XML unit key mapping from API name → our key
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
    settings.value = { ...defaultSettings(), ...preset } as WorldSettings
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

      // Parse unit speeds
      const unitTimes: UnitTimes = { ...DEFAULT_UNIT_TIMES }
      for (const [apiKey, storeKey] of Object.entries(API_UNIT_MAP)) {
        const el = unitDoc.querySelector(`${apiKey} speed`)
        if (el?.textContent) {
          const val = parseFloat(el.textContent)
          if (!isNaN(val) && val > 0) {
            unitTimes[storeKey] = val
          }
        }
      }

      // Parse world config
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
