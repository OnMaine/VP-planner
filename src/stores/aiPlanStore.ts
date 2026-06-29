import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { callAI, type AIProvider, type AITool } from '@/utils/aiProviders'
import { useMassConfigStore, blankMassConfig } from './massConfigStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIMassProposal {
  reasoning: string
  name?: string
  offs_enabled?: boolean; offs_count?: number
  spikes_enabled?: boolean; spikes_count?: number
  noble_train_enabled?: boolean; noble_train_count?: number; noble_train_offset_ms?: number
  green_nobles_enabled?: boolean; green_nobles_count?: number; green_nobles_offset_ms?: number
  spam_train_enabled?: boolean; spam_train_count?: number; spam_train_offset_ms?: number
  spam_enabled?: boolean; spam_count?: number
  spam_window_before_off_min?: number; spam_window_after_noble_min?: number
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM = `Ты — ИИ-помощник для планирования массовых атак в игре Tribal Wars.
Настрой параметры масс-атаки на основе запроса игрока и доступных данных.

Термины: Офф — топоры+лёгкая кав+тараны. Паровоз — цепочка дворян. Колючка — атака на защитника. Зелёный двор — двор с малым эскортом. Спам — фейк-атаки. Спам-паровоз — фейковые дворяне.

Рекомендации по offs_count: 1–2 если мало войск, 3–4 стандарт, 5+ если много.
spam_count — сколько фейков на цель (10–20 стандарт). Фейки приходят случайно в окне [оффы − window_before_off_sec … захват + window_after_noble_sec].

Отвечай ТОЛЬКО через инструмент configure_mass_attack. Объяснение reasoning на русском.`

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const CONFIGURE_TOOL: AITool = {
  name: 'configure_mass_attack',
  description: 'Настроить параметры массовой атаки',
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
      offs_enabled: {
        type: 'boolean',
        description: 'Включить оффы (топоры + лёгкая кавалерия + тараны)',
      },
      offs_count: {
        type: 'number',
        description: 'Количество оффов на цель (1–10)',
      },
      spikes_enabled: {
        type: 'boolean',
        description: 'Включить колючки (атаки на защитников)',
      },
      spikes_count: {
        type: 'number',
        description: 'Количество колючек на цель',
      },
      noble_train_enabled: {
        type: 'boolean',
        description: 'Включить паровоз (цепочка дворян)',
      },
      noble_train_count: {
        type: 'number',
        description: 'Количество паровозов на цель',
      },
      noble_train_offset_ms: {
        type: 'number',
        description: 'Смещение прилёта паровоза в миллисекундах после оффов',
      },
      green_nobles_enabled: {
        type: 'boolean',
        description: 'Включить зелёные дворы (дворяне с малым эскортом)',
      },
      green_nobles_count: {
        type: 'number',
        description: 'Количество зелёных дворов на цель',
      },
      green_nobles_offset_ms: {
        type: 'number',
        description: 'Смещение прилёта зелёных дворов в миллисекундах',
      },
      spam_train_enabled: {
        type: 'boolean',
        description: 'Включить спам-паровоз (фейковые дворяне)',
      },
      spam_train_count: {
        type: 'number',
        description: 'Количество спам-паровозов на цель',
      },
      spam_train_offset_ms: {
        type: 'number',
        description: 'Смещение прилёта спам-паровоза в миллисекундах',
      },
      spam_enabled: {
        type: 'boolean',
        description: 'Включить спам (фейк-атаки)',
      },
      spam_count: {
        type: 'number',
        description: 'Количество фейк-атак на цель (1–50)',
      },
      spam_window_before_off_min: {
        type: 'number',
        description: 'Окно до оффов в минутах (default 60)',
      },
      spam_window_after_noble_min: {
        type: 'number',
        description: 'Окно после захвата в минутах (default 60)',
      },
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

    const massStore = useMassConfigStore()
    const p = proposal.value
    const activeRaw = massStore.active

    const base = activeRaw
      ? {
          name: p.name ? `AI: ${p.name}` : 'AI конфиг',
          description: p.reasoning.slice(0, 200),
          slots: activeRaw.slots.map(s => ({ ...s })),
        }
      : { ...blankMassConfig(), name: p.name ? `AI: ${p.name}` : 'AI конфиг', description: p.reasoning.slice(0, 200) }

    const created = massStore.add(base)
    massStore.setActive(created.id)

    proposal.value = null
    status.value = 'idle'
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
