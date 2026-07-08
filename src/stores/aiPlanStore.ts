import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { callAI, type AIProvider, type AITool } from '@/utils/aiProviders'
import { useMassConfigStore, type MassSlot } from './massConfigStore'
import { usePresetsStore, defaultRoleForType, type VillageRoleType } from './presetsStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIPresetSpec {
  ref_id: string                       // temporary ref used inside slots[]
  name: string
  description?: string
  type: VillageRoleType
  // half_off
  halfMin?: number
  halfMax?: number
  minRams?: number
  // cat_squad
  catMinCats?: number
  catMaxEscort?: number
  nobleIncluded?: boolean
  // spam
  spamCount?: number
  spamStrength?: 'weak' | 'strong' | 'full'
  spamNobleCount?: number
  spamTrainSize?: number
}

export interface AISlotSpec {
  preset_ref: string       // built-in preset ID or ref_id from custom_presets
  count: number
  offset_min?: number      // arrival offset in minutes (may be negative)
  window_before_min?: number  // spam only
  window_after_min?: number   // spam only
}

export interface AIMassProposal {
  reasoning: string
  name?: string
  // Explicit presets + slots (preferred for custom scenarios)
  custom_presets?: AIPresetSpec[]
  slots?: AISlotSpec[]
  // High-level shorthand (simple cases, fallback when slots not given)
  offs_enabled?: boolean; offs_count?: number
  spam_train_enabled?: boolean; spam_train_count?: number; spam_train_offset_ms?: number
  spam_enabled?: boolean; spam_count?: number
  spam_window_before_off_min?: number; spam_window_after_noble_min?: number
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM = `Ты — ИИ-помощник для планирования массовых атак в игре Tribal Wars.
Настрой параметры масс-атаки и при необходимости создай кастомные пресеты атак.

Термины:
- Офф (full_off) — все атак. войска: топоры + лёгкая кав + тараны
- Медиум офф (half_off) — часть оффа, halfMin–halfMax юнитов
- Кат отряд (cat_squad) — катапульты + сопровождение
- Спам (spam) — weak=фейки; spamNobleCount=фейк-дворяне; spamTrainSize=паровоз
- Кастомный (custom_off) — полностью настраиваемый состав

Встроенные пресеты (используй в slots[].preset_ref):
  bi_full_off, bi_half_off, bi_mini_off, bi_cat_squad, bi_spam_weak, bi_spam_train

Когда использовать custom_presets:
- Нужен медиум офф с конкретными пороговыми значениями
- Нужен спам с особым количеством дворян
- Нестандартный состав войск

Стратегии: offs_count 1–2=мало войск, 3–4=стандарт, 5+=много. spam_count 10–20 стандарт.
Offset: оффы прилетают первыми (offset 0), паровоз через 500–2000 мс после.

Отвечай ТОЛЬКО через инструмент configure_mass_attack. reasoning на русском.`

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const PRESET_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    ref_id:       { type: 'string', description: 'Временный ID для использования в slots[].preset_ref' },
    name:         { type: 'string', description: 'Название пресета' },
    description:  { type: 'string', description: 'Описание пресета' },
    type:         { type: 'string', enum: ['full_off','half_off','mini_off','cat_squad','spam','custom_off'], description: 'Тип пресета' },
    halfMin:      { type: 'number', description: 'Мин. юнитов (half_off)' },
    halfMax:      { type: 'number', description: 'Макс. юнитов (half_off)' },
    catMinCats:   { type: 'number', description: 'Мин. катапульт (cat_squad)' },
    catMaxEscort: { type: 'number', description: 'Макс. сопровождения (cat_squad)' },
    nobleIncluded: { type: 'boolean', description: 'Включить двор в атаку (full_off)' },
    spamCount:    { type: 'number', description: 'Кол-во спам атак (spam)' },
    spamStrength: { type: 'string', enum: ['weak','strong','full'] },
    spamNobleCount: { type: 'number' },
    spamTrainSize:  { type: 'number' },
  },
  required: ['ref_id', 'name', 'type'],
}

const SLOT_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    preset_ref:       { type: 'string', description: 'ID встроенного пресета (bi_full_off и т.д.) или ref_id из custom_presets' },
    count:            { type: 'number', description: 'Кол-во атак на цель' },
    offset_min:       { type: 'number', description: 'Смещение прилёта в минутах (может быть отрицательным)' },
    window_before_min:{ type: 'number', description: 'Только для спама: окно до оффов в минутах' },
    window_after_min: { type: 'number', description: 'Только для спама: окно после захвата в минутах' },
  },
  required: ['preset_ref', 'count'],
}

const CONFIGURE_TOOL: AITool = {
  name: 'configure_mass_attack',
  description: 'Настроить параметры массовой атаки, при необходимости создав кастомные пресеты',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Объяснение предложенной конфигурации на русском языке',
      },
      name: {
        type: 'string',
        description: 'Название конфигурации (краткое, без префикса AI)',
      },
      custom_presets: {
        type: 'array',
        items: PRESET_SPEC_SCHEMA,
        description: 'Кастомные пресеты для создания. Используй когда нужен нестандартный паровоз, специфичные пороги или особые параметры.',
      },
      slots: {
        type: 'array',
        items: SLOT_SPEC_SCHEMA,
        description: 'Явные слоты конфига. Если задан — используется вместо высокоуровневых полей offs_count и т.д. Порядок: сначала спам, потом пробой/оффы, потом паровоз.',
      },
      offs_enabled: { type: 'boolean', description: 'Включить оффы' },
      offs_count:   { type: 'number',  description: 'Количество оффов на цель (1–10)' },
      spam_train_enabled:  { type: 'boolean', description: 'Включить спам-паровоз' },
      spam_train_count:    { type: 'number',  description: 'Количество спам-паровозов на цель' },
      spam_train_offset_ms:{ type: 'number',  description: 'Смещение прилёта спам-паровоза в миллисекундах' },
      spam_enabled: { type: 'boolean', description: 'Включить спам (фейк-атаки)' },
      spam_count:   { type: 'number',  description: 'Количество фейк-атак на цель (1–50)' },
      spam_window_before_off_min:  { type: 'number', description: 'Окно до оффов в минутах (default 60)' },
      spam_window_after_noble_min: { type: 'number', description: 'Окно после захвата в минутах (default 60)' },
    },
    required: ['reasoning'],
  },
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const LS_MODE     = 'vp_planner_mode'
const LS_PROVIDER = 'vp_ai_provider'

function _lsKeyFor(p: AIProvider) { return `vp_ai_key_${p}` }

export { type AIProvider }

export const useAIPlanStore = defineStore('aiPlan', () => {
  const provider = ref<AIProvider>(
    (localStorage.getItem(LS_PROVIDER) as AIProvider | null) ?? 'anthropic',
  )
  const apiKeys = ref<Record<AIProvider, string>>({
    anthropic: localStorage.getItem(_lsKeyFor('anthropic')) ?? '',
    groq:      localStorage.getItem(_lsKeyFor('groq'))      ?? '',
    gemini:    localStorage.getItem(_lsKeyFor('gemini'))    ?? '',
  })
  const mode    = ref<'manual' | 'ai'>((localStorage.getItem(LS_MODE) as 'manual' | 'ai') ?? 'manual')
  const status  = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
  const proposal = ref<AIMassProposal | null>(null)
  const errorMsg = ref<string>('')

  const currentApiKey = computed(() => apiKeys.value[provider.value])

  function setProvider(p: AIProvider) {
    provider.value = p
    localStorage.setItem(LS_PROVIDER, p)
  }

  function setApiKey(p: AIProvider, key: string) {
    apiKeys.value[p] = key
    localStorage.setItem(_lsKeyFor(p), key)
  }

  function setMode(m: 'manual' | 'ai') {
    mode.value = m
    localStorage.setItem(LS_MODE, m)
  }

  async function ask(userRequest: string, contextText: string): Promise<void> {
    if (!currentApiKey.value) {
      errorMsg.value = 'API ключ не задан'
      status.value = 'error'
      return
    }

    status.value = 'loading'
    errorMsg.value = ''
    proposal.value = null

    const userMessage = `${contextText}\n\nЗапрос: ${userRequest}`

    try {
      const result = await callAI(provider.value, currentApiKey.value, SYSTEM, userMessage, CONFIGURE_TOOL)
      proposal.value = result as unknown as AIMassProposal
      status.value = 'done'
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : String(err)
      status.value = 'error'
    }
  }

  function applyProposal(): void {
    if (!proposal.value) return

    const massStore  = useMassConfigStore()
    const presStore  = usePresetsStore()
    const p          = proposal.value

    // Step 1: create custom presets, build ref_id → real ID map
    const refMap: Record<string, string> = {}
    if (p.custom_presets?.length) {
      for (const spec of p.custom_presets) {
        const base = defaultRoleForType(spec.type as VillageRoleType)
        const role = {
          ...base,
          ...(spec.halfMin        != null ? { halfMin:        spec.halfMin }        : {}),
          ...(spec.halfMax        != null ? { halfMax:        spec.halfMax }        : {}),
          ...(spec.minRams        != null ? { minRams:        spec.minRams }        : {}),
          ...(spec.catMinCats     != null ? { catMinCats:     spec.catMinCats }     : {}),
          ...(spec.catMaxEscort   != null ? { catMaxEscort:   spec.catMaxEscort }   : {}),
          ...(spec.nobleIncluded  != null ? { nobleIncluded:  spec.nobleIncluded }  : {}),
          ...(spec.spamCount      != null ? { spamCount:      spec.spamCount }      : {}),
          ...(spec.spamStrength   != null ? { spamStrength:   spec.spamStrength }   : {}),
          ...(spec.spamNobleCount != null ? { spamNobleCount: spec.spamNobleCount } : {}),
          ...(spec.spamTrainSize  != null ? { spamTrainSize:  spec.spamTrainSize }  : {}),
        }
        const created = presStore.add({
          name: spec.name,
          description: spec.description ?? '',
          role,
        })
        refMap[spec.ref_id] = created.id
      }
    }

    // Step 2: build slots
    function _slotId() { return `sl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` }

    let slots: MassSlot[]
    if (p.slots?.length) {
      // Explicit slot list from AI
      slots = p.slots.map(s => ({
        id: _slotId(),
        presetId: refMap[s.preset_ref] ?? s.preset_ref,
        count:    s.count,
        offsetMs: (s.offset_min ?? 0) * 60_000,
        enabled:  true,
        ...(s.window_before_min != null ? { windowBeforeMin: s.window_before_min } : {}),
        ...(s.window_after_min  != null ? { windowAfterMin:  s.window_after_min  } : {}),
      }))
    } else {
      // Fall back to high-level shorthand fields
      slots = []
      if (p.spam_enabled && (p.spam_count ?? 0) > 0) {
        slots.push({ id: _slotId(), presetId: 'bi_spam_weak', count: p.spam_count!, offsetMs: 0, enabled: true,
          windowBeforeMin: p.spam_window_before_off_min ?? 60,
          windowAfterMin:  p.spam_window_after_noble_min ?? 60 })
      }
      if (p.offs_enabled && (p.offs_count ?? 0) > 0) {
        slots.push({ id: _slotId(), presetId: 'bi_full_off', count: p.offs_count!, offsetMs: 0, enabled: true })
      }
      if (p.spam_train_enabled && (p.spam_train_count ?? 0) > 0) {
        slots.push({ id: _slotId(), presetId: 'bi_spam_train', count: p.spam_train_count!, offsetMs: p.spam_train_offset_ms ?? 0, enabled: true })
      }
    }

    const cfg = massStore.add({
      name:        p.name ? `AI: ${p.name}` : 'AI конфиг',
      description: p.reasoning.slice(0, 200),
      slots,
    })
    massStore.setActive(cfg.id)

    proposal.value = null
    status.value   = 'idle'
  }

  function updateProposal(patch: Partial<AIMassProposal>): void {
    if (!proposal.value) return
    proposal.value = { ...proposal.value, ...patch }
  }

  function dismissProposal(): void {
    proposal.value = null
    status.value = 'idle'
  }

  return {
    provider,
    apiKeys,
    currentApiKey,
    mode,
    status,
    proposal,
    errorMsg,
    setProvider,
    setApiKey,
    setMode,
    ask,
    applyProposal,
    updateProposal,
    dismissProposal,
  }
})
