import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------

export interface MassSlot {
  id: string
  presetId: string
  count: number       // attacks per target (for train presets: number of trains)
  offsetMs: number    // arrival offset from target arrivalTime (may be negative)
  enabled: boolean
  windowBeforeMin?: number  // spam only: random window, minutes before arrivalTime
  windowAfterMin?: number   // spam only: random window, minutes after arrivalTime
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type NoblePriority = 'distance' | 'built'

export interface MassConfig {
  id: string
  name: string
  description: string
  builtIn?: true
  slots: MassSlot[]
  noblePriority?: NoblePriority  // how to pick noble village; defaults to 'distance'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genSlotId() { return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` }

export function defaultMassSlot(): Omit<MassSlot, 'id'> {
  return { presetId: 'bi_full_off', count: 1, offsetMs: 0, enabled: true }
}

export function blankMassConfig(): Omit<MassConfig, 'id' | 'builtIn'> {
  return { name: '', description: '', slots: [], noblePriority: 'distance' }
}

// ---------------------------------------------------------------------------
// Built-in configs
// ---------------------------------------------------------------------------

const BUILT_IN: MassConfig[] = [
  {
    id: 'bi_real_mass',
    name: 'Реальный масс',
    description: 'Оффы + сильный паровоз + спам до и после',
    builtIn: true,
    slots: [
      { id: 'bsl_rm_spam',   presetId: 'bi_spam_weak',  count: 7,  offsetMs: 0, enabled: true, windowBeforeMin: 60, windowAfterMin: 60 },
      { id: 'bsl_rm_train',  presetId: 'bi_train',      count: 1,  offsetMs: 0, enabled: true },
      { id: 'bsl_rm_breach', presetId: 'bi_breach_off', count: 1,  offsetMs: 0, enabled: true },
      { id: 'bsl_rm_full',   presetId: 'bi_full_off',   count: 2,  offsetMs: 0, enabled: true },
    ],
  },
  {
    id: 'bi_spam_mass',
    name: 'Спамовый масс',
    description: 'Спам атаки + спам паровозы, без реальных оффов',
    builtIn: true,
    slots: [
      { id: 'bsl_sm_spam',   presetId: 'bi_spam_weak',  count: 10, offsetMs: 0, enabled: true, windowBeforeMin: 60, windowAfterMin: 60 },
      { id: 'bsl_sm_strain', presetId: 'bi_spam_train', count: 2,  offsetMs: 0, enabled: true },
    ],
  },
  {
    id: 'bi_spike_mass',
    name: 'Масс колючек',
    description: 'Колючки + спам + зелёные дворы',
    builtIn: true,
    slots: [
      { id: 'bsl_sk_spike',  presetId: 'bi_spike',     count: 3, offsetMs: 0, enabled: true },
      { id: 'bsl_sk_green',  presetId: 'bi_green',     count: 1, offsetMs: 0, enabled: true },
      { id: 'bsl_sk_spam',   presetId: 'bi_spam_weak', count: 3, offsetMs: 0, enabled: true, windowBeforeMin: 60, windowAfterMin: 60 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const LS_CUSTOM = 'vp_mass_configs_v3'
const LS_ACTIVE = 'vp_mass_active_id'

function genId() { return `mc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export const useMassConfigStore = defineStore('massConfig', () => {
  function _loadCustom(): MassConfig[] {
    try {
      const raw = localStorage.getItem(LS_CUSTOM)
      return raw ? (JSON.parse(raw) as MassConfig[]) : []
    } catch { return [] }
  }

  function _persist() {
    localStorage.setItem(LS_CUSTOM, JSON.stringify(custom.value))
  }

  const custom   = ref<MassConfig[]>(_loadCustom())
  const all      = computed<MassConfig[]>(() => [...BUILT_IN, ...custom.value])
  const activeId = ref<string | null>(localStorage.getItem(LS_ACTIVE) ?? BUILT_IN[0].id)

  const active = computed<MassConfig | null>(
    () => all.value.find((c) => c.id === activeId.value) ?? null
  )

  function setActive(id: string) {
    activeId.value = id
    localStorage.setItem(LS_ACTIVE, id)
  }

  function add(data: Omit<MassConfig, 'id' | 'builtIn'>): MassConfig {
    const cfg: MassConfig = { ...data, id: genId(), slots: data.slots.map(s => ({ ...s })) }
    custom.value = [...custom.value, cfg]
    _persist()
    return cfg
  }

  function update(id: string, changes: Partial<Omit<MassConfig, 'id' | 'builtIn'>>): void {
    custom.value = custom.value.map((c) => c.id === id ? { ...c, ...changes } : c)
    _persist()
  }

  function remove(id: string): void {
    custom.value = custom.value.filter((c) => c.id !== id)
    if (activeId.value === id) setActive(BUILT_IN[0].id)
    _persist()
  }

  function clone(id: string): MassConfig | null {
    const src = all.value.find((c) => c.id === id)
    if (!src) return null
    return add({
      name:        `${src.name} (копия)`,
      description: src.description,
      slots:       src.slots.map(s => ({ ...s, id: genSlotId() })),
    })
  }

  function addSlot(configId: string, data: Omit<MassSlot, 'id'>): void {
    custom.value = custom.value.map(c =>
      c.id === configId
        ? { ...c, slots: [...c.slots, { ...data, id: genSlotId() }] }
        : c
    )
    _persist()
  }

  function removeSlot(configId: string, slotId: string): void {
    custom.value = custom.value.map(c =>
      c.id === configId
        ? { ...c, slots: c.slots.filter(s => s.id !== slotId) }
        : c
    )
    _persist()
  }

  function updateSlot(configId: string, slotId: string, patch: Partial<Omit<MassSlot, 'id'>>): void {
    custom.value = custom.value.map(c =>
      c.id === configId
        ? { ...c, slots: c.slots.map(s => s.id === slotId ? { ...s, ...patch } : s) }
        : c
    )
    _persist()
  }

  function reorderSlots(configId: string, newSlots: MassSlot[]): void {
    custom.value = custom.value.map(c =>
      c.id === configId ? { ...c, slots: newSlots } : c
    )
    _persist()
  }

  return { all, custom, active, activeId, setActive, add, update, remove, clone, addSlot, removeSlot, updateSlot, reorderSlots }
})
