import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnemyVillage {
  id: number
  name: string
  coords: string
  x: number
  y: number
  playerId: number
  points: number
}

export interface EnemyPlayer {
  id: number
  name: string
  allyId: number
  villages: number
  points: number
}

export interface EnemyAlly {
  id: number
  name: string
  tag: string
}

export interface EnemyVillageInfo {
  village: EnemyVillage
  player: EnemyPlayer | null
  ally: EnemyAlly | null
}

// ---------------------------------------------------------------------------
// File parsers
// ---------------------------------------------------------------------------

async function readFileText(file: File): Promise<string> {
  if (file.name.endsWith('.gz')) {
    const buf = await file.arrayBuffer()
    const ds = new DecompressionStream('gzip')
    const stream = new Blob([buf]).stream().pipeThrough(ds)
    return new Response(stream).text()
  }
  return file.text()
}

function decodeField(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s }
}

function parseVillages(text: string): EnemyVillage[] {
  const result: EnemyVillage[] = []
  for (const line of text.split('\n')) {
    const p = line.trim().split(',')
    if (p.length < 6) continue
    const id = parseInt(p[0], 10)
    const x = parseInt(p[2], 10)
    const y = parseInt(p[3], 10)
    if (isNaN(id) || isNaN(x) || isNaN(y)) continue
    result.push({
      id,
      name: decodeField(p[1]),
      coords: `${x}|${y}`,
      x, y,
      playerId: parseInt(p[4], 10) || 0,
      points: parseInt(p[5], 10) || 0,
    })
  }
  return result
}

function parsePlayers(text: string): EnemyPlayer[] {
  const result: EnemyPlayer[] = []
  for (const line of text.split('\n')) {
    const p = line.trim().split(',')
    if (p.length < 5) continue
    const id = parseInt(p[0], 10)
    if (isNaN(id)) continue
    result.push({
      id,
      name: decodeField(p[1]),
      allyId: parseInt(p[2], 10) || 0,
      villages: parseInt(p[3], 10) || 0,
      points: parseInt(p[4], 10) || 0,
    })
  }
  return result
}

function parseAllies(text: string): EnemyAlly[] {
  const result: EnemyAlly[] = []
  for (const line of text.split('\n')) {
    const p = line.trim().split(',')
    if (p.length < 3) continue
    const id = parseInt(p[0], 10)
    if (isNaN(id)) continue
    result.push({ id, name: decodeField(p[1]), tag: decodeField(p[2]) })
  }
  return result
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEnemyDataStore = defineStore('enemyData', () => {
  const villages = ref<EnemyVillage[]>([])
  const players = ref<EnemyPlayer[]>([])
  const allies = ref<EnemyAlly[]>([])

  const loadError = ref('')
  const loading = ref(false)

  // Lookup maps (recomputed when data changes)
  const villageByCoords = computed(() => {
    const m = new Map<string, EnemyVillage>()
    for (const v of villages.value) m.set(v.coords, v)
    return m
  })

  const playerById = computed(() => {
    const m = new Map<number, EnemyPlayer>()
    for (const p of players.value) m.set(p.id, p)
    return m
  })

  const allyById = computed(() => {
    const m = new Map<number, EnemyAlly>()
    for (const a of allies.value) m.set(a.id, a)
    return m
  })

  const playerByName = computed(() => {
    const m = new Map<string, EnemyPlayer>()
    for (const p of players.value) m.set(p.name, p)
    return m
  })

  function lookupCoords(coords: string): EnemyVillageInfo | null {
    const village = villageByCoords.value.get(coords)
    if (!village) return null
    const player = village.playerId ? (playerById.value.get(village.playerId) ?? null) : null
    const ally = player?.allyId ? (allyById.value.get(player.allyId) ?? null) : null
    return { village, player, ally }
  }

  async function loadVillageFile(file: File): Promise<number> {
    loading.value = true
    loadError.value = ''
    try {
      const text = await readFileText(file)
      const parsed = parseVillages(text)
      if (!parsed.length) { loadError.value = 'Файл пустой или неверный формат'; return 0 }
      villages.value = parsed
      return parsed.length
    } catch (e) {
      loadError.value = `Помилка читання файлу: ${String(e)}`
      return 0
    } finally {
      loading.value = false
    }
  }

  async function loadPlayerFile(file: File): Promise<number> {
    loading.value = true
    loadError.value = ''
    try {
      const text = await readFileText(file)
      const parsed = parsePlayers(text)
      if (!parsed.length) { loadError.value = 'Файл пустой или неверный формат'; return 0 }
      players.value = parsed
      return parsed.length
    } catch (e) {
      loadError.value = `Помилка читання файлу: ${String(e)}`
      return 0
    } finally {
      loading.value = false
    }
  }

  async function loadAllyFile(file: File): Promise<number> {
    loading.value = true
    loadError.value = ''
    try {
      const text = await readFileText(file)
      const parsed = parseAllies(text)
      if (!parsed.length) { loadError.value = 'Файл пустой или неверный формат'; return 0 }
      allies.value = parsed
      return parsed.length
    } catch (e) {
      loadError.value = `Помилка читання файлу: ${String(e)}`
      return 0
    } finally {
      loading.value = false
    }
  }

  function clearAll() {
    villages.value = []
    players.value = []
    allies.value = []
    loadError.value = ''
  }

  const hasVillageData = computed(() => villages.value.length > 0)
  const hasPlayerData = computed(() => players.value.length > 0)
  const hasAllyData = computed(() => allies.value.length > 0)

  return {
    villages, players, allies,
    loadError, loading,
    villageByCoords, playerById, playerByName, allyById,
    lookupCoords,
    loadVillageFile, loadPlayerFile, loadAllyFile,
    clearAll,
    hasVillageData, hasPlayerData, hasAllyData,
  }
})
