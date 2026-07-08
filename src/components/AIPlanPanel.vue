<template>
  <section class="panel ai-panel">
    <div class="ai-header">
      <span class="ai-title">AI Планировщик</span>
      <div class="provider-tabs">
        <button
          v-for="p in PROVIDERS" :key="p.id"
          :class="['provider-btn', { active: aiStore.provider === p.id }]"
          @click="aiStore.setProvider(p.id)"
        >{{ p.label }}</button>
      </div>
      <button class="btn btn-secondary btn-sm" @click="keyOpen = !keyOpen">
        🔑 {{ apiKey ? `••••${apiKey.slice(-4)}` : 'Добавить ключ' }}
      </button>
    </div>

    <!-- API key row -->
    <div v-if="keyOpen" class="key-row">
      <input
        class="input key-input"
        type="password"
        :placeholder="currentProviderInfo.keyPlaceholder"
        :value="apiKey"
        @change="setKey(($event.target as HTMLInputElement).value)"
      />
      <a :href="currentProviderInfo.keyLink" target="_blank" class="key-link">Получить ключ ↗</a>
      <button class="btn btn-secondary btn-sm" @click="keyOpen = false">OK</button>
    </div>

    <!-- Request textarea -->
    <textarea
      v-model="request"
      class="ai-textarea"
      rows="3"
      placeholder="Опиши стратегию: напр. «4 оффа, спам до и после дворов»"
    />

    <div class="ai-controls">
      <button
        class="btn btn-primary"
        :disabled="status === 'loading' || !apiKey"
        @click="onAsk"
      >
        {{ status === 'loading' ? '⏳ AI думает...' : 'Спросить AI' }}
      </button>
      <span v-if="!apiKey" class="hint-text">Нужен API ключ ({{ currentProviderInfo.label }})</span>
    </div>

    <!-- Error -->
    <div v-if="status === 'error'" class="status-msg status-err">{{ errorMsg }}</div>

    <!-- Proposal result -->
    <template v-if="status === 'done' && proposal">
      <div class="ai-reasoning">{{ proposal.reasoning }}</div>

      <!-- Custom presets preview -->
      <div v-if="proposal.custom_presets?.length" class="ai-presets-preview">
        <span class="ai-presets-label">Создаст пресеты:</span>
        <span
          v-for="pr in proposal.custom_presets" :key="pr.ref_id"
          class="ai-preset-badge"
        >{{ pr.name }}</span>
      </div>

      <!-- Slots preview -->
      <div v-if="proposal.slots?.length" class="ai-slots-preview">
        <span
          v-for="(sl, i) in proposal.slots" :key="i"
          class="ai-slot-chip"
        >{{ resolvePresetName(sl.preset_ref) }} ×{{ sl.count }}</span>
      </div>

      <div class="ai-actions">
        <button class="btn btn-primary" @click="onApplyAndGenerate">Применить и сгенерировать</button>
        <button class="btn btn-secondary" @click="aiStore.applyProposal()">Только применить</button>
        <button class="btn btn-danger btn-sm" @click="aiStore.dismissProposal()">Отменить</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAIPlanStore } from '@/stores/aiPlanStore'
import { useMassConfigStore } from '@/stores/massConfigStore'
import { usePresetsStore } from '@/stores/presetsStore'
import { useVillagesStore } from '@/stores/villagesStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePlanStore } from '@/stores/planStore'
import { PROVIDER_INFO, type AIProvider } from '@/utils/aiProviders'

const PROVIDERS: Array<{ id: AIProvider; label: string }> = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'groq',      label: 'Groq' },
  { id: 'gemini',    label: 'Gemini' },
]

const emit = defineEmits<{ (e: 'generate'): void }>()

const aiStore       = useAIPlanStore()
const massStore     = useMassConfigStore()
const presetsStore  = usePresetsStore()
const villagesStore = useVillagesStore()
const worldStore    = useWorldStore()

// Keep planStore available for the generate emit flow
const _planStore = usePlanStore()
void _planStore // used via emit('generate') in parent

const apiKey              = computed(() => aiStore.currentApiKey)
const currentProviderInfo = computed(() => PROVIDER_INFO[aiStore.provider])
const status              = computed(() => aiStore.status)
const proposal            = computed(() => aiStore.proposal)
const errorMsg            = computed(() => aiStore.errorMsg)

const keyOpen = ref(false)
const request = ref('')

function setKey(val: string) {
  aiStore.setApiKey(aiStore.provider, val)
}

// ---------------------------------------------------------------------------
// Build context string for Claude
// ---------------------------------------------------------------------------

function buildContext(): string {
  const ws = worldStore.settings
  const lines: string[] = []

  lines.push(
    `Настройки мира: скорость ×${ws.worldSpeed}, юниты ×${ws.unitSpeed}, ночной бонус: ${ws.nightActive ? 'да' : 'нет'}`,
    '',
  )

  // Aggregate troops per player
  const playerMap = new Map<string, {
    villages: number
    axe: number; light: number; ram: number; snob: number
  }>()

  for (const v of villagesStore.villages) {
    let p = playerMap.get(v.player)
    if (!p) {
      p = { villages: 0, axe: 0, light: 0, ram: 0, snob: 0 }
      playerMap.set(v.player, p)
    }
    p.villages++
    p.axe   += v.troops.axe
    p.light += v.troops.light
    p.ram   += v.troops.ram
    p.snob  += v.troops.snob
  }

  lines.push(`Наши игроки (${playerMap.size}):`)
  for (const [name, data] of playerMap) {
    lines.push(
      `  ${name}: ${data.villages} дер. | топоры: ${data.axe} | лёгкая кав: ${data.light} | тараны: ${data.ram} | дворяне: ${data.snob}`,
    )
  }
  lines.push('')

  // Targets
  const planStore = usePlanStore()
  const targets = planStore.targets
  lines.push(`Цели (${targets.length}):`)
  for (const t of targets) {
    const d = t.arrivalTime
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const player = t.enemyPlayer ? ` (${t.enemyPlayer})` : ''
    lines.push(`  ${t.coords}${player} прилёт ${dd}.${mm} ${hh}:${min}`)
  }
  lines.push('')

  // Active mass config summary
  const active = massStore.active
  if (active) {
    lines.push(`Текущий конфиг: "${active.name}"`)
    for (const slot of active.slots.filter(s => s.enabled)) {
      const pr = presetsStore.all.find(p => p.id === slot.presetId)
      lines.push(`  - ${pr?.name ?? slot.presetId} ×${slot.count}`)
    }
  } else {
    lines.push('Текущий конфиг: не выбран')
  }

  return lines.join('\n')
}


// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function onAsk() {
  aiStore.ask(request.value, buildContext())
}

function resolvePresetName(refOrId: string): string {
  // Check if it's a custom_presets ref_id from the current proposal
  const customMatch = proposal.value?.custom_presets?.find(p => p.ref_id === refOrId)
  if (customMatch) return customMatch.name
  // Otherwise look up by built-in preset ID
  const preset = presetsStore.all.find(p => p.id === refOrId)
  return preset?.name ?? refOrId
}

function onApplyAndGenerate() {
  aiStore.applyProposal()
  emit('generate')
}
</script>

<style lang="scss" scoped>
.ai-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.provider-tabs {
  display: flex;
  gap: 0.2rem;
  flex: 1;
}

.provider-btn {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 5px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.22rem 0.65rem;
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
  &:hover  { border-color: $accent; color: $text; }
  &.active { border-color: $accent; color: $accent; background: a($accent, 0.08); }
}

.key-link {
  font-size: 0.8rem;
  color: $accent;
  white-space: nowrap;
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.ai-title {
  font-weight: 700;
  font-size: 1rem;
  color: $text;
}

.key-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;

  .key-input { flex: 1; }
}

.ai-textarea {
  width: 100%;
  min-height: 70px;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  font-size: 0.9rem;
  padding: 0.5rem;
  resize: vertical;
  margin-bottom: 0.75rem;
  box-sizing: border-box;

  &:focus { outline: none; border-color: $accent; }
}

.ai-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.hint-text {
  font-size: 0.8rem;
  color: $text-faint;
}

.ai-reasoning {
  background: a($accent, 0.06);
  border-left: 3px solid $accent;
  border-radius: 0 4px 4px 0;
  padding: 0.6rem 0.75rem;
  font-size: 0.88rem;
  color: $text-dim;
  margin-bottom: 0.75rem;
  white-space: pre-wrap;
}

.diff-table {
  margin-bottom: 0.75rem;
  width: auto;
}

.diff-before { color: $text-dim; }

.diff-changed td { background: a($orange, 0.07); }

.diff-toggle {
  border: 1px solid $border;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  transition: all 0.15s;
}
.diff-toggle-on  { background: a($green,  0.15); color: $green;    border-color: a($green,  0.4); }
.diff-toggle-off { background: a($text-dim,0.1); color: $text-dim; border-color: a($text-dim,0.3); }
.diff-highlight-border { border-color: $orange !important; box-shadow: 0 0 0 1px $orange; }

.diff-num-input {
  width: 60px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
  text-align: center;
}
.diff-num-changed { border-color: $orange; color: $orange; font-weight: 700; }

.ai-presets-preview {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.ai-presets-label {
  font-size: 0.78rem;
  color: $text-faint;
  white-space: nowrap;
}

.ai-preset-badge {
  background: a($green, 0.15);
  border: 1px solid a($green, 0.35);
  border-radius: 4px;
  color: $green;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
}

.ai-slots-preview {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}

.ai-slot-chip {
  background: a($accent, 0.1);
  border: 1px solid a($accent, 0.3);
  border-radius: 4px;
  color: $text-dim;
  font-size: 0.78rem;
  padding: 0.1rem 0.45rem;
}

.ai-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
