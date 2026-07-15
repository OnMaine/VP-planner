import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ---------------------------------------------------------------------------
// Catapult target building
// ---------------------------------------------------------------------------

export type CatTarget =
  | 'main' | 'barracks' | 'stable' | 'garage' | 'smith'
  | 'market' | 'wood' | 'stone' | 'iron' | 'farm'
  | 'storage' | 'hide' | 'wall' | 'watchtower' | 'statue'

export const CAT_TARGET_LABELS: Record<CatTarget, string> = {
  main:       'Ратуша',
  barracks:   'Казарма',
  stable:     'Конюшня',
  garage:     'Мастерская',
  smith:      'Кузница',
  market:     'Рынок',
  wood:       'Лесопилка',
  stone:      'Глиняная яма',
  iron:       'Железная шахта',
  farm:       'Усадьба',
  storage:    'Склад',
  hide:       'Тайник',
  wall:       'Стена',
  watchtower: 'Сторожевая башня',
  statue:     'Статуя',
}

// ---------------------------------------------------------------------------
// Village role — what ONE village contributes to an attack
// ---------------------------------------------------------------------------

export type VillageRoleType =
  | 'full_off'    // Фулл офф — все офф войска: топоры + ЛК + тараны
  | 'half_off'    // Медиум офф — offFarm между halfOff и fullOff порогами
  | 'mini_off'    // Мини офф — offFarm между smallOff и halfOff порогами
  | 'cat_squad'   // Кат отряд — катапульты + сопровождение
  | 'spam'        // Спам — много фейк-атак и/или спам-дворян
  | 'custom_off'  // Кастомный — полностью настраиваемый состав атаки


export interface VillageRole {
  type: VillageRoleType
  // full_off / half_off — optional noble in the attack
  nobleIncluded?: boolean
  // custom_off — per-unit: -1 = take all, 0 = skip, positive = fixed count, pct overrides via customUnitPct
  customMin?: number
  customMax?: number
  customColor?: string         // hex цвет бейджа в результатах (def '#e07b39')
  customImageUrl?: string      // user-uploaded image (data URL or object URL)
  customUnits?: Partial<Record<string, number>>
  customUnitPct?: Partial<Record<string, number>> // per-unit percentage (1–100); overrides customUnits when set
  customUnitMin?: Partial<Record<string, number>> // per-unit minimum in village troops required for eligibility
  customIsSpam?: boolean // treat as spam in mass editor (enables window/range, groups under Спам)
  // half_off
  halfMin?: number         // мин. юнитов в атаке (def 1001)
  halfMax?: number         // макс. юнитов в атаке (def 5000)
  halfFixedComp?: boolean  // фиксированный состав вместо деления пополам
  halfFixedAxe?: number
  halfFixedLight?: number
  halfFixedHeavy?: number
  halfFixedRam?: number
  minRams?: number
  // cat_squad
  catMinCats?: number    // мин катапульт для отряда (def 50)
  catTarget?: CatTarget  // целевое здание
  // spam
  spamCount?: number               // кол-во спам-атак (def 10)
  spamStrength?: 'weak' | 'strong' | 'full' // слабый / рыжий (1000+) / фуллами (def 'weak')
  spamNobleCount?: number          // кол-во спам-дворян (def 0)
  spamTrainSize?: number           // размер спам-паровоза (def 0 = нет)
}

export const ROLE_LABELS: Record<VillageRoleType, string> = {
  full_off:   'Full_OFF',
  half_off:   'Mid_OFF',
  mini_off:   'Mini_OFF',
  cat_squad:  'Кат отряд',
  spam:       'Спам',
  custom_off: 'Кастомный',
}

export const ALL_ROLE_TYPES: VillageRoleType[] = [
  'full_off', 'half_off', 'mini_off', 'cat_squad', 'spam', 'custom_off',
]

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

export interface AttackPreset {
  id: string
  name: string
  description: string
  color?: string   // display color for badge + BB code; falls back to defaultColorForRole
  builtIn?: true
  combined?: true
  role: VillageRole
}

export function defaultColorForRole(type: VillageRoleType, role?: VillageRole): string {
  switch (type) {
    case 'full_off':   return '#e94560'
    case 'half_off':   return '#c87d3e'
    case 'mini_off':   return '#b8a832'
    case 'cat_squad':  return '#89b4fa'
    case 'spam':       return '#4ecca3'
    case 'custom_off': return (role as { customColor?: string } | undefined)?.customColor ?? '#e07b39'
    default:           return '#e94560'
  }
}

// ---------------------------------------------------------------------------
// Default role values per type
// ---------------------------------------------------------------------------

export function defaultRoleForType(type: VillageRoleType): VillageRole {
  switch (type) {
    case 'half_off':   return { type, halfMin: 1001, halfMax: 5000, halfFixedComp: false }
    case 'custom_off': return { type, customMin: 0, customMax: 99999, customColor: '#e07b39', customUnits: { spear: 0, sword: 0, axe: -1, spy: 0, light: -1, heavy: -1, ram: -1, catapult: 0, knight: 0, snob: 0 } }
    case 'cat_squad':  return { type, catMinCats: 50 }
    case 'spam':       return { type, spamCount: 10, spamStrength: 'weak', spamNobleCount: 0, spamTrainSize: 0 }
    default:           return { type }
  }
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const BUILT_IN: AttackPreset[] = [
  {
    id: 'bi_full_off',
    name: 'Full_OFF',
    description: 'Все офф войска из деревни: топоры + ЛК + тараны',
    builtIn: true,
    role: { type: 'full_off' },
  },
  {
    id: 'bi_half_off',
    name: 'Mid_OFF',
    description: 'Средний офф — offFarm между порогами мед и фулл (из настроек импорта)',
    builtIn: true,
    role: { type: 'half_off', halfMin: 1001, halfMax: 5000 },
  },
  {
    id: 'bi_mini_off',
    name: 'Mini_OFF',
    description: 'Мини офф — offFarm между порогами мини и мед (из настроек импорта)',
    builtIn: true,
    role: { type: 'mini_off' },
  },
  {
    id: 'bi_cat_squad',
    name: 'CAT',
    description: 'Все катапульты деревни в одном отряде',
    builtIn: true,
    role: { type: 'cat_squad', catMinCats: 50 },
  },
  {
    id: 'bi_spam_weak',
    name: 'Time_SPAM',
    description: 'Фейк атака — минимум войск для имитации угрозы',
    builtIn: true,
    role: { type: 'spam', spamStrength: 'weak', spamNobleCount: 0, spamTrainSize: 0 },
  },
  {
    id: 'bi_spam_train',
    name: 'Train_SPAM_x5',
    description: '5 фейк-атак с дворянином из одной деревни — имитация захвата',
    builtIn: true,
    combined: true,
    color: '#4ecca3',
    role: { type: 'spam', spamCount: 5, spamStrength: 'weak', spamNobleCount: 5, spamTrainSize: 5 },
  },
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vp_presets_v2'

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

  function _lsRef(key: string, def: number) {
    const v = parseInt(localStorage.getItem(key) ?? '', 10)
    const r = ref(isNaN(v) ? def : v)
    watch(r, (val) => localStorage.setItem(key, String(val)))
    return r
  }

  // Global off classification thresholds — shared with ImportStats
  // offFarm = axe*pop.axe + light*pop.light + ram*pop.ram  (catapult is a separate mechanic)
  const breachMinRams     = _lsRef('vp_breach_min_rams',       750)
  const fullOffMinOffFarm = _lsRef('vp_full_off_min_off_farm', 13400)
  const halfOffMinOffFarm = _lsRef('vp_half_off_min_off_farm', 8175)
  const smallOffMinOffFarm= _lsRef('vp_small_off_min_off_farm',3100)
  const catMinSize     = _lsRef('vp_cat_min',            50)
  const _rawCatTarget  = localStorage.getItem('vp_cat_target') as CatTarget | null
  const catDefaultTarget = ref<CatTarget | undefined>(_rawCatTarget ?? undefined)
  watch(catDefaultTarget, (v) => {
    if (v) localStorage.setItem('vp_cat_target', v)
    else   localStorage.removeItem('vp_cat_target')
  })

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

  function clone(id: string): AttackPreset | null {
    const preset = all.value.find((p) => p.id === id)
    if (!preset) return null
    return add({
      name: `${preset.name} (копия)`,
      description: preset.description,
      combined: preset.combined,
      role: { ...preset.role },
    })
  }

  return { all, custom, breachMinRams, fullOffMinOffFarm, halfOffMinOffFarm, smallOffMinOffFarm, catMinSize, catDefaultTarget, add, update, remove, clone }
})
