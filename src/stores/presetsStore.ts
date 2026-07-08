import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ---------------------------------------------------------------------------
// Village role — what ONE village contributes to an attack
// ---------------------------------------------------------------------------

export type VillageRoleType =
  | 'full_off'    // Фулл офф — все офф войска: топоры + ЛК + тараны
  | 'half_off'    // Медиум офф — offFarm между halfOff и fullOff порогами
  | 'mini_off'    // Мини офф — offFarm между smallOff и halfOff порогами
  | 'green_off'   // Зеленка — 50 таранов + ≤999 ЛК/топоров (сопровождение двора)
  | 'cat_squad'   // Кат отряд — катапульты + сопровождение
  | 'spike'       // Колючка — зелёный спам-отряд для пробива дефа (тараны + лаз + ЛК)
  | 'split'       // Поделёнка — войска делятся поровну между дворянами
  | 'spam'        // Спам — много фейк-атак и/или спам-дворян
  | 'custom_off'  // Кастомный — полностью настраиваемый состав атаки

export type GreenVariant = 'light' | 'axes' | 'flexible'

export interface VillageRole {
  type: VillageRoleType
  // split
  nobleCount?: number
  // full_off / half_off — optional noble in the attack
  nobleIncluded?: boolean
  // spike
  spikeRams?: number   // тараны (def 100)
  spikeSpy?: number    // лазутчики (def 1)
  spikeLight?: number  // ЛК (def 899)
  spikeAxe?: number    // топоры (def 0)
  spikeHeavy?: number  // ТК (def 0)
  spikeCat?: number    // катапульты (def 0)
  // custom_off — per-unit: -1 = take all, 0 = skip, positive = fixed count, pct overrides via customUnitPct
  customMin?: number
  customMax?: number
  customColor?: string         // hex цвет бейджа в результатах (def '#e07b39')
  customImageUrl?: string      // user-uploaded image (data URL or object URL)
  customUnits?: Partial<Record<string, number>>
  customUnitPct?: Partial<Record<string, number>> // per-unit percentage (1–100); overrides customUnits when set
  customIsSpam?: boolean // treat as spam in mass editor (enables window/range, groups under Спам)
  // half_off
  halfMin?: number         // мин. юнитов в атаке (def 1001)
  halfMax?: number         // макс. юнитов в атаке (def 5000)
  halfFixedComp?: boolean  // фиксированный состав вместо деления пополам
  halfFixedAxe?: number
  halfFixedLight?: number
  halfFixedHeavy?: number
  halfFixedRam?: number
  // green_off
  greenVariant?: GreenVariant  // тип эскорта (def 'light')
  greenWithRams?: boolean      // тараны (def true)
  greenMin?: number            // мин. эскорт юнитов для flexible (def 0)
  greenMax?: number            // макс. эскорт юнитов (def 999)
  greenTargetAxe?: number      // цель: топоры для flexible (def 500)
  greenTargetLight?: number    // цель: ЛК для flexible (def 250)
  minRams?: number  // мин тараны — для breach-пресетов
  // cat_squad
  catMinCats?: number    // мин катапульт для отряда (def 50)
  catMaxEscort?: number  // макс юнитов сопровождения всего (def 999)
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
  green_off:  'Зеленка',
  cat_squad:  'Кат отряд',
  spike:      'Колючка',
  split:      'Поделёнка',
  spam:       'Спам',
  custom_off: 'Кастомный',
}

export const ALL_ROLE_TYPES: VillageRoleType[] = [
  'full_off', 'half_off', 'mini_off', 'green_off', 'cat_squad', 'spike', 'split', 'spam', 'custom_off',
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
    case 'green_off':  return { type, greenVariant: 'flexible', greenMin: 100, greenMax: 999, greenTargetAxe: 500, greenTargetLight: 250, greenWithRams: false }
    case 'spike':      return { type, spikeRams: 100, spikeSpy: 1, spikeLight: 899 }
    case 'cat_squad':  return { type, catMinCats: 50, catMaxEscort: 999 }
    case 'split':      return { type, nobleCount: 2 }
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
    description: 'Катапульты + сопровождение = 1000 юнитов (сопровождение = 1000 − кол-во кат в отряде)',
    builtIn: true,
    role: { type: 'cat_squad', catMinCats: 50, catMaxEscort: 999 },
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
  const catMaxSize     = _lsRef('vp_cat_max',            200)
  const catSplitSquads = ref(localStorage.getItem('vp_cat_split') !== 'false')
  watch(catSplitSquads, (v) => localStorage.setItem('vp_cat_split', String(v)))

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

  return { all, custom, breachMinRams, fullOffMinOffFarm, halfOffMinOffFarm, smallOffMinOffFarm, catMinSize, catMaxSize, catSplitSquads, add, update, remove, clone }
})
