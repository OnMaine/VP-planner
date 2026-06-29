<template>
  <div class="presets-view">
    <h1>Пресеты войск</h1>

    <div class="top-bar">
      <button class="btn btn-primary" @click="openNew('single')">+ Одиночный пресет</button>
      <button class="btn btn-primary" @click="openNew('train')">+ Комбинированный</button>
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
          <span :class="['chip', roleChipClass(preset.role.type)]">{{ ROLE_LABELS[preset.role.type] }}</span>
          <span v-for="(d, i) in roleDetails(preset.role, preset.builtIn)" :key="i" :class="['chip', d.warn ? 'chip-warn' : 'chip-detail']">{{ d.label }}</span>
        </div>
        <div class="card-actions">
          <button v-if="!preset.builtIn" class="btn btn-secondary btn-sm" @click="openEdit(preset.id)">Изменить</button>
          <button class="btn btn-secondary btn-sm" @click="store.clone(preset.id)">{{ preset.builtIn ? 'Клонировать' : 'Копия' }}</button>
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
          <span :class="['chip', roleChipClass(preset.role.type)]">{{ ROLE_LABELS[preset.role.type] }}</span>
          <span v-for="(d, i) in roleDetails(preset.role, preset.builtIn)" :key="i" :class="['chip', d.warn ? 'chip-warn' : 'chip-detail']">{{ d.label }}</span>
        </div>
        <div class="card-actions">
          <button v-if="!preset.builtIn" class="btn btn-secondary btn-sm" @click="openEdit(preset.id)">Изменить</button>
          <button class="btn btn-secondary btn-sm" @click="store.clone(preset.id)">{{ preset.builtIn ? 'Клонировать' : 'Копия' }}</button>
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

      <!-- Role type selector -->
      <h3 class="sub-head">Тип роли деревни</h3>
      <div class="role-type-grid">
        <button
          v-for="t in availableRoleTypes"
          :key="t"
          :class="['role-btn', { active: form.role.type === t }, roleChipClass(t)]"
          @click="setRoleType(t)"
        >{{ editorMode === 'custom' ? (t === 'custom_off' ? 'Одиночная' : 'Комбинированная') : ROLE_LABELS[t] }}</button>
      </div>

      <!-- Type-specific config -->
      <!-- Type-specific config -->
      <template v-if="form.role.type === 'spike'">
        <h3 class="sub-head">Состав колючки</h3>
        <div class="form-row">
          <label class="f-label">
            Тараны
            <input v-model.number="form.role.spikeRams" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            Лазутчики
            <input v-model.number="form.role.spikeSpy" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            Топоры
            <input v-model.number="form.role.spikeAxe" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            ЛК
            <input v-model.number="form.role.spikeLight" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            ТК
            <input v-model.number="form.role.spikeHeavy" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            Катапульты
            <input v-model.number="form.role.spikeCat" type="number" min="0" class="input" />
          </label>
        </div>
      </template>

      <template v-else-if="form.role.type === 'half_off'">
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

      <template v-else-if="form.role.type === 'breach_off'">
        <h3 class="sub-head">Параметры</h3>
        <div class="form-row">
          <label class="f-label">
            Мин. тараны
            <input v-model.number="form.role.minRams" type="number" min="1" class="input" />
          </label>
        </div>
      </template>

      <template v-else-if="form.role.type === 'green_off'">
        <h3 class="sub-head">Параметры</h3>
        <div class="form-row">
          <label class="f-label">
            Тип эскорта
            <select v-model="form.role.greenVariant" class="input">
              <option value="light">ЛК (лёгкая кавалерия)</option>
              <option value="axes">Топоры</option>
              <option value="flexible">Гибкий (любые войска)</option>
            </select>
          </label>
          <template v-if="form.role.greenVariant !== 'flexible'">
            <label class="f-label f-checkbox">
              <input v-model="form.role.greenWithRams" type="checkbox" />
              Включить тараны (опционально)
            </label>
          </template>
        </div>
        <template v-if="form.role.greenVariant === 'flexible'">
          <div class="form-row">
            <label class="f-label">
              Цель: топоры
              <input v-model.number="form.role.greenTargetAxe" type="number" min="0" :max="form.role.greenMax ?? 999" class="input"
                @change="clampFlexGreenFields()" />
            </label>
            <label class="f-label">
              Цель: ЛК
              <input v-model.number="form.role.greenTargetLight" type="number" min="0" :max="(form.role.greenMax ?? 999) - (form.role.greenTargetAxe ?? 0)" class="input"
                @change="clampFlexGreenFields()" />
            </label>
            <label class="f-label">
              Макс. эскорт
              <input v-model.number="form.role.greenMax" type="number" min="1" max="999" class="input"
                @change="clampFlexGreenFields()" />
            </label>
            <label class="f-label">
              Мин. эскорт
              <input v-model.number="form.role.greenMin" type="number" min="0" :max="form.role.greenMax ?? 999" class="input"
                @change="clampFlexGreenFields()" />
            </label>
          </div>
          <p class="hint-text">Заполняет: сначала топоры (до цели), затем ЛК (до цели), затем тяж.кав → мечи → копья. Деревня пропускается если эскорт &lt; мин.</p>
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

      <template v-else-if="form.role.type === 'train'">
        <h3 class="sub-head">Атаки паровоза</h3>
        <div class="train-attacks">
          <div class="train-attack-head">
            <span class="ta-num"></span>
            <span class="ta-col">Тип атаки</span>
            <span class="ta-col">Эскорт</span>
            <span class="ta-col">Доп. параметры</span>
            <span class="ta-actions"></span>
          </div>
          <div
            v-for="(atk, i) in (form.role.trainAttacks ?? [])"
            :key="i"
            class="train-attack-row"
          >
            <span class="ta-num">Нападение #{{ i + 1 }}</span>
            <select
              :value="trainSelectValue(atk)"
              class="input ta-select"
              @change="onTrainAttackSelect(atk, ($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="С дворянином">
                <option value="full_off">Красный двор</option>
                <option value="split">Поделёнка</option>
                <option value="green_off">Зеленка</option>
              </optgroup>
              <optgroup label="Оффы">
                <option value="pal_off">Пал-офф</option>
                <option value="breach_off">Офф пробой</option>
                <option value="half_off">Медиум офф</option>
              </optgroup>
              <optgroup label="Спец">
                <option value="spike">Колючка</option>
                <option value="cat_squad">Кат отряд</option>
              </optgroup>
              <optgroup label="Спам">
                <option value="spam">Спам</option>
              </optgroup>
              <optgroup v-if="customOffPresets.length > 0" label="── Кастом ──">
                <option v-for="p in customOffPresets" :key="p.id" :value="`custom::${p.id}`">{{ p.name }}</option>
              </optgroup>
            </select>
            <template v-if="atk.type === 'green_off'">
              <select v-model="atk.greenVariant" class="input ta-select">
                <option value="light">ЛК</option>
                <option value="axes">Топоры</option>
                <option value="flexible">Гибкий</option>
              </select>
              <template v-if="atk.greenVariant === 'flexible'">
                <span class="ta-flex-params">
                  <input v-model.number="atk.greenTargetAxe" type="number" min="0" :max="atk.greenMax ?? 999" class="input ta-tiny" placeholder="топ." title="Цель: топоры"
                    @change="atk.greenTargetAxe = Math.max(0, Math.min(atk.greenTargetAxe ?? 0, atk.greenMax ?? 999)); atk.greenTargetLight = Math.max(0, Math.min(atk.greenTargetLight ?? 0, (atk.greenMax ?? 999) - (atk.greenTargetAxe ?? 0)))" />
                  <input v-model.number="atk.greenTargetLight" type="number" min="0" :max="(atk.greenMax ?? 999) - (atk.greenTargetAxe ?? 0)" class="input ta-tiny" placeholder="лк" title="Цель: ЛК"
                    @change="atk.greenTargetLight = Math.max(0, Math.min(atk.greenTargetLight ?? 0, (atk.greenMax ?? 999) - (atk.greenTargetAxe ?? 0)))" />
                  <span class="ta-flex-info">{{ worldStore.settings.minAttackSize }}–{{ atk.greenMax ?? 999 }}</span>
                </span>
              </template>
              <label v-else class="ta-check">
                <input v-model="atk.greenWithRams" type="checkbox" /> тар.
              </label>
            </template>
            <template v-else-if="atk.type === 'custom_off'">
              <span class="ta-empty">—</span>
              <span class="ta-empty">—</span>
            </template>
            <template v-else>
              <span class="ta-empty">—</span>
              <span class="ta-empty">—</span>
            </template>
            <button class="ta-remove" @click="removeTrainAttack(i)" title="Удалить">✕</button>
          </div>
          <button class="btn btn-secondary btn-sm ta-add" @click="addTrainAttack">+ Нападение</button>
        </div>
      </template>


      <template v-else-if="form.role.type === 'custom_off'">
        <h3 class="sub-head">Состав атаки</h3>
        <div class="custom-units-grid">
          <div v-for="u in CUSTOM_UNITS" :key="u.key" class="cu-row">
            <img :src="u.icon" class="cu-icon" :title="u.label" />
            <span class="cu-label">{{ u.label }}</span>
            <div class="cu-controls">
              <button
                :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) === 0 }]"
                @click="setCustomUnit(u.key, 0)"
              >Не брать</button>
              <button
                :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) === -1 }]"
                @click="setCustomUnit(u.key, -1)"
              >Всё</button>
              <button
                :class="['cu-mode', { 'cu-mode-on': getCustomUnit(u.key) > 0 }]"
                @click="setCustomUnit(u.key, getCustomUnit(u.key) > 0 ? getCustomUnit(u.key) : 100)"
              >Кол-во</button>
              <input
                v-if="getCustomUnit(u.key) > 0"
                :value="getCustomUnit(u.key)"
                type="number" min="1"
                class="input cu-count"
                @change="setCustomUnit(u.key, Math.max(1, +($event.target as HTMLInputElement).value))"
              />
            </div>
          </div>
        </div>
        <h3 class="sub-head">Ограничения и отображение</h3>
        <div class="form-row">
          <label class="f-label">
            Мин. юнитов
            <input v-model.number="form.role.customMin" type="number" min="0" class="input" />
          </label>
          <label class="f-label">
            Макс. юнитов
            <input v-model.number="form.role.customMax" type="number" min="1" class="input" />
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

      <template v-else-if="form.role.type === 'spam'">
        <h3 class="sub-head">Параметры спама</h3>
        <div class="form-row">
          <label class="f-label">
            Тип спама
            <select v-model="form.role.spamStrength" class="input">
              <option value="weak">Зелень (мин. войска)</option>
              <option value="strong">Рыжий (1000+ юнитов)</option>
              <option value="full">Фуллами (полный офф)</option>
            </select>
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
  ROLE_LABELS, ALL_ROLE_TYPES, defaultRoleForType,
} from '@/stores/presetsStore'
import type { VillageRole, VillageRoleType, GreenVariant, TrainAttack, TrainAttackType, AttackPreset } from '@/stores/presetsStore'
import { TRAIN_ATTACK_LABELS } from '@/stores/presetsStore'
import attackLarge  from '@/assets/images/attack_large.webp'
import attackMedium from '@/assets/images/attack_medium.webp'
import attackSmall  from '@/assets/images/attack_small.webp'
import customAttIcon from '@/assets/images/att.png'
import catapultIcon from '@/assets/images/unit_catapult@2x.webp'
import snobIcon     from '@/assets/images/unit_snob.webp'
import knightIcon   from '@/assets/images/unit_knight.webp'
import ramIcon      from '@/assets/images/unit_ram@2x.webp'
import { UNIT_ICONS } from '@/utils/unitIcons'
import lightIcon    from '@/assets/images/unit_light@2x.webp'

const store = usePresetsStore()
const worldStore = useWorldStore()

const isCombined = (p: AttackPreset) => p.role.type === 'train' || p.combined
const singlePresets = computed(() => store.all.filter(p => !isCombined(p)))
const trainPresets  = computed(() => store.all.filter(p => isCombined(p)))

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const editorMode = ref<'single' | 'custom'>('single')

const availableRoleTypes = computed(() =>
  editorMode.value === 'custom'
    ? (['custom_off', 'train'] as VillageRoleType[])
    : ALL_ROLE_TYPES.filter(t => t !== 'train' && t !== 'custom_off')
)

interface FormState {
  name: string
  description: string
  role: VillageRole
}

function blankForm(): FormState {
  return { name: '', description: '', role: { type: 'full_off' } }
}

const form = reactive<FormState>(blankForm())

const canSave = computed(() => form.name.trim().length > 0)

function roleIcons(role: VillageRole): string[] {
  switch (role.type) {
    case 'full_off':   return role.nobleIncluded ? [attackLarge, snobIcon] : [attackLarge]
    case 'breach_off': return [attackLarge, ramIcon]
    case 'pal_off':    return [attackLarge, knightIcon]
    case 'half_off':   return [attackMedium]
    case 'green_off':  return [attackSmall, snobIcon]
    case 'cat_squad':  return [catapultIcon]
    case 'spike':      return [ramIcon, lightIcon]
    case 'train': {
      const attacks = role.trainAttacks ?? []
      const allGreen = attacks.length > 0 && attacks.every(a => a.type === 'green_off')
      const hasRed = attacks.some(a => a.type === 'full_off' || a.type === 'pal_off' || a.type === 'breach_off')
      return [allGreen ? attackSmall : hasRed ? attackLarge : attackMedium, snobIcon]
    }
    case 'split':      return [attackMedium, snobIcon]
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
  if (preset.id === 'bi_pal_off') return '★ приоритет — самые укомплектованные оффы: сначала оффы пробоя, иначе — самый сильный обычный офф'
  return ''
}

function cardDescription(preset: AttackPreset): string {
  if (preset.id === 'bi_breach_off') {
    return `Офф с ${store.breachMinRams}+ таранами — пробивает стену перед оффами и дворами`
  }
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

function roleChipClass(type: VillageRoleType): string {
  switch (type) {
    case 'full_off':
    case 'half_off':
    case 'pal_off':
    case 'breach_off': return 'chip-off'
    case 'green_off':
    case 'cat_squad':
    case 'spike':      return 'chip-green'
    case 'train':
    case 'split':      return 'chip-noble'
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
    case 'spike': {
      if (role.spikeRams)  d.push(chip(`${role.spikeRams} тар.`))
      if (role.spikeSpy)   d.push(chip(`${role.spikeSpy} лаз.`))
      if (role.spikeLight) d.push(chip(`${role.spikeLight} ЛК`))
      d.push(chip('≤1000 юн.'))
      break
    }
    case 'full_off':
      d.push(chip('5001+ юн.'))
      if (role.nobleIncluded) d.push(chip('1 двор'))
      break
    case 'pal_off':
      d.push(chip('5001+ юн.'))
      break
    case 'breach_off': {
      const threshold = builtIn ? store.breachMinRams : (role.minRams ?? 750)
      d.push(chip('5001+ юн.'))
      d.push(chip(`${threshold}+ тар.`))
      break
    }
    case 'half_off': {
      const hMin = role.halfMin ?? 1001
      const hMax = role.halfMax ?? 5000
      d.push(chip(`${hMin}–${hMax} юн.`))
      if (role.halfFixedComp) d.push(chip('фикс. состав'))
      break
    }
    case 'green_off': {
      const v = role.greenVariant ?? 'light'
      d.push(chip('1 двор'))
      if (v === 'flexible') {
        d.push(chip(`топ.${role.greenTargetAxe ?? 500}+лк${role.greenTargetLight ?? 250}`))
        d.push(chip(`≤${role.greenMax ?? 999} юн.`))
        if ((role.greenMin ?? 0) > 0) d.push(chip(`мин.${role.greenMin}`))
      } else {
        d.push(chip(v === 'axes' ? 'Топоры' : 'ЛК'))
        if (role.greenWithRams) d.push(chip('+ тар.'))
        d.push(chip('= 1000'))
      }
      break
    }
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
    case 'train': {
      const attacks = role.trainAttacks ?? []
      d.push(chip(`${attacks.length} атак`))
      const counts: Partial<Record<string, number>> = {}
      for (const a of attacks) counts[a.type] = (counts[a.type] ?? 0) + 1
      for (const [t, n] of Object.entries(counts)) {
        d.push(chip(`${n}× ${TRAIN_ATTACK_LABELS[t as TrainAttackType] ?? t}`))
      }
      break
    }
    case 'split':
      d.push(chip('1001–5001 юн.'))
      break
    case 'spam': {
      const s = role.spamStrength ?? 'weak'
      if (s === 'strong') { d.push(chip('Медиум офф')); d.push(chip('1001–5001 юн.')) }
      else if (s === 'full') { d.push(chip('Фулл офф')); d.push(chip('5001+ юн.')) }
      else { d.push(chip('Фейк')); d.push(chip('≤1000 юн.')) }
      if (role.spamNobleCount) {
        d.push(chip(`${role.spamNobleCount} дворян`))
        if ((role.spamTrainSize ?? 0) > 0) d.push(chip('Паровоз'))
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

function getCustomUnit(key: string): number {
  return (form.role.customUnits?.[key] as number | undefined) ?? -1
}

function setCustomUnit(key: string, val: number): void {
  if (!form.role.customUnits) form.role.customUnits = {}
  form.role.customUnits[key] = val
}

function onCustomImageUpload(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => { form.role.customImageUrl = ev.target?.result as string }
  reader.readAsDataURL(file)
}

function clampFlexGreenFields(): void {
  const max = Math.max(1, Math.min(form.role.greenMax ?? 999, 999))
  form.role.greenMax       = max
  const axe  = Math.max(0, Math.min(form.role.greenTargetAxe  ?? 0, max))
  const light = Math.max(0, Math.min(form.role.greenTargetLight ?? 0, max - axe))
  form.role.greenTargetAxe   = axe
  form.role.greenTargetLight = light
  form.role.greenMin         = Math.max(0, Math.min(form.role.greenMin ?? 0, max))
}

const customColor = computed({
  get: () => (form.role as { customColor?: string }).customColor ?? '#e07b39',
  set: (v: string) => { (form.role as { customColor?: string }).customColor = v },
})

function setRoleType(type: VillageRoleType): void {
  if (form.role.type === type) return
  const role = defaultRoleForType(type)
  if (type === 'breach_off') role.minRams = store.breachMinRams
  form.role = role
}

function defaultTrainAttack(): TrainAttack {
  return { type: 'green_off', greenVariant: 'flexible', greenTargetAxe: 500, greenTargetLight: 250, greenMax: 999, greenWithRams: false }
}

// only single-attack customs — train presets explicitly excluded to prevent nesting loops
const customOffPresets = computed(() => store.all.filter(p => p.role.type === 'custom_off'))

function trainSelectValue(atk: TrainAttack): string {
  if (atk.type === 'custom_off' && atk.customPresetId) return `custom::${atk.customPresetId}`
  return atk.type
}

function onTrainAttackSelect(atk: TrainAttack, val: string): void {
  if (val.startsWith('custom::')) {
    atk.type = 'custom_off'
    atk.customPresetId = val.slice(8)
  } else {
    atk.type = val as TrainAttackType
    atk.customPresetId = undefined
    onAttackTypeChange(atk)
  }
}

function onAttackTypeChange(atk: TrainAttack): void {
  if (atk.type === 'green_off') {
    atk.greenVariant     = atk.greenVariant     ?? 'flexible'
    atk.greenTargetAxe   = atk.greenTargetAxe   ?? 500
    atk.greenTargetLight = atk.greenTargetLight  ?? 250
    atk.greenMax         = atk.greenMax          ?? 999
    atk.greenWithRams    = atk.greenWithRams     ?? false
  }
}

function addTrainAttack(): void {
  if (!form.role.trainAttacks) form.role.trainAttacks = []
  form.role.trainAttacks.push(defaultTrainAttack())
}

function removeTrainAttack(i: number): void {
  form.role.trainAttacks?.splice(i, 1)
}

function openNew(section: 'single' | 'train' | 'custom' = 'single'): void {
  const f = blankForm()
  if (section === 'train')  { f.role = defaultRoleForType('train');      }
  if (section === 'custom') { f.role = defaultRoleForType('custom_off'); }
  Object.assign(form, f)
  editorMode.value = section === 'train' ? 'custom' : section
  editingId.value = null
  editorOpen.value = true
  scrollToEditor()
}

function openEdit(id: string): void {
  const preset = store.all.find((p) => p.id === id)
  if (!preset) return
  form.name = preset.name
  form.description = preset.description
  form.role = {
    ...preset.role,
    customUnits: { ...(preset.role.customUnits ?? {}) },
    ...(preset.role.type === 'custom_off' ? { customColor: preset.role.customColor ?? '#e07b39' } : {}),
  }
  editorMode.value = (preset.role.type === 'train' || preset.role.type === 'custom_off') ? 'custom' : 'single'
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
    role: { ...form.role },
  }
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
.chip-green  { background: a($green,     0.15); color: $green;     border: 1px solid a($green,     0.3); }
.chip-noble  { background: a($purple,    0.15); color: $purple;    border: 1px solid a($purple,    0.3); }
.chip-spam   { background: a($text-dim,  0.12); color: $text-dim;  border: 1px solid a($text-dim,  0.2); }
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
  &.chip-green.active  { background: a($green,     0.2); color: $green;    border-color: a($green,     0.5); }
  &.chip-noble.active  { background: a($purple,    0.2); color: $purple;   border-color: a($purple,    0.5); }
  &.chip-spam.active   { background: a($text-dim,  0.2); color: $text-dim; border-color: a($text-dim,  0.4); }

  &:not(.active) {
    &.chip-off   { color: a($accent,   0.5); border-color: a($accent,   0.15); }
    &.chip-green { color: a($green,    0.5); border-color: a($green,    0.15); }
    &.chip-noble { color: a($purple,   0.5); border-color: a($purple,   0.15); }
    &.chip-spam  { color: a($text-dim, 0.5); border-color: a($text-dim, 0.15); }
  }
}

// ---- Green train attack rows ----
.train-attacks {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.25rem;
}

.train-attack-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $text-faint;
  padding: 0 0.1rem;
}

.train-attack-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ta-num {
  font-size: 0.8rem;
  color: $text-dim;
  min-width: 110px;
}

.ta-col { min-width: 110px; }

.ta-select {
  width: 130px !important;
  padding: 0.3rem 0.5rem !important;
  font-size: 0.85rem !important;
}

.ta-check {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: $text-dim;
  cursor: pointer;
}

.ta-flex-params {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.ta-tiny {
  width: 54px !important;
  padding: 0.3rem 0.3rem !important;
  font-size: 0.8rem !important;
  text-align: center;
}

.ta-flex-info {
  font-size: 0.75rem;
  color: $text-faint;
  white-space: nowrap;
  align-self: center;
}

.ta-empty {
  min-width: 110px;
  color: $text-faint;
  font-size: 0.82rem;
}

.ta-actions { min-width: 24px; }

.ta-remove {
  background: none;
  border: none;
  color: $text-faint;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.3rem;
  border-radius: 4px;
  line-height: 1;
  &:hover { color: $accent; background: a($accent, 0.1); }
}

.ta-add {
  margin-top: 0.4rem;
  align-self: flex-start;
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

.cu-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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
