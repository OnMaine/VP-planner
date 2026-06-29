import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

// ---------------------------------------------------------------------------
// Village role — what ONE village contributes to an attack
// ---------------------------------------------------------------------------

export type VillageRoleType =
  | 'full_off'    // Фулл офф — все офф войска: топоры + ЛК + тараны
  | 'half_off'    // Медиум офф — половина оффа
  | 'pal_off'     // Пал-офф — фулл офф с атакующим паладином
  | 'breach_off'  // Офф пробой — 750+ таранов + офф
  | 'green_off'   // Зеленка — 50 таранов + ≤999 ЛК/топоров (сопровождение двора)
  | 'cat_squad'   // Кат отряд — катапульты + сопровождение
  | 'spike'       // Колючка — зелёный спам-отряд для пробива дефа (тараны + лаз + ЛК)
  | 'train'       // Паровоз — офф + N дворян с сопровождением
  | 'split'       // Поделёнка — войска делятся поровну между дворянами
  | 'spam'        // Спам — много фейк-атак и/или спам-дворян
  | 'custom_off'  // Кастомный — полностью настраиваемый состав атаки

export type GreenVariant = 'light' | 'axes' | 'flexible'

export type TrainAttackType = Exclude<VillageRoleType, 'train'>

export interface TrainAttack {
  type: TrainAttackType
  // green_off
  greenVariant?: GreenVariant
  greenWithRams?: boolean
  greenMin?: number
  greenMax?: number
  greenTargetAxe?: number
  greenTargetLight?: number
  // breach_off
  minRams?: number
  // cat_squad
  catMinCats?: number
  catMaxEscort?: number
  // spam
  spamStrength?: 'weak' | 'strong' | 'full'
  spamNobleCount?: number
  // custom_off
  customPresetId?: string
}

export const TRAIN_ATTACK_LABELS: Record<TrainAttackType, string> = {
  full_off:   'Красный двор',
  half_off:   'Медиум офф',
  pal_off:    'Пал-офф',
  breach_off: 'Офф пробой',
  green_off:  'Зеленка',
  cat_squad:  'Кат отряд',
  spike:      'Колючка',
  split:      'Поделёнка',
  spam:       'Спам',
  custom_off: 'Кастом',
}

export interface VillageRole {
  type: VillageRoleType
  // train — sequence of per-noble attacks
  trainAttacks?: TrainAttack[]
  // split
  nobleCount?: number
  // full_off / half_off / breach_off / pal_off — optional noble in the attack
  nobleIncluded?: boolean
  // spike
  spikeRams?: number   // тараны (def 100)
  spikeSpy?: number    // лазутчики (def 1)
  spikeLight?: number  // ЛК (def 899)
  spikeAxe?: number    // топоры (def 0)
  spikeHeavy?: number  // ТК (def 0)
  spikeCat?: number    // катапульты (def 0)
  // custom_off — per-unit: -1 = take all, 0 = skip, positive = fixed count
  customMin?: number
  customMax?: number
  customColor?: string         // hex цвет бейджа в результатах (def '#e07b39')
  customImageUrl?: string      // user-uploaded image (data URL or object URL)
  customUnits?: Partial<Record<string, number>>
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
  // breach_off
  minRams?: number  // мин тараны (def 750)
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
  full_off:   'Фулл офф',
  half_off:   'Медиум офф',
  pal_off:    'Пал-офф',
  breach_off: 'Офф пробой',
  green_off:  'Зеленка',
  cat_squad:  'Кат отряд',
  spike:      'Колючка',
  train:      'Паровоз',
  split:      'Поделёнка',
  spam:       'Спам',
  custom_off: 'Кастомный',
}

export const ALL_ROLE_TYPES: VillageRoleType[] = [
  'full_off', 'half_off', 'pal_off', 'breach_off',
  'green_off', 'cat_squad', 'spike', 'train', 'split', 'spam', 'custom_off',
]

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

export interface AttackPreset {
  id: string
  name: string
  description: string
  builtIn?: true
  combined?: true
  role: VillageRole
}

// ---------------------------------------------------------------------------
// Default role values per type
// ---------------------------------------------------------------------------

export function defaultRoleForType(type: VillageRoleType): VillageRole {
  switch (type) {
    case 'breach_off': return { type, minRams: 750 }
    case 'half_off':   return { type, halfMin: 1001, halfMax: 5000, halfFixedComp: false }
    case 'custom_off': return { type, customMin: 0, customMax: 99999, customColor: '#e07b39', customUnits: { spear: 0, sword: 0, axe: -1, spy: 0, light: -1, heavy: -1, ram: -1, catapult: 0, knight: 0, snob: 0 } }
    case 'green_off':  return { type, greenVariant: 'flexible', greenMin: 100, greenMax: 999, greenTargetAxe: 500, greenTargetLight: 250, greenWithRams: false }
    case 'spike':      return { type, spikeRams: 100, spikeSpy: 1, spikeLight: 899 }
    case 'cat_squad':  return { type, catMinCats: 50, catMaxEscort: 999 }
    case 'train':      return { type, trainAttacks: [
      { type: 'full_off' },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
    ] }
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
    name: 'Фулл офф',
    description: 'Все офф войска из деревни: топоры + ЛК + тараны',
    builtIn: true,
    role: { type: 'full_off' },
  },
  {
    id: 'bi_half_off',
    name: 'Медиум офф',
    description: 'Половина оффа — 1001–5000 юнитов из деревни',
    builtIn: true,
    role: { type: 'half_off', halfMin: 1001, halfMax: 5000 },
  },
  {
    id: 'bi_pal_off',
    name: 'Пал-офф',
    description: 'Полный офф с атакующим паладином',
    builtIn: true,
    role: { type: 'pal_off' },
  },
  {
    id: 'bi_breach_off',
    name: 'Офф пробой',
    description: 'Офф с увеличенным числом таранов — пробивает стену перед оффами и дворами',
    builtIn: true,
    role: { type: 'breach_off', minRams: 750 },
  },
  {
    id: 'bi_green',
    name: 'Зеленка',
    description: 'Двор + гибкий эскорт (топоры + ЛК + добивка) до 1000 юнитов',
    builtIn: true,
    role: { type: 'green_off', greenVariant: 'flexible', greenMin: 100, greenMax: 999, greenTargetAxe: 500, greenTargetLight: 250 },
  },
  {
    id: 'bi_cat_squad',
    name: 'Кат отряд',
    description: 'Катапульты + сопровождение = 1000 юнитов (сопровождение = 1000 − кол-во кат в отряде)',
    builtIn: true,
    role: { type: 'cat_squad', catMinCats: 50, catMaxEscort: 999 },
  },
  {
    id: 'bi_spike',
    name: 'Колючка',
    description: 'Зелёный спам-отряд для пробива дефа без засвета — тараны + лаз + ЛК (≤1000 юн.)',
    builtIn: true,
    role: { type: 'spike', spikeRams: 100, spikeSpy: 1, spikeLight: 899 },
  },
  {
    id: 'bi_train',
    name: 'Красный паровоз (5)',
    description: '5 атак из 1 деревни: 1-я — фулл офф + двор, остальные 4 — зеленки',
    builtIn: true,
    role: { type: 'train', trainAttacks: [
      { type: 'full_off' },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
    ] },
  },
  {
    id: 'bi_train_green',
    name: 'Зелёный паровоз',
    description: '5 зеленок из одной деревни — до 1000 юнитов в каждой атаке',
    builtIn: true,
    role: { type: 'train', trainAttacks: [
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
    ] },
  },
  {
    id: 'bi_train_split',
    name: 'Паровоз поделёнок (5)',
    description: '5 атак: 2 поделёнки + 3 зеленки — чередование рыжий/зелёный',
    builtIn: true,
    role: { type: 'train', trainAttacks: [
      { type: 'split' },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'split' },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
      { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999 },
    ] },
  },
  {
    id: 'bi_split',
    name: 'Поделёнка',
    description: 'Офф с дворянином — медиум-сила (половина фулл-оффа или вся медиум-дер.)',
    builtIn: true,
    role: { type: 'split', nobleCount: 2 },
  },
  {
    id: 'bi_red_noble',
    name: 'Красный дворянин',
    description: 'Фулл офф + 1 дворянин одной атакой — максимальная сила захвата',
    builtIn: true,
    role: { type: 'full_off', nobleIncluded: true },
  },
  {
    id: 'bi_spam_weak',
    name: 'Спам зелень',
    description: 'Фейк атака — минимум войск для имитации угрозы',
    builtIn: true,
    role: { type: 'spam', spamStrength: 'weak', spamNobleCount: 0, spamTrainSize: 0 },
  },
  {
    id: 'bi_spam_strong',
    name: 'Спам рыжий',
    description: 'Атаки по 1000+ юнитов — вынуждают противника тратить деф',
    builtIn: true,
    role: { type: 'spam', spamStrength: 'strong', spamNobleCount: 0, spamTrainSize: 0 },
  },
  {
    id: 'bi_spam_full',
    name: 'Спам фулкой',
    description: 'Спам атаки с полным оффом — максимальное давление',
    builtIn: true,
    role: { type: 'spam', spamStrength: 'full', spamNobleCount: 0, spamTrainSize: 0 },
  },
  {
    id: 'bi_noble_spam',
    name: 'Спам двор рыжий',
    description: 'Дворянин + 1000 юнитов (копья/микс) — имитация сильного двора',
    builtIn: true,
    role: { type: 'spam', spamStrength: 'strong', spamNobleCount: 1, spamTrainSize: 0 },
  },
  {
    id: 'bi_spam_train',
    name: 'Спам паровоз',
    description: '5 фейк-атак + 5 спам-дворян из одной деревни — имитация захвата',
    builtIn: true,
    combined: true,
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
  const breachMinRams  = _lsRef('vp_breach_min_rams',   750)
  const fullOffMinAxe  = _lsRef('vp_full_off_min_axe',  5000)
  const halfOffMinAxe  = _lsRef('vp_half_off_min_axe',  2000)
  const smallOffMinAxe = _lsRef('vp_small_off_min_axe', 1000)
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

  return { all, custom, breachMinRams, fullOffMinAxe, halfOffMinAxe, smallOffMinAxe, catMinSize, catMaxSize, catSplitSquads, add, update, remove, clone }
})
