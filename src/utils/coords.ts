export interface Coords {
  x: number
  y: number
}

export function parseCoords(s: string): Coords | null {
  const match = s.trim().match(/^(\d+)\|(\d+)$/)
  if (!match) return null
  return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) }
}

export function calcDistance(a: Coords, b: Coords, mapSize: number): number {
  const rawDx = Math.abs(a.x - b.x)
  const rawDy = Math.abs(a.y - b.y)
  const dx = Math.min(rawDx, mapSize - rawDx)
  const dy = Math.min(rawDy, mapSize - rawDy)
  return Math.sqrt(dx * dx + dy * dy)
}
