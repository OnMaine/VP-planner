<template>
  <div class="mass-configs-view">
    <h1>Конфигуратор масса</h1>

    <div class="top-bar">
      <button class="btn btn-primary" @click="openNew">+ Новый масс</button>
    </div>

    <!-- Cards -->
    <div class="configs-grid">
      <div
        v-for="cfg in store.all"
        :key="cfg.id"
        :class="['cfg-card', {
          'cfg-active':  store.activeId === cfg.id,
          'cfg-editing': editingId === cfg.id,
        }]"
      >
        <div class="card-head">
          <span class="card-name">{{ cfg.name }}</span>
          <span v-if="store.activeId === cfg.id" class="badge-active">активный</span>
        </div>

        <p class="card-desc">{{ cfg.description || '—' }}</p>

        <div class="card-chips">
          <template v-for="slot in cfg.slots" :key="slot.id">
            <span v-if="slot.enabled" class="chip" :style="slotChipStyle(slot.presetId)">
              {{ presetShortName(slot.presetId) }} ×{{ slot.count }}
            </span>
          </template>
        </div>

        <div class="card-actions">
          <button
            v-if="store.activeId !== cfg.id"
            class="btn btn-primary btn-sm"
            @click="store.setActive(cfg.id)"
          >Выбрать</button>
          <button class="btn btn-secondary btn-sm" @click="openEdit(cfg.id)">Изменить</button>
          <button class="btn btn-secondary btn-sm" @click="store.clone(cfg.id)">Копия</button>
          <button class="btn btn-danger btn-sm" @click="confirmRemove(cfg.id)">✕</button>
        </div>
      </div>
    </div>

    <!-- ── Editor ─────────────────────────────────────────────────────── -->
    <section v-if="editorOpen" class="panel editor-panel">
      <h2>{{ editingId ? 'Редактировать масс' : 'Новый масс' }}</h2>

      <div class="editor-layout">
      <div class="editor-main">
      <div class="form-row">
        <label class="f-label f-wide">
          Название
          <input v-model="form.name" type="text" class="input" placeholder="Название конфига" />
        </label>
        <label class="f-label f-wide">
          Описание (необяз.)
          <input v-model="form.description" type="text" class="input" />
        </label>
      </div>


      <!-- Slot list -->
      <div class="slots-section">
        <div class="slots-header">
          <span class="slots-title">Слоты атак</span>
          <button class="btn btn-secondary btn-sm" @click="addSlot">+ Добавить слот</button>
        </div>

        <p class="slots-note">
          Порядок слотов определяет приоритет распределения войск. Если смещение не задано — атаки приходят строго в порядке очереди. Смещение сдвигает тайминг конкретного слота относительно опорного времени цели.
        </p>

        <div v-if="form.slots.length === 0" class="slots-empty">Слотов нет — добавьте хотя бы один</div>

        <div v-if="form.slots.length > 0" class="slot-header-row">
          <span class="sh-check"></span>
          <span class="sh-preset">Пресет</span>
          <span class="sh-count">Кол-во</span>
          <span class="sh-offset">Смещение от тайминга</span>
        </div>

        <div v-for="(slot, i) in form.slots" :key="slot.id" class="slot-row">
          <!-- Enable toggle -->
          <input type="checkbox" v-model="slot.enabled" class="slot-check" title="Включить/выключить" />

          <!-- Preset select -->
          <select v-model="slot.presetId" class="input slot-preset-select">
            <optgroup v-for="grp in presetGroups" :key="grp.label" :label="grp.label">
              <option v-for="p in grp.presets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
          </select>

          <!-- Count -->
          <label class="slot-inline-label">
            ×
            <input v-model.number="slot.count" type="number" min="1" max="50" class="input input-xs" />
          </label>

          <!-- Offset ±h/m/s/ms -->
          <div class="slot-offset-group">
            <button
              class="sign-btn" :class="slot.offsetNeg ? 'sign-neg' : 'sign-pos'"
              @click="toggleOffsetSign(slot)" title="Знак смещения"
            >{{ slot.offsetNeg ? '−' : '+' }}</button>
            <label class="slot-inline-label">
              <input type="number" min="0" max="23"
                :value="getOffsetH(slot)"
                @change="setOffsetH(slot, +($event.target as HTMLInputElement).value)"
                class="input input-xs"
              />ч
            </label>
            <label class="slot-inline-label">
              <input type="number" min="0" max="59"
                :value="getOffsetM(slot)"
                @change="setOffsetM(slot, +($event.target as HTMLInputElement).value)"
                class="input input-xs"
              />м
            </label>
            <label class="slot-inline-label">
              <input type="number" min="0" max="59"
                :value="getOffsetS(slot)"
                @change="setOffsetS(slot, +($event.target as HTMLInputElement).value)"
                class="input input-xs"
              />с
            </label>
            <label class="slot-inline-label">
              <input type="number" min="0" max="999"
                :value="getOffsetMs(slot)"
                @change="setOffsetMs(slot, +($event.target as HTMLInputElement).value)"
                class="input input-xxs"
              />мс
            </label>
          </div>

          <!-- Spam window toggle -->
          <template v-if="isSpamPreset(slot.presetId)">
            <label class="slot-inline-label slot-window-toggle">
              <input type="checkbox" :checked="hasSpamWindow(slot)" @change="toggleSpamWindow(slot)" />
              диапазон
            </label>
            <template v-if="hasSpamWindow(slot)">
              <label class="slot-inline-label slot-window">
                −<input v-model.number="slot.windowBeforeMin" type="number" min="0" max="1440" class="input input-xs" /> мин до
              </label>
              <label class="slot-inline-label slot-window">
                +<input v-model.number="slot.windowAfterMin" type="number" min="0" max="1440" class="input input-xs" /> мин после
              </label>
            </template>
          </template>

          <!-- Move + delete -->
          <div class="slot-actions">
            <button class="icon-btn" :disabled="i === 0" @click="moveSlotUp(i)" title="Вверх">↑</button>
            <button class="icon-btn" :disabled="i === form.slots.length - 1" @click="moveSlotDown(i)" title="Вниз">↓</button>
            <button class="icon-btn icon-btn-danger" @click="removeSlot(i)" title="Удалить">✕</button>
          </div>
        </div>
      </div>

      <div class="editor-footer">
        <button class="btn btn-primary" :disabled="!canSave" @click="save">
          {{ editingId ? 'Сохранить' : 'Создать' }}
        </button>
        <button class="btn btn-secondary" @click="closeEditor">Отмена</button>
      </div>
      </div><!-- /editor-main -->

      <!-- ── Timeline preview ──────────────────────────────────────────── -->
      <div class="editor-preview">
        <div class="preview-header">Порядок прихода</div>
        <div v-if="previewItems.length <= 1" class="preview-empty">нет активных слотов</div>
        <div v-else class="timeline-list">
          <template v-for="item in previewItems" :key="item.id">
            <div v-if="item.kind === 'divider'" class="tl-divider">
              <span>T — тайминг цели</span>
            </div>
            <div v-else class="tl-entry">
              <div class="tl-dot" :style="{ background: item.color }"></div>
              <div class="tl-body">
                <div class="tl-row">
                  <span class="tl-chip" :style="{ background: item.color + '22', color: item.color, border: `1px solid ${item.color}4d` }">{{ item.label }} ×{{ item.count }}</span>
                  <span class="tl-time">{{ item.timeLabel }}</span>
                </div>
                <div v-if="item.isRange" class="tl-range-row">
                  {{ item.rangeLabel }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      </div><!-- /editor-layout -->
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, type ComputedRef } from 'vue'
import { useMassConfigStore, blankMassConfig, defaultMassSlot } from '@/stores/massConfigStore'
import type { MassSlot } from '@/stores/massConfigStore'
import { usePresetsStore, defaultColorForRole } from '@/stores/presetsStore'
import type { AttackPreset } from '@/stores/presetsStore'

const store        = useMassConfigStore()
const presetsStore = usePresetsStore()

// ── Preset helpers ─────────────────────────────────────────────────────────

function presetShortName(presetId: string): string {
  return presetsStore.all.find(p => p.id === presetId)?.name ?? presetId
}

function slotColor(presetId: string): string {
  const p = presetsStore.all.find(pr => pr.id === presetId)
  if (!p) return '#e94560'
  return p.color ?? defaultColorForRole(p.role.type, p.role)
}

function slotChipStyle(presetId: string): Record<string, string> {
  const c = slotColor(presetId)
  return { background: c + '1a', color: c, border: `1px solid ${c}4d` }
}

function isSpamPreset(presetId: string): boolean {
  const p = presetsStore.all.find(pr => pr.id === presetId)
  return p?.role.type === 'spam' || !!p?.role.customIsSpam
}

function hasSpamWindow(slot: FormSlot): boolean {
  return slot.windowBeforeMin > 0 || slot.windowAfterMin > 0
}

function toggleSpamWindow(slot: FormSlot): void {
  if (hasSpamWindow(slot)) {
    slot.windowBeforeMin = 0
    slot.windowAfterMin  = 0
  } else {
    slot.windowBeforeMin = 60
    slot.windowAfterMin  = 60
  }
}

function getOffsetH(slot: FormSlot):  number { return Math.trunc(slot.offsetMs / 3_600_000) }
function getOffsetM(slot: FormSlot):  number { return Math.trunc((slot.offsetMs % 3_600_000) / 60_000) }
function getOffsetS(slot: FormSlot):  number { return Math.trunc((slot.offsetMs % 60_000) / 1_000) }
function getOffsetMs(slot: FormSlot): number { return slot.offsetMs % 1_000 }

function setOffsetH(slot: FormSlot, val: number): void {
  slot.offsetMs = Math.max(0, val) * 3_600_000 + (slot.offsetMs % 3_600_000)
}
function setOffsetM(slot: FormSlot, val: number): void {
  const h = Math.trunc(slot.offsetMs / 3_600_000)
  slot.offsetMs = h * 3_600_000 + Math.max(0, Math.min(59, val)) * 60_000 + (slot.offsetMs % 60_000)
}
function setOffsetS(slot: FormSlot, val: number): void {
  slot.offsetMs = Math.trunc(slot.offsetMs / 60_000) * 60_000 + Math.max(0, Math.min(59, val)) * 1_000 + (slot.offsetMs % 1_000)
}
function setOffsetMs(slot: FormSlot, val: number): void {
  slot.offsetMs = Math.trunc(slot.offsetMs / 1_000) * 1_000 + Math.max(0, Math.min(999, val))
}
function toggleOffsetSign(slot: FormSlot): void {
  slot.offsetNeg = !slot.offsetNeg
}

// Grouped presets for the slot select
const ROLE_GROUP: Record<string, string> = {
  full_off:   'Оффы',
  half_off:   'Оффы',
  mini_off:   'Оффы',
  cat_squad:  'Каты',
  spam:       'Спам',
  custom_off: 'Кастом',
}
const GROUP_ORDER = ['Оффы', 'Каты', 'Спам', 'Кастом']

const presetGroups = computed<Array<{ label: string; presets: AttackPreset[] }>>(() => {
  const map = new Map<string, AttackPreset[]>()
  for (const p of presetsStore.all) {
    const grp = p.role.customIsSpam ? 'Спам' : (ROLE_GROUP[p.role.type] ?? 'Прочее')
    if (!map.has(grp)) map.set(grp, [])
    map.get(grp)!.push(p)
  }
  return GROUP_ORDER
    .filter(g => map.has(g))
    .map(g => ({ label: g, presets: map.get(g)! }))
})

// ── Timeline preview ───────────────────────────────────────────────────────

function fmtOffsetMs(ms: number): string {
  if (ms === 0) return 'T'
  const sign = ms < 0 ? '−' : '+'
  const abs  = Math.abs(ms)
  const h = Math.trunc(abs / 3_600_000)
  const m = Math.trunc((abs % 3_600_000) / 60_000)
  const s = Math.trunc((abs % 60_000) / 1_000)
  const parts: string[] = []
  if (h) parts.push(`${h}ч`)
  if (m) parts.push(`${m}м`)
  if (s) parts.push(`${s}с`)
  if (!parts.length) parts.push(`${abs % 1_000}мс`)
  return `T ${sign} ${parts.join(' ')}`
}

interface TLSlot {
  kind: 'slot'
  id: string
  label: string
  color: string
  count: number
  signedOffsetMs: number
  isRange: boolean
  rangeStartMs: number
  rangeEndMs: number
  timeLabel: string
  rangeLabel: string
}
interface TLDivider { kind: 'divider'; id: string }
type TLItem = TLSlot | TLDivider

const previewItems = computed<TLItem[]>(() => {
  const entries: TLSlot[] = form.slots
    .filter(s => s.enabled)
    .map(s => {
      const off     = s.offsetNeg ? -s.offsetMs : s.offsetMs
      const isRange = isSpamPreset(s.presetId) && hasSpamWindow(s)
      const rStart  = isRange ? off - s.windowBeforeMin * 60_000 : off
      const rEnd    = isRange ? off + s.windowAfterMin  * 60_000 : off
      return {
        kind:            'slot' as const,
        id:              s.id,
        label:           presetShortName(s.presetId),
        color:           slotColor(s.presetId),
        count:           s.count,
        signedOffsetMs:  off,
        isRange,
        rangeStartMs:    rStart,
        rangeEndMs:      rEnd,
        timeLabel:       fmtOffsetMs(off),
        rangeLabel:      isRange ? `${fmtOffsetMs(rStart)} … ${fmtOffsetMs(rEnd)}` : '',
      }
    })
    .sort((a, b) => (a.isRange ? a.rangeStartMs : a.signedOffsetMs)
                  - (b.isRange ? b.rangeStartMs : b.signedOffsetMs))

  const result: TLItem[] = []
  let dividerInserted = false
  for (const e of entries) {
    const sortKey = e.isRange ? e.rangeStartMs : e.signedOffsetMs
    if (!dividerInserted && sortKey >= 0) {
      result.push({ kind: 'divider', id: '__t0__' })
      dividerInserted = true
    }
    result.push(e)
  }
  if (!dividerInserted) result.push({ kind: 'divider', id: '__t0__' })
  return result
})

// ── Editor state ───────────────────────────────────────────────────────────

const editorOpen = ref(false)
const editingId  = ref<string | null>(null)

let _slotCounter = 0
function genFormSlotId() { return `fsl_${Date.now()}_${++_slotCounter}` }

interface FormSlot {
  id: string
  presetId: string
  count: number
  offsetMs: number    // always stored as absolute value internally; sign applied via offsetNeg
  offsetNeg: boolean  // true = subtract from base timing
  enabled: boolean
  windowBeforeMin: number
  windowAfterMin: number
}

interface FormData {
  name: string
  description: string
  slots: FormSlot[]
}

const form = reactive<FormData>({ name: '', description: '', slots: [] })

const canSave = computed(() => form.name.trim().length > 0 && form.slots.length > 0)

function slotToForm(s: MassSlot): FormSlot {
  return {
    id:              s.id,
    presetId:        s.presetId,
    count:           s.count,
    offsetMs:        Math.abs(s.offsetMs),
    offsetNeg:       s.offsetMs < 0,
    enabled:         s.enabled,
    windowBeforeMin: s.windowBeforeMin ?? 0,
    windowAfterMin:  s.windowAfterMin  ?? 0,
  }
}

function formSlotToMassSlot(s: FormSlot): MassSlot {
  const base: MassSlot = {
    id: s.id, presetId: s.presetId, count: s.count,
    offsetMs: s.offsetNeg ? -s.offsetMs : s.offsetMs, enabled: s.enabled,
  }
  if (s.windowBeforeMin > 0 || s.windowAfterMin > 0) {
    base.windowBeforeMin = s.windowBeforeMin
    base.windowAfterMin  = s.windowAfterMin
  }
  return base
}

function openNew() {
  form.name          = ''
  form.description   = ''
  form.slots         = []
  editingId.value    = null
  editorOpen.value   = true
  scrollToEditor()
}

function openEdit(id: string) {
  const cfg = store.all.find(c => c.id === id)
  if (!cfg) return
  form.name          = cfg.name
  form.description   = cfg.description
  form.slots         = cfg.slots.map(slotToForm)
  editingId.value    = id
  editorOpen.value   = true
  scrollToEditor()
}

function closeEditor() {
  editorOpen.value = false
  editingId.value  = null
}

function save() {
  if (!canSave.value) return
  const data = {
    name:        form.name.trim(),
    description: form.description.trim(),
    slots:       form.slots.map(formSlotToMassSlot),
  }
  if (editingId.value) {
    store.update(editingId.value, data)
  } else {
    store.add(data)
  }
  closeEditor()
}

function confirmRemove(id: string) {
  const cfg = store.all.find(c => c.id === id)
  if (confirm(`Удалить "${cfg?.name}"?`)) store.remove(id)
}

function scrollToEditor() {
  setTimeout(() => {
    document.querySelector('.editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}

// ── Slot CRUD ──────────────────────────────────────────────────────────────

function addSlot() {
  const defaults = defaultMassSlot()
  const firstPreset = presetsStore.all[0]
  form.slots.push({
    id:              genFormSlotId(),
    presetId:        firstPreset?.id ?? '',
    count:           defaults.count,
    offsetMs:        defaults.offsetMs,
    offsetNeg:       false,
    enabled:         defaults.enabled,
    windowBeforeMin: 0,
    windowAfterMin:  0,
  })
}

function removeSlot(i: number) {
  form.slots.splice(i, 1)
}

function moveSlotUp(i: number) {
  if (i === 0) return
  const s = form.slots.splice(i, 1)[0]
  form.slots.splice(i - 1, 0, s)
}

function moveSlotDown(i: number) {
  if (i >= form.slots.length - 1) return
  const s = form.slots.splice(i, 1)[0]
  form.slots.splice(i + 1, 0, s)
}
</script>

<style lang="scss" scoped>
.mass-configs-view {
  max-width: 1200px;
  margin: 0 auto;
}

.top-bar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

// ── Grid ──────────────────────────────────────────────────────────────────
.configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.cfg-card {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: border-color 0.15s;

  &.cfg-active   { border-color: $green; box-shadow: 0 0 0 2px a($green, 0.15); }
  &.cfg-editing  { border-color: $accent; box-shadow: 0 0 0 2px a($accent, 0.2); }
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
  flex: 1;
}

.badge-active {
  font-size: 0.65rem;
  background: a($green, 0.15);
  color: $green;
  border: 1px solid a($green, 0.35);
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
.chip-off   { background: a($accent,   0.15); color: $accent;   border: 1px solid a($accent,   0.3); }
.chip-noble { background: a($purple,   0.15); color: $purple;   border: 1px solid a($purple,   0.3); }
.chip-spam  { background: a($text-dim, 0.12); color: $text-dim; border: 1px solid a($text-dim, 0.2); }

.card-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 0.25rem;
}

// ── Editor ────────────────────────────────────────────────────────────────
.editor-panel {
  border-color: $accent;
  margin-top: 0.5rem;
}

.editor-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.editor-main {
  flex: 1 1 0;
  min-width: 0;
}

// ── Preview sidebar ───────────────────────────────────────────────────────
.editor-preview {
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 1rem;
  background: a($bg-page, 0.6);
  border: 1px solid $border;
  border-radius: 8px;
  padding: 0.75rem;
}

.preview-header {
  font-size: 0.72rem;
  font-weight: 700;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.65rem;
}

.preview-empty {
  font-size: 0.8rem;
  color: $text-faint;
  font-style: italic;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tl-divider {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.35rem 0;
  font-size: 0.68rem;
  color: $green;
  font-weight: 600;
  letter-spacing: 0.03em;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: a($green, 0.35);
  }
}

.tl-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid a($border, 0.5);

  &:last-child { border-bottom: none; }
}

.tl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.3rem;
}

.tl-body {
  flex: 1;
  min-width: 0;
}

.tl-row {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.tl-chip {
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  border-radius: 0;

  &.chip-off   { color: $accent; }
  &.chip-noble { color: $purple; }
  &.chip-spam  { color: $text-dim; }
}

.tl-time {
  font-size: 0.7rem;
  color: $text-faint;
  white-space: nowrap;
  margin-left: auto;
}

.tl-range-row {
  font-size: 0.65rem;
  color: $text-faint;
  margin-top: 0.1rem;
  font-style: italic;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  align-items: flex-end;
}

.f-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: $text-dim;
  min-width: 120px;
}

.f-wide { flex: 1 1 200px; }

// ── Slots ─────────────────────────────────────────────────────────────────
.slots-section {
  margin-bottom: 1rem;
}

.slots-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.slots-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: $text;
}

.slots-empty {
  font-size: 0.85rem;
  color: $text-faint;
  font-style: italic;
  padding: 0.5rem 0;
}


.slots-note {
  font-size: 0.78rem;
  color: $text-faint;
  line-height: 1.5;
  margin: 0 0 0.75rem;
  padding: 0.45rem 0.75rem;
  border-left: 2px solid a($accent, 0.35);
  background: a($accent, 0.04);
  border-radius: 0 4px 4px 0;
}

.slot-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  .sh-check  { width: 15px; flex-shrink: 0; }
  .sh-preset { flex: 1 1 160px; min-width: 120px; max-width: 260px; }
  .sh-count  { width: 68px; }
  .sh-offset { flex: 1; }
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: a($bg-page, 0.5);
  border: 1px solid $border;
  border-radius: 6px;
  margin-bottom: 0.4rem;

  &:last-child { margin-bottom: 0; }
}

.slot-check {
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}

.slot-preset-select {
  flex: 1 1 160px;
  min-width: 120px;
  max-width: 260px;
  font-size: 0.82rem;
  padding: 0.22rem 0.4rem !important;
  height: auto !important;
}

.slot-inline-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: $text-dim;
  white-space: nowrap;
}

.input-xs {
  width: 44px !important;
  padding: 0.2rem 0.3rem !important;
  font-size: 0.8rem !important;
  height: auto !important;
}

.input-xxs {
  width: 36px !important;
  padding: 0.2rem 0.2rem !important;
  font-size: 0.8rem !important;
  height: auto !important;
}

.slot-offset-group {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.sign-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid $border;
  background: none;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s, background 0.12s;

  &.sign-pos { color: $green;  border-color: a($green,  0.4); background: a($green,  0.08); }
  &.sign-neg { color: $accent; border-color: a($accent, 0.4); background: a($accent, 0.08); }
  &:hover    { filter: brightness(1.2); }
}

.slot-window {
  color: $text-faint;
  font-size: 0.76rem;
}

.slot-window-toggle {
  color: $text-dim;
  font-size: 0.78rem;
  input { width: 13px; height: 13px; cursor: pointer; }
}

.slot-actions {
  display: flex;
  gap: 0.2rem;
  margin-left: auto;
  flex-shrink: 0;
}

.icon-btn {
  background: none;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.18rem 0.4rem;
  line-height: 1;
  transition: border-color 0.12s, color 0.12s;

  &:hover:not(:disabled) { border-color: $accent; color: $accent; }
  &:disabled { opacity: 0.3; cursor: default; }
  &.icon-btn-danger:hover:not(:disabled) { border-color: $accent; color: $accent; }
}

.editor-footer {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid $border;
}
</style>
