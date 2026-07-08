import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface VillageTroops {
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

export interface Village {
  villageId?: number
  player: string
  coords: string
  x: number
  y: number
  points: number
  troops: VillageTroops
}

const LS_KEY = 'vp_villages'

// CSV header → troop key mapping (Ukrainian headers)
const HEADER_MAP: Record<string, keyof VillageTroops> = {
  Копья: 'spear',
  Мечи: 'sword',
  Топоры: 'axe',
  Лазы: 'spy',
  ЛК: 'light',
  ТК: 'heavy',
  Тараны: 'ram',
  Каты: 'catapult',
  Пал: 'knight',
  Двор: 'snob',
}

function loadFromLS(): Village[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Village[]
  } catch {
    // ignore
  }
  return []
}

export const useVillagesStore = defineStore('villages', () => {
  const villages = ref<Village[]>(loadFromLS())

  const playerCount = computed(() => new Set(villages.value.map((v) => v.player)).size)

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(villages.value))
  }

  function parseCSV(text: string): { count: number; playerCount: number } {
    const lines = text.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length < 2) return { count: 0, playerCount: 0 }

    const headers = lines[0].split(',').map((h) => h.trim())

    // Locate fixed column indices
    const playerIdx = headers.indexOf('Игрок')
    const coordsIdx = headers.indexOf('Координаты')
    const pointsIdx = headers.indexOf('Очки')
    const idIdx     = headers.indexOf('ID')

    if (playerIdx === -1 || coordsIdx === -1) {
      throw new Error('CSV не содержит обязательных колонок "Игрок" или "Координаты"')
    }

    // Map troop column indices
    const troopIndices: Array<{ idx: number; key: keyof VillageTroops }> = []
    headers.forEach((h, i) => {
      const key = HEADER_MAP[h]
      if (key) troopIndices.push({ idx: i, key })
    })

    const parsed: Village[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim())
      if (cols.length < Math.max(playerIdx, coordsIdx) + 1) continue

      const player    = cols[playerIdx] ?? ''
      const coords    = cols[coordsIdx] ?? ''
      const points    = pointsIdx >= 0 ? parseInt(cols[pointsIdx]  ?? '0', 10) || 0 : 0
      const villageId = idIdx     >= 0 ? parseInt(cols[idIdx]      ?? '',  10) || undefined : undefined

      const match = coords.match(/^(\d+)\|(\d+)$/)
      if (!match) continue

      const x = parseInt(match[1], 10)
      const y = parseInt(match[2], 10)

      const troops: VillageTroops = {
        spear: 0, sword: 0, axe: 0, spy: 0, light: 0,
        heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0,
      }

      for (const { idx, key } of troopIndices) {
        troops[key] = parseInt(cols[idx] ?? '0', 10) || 0
      }

      parsed.push({ villageId, player, coords, x, y, points, troops })
    }

    villages.value = parsed
    save()
    return { count: parsed.length, playerCount: new Set(parsed.map((v) => v.player)).size }
  }

  function upsertVillage(v: Village): boolean {
    const idx = villages.value.findIndex(u => u.coords === v.coords)
    if (idx >= 0) {
      villages.value[idx] = v
    } else {
      villages.value.push(v)
    }
    save()
    return idx >= 0
  }

  function removeVillage(coords: string): void {
    villages.value = villages.value.filter(v => v.coords !== coords)
    save()
  }

  function clear() {
    villages.value = []
    save()
  }

  return {
    villages,
    playerCount,
    parseCSV,
    upsertVillage,
    removeVillage,
    clear,
    save,
  }
})
