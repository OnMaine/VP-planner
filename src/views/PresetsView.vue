<template>
  <div class="presets-view">
    <h1>Пресеты войск</h1>

    <div class="top-bar">
      <button class="btn btn-primary" @click="openNew('custom')">+ Кастомный</button>
    </div>

    <!-- Single-attack presets -->
    <h2 class="section-head">Одиночные атаки</h2>
    <div class="presets-grid">
      <div
        v-for="preset in singlePresets"
        :key="preset.id"
        :class="['preset-card', { 'card-editing': editingId === preset.id, 'card-builtin': preset.builtIn, 'card-spam': preset.role.type === 'spam' }]"
      >
        <div class="card-head">
          <img v-for="(ico, i) in roleIcons(preset.role)" :key="i" :src="ico" class="card-role-icon" />
          <span class="card-name">{{ preset.name }}</span>
          <span v-if="preset.builtIn" class="badge-builtin">встроенный</span>
        </div>
        <p class="card-desc">{{ cardDescription(preset) }}</p>
        <p v-if="cardNote(preset)" class="card-note">{{ cardNote(preset) }}</p>
        <div class="card-chips">
          <span
            class="chip"
            :style="chipStyle(preset)"
          >{{ preset.name }}</span>
          <span v-for="(d, i) in roleDetails(preset.role, preset.builtIn)" :key="i" :class="['chip', d.warn ? 'chip-warn' : 'chip-detail']">{{ d.label }}</span>
        </div>
        <div class="card-actions">
          <button v-if="!preset.builtIn" class="btn btn-secondary btn-sm" @click="openEdit(preset.id)">Изменить</button>
          <button
            v-if="!(preset.builtIn && ['full_off','half_off','mini_off'].includes(preset.role.type)) && preset.id !== 'bi_spam_weak'"
            class="btn btn-secondary btn-sm"
            @click="store.clone(preset.id)"
          >{{ preset.builtIn ? 'Клонировать' : 'Копия' }}</button>
          <button v-if="!preset.builtIn" class="btn btn-danger btn-sm" @click="confirmRemove(preset.id)">✕</button>
        </div>
      </div>
    </div>

    <!-- Train presets -->
    <h2 class="section-head">Комбинированные пресеты</h2>
    <div class="presets-grid">
      <div
        v-for="preset in trainPresets"
        :key="preset.id"
        :class="['preset-card', 'card-train', { 'card-editing': editingId === preset.id, 'card-builtin': preset.builtIn, 'card-spam': preset.role.type === 'spam' }]"
      >
        <div class="card-head">
          <img v-for="(ico, i) in roleIcons(preset.role)" :key="i" :src="ico" class="card-role-icon" />
          <span class="card-name">{{ preset.name }}</span>
          <span v-if="preset.builtIn" class="badge-builtin">встроенный</span>
        </div>
        <p class="card-desc">{{ cardDescription(preset) }}</p>
        <p v-if="cardNote(preset)" class="card-note">{{ cardNote(preset) }}</p>
        <div class="card-chips">
          <span
            class="chip"
            :style="chipStyle(preset)"
          >{{ preset.name }}</span>
          <span v-for="(d, i) in roleDetails(preset.role, preset.builtIn)" :key="i" :class="['chip', d.warn ? 'chip-warn' : 'chip-detail']">{{ d.label }}</span>
        </div>
        <div class="card-actions">
          <button v-if="!preset.builtIn" class="btn btn-secondary btn-sm" @click="openEdit(preset.id)">Изменить</button>
          <button v-if="preset.id !== 'bi_spam_train'" class="btn btn-secondary btn-sm" @click="store.clone(preset.id)">{{ preset.builtIn ? 'Клонировать' : 'Копия' }}</button>
          <button v-if="!preset.builtIn" class="btn btn-danger btn-sm" @click="confirmRemove(preset.id)">✕</button>
        </div>
      </div>
    </div>

    <!-- Editor panel -->
    <section v-if="editorOpen" class="panel editor-panel">
      <h2>{{ editingId ? 'Редактировать пресет' : 'Новый пресет' }}</h2>

      <!-- Name + description -->
      <div class="form-row">
        <label class="f-label f-wide">
          Название
          <input v-model="form.name" type="text" class="input" placeholder="Название пресета" />
        </label>
        <label class="f-label f-wide">
          Описание (необяз.)
          <input v-model="form.description" type="text" class="input" />
        </label>
      </div>

      <!-- Role type selector — only for custom mode -->
      <template v-if="editorMode === 'custom'">
        <h3 class="sub-head">Тип роли деревни</h3>
        <div class="role-type-grid">
          <button
            v-for="t in availableRoleTypes"
            :key="t"
            :class="['role-btn', { active: form.role.type === t }, roleChipClass(t)]"
            @click="setRoleType(t)"
          >Одиночная</button>
          <button class="role-btn chip-noble" disabled title="В разработке">Комбинированная</button>
        </div>
      </template>

      <!-- Type-specific config -->
      <template v-if="form.role.type === 'half_off'">
        <h3 class="sub-head">Параметры</h3>
        <div class="form-row">
          <label class="f-label">
            Мин. юнитов
            <input v-model.number="form.role.halfMin" type="number" min="1" class="input" />
          </label>
          <label class="f-label">
            Макс. юнитов
            <input v-model.number="form.role.halfMax" type="number" min="1" class="input" />
          </label>
          <label class="f-label f-checkbox">
            <input v-model="form.role.halfFixedComp" type="checkbox" />
            Фиксированный состав
          </label>
        </div>
        <template v-if="form.role.halfFixedComp">
          <div class="form-row">
            <label class="f-label">
              Топоры
              <input v-model.number="form.role.halfFixedAxe" type="number" min="0" class="input" />
            </label>
            <label class="f-label">
              ЛК
              <input v-model.number="form.role.halfFixedLight" type="number" min="0" class="input" />
            </label>
            <label class="f-label">
              ТК
              <input v-model.number="form.role.halfFixedHeavy" type="number" min="0" class="input" />
            </label>
            <label class="f-label">
              Тараны
              <input v-model.number="form.role.halfFixedRam" type="number" min="0" class="input" />
            </label>
          </div>
          <p class="hint-text">Берёт деревни с армией в диапазоне [мин–макс]. В фиксированном режиме отправляет не более указанного кол-ва каждого юнита.</p>
        </template>
      </template>

      <template v-else-if="form.role.type === 'cat_squad'">
        <h3 class="sub-head">Параметры</h3>
        <div class="form-row">
          <label class="f-label">
            Мин. катапульт для отряда
            <input v-model.number="form.role.catMinCats" type="number" min="1" class="input" />
          </label>
          <label class="f-label">
            Макс. сопровождение (юнитов)
            <input v-model.number="form.role.catMaxEscort" type="number" min="1" max="9999" class="input" />
          </label>
        </div>
      </template>

      <template v-else-if="form.role.type === 'custom_off'">
        <div class="cu-table">
          <div class="cu-table-head">
            <span class="cu-th-left">Состав атаки</span>
            <span class="cu-th-right">Мин. в деревне для подбора</span>
          </div>
          <div v-for="u in CUSTOM_UNITS" :key="u.key" class="cu-row">
            <div class="cu-left">
              <img :src="u.icon" class="cu-icon" :title="u.label" />
              <span class="cu-label">{{ u.label }}</span>
              <div class="cu-controls">
                <button
                  :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) === 0 && !getCustomUnitPct(u.key) }]"
                  @click="setCustomUnit(u.key, 0)"
                >Не брать</button>
                <template v-if="u.key === 'knight'">
                  <button
                    :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) === -1 && !getCustomUnitPct(u.key) }]"
                    @click="setCustomUnit(u.key, -1)"
                  >Взять</button>
                </template>
                <template v-else>
                  <button
                    :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) === -1 && !getCustomUnitPct(u.key) }]"
                    @click="setCustomUnit(u.key, -1)"
                  >Всё</button>
                  <button
                    :class="['cu-mode', { 'cu-mode-on': !!getCustomUnitPct(u.key) }]"
                    @click="activatePctMode(u.key)"
                  >%</button>
                  <input
                    v-if="getCustomUnitPct(u.key)"
                    :value="getCustomUnitPct(u.key)"
                    type="number" min="1" max="100"
                    class="input cu-count"
                    @change="setCustomUnitPct(u.key, +($event.target as HTMLInputElement).value)"
                  /><span v-if="getCustomUnitPct(u.key)" class="cu-pct-sign">%</span>
                  <button
                    :class="['cu-mode', { 'cu-mode-on': isCountMode(u.key) }]"
                    @click="activateCountMode(u.key)"
                  >Кол-во</button>
                  <input
                    v-if="isCountMode(u.key)"
                    :value="getCustomUnit(u.key) > 0 ? getCustomUnit(u.key) : ''"
                    type="number" min="0"
                    placeholder="0"
                    class="input cu-count"
                    @change="onCountInput(u.key, +($event.target as HTMLInputElement).value)"
                  />
                </template>
              </div>
            </div>
            <div class="cu-right">
              <input
                v-if="u.key !== 'snob' && u.key !== 'knight'"
                :value="getCustomUnitMin(u.key) || ''"
                type="number" min="0"
                class="input cu-min-input"
                placeholder="—"
                title="Мин. количество юнита в деревне — деревни с меньшим кол-вом не попадут в этот пресет"
                @change="setCustomUnitMin(u.key, +($event.target as HTMLInputElement).value, $event.target as HTMLInputElement)"
              />
              <span v-else class="cu-min-na">—</span>
            </div>
          </div>
        </div>
        <div v-if="customFixedPop !== null" class="cu-pop-summary">
          Фиксированный состав: <strong>{{ customFixedPop.toLocaleString('ru') }}</strong> усадьбы
        </div>
        <h3 class="sub-head">Отображение</h3>
        <div v-if="customPopWarning" class="custom-pop-warning">{{ customPopWarning }}</div>
        <div class="form-row">
          <label class="f-label f-checkbox" title="Пресет попадёт в группу Спам в масс-редакторе и получит возможность задать диапазон разброса тайминга">
            <input v-model="form.role.customIsSpam" type="checkbox" />
            Считать спамом
          </label>
          <label class="f-label">
            Цвет бейджа
            <div class="cu-color-row">
              <input type="color" v-model="customColor" class="cu-color-input" />
              <span class="cu-color-preview" :style="{ background: customColor }">Кастом</span>
            </div>
          </label>
          <label class="f-label">
            Иконка пресета
            <div class="cu-image-row">
              <label :class="['cu-img-opt', { 'cu-img-on': !form.role.customImageUrl }]" @click="form.role.customImageUrl = undefined" title="По умолчанию">
                <img :src="customAttIcon" class="cu-img-preview" />
              </label>
              <label :class="['cu-img-opt', { 'cu-img-on': !!form.role.customImageUrl }]" title="Загрузить свою">
                <span v-if="!form.role.customImageUrl" class="cu-img-upload-text">📁</span>
                <input type="file" accept="image/*" class="cu-file-input" @change="onCustomImageUpload" />
                <img v-if="form.role.customImageUrl" :src="form.role.customImageUrl" class="cu-img-preview" />
              </label>
            </div>
          </label>
        </div>
      </template>

      <div class="editor-footer">
        <button class="btn btn-primary" :disabled="!canSave" @click="save">
          {{ editingId ? 'Сохранить изменения' : 'Создать пресет' }}
        </button>
        <button class="btn btn-secondary" @click="closeEditor">Отмена</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { usePresetsStore } from '@/stores/presetsStore'
import { useWorldStore } from '@/stores/worldStore'
import {
  ALL_ROLE_TYPES, defaultRoleForType, defaultColorForRole,
} from '@/stores/presetsStore'
import type { VillageRole, VillageRoleType, GreenVariant, AttackPreset } from '@/stores/presetsStore'
import attackLarge  from '@/assets/images/attack_large.webp'
import attackMedium from '@/assets/images/attack_medium.webp'
import attackSmall  from '@/assets/images/attack_small.webp'
import customAttIcon from '@/assets/images/att.png'
import catapultIcon from '@/assets/images/unit_catapult@2x.webp'
import snobIcon     from '@/assets/images/unit_snob.webp'
import { UNIT_ICONS } from '@/utils/unitIcons'

const store = usePresetsStore()

const singlePresets = computed(() => store.all.filter(p => !p.combined))
const trainPresets  = computed(() => store.all.filter(p => !!p.combined))

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const editorMode = ref<'single' | 'custom'>('single')

const availableRoleTypes = computed(() =>
  editorMode.value === 'custom'
    ? (['custom_off'] as VillageRoleType[])
    : ALL_ROLE_TYPES.filter(t => t !== 'custom_off')
)

interface FormState {
  name: string
  description: string
  color?: string
  role: VillageRole
}

function blankForm(): FormState {
  return { name: '', description: '', role: { type: 'full_off' } }
}

const form = reactive<FormState>(blankForm())

const worldStore = useWorldStore()

const customFixedPop = computed((): number | null => {
  if (form.role.type !== 'custom_off') return null
  const units = form.role.customUnits ?? {}
  const pct   = form.role.customUnitPct ?? {}
  const pop   = worldStore.settings.unitPop as Record<string, number>
  let fixedPop = 0
  let hasFixed = false
  for (const [k, v] of Object.entries(units)) {
    const count = v as number
    if (count <= 0) continue
    if (((pct[k] as number | undefined) ?? 0) > 0) continue
    hasFixed = true
    fixedPop += count * (pop[k] ?? 1)
  }
  return hasFixed ? fixedPop : null
})

const customPopWarning = computed((): string | null => {
  const fixedPop = customFixedPop.value
  if (fixedPop === null) return null
  const minAtk = worldStore.settings.minAttackSize
  if (fixedPop >= minAtk) return null
  return `Фиксированный состав даёт ${fixedPop} усадьбы — меньше минимума атаки (${minAtk}). Атаки с таким пресетом не будут созданы.`
})

const canSave = computed(() => form.name.trim().length > 0 && !customPopWarning.value)

function roleIcons(role: VillageRole): string[] {
  switch (role.type) {
    case 'full_off':   return role.nobleIncluded ? [attackLarge, snobIcon] : [attackLarge]
    case 'half_off':   return [attackMedium]
    case 'mini_off':   return [attackSmall]
    case 'cat_squad':  return [catapultIcon]
    case 'spam': {
      const base = role.spamStrength === 'full' ? attackLarge : role.spamStrength === 'strong' ? attackMedium : attackSmall
      return (role.spamNobleCount ?? 0) > 0 ? [base, snobIcon] : [base]
    }
    case 'custom_off': {
      return [role.customImageUrl ?? customAttIcon]
    }
    default:           return []
  }
}

function cardNote(preset: AttackPreset): string {
  if (preset.id === 'bi_cat_squad') return '⚠ макс. кат в отряде не должен превышать 400'
  if (preset.id === 'bi_spam_weak') return 'ℹ Для спама нужен хотя бы 1 таран или 1 катапульта — не влияет на подбор деревень'
  if (preset.id === 'bi_spam_train') return 'ℹ Подбор деревни — только по наличию дворов (реальных или виртуальных); состав войск не учитывается'
  return ''
}

function cardDescription(preset: AttackPreset): string {
  if (preset.id === 'bi_cat_squad') {
    if (store.catSplitSquads) {
      return `Катапульты + сопровождение = 1000 юн. (сопровождение = 1000 − кол-во кат); отряд: мин. ${store.catMinSize}, макс. ${store.catMaxSize} кат.`
    }
    return `Все каты деревни = 1 отряд (мин. ${store.catMinSize} кат.); сопровождение = 1000 − кол-во кат`
  }
  return preset.description || '—'
}

// ---------------------------------------------------------------------------
// Chip helpers
// ---------------------------------------------------------------------------

function chipStyle(preset: AttackPreset): Record<string, string> {
  const c = preset.color ?? defaultColorForRole(preset.role.type, preset.role)
  return { background: c + '22', color: c, borderColor: c + '77' }
}

function roleChipClass(type: VillageRoleType): string {
  switch (type) {
    case 'full_off':   return 'chip-off'
    case 'half_off':   return 'chip-mid'
    case 'mini_off':   return 'chip-mini'
    case 'cat_squad':  return 'chip-green'
    case 'spam':       return 'chip-spam'
    case 'custom_off': return 'chip-off'
    default:           return 'chip-detail'
  }
}

interface DetailChip { label: string; warn?: true }
function chip(label: string, warn?: true): DetailChip { return warn ? { label, warn } : { label } }

function roleDetails(role: VillageRole, builtIn?: true): DetailChip[] {
  const d: DetailChip[] = []
  switch (role.type) {
    case 'full_off':
      d.push(chip(`offFarm ≥ ${store.fullOffMinOffFarm}`))
      if (role.nobleIncluded) d.push(chip('1 двор'))
      break
    case 'half_off': {
      d.push(chip(`offFarm ${store.halfOffMinOffFarm}–${store.fullOffMinOffFarm}`))
      if (role.halfFixedComp) d.push(chip('фикс. состав'))
      break
    }
    case 'mini_off':
      d.push(chip(`offFarm ${store.smallOffMinOffFarm}–${store.halfOffMinOffFarm}`))
      break
    case 'cat_squad': {
      const minC = builtIn ? store.catMinSize : (role.catMinCats ?? 50)
      const maxC = builtIn ? store.catMaxSize : (role.catMaxEscort ?? 200)
      const splitting = builtIn ? store.catSplitSquads : true
      d.push(chip(`мин. ${minC} кат.`))
      if (splitting) {
        d.push(chip(`макс. ${maxC} кат.`))
        d.push(chip(`эскорт ${1000 - maxC}`))
        if (maxC > 400) d.push(chip('⚠ >400 кат!', true))
      } else {
        d.push(chip('1 отряд'))
      }
      d.push(chip('= 1000'))
      break
    }
    case 'spam': {
      const s = role.spamStrength ?? 'weak'
      if (s === 'strong') { d.push(chip('Медиум офф')); d.push(chip('1001–5001 юн.')) }
      else if (s === 'full') { d.push(chip('Фулл офф')); d.push(chip('5001+ юн.')) }
      else { d.push(chip('Фейк')); d.push(chip('≤1000 юн.')) }
      if (role.spamNobleCount) {
        d.push(chip(`${role.spamNobleCount} дворян`))
      }
      break
    }
    case 'custom_off': {
      const units = role.customUnits ?? {}
      const active = Object.entries(units).filter(([, v]) => (v as number) !== 0).map(([k]) => k)
      if (active.length) d.push(chip(active.join('+')))
      if ((role.customMin ?? 0) > 0) d.push(chip(`мин.${role.customMin}`))
      if ((role.customMax ?? 99999) < 99999) d.push(chip(`макс.${role.customMax}`))
      break
    }
  }
  return d
}

// ---------------------------------------------------------------------------
// Editor actions
// ---------------------------------------------------------------------------

// ── Custom off helpers ────────────────────────────────────────────────────

const CUSTOM_UNITS = [
  { key: 'axe',      label: 'Топоры',      icon: UNIT_ICONS.axe },
  { key: 'light',    label: 'ЛК',          icon: UNIT_ICONS.light },
  { key: 'heavy',    label: 'ТК',          icon: UNIT_ICONS.heavy },
  { key: 'ram',      label: 'Тараны',      icon: UNIT_ICONS.ram },
  { key: 'spear',    label: 'Копья',       icon: UNIT_ICONS.spear },
  { key: 'sword',    label: 'Мечи',        icon: UNIT_ICONS.sword },
  { key: 'spy',      label: 'Лазутчики',   icon: UNIT_ICONS.spy },
  { key: 'catapult', label: 'Катапульты',  icon: UNIT_ICONS.catapult },
  { key: 'knight',   label: 'Паладин',     icon: UNIT_ICONS.knight },
  { key: 'snob',     label: 'Дворянин',    icon: UNIT_ICONS.snob },
]

// tracks which unit keys are explicitly in "Кол-во" mode (even when value is 0)
const cuCountModeKeys = ref(new Set<string>())

function isCountMode(key: string): boolean {
  const v = (form.role.customUnits?.[key] as number | undefined) ?? -1
  return (v > 0 || cuCountModeKeys.value.has(key)) && !getCustomUnitPct(key)
}

function activateCountMode(key: string): void {
  cuCountModeKeys.value.add(key)
  if (!form.role.customUnits) form.role.customUnits = {}
  // keep existing positive value, otherwise 0 (user will type)
  if ((form.role.customUnits[key] as number | undefined) === undefined || (form.role.customUnits[key] as number) < 0)
    form.role.customUnits[key] = 0
  if (form.role.customUnitPct) form.role.customUnitPct[key] = 0
}

function onCountInput(key: string, val: number): void {
  cuCountModeKeys.value.add(key)
  if (!form.role.customUnits) form.role.customUnits = {}
  const count = Math.max(0, val)
  form.role.customUnits[key] = count
  if (count === 0) {
    if (form.role.customUnitMin) delete form.role.customUnitMin[key]
  } else {
    if (!form.role.customUnitMin) form.role.customUnitMin = {}
    // always sync min to count — user can lower min manually afterward
    form.role.customUnitMin[key] = count
  }
}

function getCustomUnit(key: string): number {
  return (form.role.customUnits?.[key] as number | undefined) ?? -1
}

function setCustomUnit(key: string, val: number): void {
  if (!form.role.customUnits) form.role.customUnits = {}
  form.role.customUnits[key] = val
  if (form.role.customUnitPct) form.role.customUnitPct[key] = 0
  cuCountModeKeys.value.delete(key)
}

function getCustomUnitPct(key: string): number {
  return (form.role.customUnitPct?.[key] as number | undefined) ?? 0
}

function setCustomUnitPct(key: string, pct: number): void {
  if (!form.role.customUnitPct) form.role.customUnitPct = {}
  form.role.customUnitPct[key] = Math.max(1, Math.min(100, pct))
  if (!form.role.customUnits) form.role.customUnits = {}
  form.role.customUnits[key] = 0
}

function getCustomUnitMin(key: string): number {
  return (form.role.customUnitMin?.[key] as number | undefined) ?? 0
}

function setCustomUnitMin(key: string, val: number, el?: HTMLInputElement): void {
  if (!form.role.customUnitMin) form.role.customUnitMin = {}
  const count = isCountMode(key) ? ((form.role.customUnits?.[key] as number | undefined) ?? 0) : Infinity
  const n = Math.max(0, Math.min(val, isFinite(count) ? count : val))
  if (n === 0) delete form.role.customUnitMin[key]
  else form.role.customUnitMin[key] = n
  if (el) el.value = n > 0 ? String(n) : ''
}

function activatePctMode(key: string): void {
  if (!form.role.customUnitPct) form.role.customUnitPct = {}
  if (!form.role.customUnitPct[key]) form.role.customUnitPct[key] = 100
  if (!form.role.customUnits) form.role.customUnits = {}
  form.role.customUnits[key] = 0
  cuCountModeKeys.value.delete(key)
}

function onCustomImageUpload(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => { form.role.customImageUrl = ev.target?.result as string }
  reader.readAsDataURL(file)
}


const customColor = computed({
  get: () => form.color ?? '#e07b39',
  set: (v: string) => { form.color = v },
})

function setRoleType(type: VillageRoleType): void {
  if (form.role.type === type) return
  const role = defaultRoleForType(type)
  form.role = role
}

function syncCountModeKeys(): void {
  cuCountModeKeys.value = new Set(
    Object.entries(form.role.customUnits ?? {})
      .filter(([, v]) => (v as number) > 0)
      .map(([k]) => k)
  )
}

function openNew(section: 'single' | 'custom' = 'single'): void {
  const f = blankForm()
  if (section === 'custom') { f.role = defaultRoleForType('custom_off'); }
  Object.assign(form, f)
  cuCountModeKeys.value = new Set()
  editorMode.value = section
  editingId.value = null
  editorOpen.value = true
  scrollToEditor()
}

function openEdit(id: string): void {
  const preset = store.all.find((p) => p.id === id)
  if (!preset) return
  form.name = preset.name
  form.description = preset.description
  form.color = preset.color ?? (preset.role as { customColor?: string }).customColor ?? undefined
  form.role = {
    ...preset.role,
    customUnits:   { ...(preset.role.customUnits   ?? {}) },
    customUnitPct: { ...(preset.role.customUnitPct ?? {}) },
    customUnitMin: { ...(preset.role.customUnitMin ?? {}) },
  }
  syncCountModeKeys()
  editorMode.value = preset.role.type === 'custom_off' ? 'custom' : 'single'
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
  const data: { name: string; description: string; color?: string; role: VillageRole } = {
    name: form.name.trim(),
    description: form.description.trim(),
    role: { ...form.role },
  }
  if (form.color) data.color = form.color
  if (editingId.value) {
    store.update(editingId.value, data)
  } else {
    store.add(data)
  }
  closeEditor()
}

function confirmRemove(id: string): void {
  const preset = store.all.find((p) => p.id === id)
  if (confirm(`Удалить пресет "${preset?.name}"?`)) store.remove(id)
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

// ---- Section headers ----
.section-head {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: $text-faint;
  margin: 1.5rem 0 0.75rem;
  border-bottom: 1px solid $border;
  padding-bottom: 0.4rem;
}

.sg-input {
  width: 64px !important;
  padding: 0.2rem 0.4rem !important;
  font-size: 0.82rem !important;
  text-align: center;
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
  &.card-train   { border-color: a($purple, 0.3); }
  &.card-train.card-builtin { border-color: a($purple, 0.5); }
  &.card-spam    { border-color: a($text-dim, 0.25); background: a($text-dim, 0.04); }
  &.card-spam.card-builtin { border-color: a($text-dim, 0.4); }
  &.card-editing  { border-color: $accent; box-shadow: 0 0 0 2px a($accent, 0.2); }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-role-icon {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  flex-shrink: 0;
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

.card-note {
  font-size: 0.76rem;
  color: $orange;
  margin: 0;
  line-height: 1.3;
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
.chip-off    { background: a($accent,    0.15); color: $accent;    border: 1px solid a($accent,    0.3); }
.chip-mid    { background: rgba(180, 100, 40, 0.18); color: #c87d3e; border: 1px solid rgba(180, 100, 40, 0.4); }
.chip-mini   { background: rgba(180, 160, 40, 0.15); color: #b8a832; border: 1px solid rgba(180, 160, 40, 0.35); }
.chip-green  { background: a($green,     0.15); color: $green;     border: 1px solid a($green,     0.3); }
.chip-noble  { background: a($purple,    0.15); color: $purple;    border: 1px solid a($purple,    0.3); }
.chip-spam   { background: a($green, 0.12); color: $green; border: 1px solid a($green, 0.25); }
.chip-detail { background: a($text-faint, 0.1); color: $text-dim;  border: 1px solid a($text-faint, 0.2); }
.chip-warn   { background: a($orange, 0.15);   color: $orange;    border: 1px solid a($orange, 0.35); }

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

.f-hint {
  font-size: 0.72rem;
  color: $text-faint;
  font-weight: 400;
  margin-left: 0.3rem;
}

.f-checkbox {
  flex-direction: row;
  align-items: flex-end;
  gap: 0.5rem;
  color: $text;
  font-size: 0.9rem;
  padding-bottom: 0.3rem;
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
  font-size: 0.78rem;
  color: $text-faint;
  margin: 0.2rem 0 0.5rem;
  line-height: 1.4;
}

// ---- Role type selector ----
.role-type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.role-btn {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  background: a($bg-deep, 0.6);
  color: $text-dim;
  transition: all 0.15s;

  &:hover { opacity: 0.85; }

  &.chip-off.active    { background: a($accent,    0.2); color: $accent;   border-color: a($accent,    0.5); }
  &.chip-mid.active    { background: rgba(180, 100, 40, 0.25); color: #c87d3e; border-color: rgba(180, 100, 40, 0.6); }
  &.chip-mini.active   { background: rgba(180, 160, 40, 0.22); color: #b8a832; border-color: rgba(180, 160, 40, 0.55); }
  &.chip-green.active  { background: a($green,     0.2); color: $green;    border-color: a($green,     0.5); }
  &.chip-noble.active  { background: a($purple,    0.2); color: $purple;   border-color: a($purple,    0.5); }
  &.chip-spam.active   { background: a($green, 0.2); color: $green; border-color: a($green, 0.5); }

  &:not(.active) {
    &.chip-off   { color: a($accent,   0.5); border-color: a($accent,   0.15); }
    &.chip-mid   { color: rgba(180, 100, 40, 0.6); border-color: rgba(180, 100, 40, 0.2); }
    &.chip-mini  { color: rgba(180, 160, 40, 0.6); border-color: rgba(180, 160, 40, 0.2); }
    &.chip-green { color: a($green,    0.5); border-color: a($green,    0.15); }
    &.chip-noble { color: a($purple,   0.5); border-color: a($purple,   0.15); }
    &.chip-spam  { color: a($green, 0.5); border-color: a($green, 0.15); }
  }
}

.editor-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
}

// ── Custom off ────────────────────────────────────────────────────────────
.custom-units-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}

.cu-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid $border;
  border-radius: 6px;
  overflow: hidden;
}

.cu-table-head {
  display: grid;
  grid-template-columns: 1fr 180px;
  background: a($text-faint, 0.06);
  border-bottom: 1px solid $border;
  padding: 0.3rem 0.75rem;
}

.cu-th-left, .cu-th-right {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: $text-faint;
}

.cu-th-right {
  padding-left: 0.75rem;
  border-left: 1px solid $border;
}

.cu-row {
  display: grid;
  grid-template-columns: 1fr 180px;
  align-items: center;
  border-bottom: 1px solid a($border, 0.5);
  &:last-child { border-bottom: none; }
}

.cu-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.75rem;
}

.cu-right {
  display: flex;
  align-items: center;
  padding: 0.3rem 0.75rem;
  border-left: 1px solid $border;
  min-height: 100%;
}

.cu-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.cu-label {
  font-size: 0.85rem;
  color: $text-dim;
  width: 90px;
  flex-shrink: 0;
}

.cu-controls {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.cu-mode {
  background: a($text-dim, 0.07);
  border: 1px solid $border;
  border-radius: 4px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  transition: all 0.12s;

  &:hover { border-color: $accent; color: $text; }

  &.cu-mode-on {
    background: a($accent, 0.12);
    border-color: a($accent, 0.5);
    color: $accent;
  }
}

.cu-count {
  width: 70px !important;
  padding: 0.22rem 0.4rem !important;
  font-size: 0.83rem !important;
}

.cu-pct-sign {
  font-size: 0.8rem;
  color: $text-dim;
  margin-left: -0.25rem;
}

.cu-pop-summary {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.82rem;
  color: $text-dim;
  strong {
    color: $text;
  }
}

.custom-pop-warning {
  margin: 0.5rem 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid #e94560;
  background: rgba(233, 69, 96, 0.08);
  border-radius: 4px;
  font-size: 0.82rem;
  color: #e94560;
  line-height: 1.4;
}

.cu-min-na {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90px;
  color: rgba(255,255,255,0.2);
  font-size: 0.9rem;
  user-select: none;
}

.cu-min-input {
  width: 90px !important;
  padding: 0.22rem 0.4rem !important;
  font-size: 0.83rem !important;
  color: $text-dim !important;
  &:not(:placeholder-shown) {
    color: #4ecca3 !important;
    border-color: rgba(78, 204, 163, 0.4) !important;
  }
}

.cu-image-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.2rem;
}

.cu-img-opt {
  border: 2px solid $border;
  border-radius: 6px;
  padding: 0.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
  min-width: 40px;
  min-height: 36px;

  &:hover { border-color: $accent; }
  &.cu-img-on { border-color: $accent; background: a($accent, 0.1); }
}

.cu-img-preview {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.cu-img-upload-text {
  font-size: 1.1rem;
  line-height: 1;
}

.cu-file-input {
  display: none;
}

.cu-color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

.cu-color-input {
  width: 40px;
  height: 32px;
  border: 1px solid $border;
  border-radius: 4px;
  padding: 2px;
  background: $bg-page;
  cursor: pointer;
}

.cu-color-preview {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 10px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
</style>
