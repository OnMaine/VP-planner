<template>
  <div>
    <!-- Build instructions -->
    <section
      v-if="planStore.attacks.length > 0 && (planStore.noblePlacements.length > 0 || planStore.paladinPlacements.length > 0)"
      class="panel"
    >
      <h2>Інструкції по будівництву</h2>

      <div v-if="planStore.noblePlacements.length > 0">
        <h3>Дворяни (де будувати)</h3>
        <div class="table-wrap">
          <table class="mini-table">
            <thead><tr>
              <th>Гравець</th>
              <th>Координати</th>
              <th>Кількість</th>
            </tr></thead>
            <tbody>
              <tr v-for="(np, i) in planStore.noblePlacements" :key="i">
                <td>{{ np.village.player }}</td>
                <td>{{ np.village.coords }}</td>
                <td class="num-cell">{{ np.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="planStore.paladinPlacements.length > 0" :class="planStore.noblePlacements.length > 0 ? 'mt' : ''">
        <h3>Паладини (для якої цілі)</h3>
        <div class="table-wrap">
          <table class="mini-table">
            <thead><tr>
              <th>Гравець</th>
              <th>Координати</th>
              <th>Для цілі</th>
            </tr></thead>
            <tbody>
              <tr v-for="(pp, i) in planStore.paladinPlacements" :key="i">
                <td>{{ pp.village.player }}</td>
                <td>{{ pp.village.coords }}</td>
                <td>{{ pp.forTarget.label ? `${pp.forTarget.label} (${pp.forTarget.coords})` : pp.forTarget.coords }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Results by player -->
    <section v-if="planStore.attacks.length > 0" class="panel">
      <h2>Результати по гравцях</h2>

      <div
        v-for="[player, playerAttacks] in planStore.attacksByPlayer"
        :key="player"
        class="player-block"
      >
        <button class="collapse-toggle player-toggle" @click="togglePlayer(player)">
          <span>
            <span class="player-name-label">{{ player }}</span>
            <span class="player-attack-count">({{ playerAttacks.length }} атак)</span>
          </span>
          <span class="collapse-icon">{{ openPlayers.has(player) ? '▲' : '▼' }}</span>
        </button>

        <div v-if="openPlayers.has(player)" class="mt">
          <div class="table-wrap">
            <table class="mini-table attack-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Відправка</th>
                  <th>Прибуття</th>
                  <th>Від → До</th>
                  <th>Юніти</th>
                  <th>Попередження</th>
                  <th>Викл.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="atk in playerAttacks" :key="atk.id"
                  :class="atk.excluded ? 'row-excluded' : ''"
                  :style="rowStyle(atk)"
                >
                  <td>
                    <span :class="['type-badge', typeBadgeClass(atk.type)]">
                      {{ typeLabel(atk.type) }}
                    </span>
                  </td>
                  <td class="mono">{{ formatDT(atk.sendTime) }}</td>
                  <td class="mono">{{ formatDT(atk.arrivalTime) }}</td>
                  <td class="mono nowrap">
                    {{ atk.fromVillage.coords }} → {{ atk.target.coords }}
                    <span v-if="atk.target.label" class="muted-small">({{ atk.target.label }})</span>
                  </td>
                  <td class="nowrap">
                    <span :class="['wt-icon', `wt-${atk.watchtowerColor}`]">
                      <img :src="atk.watchtowerIcon === 'snob' ? UNIT_ICONS.snob : UNIT_ICONS.axe" class="unit-icon-xs" />
                    </span>
                    <span class="units-count">{{ atk.totalUnits.toLocaleString() }}</span>
                    <span class="units-detail">
                      <span v-for="p in compParts(atk.composition)" :key="p.key" class="comp-unit">
                        <img :src="p.icon" class="unit-icon-xs" :title="p.key" />{{ p.count.toLocaleString() }}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span
                      v-for="w in atk.warnings" :key="w"
                      :class="['warn-badge', warnBadgeClass(w)]"
                      :title="warnBadgeTitle(w)"
                    >{{ warnBadgeLabel(w) }}</span>
                  </td>
                  <td class="center-cell">
                    <input type="checkbox" :checked="atk.excluded" @change="planStore.toggleExclude(atk.id)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import type { Attack, AttackType, WarningCode, AttackComposition } from '@/stores/planStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { UNIT_ICONS } from '@/utils/unitIcons'

const planStore = usePlanStore()
const { formatDT } = useDateFormat()

const openPlayers = ref<Set<string>>(new Set())

function expandAll(players: Iterable<string>): void {
  openPlayers.value = new Set(players)
}
defineExpose({ expandAll })

function togglePlayer(player: string): void {
  const next = new Set(openPlayers.value)
  if (next.has(player)) next.delete(player)
  else next.add(player)
  openPlayers.value = next
}

function typeLabel(type: AttackType): string {
  switch (type) {
    case 'off':                return 'Офф'
    case 'paladin_off':        return 'Пал-Офф'
    case 'split_off_rams':     return 'Сплін (тарани)'
    case 'split_off_rest':     return 'Сплін (решта)'
    case 'noble_green_strong': return 'Двір 999'
    case 'noble_green_weak':   return 'Двір ~50'
    case 'noble_orange':       return 'Двір 1001+'
    case 'noble_red':          return 'Двір Фулл'
    case 'spam':               return 'Спам'
    case 'spam_noble':         return 'Спам-двір'
  }
}

function typeBadgeClass(type: AttackType): string {
  switch (type) {
    case 'off':
    case 'paladin_off':
    case 'split_off_rams':
    case 'split_off_rest':
      return 'badge-off'
    case 'noble_green_strong':
    case 'noble_green_weak':
      return 'badge-noble-green'
    case 'noble_orange':
      return 'badge-noble-orange'
    case 'noble_red':
      return 'badge-noble-red'
    case 'spam':
    case 'spam_noble':
      return 'badge-spam'
  }
}

function rowStyle(atk: Attack): Record<string, string> {
  if (atk.warnings.includes('SEND_IN_PAST')) return { background: 'rgba(233,69,96,0.12)' }
  if (atk.warnings.includes('NIGHT_ARRIVAL') || atk.warnings.includes('NIGHT_SEND'))
    return { background: 'rgba(245,166,35,0.12)' }
  return {}
}

function warnBadgeLabel(code: WarningCode): string {
  switch (code) {
    case 'SEND_IN_PAST':   return 'Минуло'
    case 'NIGHT_ARRIVAL':  return 'Ніч↓'
    case 'NIGHT_SEND':     return 'Ніч↑'
    case 'WATCHTOWER_HIT': return 'Вежа'
    case 'SNOB_TOO_FAR':   return 'Далеко'
  }
}

function warnBadgeTitle(code: WarningCode): string {
  switch (code) {
    case 'SEND_IN_PAST':   return 'Час відправки вже минув'
    case 'NIGHT_ARRIVAL':  return 'Прибуття у нічний час'
    case 'NIGHT_SEND':     return 'Відправка у нічний час'
    case 'WATCHTOWER_HIT': return 'Потрапляє під вежу'
    case 'SNOB_TOO_FAR':   return 'Двір занадто далеко від цілі'
  }
}

function warnBadgeClass(code: WarningCode): string {
  switch (code) {
    case 'SEND_IN_PAST':   return 'warn-red'
    case 'NIGHT_ARRIVAL':  return 'warn-orange'
    case 'NIGHT_SEND':     return 'warn-orange'
    case 'WATCHTOWER_HIT': return 'warn-yellow'
    case 'SNOB_TOO_FAR':   return 'warn-red'
  }
}

function compParts(c: AttackComposition): Array<{ key: string; icon: string; count: number }> {
  const order: Array<keyof AttackComposition> = [
    'axe', 'light', 'heavy', 'ram', 'spear', 'sword', 'spy', 'catapult', 'knight', 'snob',
  ]
  return order
    .filter((key) => c[key] > 0)
    .map((key) => ({ key, icon: UNIT_ICONS[key], count: c[key] }))
}
</script>

<style lang="scss" scoped>
$purple-badge: #6450c8;
$yellow:       #f0c040;

.player-block {
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background: $bg-page;
}
.player-toggle       { font-size: 0.95rem; font-weight: 600; }
.player-name-label   { color: $text; margin-right: 0.5rem; }
.player-attack-count { color: $text-dim; font-size: 0.82rem; font-weight: 400; }

.attack-table {
  font-size: 0.78rem;
  td { vertical-align: middle; }
}

// Type badges
.type-badge {
  display: inline-block;
  padding: 0.18rem 0.5rem;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge-off          { background: a($purple-badge, 0.2); color: $purple; border: 1px solid a($purple-badge, 0.4); }
.badge-noble-green  { background: a($green,  0.15); color: $green;  border: 1px solid a($green,  0.35); }
.badge-noble-orange { background: a($orange, 0.15); color: $orange; border: 1px solid a($orange, 0.35); }
.badge-noble-red    { background: a($accent, 0.15); color: $accent; border: 1px solid a($accent, 0.35); }
.badge-spam         { background: a($text-dim, 0.15); color: $text-dim; border: 1px solid a($text-dim, 0.3); }

// Warning badges
.warn-badge {
  display: inline-block;
  padding: 0.12rem 0.38rem;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 600;
  margin-right: 0.25rem;
  white-space: nowrap;
  cursor: help;
}
.warn-red    { background: a($accent,  0.2);  color: $accent;  border: 1px solid a($accent,  0.4); }
.warn-orange { background: a($orange,  0.2);  color: $orange;  border: 1px solid a($orange,  0.4); }
.warn-yellow { background: a($yellow,  0.18); color: $yellow;  border: 1px solid a($yellow,  0.38); }

// Watchtower indicator
.wt-icon         { display: inline-flex; align-items: center; margin-right: 0.25rem; }
.wt-green  img   { filter: brightness(0) saturate(100%) invert(70%) sepia(60%) saturate(400%) hue-rotate(115deg); }
.wt-orange img   { filter: brightness(0) saturate(100%) invert(75%) sepia(60%) saturate(600%) hue-rotate(10deg); }
.wt-red    img   { filter: brightness(0) saturate(100%) invert(35%) sepia(80%) saturate(600%) hue-rotate(320deg); }

// Units composition
.units-count  { font-weight: 700; color: $text; margin-right: 0.35rem; }
.units-detail { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0 6px; }
.comp-unit    { display: inline-flex; align-items: center; gap: 2px; color: #7a7a9a; font-size: 0.72rem; }
.unit-icon-xs { width: 13px; height: 13px; image-rendering: pixelated; }
</style>
