<template>
  <section class="panel active-mass-panel">

    <!-- Заголовок + тайминг выбранной волны -->
    <div class="panel-row panel-row-main">
      <span class="section-label">Настройки волны</span>
      <span v-if="curWaveInfo?.multi" class="settings-wave-badge">волна {{ curWaveInfo.ordinal }} · {{ curWaveInfo.name }}</span>
      <div class="row-spacer" />

      <template v-if="wsettings">
        <span class="time-label">
          Тайминг
          <span class="timing-hint" title="Опорное время для цели этой волны. От него считаются все атаки: смещение слота задаёт сдвиг относительно этой точки">?</span>
        </span>
        <input v-model="arrivalDatetime" type="datetime-local" class="arrival-input" step="0.001" />
        <button
          class="apply-btn"
          :title="curWaveInfo?.multi ? `Проставить это время ВСЕМ целям волны ${curWaveInfo.ordinal} (${curWaveInfo.name}) — другие волны не трогает` : 'Проставить это время всем целям'"
          @click="applyArrivalTime"
        >{{ curWaveInfo?.multi ? `→ целям волны ${curWaveInfo.ordinal}` : '→ всем целям' }}</button>
      </template>
    </div>

    <template v-if="wsettings">
      <!-- Пер-волновые тумблеры -->
      <div class="panel-row panel-row-opts">
        <button
          :class="['toggle-btn', { 'toggle-on': wsettings.sendExcludeEnabled }]"
          title="Без ночных: пропускать атаки, отправка которых попадает в ночное окно. Укажи диапазон часов ниже."
          @click="setWS({ sendExcludeEnabled: !wsettings.sendExcludeEnabled })"
        >🌙 Без ночных</button>
        <transition name="fade">
          <span v-if="wsettings.sendExcludeEnabled" class="night-range">
            <input type="number" min="0" max="23" class="night-input"
              :value="wsettings.nightFrom"
              @change="setWS({ nightFrom: +($event.target as HTMLInputElement).value })" />
            <span class="night-sep">–</span>
            <input type="number" min="0" max="23" class="night-input"
              :value="wsettings.nightTo"
              @change="setWS({ nightTo: +($event.target as HTMLInputElement).value })" />
            <span class="night-unit">ч</span>
          </span>
        </transition>

        <div class="v-sep" />

        <button
          :class="['toggle-btn', { 'toggle-on': wsettings.earliestSendEnabled }]"
          title="Ранний старт: не генерировать атаки, отправка которых раньше указанного времени"
          @click="toggleEarliest"
        >⏰ Старт не ранее</button>
        <transition name="fade">
          <input v-if="wsettings.earliestSendEnabled" type="datetime-local" class="input earliest-input" step="60"
            :max="wsettings.arrivalTime || undefined"
            :value="wsettings.earliestSendTime"
            @change="onEarliestChange(($event.target as HTMLInputElement).value)" />
        </transition>

        <div class="v-sep" />

        <button
          :class="['toggle-btn', { 'toggle-on': wsettings.moraleEnabled }]"
          title="Мораль: предупреждать, если очки атакующего значительно превышают очки защитника."
          @click="setWS({ moraleEnabled: !wsettings.moraleEnabled })"
        >⚖ Мораль</button>

        <div v-if="worldStore.settings.watchtowerEnabled" class="v-sep" />
        <button
          v-if="worldStore.settings.watchtowerEnabled"
          :class="['toggle-btn', { 'toggle-on': wsettings.watchtowerAvoidEnabled }]"
          title="Башни: засвеченные деревни уходят в конец очереди подбора — только для этой волны"
          @click="setWS({ watchtowerAvoidEnabled: !wsettings.watchtowerAvoidEnabled })"
        >🗼 Башни</button>

        <div class="v-sep" />
        <button
          :class="['toggle-btn', { 'toggle-on': wsettings.frontReserveEnabled }]"
          title="Резерв фронта: деры в радиусе N полей от целей ЭТОЙ волны не берутся как источники"
          @click="setWS({ frontReserveEnabled: !wsettings.frontReserveEnabled })"
        >🛡 Резерв фронта</button>
        <transition name="fade">
          <span v-if="wsettings.frontReserveEnabled" class="night-range">
            <input type="number" min="1" max="200" class="input front-dist-input"
              :value="wsettings.frontReserveDist"
              @change="setWS({ frontReserveDist: +($event.target as HTMLInputElement).value })" />
            <span class="night-unit">полей</span>
          </span>
        </transition>
      </div>

      <!-- Пер-волновое распределение -->
      <div class="panel-row panel-row-selects">
        <span class="opts-label">Распределение</span>
        <select class="input dist-select" :value="wsettings.offDistribution"
          title="Алгоритм распределения офов по целям этой волны"
          @change="setWS({ offDistribution: ($event.target as HTMLSelectElement).value as 'default' | 'fair' | 'far_first' | 'max_coverage' })">
          <option value="far_first">Дальние вперёд</option>
          <option value="fair">Справедливо</option>
          <option value="default">Жадно</option>
          <option value="max_coverage">Максимальное покрытие</option>
        </select>
      </div>
    </template>
    <div v-else class="settings-empty-hint">Добавь волну в «Волны плана», чтобы настроить генерацию.</div>

    <!-- Общие для плана (не пер-волну) -->
    <div class="global-section">
      <span class="global-label">Общие для плана</span>

      <div class="global-selects">
        <span class="opts-label">Дворяне</span>
        <select class="input dist-select" :value="worldStore.settings.noblePollMode ?? 'real'"
          @change="worldStore.updateSettings({ noblePollMode: ($event.target as HTMLSelectElement).value as 'real' | 'virtual' })"
          title="Источник дворян для расчёта пула (глобально для плана)">
          <option value="real">Реальные</option>
          <option value="virtual">Виртуальные</option>
        </select>

        <span class="opts-label">Паладины</span>
        <select class="input dist-select" :value="worldStore.settings.paladinMode ?? 'none'"
          @change="worldStore.updateSettings({ paladinMode: ($event.target as HTMLSelectElement).value as 'auto' | 'manual' | 'none' })"
          title="Режим определения офф-паладинов (глобально для плана)">
          <option value="none">Не распределять</option>
          <option value="manual">Вручную</option>
          <option value="auto">Автоматически</option>
        </select>
      </div>
    </div>

    <p v-if="virtualNobleFilterIgnored" class="virtual-noble-note">
      ⚠ Режим дворян «Виртуальные»: в пресете с двором фильтр «мин/макс дворов в дере» <b>игнорируется</b> — дворы берутся из общего пула игрока, а не из деревни.
    </p>

  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useMassConfigStore } from '@/stores/massConfigStore'
import { usePresetsStore, defaultColorForRole } from '@/stores/presetsStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePlanStore } from '@/stores/planStore'
import { useDateFormat } from '@/composables/useDateFormat'

const store = useMassConfigStore()
const presetsStore = usePresetsStore()
const worldStore = useWorldStore()
const planStore = usePlanStore()

// Виртуальный режим + в каком-либо конфиге волн есть паравоз с фильтром «мин/макс дворов в дере»
const virtualNobleFilterIgnored = computed(() => {
  if ((worldStore.settings.noblePollMode ?? 'real') === 'real') return false
  const usedConfigIds = new Set(planStore.planWaves.map(w => w.configId))
  return store.all.filter(c => usedConfigIds.has(c.id)).some(cfg =>
    cfg.slots.some(slot => {
      if (!slot.enabled) return false
      const role = presetsStore.all.find(p => p.id === slot.presetId)?.role
      if (!role || role.type !== 'custom_off') return false
      const snobSpec = (role.customUnits?.snob as number | undefined) ?? -1
      if (snobSpec <= 0) return false
      return !!(role.customUnitMin?.snob || role.customUnitMax?.snob)
    }))
})
const { toDatetimeLocal } = useDateFormat()

function slotChipClass(presetId: string): string {
  const type = presetsStore.all.find(p => p.id === presetId)?.role.type
  if (type === 'spam') return 'chip-spam'
  if (type === 'half_off') return 'chip-mid'
  if (type === 'mini_off') return 'chip-mini'
  return 'chip-off'
}

function slotCustomColor(presetId: string): string | undefined {
  const p = presetsStore.all.find(p => p.id === presetId)
  if (!p) return undefined
  return p.color ?? defaultColorForRole(p.role.type, p.role)
}

function chipCustomStyle(color: string): Record<string, string> {
  return { background: color + '1a', color, border: `1px solid ${color}4d` }
}

function slotLabel(presetId: string): string {
  return presetsStore.all.find(p => p.id === presetId)?.name ?? presetId
}

// ── Выбранная волна и её настройки (пер-волновые) ──────────────────────────
import type { WaveSettings } from '@/stores/planStore'
const curWaveId = computed(() => planStore.selectedWaveId ?? planStore.planWaves[0]?.id ?? null)
const curWave = computed(() => planStore.planWaves.find(w => w.id === curWaveId.value) ?? null)
const wsettings = computed<WaveSettings | null>(() => curWave.value?.settings ?? null)
const curWaveInfo = computed(() => {
  const idx = planStore.planWaves.findIndex(w => w.id === curWaveId.value)
  if (idx < 0) return null
  const cfg = store.all.find(c => c.id === planStore.planWaves[idx].configId)
  return { ordinal: idx + 1, name: cfg?.name ?? '(конфиг удалён)', multi: planStore.planWaves.length > 1 }
})
function setWS(partial: Partial<WaveSettings>): void {
  if (curWaveId.value) planStore.updateWaveSettings(curWaveId.value, partial)
}

const DEFAULT_ARRIVAL = toDatetimeLocal(new Date(Math.floor((Date.now() + 3600_000) / 1000) * 1000))
const arrivalDatetime = computed<string>({
  get: () => wsettings.value?.arrivalTime || DEFAULT_ARRIVAL,
  set: (v) => setWS({ arrivalTime: v }),
})

// «→ всем» — применяет опорное время к целям ЭТОЙ волны (или ко всем при одной волне).
function applyArrivalTime(): void {
  const d = new Date(arrivalDatetime.value)
  if (isNaN(d.getTime())) return
  const wid = curWaveId.value
  const multi = planStore.planWaves.length > 1
  for (const t of planStore.targets) {
    if (multi && t.waveId !== wid) continue
    planStore.updateTarget(t.id, { arrivalTime: d })
  }
}

// Toggle "старт не ранее" выбранной волны; при включении без времени — текущее.
function nowLocalInput(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function toggleEarliest(): void {
  const s = wsettings.value
  if (!s) return
  const enabled = !s.earliestSendEnabled
  const patch: Partial<WaveSettings> = { earliestSendEnabled: enabled }
  if (enabled && !s.earliestSendTime) patch.earliestSendTime = nowLocalInput()
  setWS(patch)
}

// Старт не ранее не может быть позже тайминга (прихода) — атака не отправляется
// после приземления. Если задали позже — зажимаем к времени прихода.
function onEarliestChange(val: string): void {
  const arr = wsettings.value?.arrivalTime
  const clamped = arr && val && val > arr ? arr : val
  setWS({ earliestSendTime: clamped })
}

// Резерв фронта теперь пер-волновый и считается в самой генерации
// (из целей волны + её радиуса), поэтому здесь ничего вычислять не нужно.
</script>

<style lang="scss" scoped>
.active-mass-panel {
  margin-bottom: 1rem;
  padding: 0.6rem 1rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mass-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.2rem;
}
.mass-empty-title { font-weight: 700; font-size: 0.95rem; color: $text; }
.mass-empty-text  { margin: 0; font-size: 0.82rem; color: $text-dim; line-height: 1.4; }
.mass-empty-btn   { margin-top: 0.2rem; text-decoration: none; }

// ── Row layout ────────────────────────────────────────────────────────────
.panel-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

.panel-row-main {
  min-height: 28px;
}

.panel-row-opts {
  min-height: 26px;
  padding: 0.55rem 0 0.1rem;
  margin-top: 0.45rem;
  border-top: 1px solid a($border, 0.5);
  flex-wrap: wrap;
}

.panel-row-selects {
  min-height: 26px;
  padding: 0.5rem 0 0;
  margin-top: 0.3rem;
  border-top: 1px solid a($border, 0.3);
  flex-wrap: wrap;
}

.row-spacer { flex: 1; }

// ── Separators ────────────────────────────────────────────────────────────
.v-sep      { width: 1px; height: 16px; background: $border; flex-shrink: 0; }
.v-sep-tall { width: 1px; height: 22px; background: $border; flex-shrink: 0; }

// ── Config section ────────────────────────────────────────────────────────
.section-label {
  font-size: 0.7rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.active-name {
  font-weight: 700;
  color: $text;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.active-none { color: $text-faint; font-style: italic; font-size: 0.85rem; }

.settings-wave-badge {
  font-size: 0.72rem; font-weight: 600; color: $green;
  background: a($green, 0.12); border: 1px solid a($green, 0.3);
  border-radius: 999px; padding: 0.05rem 0.5rem; white-space: nowrap; flex-shrink: 0;
}
.settings-empty-hint {
  margin-top: 0.5rem; padding: 0.5rem 0.2rem; font-size: 0.82rem; color: $text-dim;
}
.global-section {
  border-top: 1px solid a($border, 0.6);
  margin-top: 0.5rem; padding-top: 0.55rem;
}
.global-label {
  display: block; margin-bottom: 0.1rem;
  font-size: 0.7rem; font-weight: 700; color: $orange;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.global-toggles { border-top: none; margin-top: 0.35rem; padding-top: 0; }
.global-selects {
  margin-top: 0.4rem;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.6rem;
  align-items: center;
  .dist-select { width: 100%; }
}

.virtual-noble-note {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.65rem;
  font-size: 0.76rem;
  line-height: 1.45;
  color: #e0a74e;
  background: rgba(224, 167, 78, 0.1);
  border: 1px solid rgba(224, 167, 78, 0.3);
  border-radius: 6px;
  b { color: #f0c070; }
}

.active-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.chip {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 10px;
  white-space: nowrap;
}

// ── Timing ────────────────────────────────────────────────────────────────
.time-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  white-space: nowrap;
}

.timing-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: a($text-faint, 0.15);
  border: 1px solid a($text-faint, 0.3);
  color: $text-faint;
  font-size: 0.6rem; font-weight: 700;
  cursor: default; text-transform: none; letter-spacing: 0; flex-shrink: 0;
  &:hover { background: a($accent, 0.15); border-color: a($accent, 0.4); color: $accent; }
}

.arrival-input {
  padding: 0.18rem 0.35rem;
  font-size: 0.82rem;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;
  width: 172px;
  &:focus { outline: none; border-color: $accent; }
}

.apply-btn {
  background: none;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.18rem 0.45rem;
  transition: border-color 0.15s, color 0.15s;
  &:hover { border-color: $accent; color: $accent; }
}

// ── Options row ───────────────────────────────────────────────────────────
.opts-label {
  font-size: 0.68rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  white-space: nowrap;
}

.toggle-btn {
  background: a($text-dim, 0.06);
  border: 1px solid $border;
  border-radius: 20px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.18rem 0.6rem;
  transition: all 0.15s;
  white-space: nowrap;
  &:hover { border-color: $text; color: $text; }
  &.toggle-on { background: rgba(78, 204, 163, 0.12); border-color: rgba(78, 204, 163, 0.5); color: #4ecca3; }
}

.night-range { display: flex; align-items: center; gap: 0.2rem; }

.night-input {
  width: 36px; padding: 0.15rem 0.2rem; text-align: center;
  font-size: 0.8rem; background: $bg-page; border: 1px solid $border;
  border-radius: 4px; color: $text;
  &:focus { outline: none; border-color: $accent; }
}

.night-sep  { font-size: 0.8rem; color: $text-dim; }
.night-unit { font-size: 0.75rem; color: $text-faint; }

.earliest-input {
  padding: 0.15rem 0.3rem; font-size: 0.78rem;
  background: $bg-page; border: 1px solid $border;
  border-radius: 4px; color: $text;
  &:focus { outline: none; border-color: $accent; }
}

.front-dist-input {
  width: 52px; padding: 0.15rem 0.3rem; font-size: 0.78rem;
  text-align: center;
  background: $bg-page; border: 1px solid $border;
  border-radius: 4px; color: $text;
  &:focus { outline: none; border-color: $accent; }
}

.front-count-hint { font-size: 0.72rem; color: $text-faint; white-space: nowrap; }


.dist-select {
  font-size: 0.8rem;
  padding: 0.15rem 0.4rem;
  height: 26px;
  cursor: pointer;
}

// ── Fade transition ───────────────────────────────────────────────────────
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
