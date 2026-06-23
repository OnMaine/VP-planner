import { computed } from 'vue'
import type { Ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import type { Target } from '@/stores/planStore'

export type GroupBy = 'none' | 'player' | 'tribe' | 'arrival' | 'tower'

export interface TargetBlock {
  key: string
  label: string
  sublabel?: string
  targets: Target[]
}

export function useTargetGroups(groupBy: Ref<GroupBy>, towerCoordsSet: Ref<Set<string>>) {
  const planStore = usePlanStore()
  const enemyStore = useEnemyDataStore()

  const targetBlocks = computed<TargetBlock[]>(() => {
    const targets = [...planStore.targets]
    const by = groupBy.value

    if (by === 'none') return [{ key: '__all', label: '', targets }]

    const buckets = new Map<string, TargetBlock>()

    const addTo = (key: string, label: string, sublabel: string | undefined, t: Target) => {
      if (!buckets.has(key)) buckets.set(key, { key, label, sublabel, targets: [] })
      buckets.get(key)!.targets.push(t)
    }

    for (const t of targets) {
      const info = enemyStore.lookupCoords(t.coords)

      if (by === 'player') {
        const name = info?.player?.name ?? t.enemyPlayer ?? '(невідомо)'
        const ally = info?.ally?.tag ?? t.enemyAllyTag ?? ''
        addTo(name, name, ally ? `[${ally}]` : undefined, t)
      } else if (by === 'tribe') {
        const ally = info?.ally?.tag ?? t.enemyAllyTag ?? '(без племені)'
        addTo(ally, ally, undefined, t)
      } else if (by === 'arrival') {
        const d = t.arrivalTime
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const label = d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
        addTo(key, label, undefined, t)
      } else if (by === 'tower') {
        const hasTower = towerCoordsSet.value.has(t.coords)
        const key = hasTower ? 'tower' : 'no_tower'
        const label = hasTower ? 'З вежею' : 'Без вежі'
        addTo(key, label, undefined, t)
      }
    }

    const blocks = [...buckets.values()]
    if (by === 'arrival') blocks.sort((a, b) => a.key.localeCompare(b.key))
    else if (by === 'tower') blocks.sort((a) => (a.key === 'tower' ? -1 : 1))
    else blocks.sort((a, b) => a.label.localeCompare(b.label))

    for (const block of blocks) {
      block.targets.sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
    }

    return blocks
  })

  return { targetBlocks }
}
