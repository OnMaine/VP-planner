<template>
  <div class="presets-view">
    <h1>Пресети атак</h1>

    <div class="top-bar">
      <button class="btn btn-primary" @click="openNew">+ Новий пресет</button>
      <button class="btn btn-secondary" @click="openSaveCurrent">Зберегти поточний</button>
      <span v-if="appliedMsg" class="applied-msg">{{ appliedMsg }}</span>
    </div>

    <!-- Card grid -->
    <div class="presets-grid">
      <div
        v-for="preset in store.all"
        :key="preset.id"
        :class="['preset-card', { 'card-editing': editingId === preset.id, 'card-builtin': preset.builtIn }]"
      >
        <div class="card-head">
          <span class="card-name">{{ preset.name }}</span>
          <span v-if="preset.builtIn" class="badge-builtin">вбудований</span>
        </div>

        <p class="card-desc">{{ preset.description || '—' }}</p>

        <div class="card-chips">
          <span class="chip chip-off">
            <template v-if="preset.config.regularOffsPerTarget > 0">
              Офф ×{{ preset.config.regularOffsPerTarget }}
              <span v-if="preset.config.splitOff"> · поділений</span>
            </template>
            <template v-else>Без оффів</template>
          </span>
          <span v-if="preset.config.nobleTrainSize > 0" class="chip chip-noble">
            Двір ×{{ preset.config.nobleTrainSize }}
          </span>
          <span v-if="preset.config.useSpamAttacks" class="chip chip-spam">
            Спам ×{{ preset.config.spamCountPerTarget }}
          </span>
          <span v-if="preset.config.useSpamNobles" class="chip chip-spam">
            Спам-двір ×{{ preset.config.spamNobleCountPerTarget }}
          </span>
        </div>

        <div class="card-actions">
          <button class="btn btn-primary btn-sm" @click="apply(preset.id)">Застосувати</button>
          <button
            v-if="!preset.builtIn"
            class="btn btn-secondary btn-sm"
            @click="openEdit(preset.id)"
          >Змінити</button>
          <button class="btn btn-secondary btn-sm" @click="store.clone(preset.id)">
            {{ preset.builtIn ? 'Клонувати' : 'Копія' }}
          </button>
          <button
            v-if="!preset.builtIn"
            class="btn btn-danger btn-sm"
            @click="confirmRemove(preset.id)"
          >✕</button>
        </div>
      </div>
    </div>

    <!-- Editor panel -->
    <section v-if="editorOpen" class="panel editor-panel">
      <h2>{{ editingId ? 'Редагувати пресет' : 'Новий пресет' }}</h2>

      <div class="form-row">
        <label class="f-label f-wide">
          Назва
          <input v-model="form.name" type="text" class="input" placeholder="Напр. Офф + паровоз" />
        </label>
        <label class="f-label f-wide">
          Опис (необов.)
          <input v-model="form.description" type="text" class="input" />
        </label>
      </div>

      <!-- Offs -->
      <h3 class="sub-head">Оффи</h3>
      <div class="form-row">
        <label class="f-label">
          Оффів на ціль
          <input v-model.number="form.config.regularOffsPerTarget" type="number" min="0" class="input" />
        </label>
        <label class="f-label f-checkbox">
          <input v-model="form.config.splitOff" type="checkbox" />
          Поділений офф (тарани окремо)
        </label>
      </div>

      <!-- Nobles -->
      <h3 class="sub-head">Дворяни</h3>
      <div class="form-row">
        <label class="f-label">
          Розмір паровоза
          <input v-model.number="form.config.nobleTrainSize" type="number" min="0" class="input" />
        </label>
        <label class="f-label">
          Макс. дворів з одного села
          <input v-model.number="form.config.maxNoblesPerVillage" type="number" min="1" class="input" />
        </label>
        <label class="f-label">
          Затримка після оффу (мс)
          <input v-model.number="form.config.offsetAfterOffMs" type="number" min="0" step="50" class="input" />
        </label>
        <label class="f-label">
          Юніт ескорту
          <select v-model="form.config.nobleComposition.escortUnit" class="input">
            <option value="light">ЛК</option>
            <option value="axe">Топор</option>
            <option value="sword">Меч</option>
            <option value="spear">Копья</option>
          </select>
        </label>
      </div>

      <div v-if="form.config.nobleTrainSize > 0">
        <p class="hint-text">Розподіл типів дворян (сума = 100%):</p>
        <div class="form-row pct-row">
          <label class="f-label">
            <span class="noble-type-label noble-gs">999 escort</span>
            <input v-model.number="form.config.nobleComposition.greenStrongPct" type="number" min="0" max="100" class="input" />
          </label>
          <label class="f-label">
            <span class="noble-type-label noble-gw">~50 escort</span>
            <input v-model.number="form.config.nobleComposition.greenWeakPct" type="number" min="0" max="100" class="input" />
          </label>
          <label class="f-label">
            <span class="noble-type-label noble-or">1001–5000</span>
            <input v-model.number="form.config.nobleComposition.orangePct" type="number" min="0" max="100" class="input" />
          </label>
          <label class="f-label">
            <span class="noble-type-label noble-rd">Повний офф</span>
            <input v-model.number="form.config.nobleComposition.redPct" type="number" min="0" max="100" class="input" />
          </label>
          <span :class="['pct-sum', pctSum === 100 ? 'pct-ok' : 'pct-err']">
            Разом: {{ pctSum }}%
          </span>
        </div>
      </div>

      <!-- Spam -->
      <h3 class="sub-head">Спам</h3>
      <div class="form-row">
        <label class="f-label f-checkbox">
          <input v-model="form.config.useSpamAttacks" type="checkbox" />
          Спам-атаки
        </label>
        <label v-if="form.config.useSpamAttacks" class="f-label">
          Спамів на ціль
          <input v-model.number="form.config.spamCountPerTarget" type="number" min="1" class="input" />
        </label>
        <label class="f-label f-checkbox">
          <input v-model="form.config.useSpamNobles" type="checkbox" />
          Спам-двори
        </label>
        <label v-if="form.config.useSpamNobles" class="f-label">
          Спам-дворів на ціль
          <input v-model.number="form.config.spamNobleCountPerTarget" type="number" min="1" class="input" />
        </label>
      </div>

      <div class="editor-footer">
        <button class="btn btn-primary" :disabled="!canSave" @click="save">
          {{ editingId ? 'Зберегти зміни' : 'Створити пресет' }}
        </button>
        <button class="btn btn-secondary" @click="closeEditor">Скасувати</button>
        <span v-if="!canSave && form.name" class="hint-text">
          {{ pctSum !== 100 && form.config.nobleTrainSize > 0 ? `Сума відсотків: ${pctSum}% ≠ 100%` : '' }}
        </span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { usePresetsStore } from '@/stores/presetsStore'
import { usePlanStore } from '@/stores/planStore'
import type { MassConfig } from '@/stores/planStore'
import { DEFAULT_MASS_CONFIG } from '@/stores/planStore'

const store = usePresetsStore()
const planStore = usePlanStore()

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const appliedMsg = ref('')

interface FormState {
  name: string
  description: string
  config: MassConfig
}

function blankForm(): FormState {
  return {
    name: '',
    description: '',
    config: {
      ...DEFAULT_MASS_CONFIG,
      nobleComposition: { ...DEFAULT_MASS_CONFIG.nobleComposition },
    },
  }
}

const form = reactive<FormState>(blankForm())

const pctSum = computed(() => {
  const nc = form.config.nobleComposition
  return nc.greenStrongPct + nc.greenWeakPct + nc.orangePct + nc.redPct
})

const canSave = computed(() => {
  if (!form.name.trim()) return false
  if (form.config.nobleTrainSize > 0 && pctSum.value !== 100) return false
  return true
})

function openNew(): void {
  Object.assign(form, blankForm())
  editingId.value = null
  editorOpen.value = true
  scrollToEditor()
}

function openSaveCurrent(): void {
  const mc = planStore.massConfig
  Object.assign(form, {
    name: '',
    description: '',
    config: { ...mc, nobleComposition: { ...mc.nobleComposition } },
  })
  editingId.value = null
  editorOpen.value = true
  scrollToEditor()
}

function openEdit(id: string): void {
  const preset = store.all.find((p) => p.id === id)
  if (!preset) return
  Object.assign(form, {
    name: preset.name,
    description: preset.description,
    config: { ...preset.config, nobleComposition: { ...preset.config.nobleComposition } },
  })
  editingId.value = id
  editorOpen.value = true
  scrollToEditor()
}

function closeEditor(): void {
  editorOpen.value = false
  editingId.value = null
}

function save(): void {
  if (!canSave.value) return
  const data = {
    name: form.name.trim(),
    description: form.description.trim(),
    config: { ...form.config, nobleComposition: { ...form.config.nobleComposition } },
  }
  if (editingId.value) {
    store.update(editingId.value, data)
  } else {
    store.add(data)
  }
  closeEditor()
}

function apply(id: string): void {
  store.applyToPlanner(id)
  const preset = store.all.find((p) => p.id === id)
  appliedMsg.value = `"${preset?.name}" застосовано`
  setTimeout(() => { appliedMsg.value = '' }, 2500)
}

function confirmRemove(id: string): void {
  const preset = store.all.find((p) => p.id === id)
  if (confirm(`Видалити пресет "${preset?.name}"?`)) store.remove(id)
}

function scrollToEditor(): void {
  setTimeout(() => {
    document.querySelector('.editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}
</script>

<style lang="scss" scoped>
.presets-view {
  max-width: 1200px;
  margin: 0 auto;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.applied-msg {
  color: $green;
  font-size: 0.9rem;
}

// ---- Grid ----
.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.preset-card {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.15s;

  &.card-builtin { border-color: a($accent, 0.35); }
  &.card-editing  { border-color: $accent; box-shadow: 0 0 0 2px a($accent, 0.2); }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-name {
  font-weight: 700;
  font-size: 1rem;
  color: $text;
}

.badge-builtin {
  font-size: 0.65rem;
  background: a($accent, 0.15);
  color: $accent;
  border: 1px solid a($accent, 0.3);
  border-radius: 10px;
  padding: 0.1rem 0.45rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-desc {
  font-size: 0.82rem;
  color: $text-dim;
  margin: 0;
  line-height: 1.4;
}

.card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.18rem 0.5rem;
  border-radius: 10px;
  white-space: nowrap;
}
.chip-off   { background: a($purple, 0.15); color: $purple; border: 1px solid a($purple, 0.3); }
.chip-noble { background: a($green,  0.15); color: $green;  border: 1px solid a($green,  0.3); }
.chip-spam  { background: a($text-dim, 0.12); color: $text-dim; border: 1px solid a($text-dim, 0.2); }

.card-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 0.3rem;
}

// ---- Editor ----
.editor-panel {
  border-color: $accent;
  margin-top: 0.5rem;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.f-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: $text-dim;
  min-width: 160px;
  flex: 1 1 160px;

  .input { padding: 0.4rem 0.6rem; font-size: 0.9rem; }
}

.f-wide { flex: 2 1 280px; }

.f-checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  color: $text;
  font-size: 0.9rem;
}

.sub-head {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: $text-faint;
  margin: 1rem 0 0.4rem;
  border-bottom: 1px solid $border;
  padding-bottom: 0.3rem;
}

.hint-text {
  font-size: 0.8rem;
  color: $text-faint;
}

.pct-row {
  align-items: flex-end;
}

.pct-sum {
  font-size: 0.85rem;
  font-weight: 700;
  padding-bottom: 0.5rem;
  white-space: nowrap;

  &.pct-ok  { color: $green; }
  &.pct-err { color: $accent; }
}

.noble-type-label {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 2px;
}
.noble-gs { background: a($green,  0.2); color: $green; }
.noble-gw { background: a($green,  0.1); color: a($green, 0.7); }
.noble-or { background: a($orange, 0.2); color: $orange; }
.noble-rd { background: a($accent, 0.2); color: $accent; }

.editor-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}
</style>
