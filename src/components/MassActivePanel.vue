<template>
  <section class="panel active-mass-panel">
    <div class="panel-main">

      <!-- Config name + chips -->
      <div class="config-section">
        <span class="section-label">Масс-конфиг</span>
        <span v-if="store.active" class="active-name">{{ store.active.name }}</span>
        <span v-else class="active-none">не выбран</span>
        <div v-if="store.active" class="active-chips">
          <template v-for="slot in store.active.slots" :key="slot.id">
            <span v-if="slot.enabled" class="chip" :class="slotChipClass(slot.presetId)">
              {{ slotLabel(slot.presetId) }} ×{{ slot.count }}
            </span>
          </template>
        </div>
      </div>

      <div class="v-divider" />

      <!-- Arrival time -->
      <div class="times-section">
        <div class="time-field">
          <span class="time-label">
            Тайминг
            <span class="timing-hint" title="Опорное время для цели. От него считаются все атаки: смещение слота задаёт сдвиг относительно этой точки">?</span>
          </span>
          <input v-model="arrivalDatetime" type="datetime-local" class="arrival-input" step="1" />
          <button class="apply-btn" title="Применить ко всем целям" @click="applyArrivalTime">→ всем</button>
        </div>
      </div>

      <div class="v-divider" />

      <!-- Options + edit -->
      <div class="options-section">
        <div class="toggle-group">
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
          <button
            :class="['toggle-btn', { 'toggle-on': worldStore.settings.moraleEnabled }]"
            title="Мораль: показывать предупреждение если очки атакующего игрока значительно превышают очки защитника. Средний риск — соотношение < 1.5×, высокий — < 1×."
            @click="worldStore.updateSettings({ moraleEnabled: !worldStore.settings.moraleEnabled })"
          >⚖ Мораль</button>
          <span class="v-sep" />
          <button
            v-if="store.active"
            :class="['toggle-btn', 'noble-priority-btn', { 'toggle-on': noblePriority === 'built' }]"
            :title="noblePriority === 'distance'
              ? 'По дистанции: сначала берётся ближайшая деревня к цели с нужными войсками. Если у неё нет дворян — виртуально достраиваем. Ближняя виртуальная бьёт дальнюю с готовыми дворянами.'
              : 'По имеющимся: сначала деревни где дворяне уже построены (ближайшие первые), только потом деревни куда нужно достраивать.'"
            @click="toggleNoblePriority"
          >🏰 {{ noblePriority === 'distance' ? 'По дистанции' : 'По имеющимся' }}</button>
        </div>
        <RouterLink to="/mass-configs" class="btn btn-secondary btn-sm">Изменить</RouterLink>
      </div>

    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useMassConfigStore } from '@/stores/massConfigStore'
import type { NoblePriority } from '@/stores/massConfigStore'
import { usePresetsStore } from '@/stores/presetsStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePlanStore } from '@/stores/planStore'
import { useDateFormat } from '@/composables/useDateFormat'

const store = useMassConfigStore()
const presetsStore = usePresetsStore()
const worldStore = useWorldStore()
const planStore = usePlanStore()
const { toDatetimeLocal } = useDateFormat()

const noblePriority = computed<NoblePriority>(() => store.active?.noblePriority ?? 'distance')

function toggleNoblePriority() {
  if (!store.active || store.active.builtIn) return
  store.update(store.active.id, {
    noblePriority: noblePriority.value === 'distance' ? 'built' : 'distance',
  })
}

function slotChipClass(presetId: string): string {
  const type = presetsStore.all.find(p => p.id === presetId)?.role.type
  if (type === 'train' || type === 'green_off') return 'chip-noble'
  if (type === 'spam') return 'chip-spam'
  if (type === 'spike') return 'chip-spike'
  return 'chip-off'
}

function slotLabel(presetId: string): string {
  return presetsStore.all.find(p => p.id === presetId)?.name ?? presetId
}

const arrivalDatetime = ref(toDatetimeLocal(new Date(Date.now() + 3600_000)))

function applyArrivalTime(): void {
  const d = new Date(arrivalDatetime.value)
  if (isNaN(d.getTime())) return
  for (const t of planStore.targets) planStore.updateTarget(t.id, { arrivalTime: d })
}
</script>

<style lang="scss" scoped>
.active-mass-panel {
  margin-bottom: 1rem;
  padding: 0.65rem 1rem;
}

.panel-main {
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: wrap;
  min-height: 48px;
}

// ── Vertical divider ──────────────────────────────────────────────────────
.v-divider {
  width: 1px;
  align-self: stretch;
  background: $border;
  margin: 0 1rem;
  flex-shrink: 0;
}

// ── Config section ────────────────────────────────────────────────────────
.config-section {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  flex: 1 1 200px;
  min-width: 0;
  max-width: 480px;
}

.section-label {
  font-size: 0.75rem;
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

.active-none {
  color: $text-faint;
  font-style: italic;
  font-size: 0.85rem;
}

.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 10px;
  white-space: nowrap;
}
.chip-off   { background: a($accent,   0.15); color: $accent;   border: 1px solid a($accent,   0.3); }
.chip-spike { background: a($green,    0.12); color: $green;    border: 1px solid a($green,    0.3); }
.chip-noble { background: a($purple,   0.15); color: $purple;   border: 1px solid a($purple,   0.3); }
.chip-spam  { background: a($text-dim, 0.12); color: $text-dim; border: 1px solid a($text-dim, 0.2); }

// ── Times section ─────────────────────────────────────────────────────────
.times-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
}

.time-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

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
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: a($text-faint, 0.15);
  border: 1px solid a($text-faint, 0.3);
  color: $text-faint;
  font-size: 0.6rem;
  font-weight: 700;
  cursor: default;
  text-transform: none;
  letter-spacing: 0;
  flex-shrink: 0;

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

// ── Options section ───────────────────────────────────────────────────────
.options-section {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.toggle-btn {
  background: a($text-dim, 0.06);
  border: 1px solid $border;
  border-radius: 20px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover { border-color: $accent; color: $text; }

  &.toggle-on {
    background: a($accent, 0.12);
    border-color: a($accent, 0.5);
    color: $accent;
  }
}

.night-range {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.night-input {
  width: 36px;
  padding: 0.15rem 0.2rem;
  text-align: center;
  font-size: 0.8rem;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  color: $text;

  &:focus { outline: none; border-color: $accent; }
}

.night-sep  { font-size: 0.8rem; color: $text-dim; }
.night-unit { font-size: 0.75rem; color: $text-faint; }
.v-sep      { width: 1px; height: 16px; background: $border; flex-shrink: 0; }

// ── Fade transition ───────────────────────────────────────────────────────
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
