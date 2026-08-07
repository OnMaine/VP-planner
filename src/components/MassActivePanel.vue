<template>
  <section class="panel active-mass-panel">

    <!-- Row 1: config info + timing + edit -->
    <div class="panel-row panel-row-main">
      <span class="section-label">Масс-конфиг</span>
      <span v-if="store.active" class="active-name">{{ store.active.name }}</span>
      <span v-else class="active-none">не выбран</span>
      <div v-if="store.active" class="active-chips">
        <template v-for="slot in store.active.slots" :key="slot.id">
          <span
            v-if="slot.enabled"
            class="chip"
            :style="chipCustomStyle(slotCustomColor(slot.presetId)!)"
          >{{ slotLabel(slot.presetId) }} ×{{ slot.count }}</span>
        </template>
      </div>
      <span
        v-if="store.active && planStore.coverageEstimate !== null"
        class="coverage-badge"
        :class="coverageBadgeClass"
        :title="`Оценка покрытия: ~${planStore.coverageEstimate} целей при текущем пуле деревень`"
      >~{{ planStore.coverageEstimate }} цел.</span>

      <div class="row-spacer" />

      <span class="time-label">
        Тайминг
        <span class="timing-hint" title="Опорное время для цели. От него считаются все атаки: смещение слота задаёт сдвиг относительно этой точки">?</span>
      </span>
      <input v-model="arrivalDatetime" type="datetime-local" class="arrival-input" step="0.001"
        @change="saveArrivalTime()" />
      <button class="apply-btn" title="Применить ко всем целям" @click="applyArrivalTime">→ всем</button>

      <div class="v-sep-tall" />
      <RouterLink to="/mass-configs" class="btn btn-secondary btn-sm">Изменить</RouterLink>
    </div>

    <!-- Row 2: toggles -->
    <div class="panel-row panel-row-opts">
      <button
        :class="['toggle-btn', { 'toggle-on': worldStore.settings.sendExcludeEnabled }]"
        title="Без ночных: пропускать атаки, отправка которых попадает в ночное окно. Укажи диапазон часов ниже."
        @click="worldStore.updateSettings({ sendExcludeEnabled: !worldStore.settings.sendExcludeEnabled })"
      >🌙 Без ночных</button>
      <transition name="fade">
        <span v-if="worldStore.settings.sendExcludeEnabled" class="night-range">
          <input
            type="number" min="0" max="23" class="night-input"
            :value="worldStore.settings.nightFrom"
            @change="worldStore.updateSettings({ nightFrom: +($event.target as HTMLInputElement).value })"
          />
          <span class="night-sep">–</span>
          <input
            type="number" min="0" max="23" class="night-input"
            :value="worldStore.settings.nightTo"
            @change="worldStore.updateSettings({ nightTo: +($event.target as HTMLInputElement).value })"
          />
          <span class="night-unit">ч</span>
        </span>
      </transition>

      <div class="v-sep" />

      <button
        :class="['toggle-btn', { 'toggle-on': worldStore.settings.earliestSendEnabled }]"
        title="Ранний старт: не генерировать атаки, отправка которых раньше указанного времени"
        @click="worldStore.updateSettings({ earliestSendEnabled: !worldStore.settings.earliestSendEnabled })"
      >⏰ Старт не ранее</button>
      <transition name="fade">
        <input
          v-if="worldStore.settings.earliestSendEnabled"
          type="datetime-local"
          class="input earliest-input"
          step="60"
          :value="worldStore.settings.earliestSendTime"
          @change="worldStore.updateSettings({ earliestSendTime: ($event.target as HTMLInputElement).value })"
        />
      </transition>

      <div class="v-sep" />

      <button
        :class="['toggle-btn', { 'toggle-on': worldStore.settings.moraleEnabled }]"
        title="Мораль: показывать предупреждение если очки атакующего игрока значительно превышают очки защитника. Средний риск — соотношение < 1.5×, высокий — < 1×."
        @click="worldStore.updateSettings({ moraleEnabled: !worldStore.settings.moraleEnabled })"
      >⚖ Мораль</button>

      <div class="v-sep" v-if="worldStore.settings.watchtowerEnabled" />

      <button
        v-if="worldStore.settings.watchtowerEnabled"
        :class="['toggle-btn', { 'toggle-on': worldStore.settings.watchtowerAvoidEnabled ?? true }]"
        title="Учитывать башни при распределении: засвеченные деревни уходят в конец очереди подбора"
        @click="worldStore.updateSettings({ watchtowerAvoidEnabled: !(worldStore.settings.watchtowerAvoidEnabled ?? true) })"
      >🗼 Башни</button>

      <div class="v-sep" v-if="store.active" />

      <button
        v-if="store.active"
        :class="['toggle-btn', { 'toggle-on': store.active.catMassEnabled }]"
        title="Кат волна: вторичная волна из свободных офов и кат отрядов по отдельным целям"
        @click="store.update(store.active!.id, { catMassEnabled: store.active.catMassEnabled ? undefined : true })"
      >🐱 Кат волна</button>

      <template v-if="planStore.targets.length > 0">
        <div class="v-sep" />
        <button
          :class="['toggle-btn', { 'toggle-on': worldStore.settings.frontReserveEnabled }]"
          title="Авто-резерв фронтовых: деревни ближе N клеток к врагу исключаются из масса"
          @click="toggleFrontReserve"
        >🛡 Резерв фронта</button>
        <transition name="fade">
          <input
            v-if="worldStore.settings.frontReserveEnabled"
            type="number" min="1" max="200"
            class="input front-dist-input"
            :value="worldStore.settings.frontReserveDist"
            @change="onFrontDistChange(+($event.target as HTMLInputElement).value)"
          />
        </transition>
        <span v-if="worldStore.settings.frontReserveEnabled" class="front-count-hint">
          {{ frontCount }} дер.
        </span>
      </template>
    </div>

    <!-- Row 3: distribution selects -->
    <div class="panel-row panel-row-selects">
      <span class="opts-label">Распределение</span>
      <select
        class="input dist-select"
        :value="planStore.offDistribution"
        title="Алгоритм распределения офов по целям"
        @change="planStore.setOffDistribution(($event.target as HTMLSelectElement).value as 'default' | 'fair' | 'far_first')"
      >
        <option value="far_first">Дальние вперёд</option>
        <option value="fair">Справедливо</option>
        <option value="default">Жадно</option>
      </select>

      <div class="v-sep" />

      <span class="opts-label">Дворяне</span>
      <select
        class="input dist-select"
        :value="worldStore.settings.noblePollMode ?? 'real'"
        @change="worldStore.updateSettings({ noblePollMode: ($event.target as HTMLSelectElement).value as 'real' | 'virtual' })"
        title="Источник дворян для расчёта пула"
      >
        <option value="real">Реальные</option>
        <option value="virtual">Виртуальные</option>
      </select>

      <div class="v-sep" />

      <span class="opts-label">Паладины</span>
      <select
        class="input dist-select"
        :value="worldStore.settings.paladinMode ?? 'manual'"
        @change="worldStore.updateSettings({ paladinMode: ($event.target as HTMLSelectElement).value as 'auto' | 'manual' | 'none' })"
        title="Режим определения офф-паладинов"
      >
        <option value="none">Не распределять</option>
        <option value="manual">Вручную</option>
        <option value="auto">Автоматически</option>
      </select>
    </div>

  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useMassConfigStore } from '@/stores/massConfigStore'
import { usePresetsStore, defaultColorForRole } from '@/stores/presetsStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePlanStore } from '@/stores/planStore'
import { useVillagesStore } from '@/stores/villagesStore'
import { calcDistance } from '@/utils/coords'
import { useDateFormat } from '@/composables/useDateFormat'

const store = useMassConfigStore()
const presetsStore = usePresetsStore()
const worldStore = useWorldStore()
const planStore = usePlanStore()
const villagesStore = useVillagesStore()

const coverageBadgeClass = computed(() => {
  const est = planStore.coverageEstimate
  const targets = planStore.targets.length
  if (est === null || targets === 0) return ''
  if (targets > est) return 'coverage-warn'
  if (targets > est * 0.85) return 'coverage-tight'
  return 'coverage-ok'
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

const LS_ARRIVAL = 'vp_mass_arrival_time'
const arrivalDatetime = ref(localStorage.getItem(LS_ARRIVAL) ?? toDatetimeLocal(new Date(Math.floor((Date.now() + 3600_000) / 1000) * 1000)))

function saveArrivalTime(): void {
  localStorage.setItem(LS_ARRIVAL, arrivalDatetime.value)
}

function applyArrivalTime(): void {
  const d = new Date(arrivalDatetime.value)
  if (isNaN(d.getTime())) return
  for (const t of planStore.targets) planStore.updateTarget(t.id, { arrivalTime: d })
}

// ── Front reserve ─────────────────────────────────────────────────────────
const frontReservedCoords = ref<Set<string>>(new Set())

function computeFront(dist: number): string[] {
  const mapSize = worldStore.settings.mapSize
  const targets = planStore.targets
  const result: string[] = []
  for (const v of villagesStore.villages) {
    for (const t of targets) {
      if (calcDistance({ x: v.x, y: v.y }, { x: t.x, y: t.y }, mapSize) <= dist) {
        result.push(v.coords); break
      }
    }
  }
  return result
}

function applyFront(dist: number): void {
  const coords = computeFront(dist)
  frontReservedCoords.value = new Set(coords)
  const merged = new Set([...planStore.reservedVillages, ...coords])
  // Remove old front reserved, add new
  const nonFront = [...planStore.reservedVillages].filter(c => !frontReservedCoords.value.has(c))
  planStore.setReservedVillages([...new Set([...nonFront, ...coords])])
}

function clearFront(): void {
  const remaining = [...planStore.reservedVillages].filter(c => !frontReservedCoords.value.has(c))
  planStore.setReservedVillages(remaining)
  frontReservedCoords.value = new Set()
}

function toggleFrontReserve(): void {
  const next = !worldStore.settings.frontReserveEnabled
  worldStore.updateSettings({ frontReserveEnabled: next })
  if (next) applyFront(worldStore.settings.frontReserveDist)
  else clearFront()
}

function onFrontDistChange(dist: number): void {
  worldStore.updateSettings({ frontReserveDist: dist })
  if (worldStore.settings.frontReserveEnabled) applyFront(dist)
}

const frontCount = computed(() => frontReservedCoords.value.size)
</script>

<style lang="scss" scoped>
.active-mass-panel {
  margin-bottom: 1rem;
  padding: 0.6rem 1rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

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

.coverage-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.4rem;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  background: a($text-faint, 0.1);
  border: 1px solid a($text-faint, 0.25);
  color: $text-faint;
  cursor: default;
  &.coverage-ok   { background: a(#4ecca3, 0.12); border-color: a(#4ecca3, 0.35); color: #4ecca3; }
  &.coverage-tight { background: a(#e07b39, 0.12); border-color: a(#e07b39, 0.35); color: #e07b39; }
  &.coverage-warn  { background: a(#e94560, 0.12); border-color: a(#e94560, 0.4);  color: #e94560; }
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
