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

export interface MassConfig {
  id: string
  name: string
  description: string
  slots: MassSlot[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genSlotId() { return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` }

export function defaultMassSlot(): Omit<MassSlot, 'id'> {
  return { presetId: 'bi_full_off', count: 1, offsetMs: 0, enabled: true }
}

export function blankMassConfig(): Omit<MassConfig, 'id'> {
  return { name: '', description: '', slots: [] }
}

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
  const all      = computed<MassConfig[]>(() => custom.value)
  const activeId = ref<string | null>(localStorage.getItem(LS_ACTIVE))

  const active = computed<MassConfig | null>(
    () => all.value.find((c) => c.id === activeId.value) ?? all.value[0] ?? null
  )

  function setActive(id: string) {
    activeId.value = id
    localStorage.setItem(LS_ACTIVE, id)
  }

  function add(data: Omit<MassConfig, 'id'>): MassConfig {
    const cfg: MassConfig = { ...data, id: genId(), slots: data.slots.map(s => ({ ...s })) }
    custom.value = [...custom.value, cfg]
    _persist()
    return cfg
  }

  function update(id: string, changes: Partial<Omit<MassConfig, 'id'>>): void {
    custom.value = custom.value.map((c) => c.id === id ? { ...c, ...changes } : c)
    _persist()
  }

  function remove(id: string): void {
    custom.value = custom.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      const next = custom.value[0]
      activeId.value = next?.id ?? null
      if (next) localStorage.setItem(LS_ACTIVE, next.id)
      else localStorage.removeItem(LS_ACTIVE)
    }
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
