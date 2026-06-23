import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'

export function usePlayerResolution() {
  const planStore = usePlanStore()
  const enemyStore = useEnemyDataStore()

  function resolveTargetPlayer(t: { coords: string; enemyPlayer?: string }): string {
    return (
      enemyStore.lookupCoords(t.coords)?.player?.name ??
      t.enemyPlayer ??
      planStore.watchtowerVillages.find((w) => w.coords === t.coords)?.player ??
      ''
    )
  }

  function resolveTowerPlayer(wt: { coords: string; player: string }): string {
    return (
      enemyStore.lookupCoords(wt.coords)?.player?.name ??
      (wt.player || planStore.targets.find((t) => t.coords === wt.coords)?.enemyPlayer) ??
      ''
    )
  }

  return { resolveTargetPlayer, resolveTowerPlayer }
}
