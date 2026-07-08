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
  const ms  = Math.round(sec * 1000)
  const h   = Math.floor(ms / 3_600_000)
  const m   = Math.floor((ms % 3_600_000) / 60_000)
  const s   = Math.floor((ms % 60_000) / 1000)
  const msr = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msr).padStart(3, '0')}`
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
