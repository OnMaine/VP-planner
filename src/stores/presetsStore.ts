import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MassConfig } from './planStore'
import { DEFAULT_MASS_CONFIG, usePlanStore } from './planStore'

export interface AttackPreset {
  id: string
  name: string
  description: string
  builtIn?: true
  config: MassConfig
}

function cfg(overrides: Partial<MassConfig> = {}): MassConfig {
  return {
    ...DEFAULT_MASS_CONFIG,
    nobleComposition: { ...DEFAULT_MASS_CONFIG.nobleComposition },
    ...overrides,
  }
}

const BUILT_IN: AttackPreset[] = [
  {
    id: 'bi_off1',
    name: 'Обычный офф',
    description: 'Один офф на цель без дворян и спама',
    builtIn: true,
    config: cfg({ regularOffsPerTarget: 1, nobleTrainSize: 0, useSpamAttacks: false }),
  },
  {
    id: 'bi_off3',
    name: 'Офф × 3',
    description: 'Три оффа на цель, без дворян',
    builtIn: true,
    config: cfg({ regularOffsPerTarget: 3, nobleTrainSize: 0, useSpamAttacks: false }),
  },
  {
    id: 'bi_off_noble',
    name: 'Офф + паровоз',
    description: '3 оффа + паровоз из 4 дворов (999 эскорт)',
    builtIn: true,
    config: cfg({ regularOffsPerTarget: 3, nobleTrainSize: 4 }),
  },
  {
    id: 'bi_split_noble',
    name: 'Разделённый офф + паровоз',
    description: 'Разделённый офф (тараны отдельно) + 4 двора',
    builtIn: true,
    config: cfg({ regularOffsPerTarget: 3, splitOff: true, nobleTrainSize: 4 }),
  },
  {
    id: 'bi_spam_train',
    name: 'Спам паровоз',
    description: '10 спамов + 4 спам-двора + паровоз из 4 дворов',
    builtIn: true,
    config: cfg({
      regularOffsPerTarget: 0,
      nobleTrainSize: 4,
      useSpamAttacks: true,
      spamCountPerTarget: 10,
      useSpamNobles: true,
      spamNobleCountPerTarget: 4,
    }),
  },
  {
    id: 'bi_spam_only',
    name: 'Только спам',
    description: 'Только спам-атаки, без оффов и дворян',
    builtIn: true,
    config: cfg({
      regularOffsPerTarget: 0,
      nobleTrainSize: 0,
      useSpamAttacks: true,
      spamCountPerTarget: 15,
    }),
  },
]

const STORAGE_KEY = 'vp_presets_v1'

export const usePresetsStore = defineStore('presets', () => {
  function _load(): AttackPreset[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as AttackPreset[]) : []
    } catch {
      return []
    }
  }

  function _persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom.value))
  }

  function _deepCopyConfig(config: MassConfig): MassConfig {
    return { ...config, nobleComposition: { ...config.nobleComposition } }
  }

  const custom = ref<AttackPreset[]>(_load())
  const all = computed<AttackPreset[]>(() => [...BUILT_IN, ...custom.value])

  function add(data: Omit<AttackPreset, 'id' | 'builtIn'>): AttackPreset {
    const preset: AttackPreset = { ...data, id: `custom_${Date.now()}` }
    custom.value = [...custom.value, preset]
    _persist()
    return preset
  }

  function update(id: string, changes: Partial<Omit<AttackPreset, 'id' | 'builtIn'>>): void {
    custom.value = custom.value.map((p) => (p.id === id ? { ...p, ...changes } : p))
    _persist()
  }

  function remove(id: string): void {
    custom.value = custom.value.filter((p) => p.id !== id)
    _persist()
  }

  function applyToPlanner(id: string): void {
    const preset = all.value.find((p) => p.id === id)
    if (!preset) return
    usePlanStore().updateMassConfig(_deepCopyConfig(preset.config))
  }

  function clone(id: string): AttackPreset | null {
    const preset = all.value.find((p) => p.id === id)
    if (!preset) return null
    return add({
      name: `${preset.name} (копия)`,
      description: preset.description,
      config: _deepCopyConfig(preset.config),
    })
  }

  return { all, custom, add, update, remove, applyToPlanner, clone }
})
