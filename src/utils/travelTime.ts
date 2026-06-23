/**
 * Calculate travel time in seconds.
 * @param dist       Euclidean distance in tiles
 * @param unitBaseSec Base seconds per tile for this unit
 * @param worldSpeed World speed multiplier (e.g. 1, 2, 3)
 * @param unitSpeed  Unit speed multiplier from world config (default 1)
 */
export function calcTravelSeconds(
  dist: number,
  unitBaseSec: number,
  worldSpeed: number,
  unitSpeed: number,
): number {
  if (worldSpeed <= 0 || unitSpeed <= 0) return Infinity
  return (dist * unitBaseSec) / worldSpeed / unitSpeed
}

/**
 * Subtract travelSec from arrival to get send time.
 */
export function calcSendTime(arrival: Date, travelSec: number): Date {
  return new Date(arrival.getTime() - travelSec * 1000)
}

/**
 * Format a duration in seconds to HH:MM:SS.
 */
export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--:--:--'
  const totalSec = Math.round(sec)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Returns true if the given date's hour falls within the night window.
 * Handles wrap-around (e.g. from=23, to=7).
 */
export function isInNightWindow(date: Date, from: number, to: number): boolean {
  const hour = date.getHours()
  if (from <= to) {
    return hour >= from && hour < to
  }
  // wrap-around: e.g. 23:00 – 07:00
  return hour >= from || hour < to
}
