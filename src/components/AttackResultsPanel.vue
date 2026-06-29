<template>
  <div v-if="planStore.attacks.length > 0" class="results-root">

    <!-- Tab switcher -->
    <div class="results-tabs">
      <button :class="['rtab', { active: tab === 'visual' }]" @click="tab = 'visual'">По игрокам</button>
      <button :class="['rtab', { active: tab === 'targets' }]" @click="tab = 'targets'">По деревням</button>
      <button :class="['rtab', { active: tab === 'bbcode' }]" @click="tab = 'bbcode'">Текст (BBCode)</button>
    </div>

    <!-- Generation issues banner -->
    <div v-if="planStore.generationIssues.length > 0" class="gen-issues-banner">
      <div class="gen-issues-title">Не хватило войск для полного покрытия</div>
      <div class="gen-issues-list">
        <div
          v-for="issue in planStore.generationIssues"
          :key="`${issue.targetCoords}-${issue.type}`"
          :class="['gen-issue-row', issueSeverity(issue)]"
        >
          <span class="gen-issue-coords">{{ issue.targetCoords }}</span>
          <span class="gen-issue-sep">—</span>
          <span class="gen-issue-msg">{{ issueLabel(issue) }}</span>
        </div>
      </div>
    </div>

    <!-- ── Visual tab ─────────────────────────────────────────────────── -->
    <template v-if="tab === 'visual'">

      <!-- Build instructions -->
      <section
        v-if="planStore.noblePlacements.length > 0 || planStore.paladinPlacements.length > 0"
        class="panel"
      >
        <h2>Инструкции по строительству</h2>
        <div v-if="planStore.noblePlacements.length > 0">
          <h3>Дворяне (где строить)</h3>
          <div class="table-wrap">
            <table class="mini-table">
              <thead><tr><th>Игрок</th><th>Координаты</th><th>Кол-во</th></tr></thead>
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
          <h3>Паладины (для какой цели)</h3>
          <div class="table-wrap">
            <table class="mini-table">
              <thead><tr><th>Игрок</th><th>Координаты</th><th>Для цели</th></tr></thead>
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

      <!-- Per-player results -->
      <section class="panel">
        <h2>Результаты по игрокам</h2>
        <div
          v-for="[player, playerAttacks] in planStore.attacksByPlayer"
          :key="player"
          class="player-block"
        >
          <button class="collapse-toggle player-toggle" @click="togglePlayer(player)">
            <span class="player-toggle-left">
              <span class="player-name-label">{{ player }}</span>
              <span class="player-attack-count">({{ playerAttacks.filter(a => !a.excluded).length }} / {{ playerAttacks.length }} атак)</span>
              <span class="player-type-chips">
                <span
                  v-for="chip in playerTypeChips(playerAttacks)" :key="chip.label"
                  :class="['type-badge', chip.cls, 'player-chip']"
                >{{ chip.label }}<template v-if="chip.count > 1"> ×{{ chip.count }}</template></span>
              </span>
            </span>
            <span class="collapse-icon">{{ openPlayers.has(player) ? '▲' : '▼' }}</span>
          </button>

          <div v-if="openPlayers.has(player)" class="mt">
            <div class="table-wrap">
              <table class="mini-table attack-table">
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Отправка</th>
                    <th>Прибытие</th>
                    <th>От → До</th>
                    <th>Юниты</th>
                    <th>⚠</th>
                    <th>Искл.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in groupAttacks(playerAttacks)" :key="row.representative.id"
                    :class="row.representative.excluded ? 'row-excluded' : ''"
                    :style="rowStyle(row.representative)"
                  >
                    <td>
                      <template v-if="row.representative.trainGroupId">
                        <span class="type-badge badge-off">Паровоз ×1</span>
                      </template>
                      <template v-else>
                        <span v-if="row.representative.type === 'noble_red'" class="type-badge badge-off">Фулл</span>
                        <span
                          :class="['type-badge', row.representative.customColor ? '' : typeBadgeClass(row.representative.type)]"
                          :style="row.representative.customColor ? customBadgeStyle(row.representative.customColor) : {}"
                        >{{ attackLabel(row.representative) }}<template v-if="row.attacks.length > 1"> ×{{ row.attacks.length }}</template></span>
                      </template>
                    </td>
                    <td class="mono">{{ formatDT(row.representative.sendTime) }}</td>
                    <td class="mono">
                      {{ formatDT(row.representative.arrivalTime) }}
                      <span v-if="row.attacks.length > 1" class="arr-range">– {{ formatDT(row.attacks[row.attacks.length - 1].arrivalTime) }}</span>
                    </td>
                    <td class="mono nowrap">
                      <RouterLink :to="`/import?highlight=${row.representative.fromVillage.coords}`" class="coords-link">{{ row.representative.fromVillage.coords }}</RouterLink> → {{ row.representative.target.coords }}
                      <span v-if="row.representative.target.label" class="muted-small">({{ row.representative.target.label }})</span>
                    </td>
                    <td class="nowrap">
                      <span class="wt-icon">
                        <img :src="attackSizeIcon(row.representative.watchtowerColor)" class="attack-size-icon" />
                      </span>
                      <span class="units-count">{{ groupedTotalUnits(row).toLocaleString() }}</span>
                      <span class="units-sep">·</span>
                      <span class="units-detail">
                        <span v-for="p in groupedCompParts(row)" :key="p.key" class="comp-unit">
                          <img :src="p.icon" class="unit-icon-xs" :title="p.key" />{{ p.count.toLocaleString() }}<template v-if="p.mult"> ×{{ p.mult }}</template>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        v-for="w in row.representative.warnings" :key="w"
                        :class="['warn-badge', warnBadgeClass(w)]"
                        :title="warnBadgeTitle(w)"
                      >{{ warnBadgeLabel(w) }}</span>
                    </td>
                    <td class="center-cell">
                      <input type="checkbox" :checked="row.representative.excluded" @change="row.attacks.forEach(a => { if (a.excluded !== row.representative.excluded) planStore.toggleExclude(a.id) }); planStore.toggleExclude(row.representative.id)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ── Targets tab ───────────────────────────────────────────────────── -->
    <template v-if="tab === 'targets'">
      <section class="panel">
        <h2>Результаты по деревням</h2>
        <div
          v-for="[coords, tgtAttacks] in attacksByTarget"
          :key="coords"
          class="player-block"
        >
          <button class="collapse-toggle player-toggle" @click="toggleTarget(coords)">
            <span>
              <span class="player-name-label">{{ coords }}</span>
              <span v-if="tgtAttacks[0].target.enemyPlayer" class="target-player-label">{{ tgtAttacks[0].target.enemyPlayer }}</span>
              <span class="player-attack-count">({{ tgtAttacks.filter(a => !a.excluded).length }} / {{ tgtAttacks.length }} атак)</span>
            </span>
            <span class="collapse-icon">{{ openTargets.has(coords) ? '▲' : '▼' }}</span>
          </button>

          <div v-if="openTargets.has(coords)" class="mt">
            <div class="table-wrap">
              <table class="mini-table attack-table">
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Отправка</th>
                    <th>Прибытие</th>
                    <th>От</th>
                    <th>Игрок</th>
                    <th>Юниты</th>
                    <th>△</th>
                    <th>Искл.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in groupAttacks(tgtAttacks)" :key="row.representative.id"
                    :class="row.representative.excluded ? 'row-excluded' : ''"
                    :style="rowStyle(row.representative)"
                  >
                    <td>
                      <template v-if="row.representative.trainGroupId">
                        <span class="type-badge badge-off">Паровоз ×1</span>
                      </template>
                      <template v-else>
                        <span v-if="row.representative.type === 'noble_red'" class="type-badge badge-off">Фулл</span>
                        <span
                          :class="['type-badge', row.representative.customColor ? '' : typeBadgeClass(row.representative.type)]"
                          :style="row.representative.customColor ? customBadgeStyle(row.representative.customColor) : {}"
                        >{{ attackLabel(row.representative) }}<template v-if="row.attacks.length > 1"> ×{{ row.attacks.length }}</template></span>
                      </template>
                    </td>
                    <td class="mono">{{ formatDT(row.representative.sendTime) }}</td>
                    <td class="mono">
                      {{ formatDT(row.representative.arrivalTime) }}
                      <span v-if="row.attacks.length > 1" class="arr-range">– {{ formatDT(row.attacks[row.attacks.length - 1].arrivalTime) }}</span>
                    </td>
                    <td class="mono nowrap">
                      <RouterLink :to="`/import?highlight=${row.representative.fromVillage.coords}`" class="coords-link">{{ row.representative.fromVillage.coords }}</RouterLink>
                    </td>
                    <td>{{ row.representative.fromVillage.player }}</td>
                    <td class="nowrap">
                      <span class="wt-icon">
                        <img :src="attackSizeIcon(row.representative.watchtowerColor)" class="attack-size-icon" />
                      </span>
                      <span class="units-count">{{ groupedTotalUnits(row).toLocaleString() }}</span>
                      <span class="units-sep">·</span>
                      <span class="units-detail">
                        <span v-for="p in groupedCompParts(row)" :key="p.key" class="comp-unit">
                          <img :src="p.icon" class="unit-icon-xs" :title="p.key" />{{ p.count.toLocaleString() }}<template v-if="p.mult"> ×{{ p.mult }}</template>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        v-for="w in row.representative.warnings" :key="w"
                        :class="['warn-badge', warnBadgeClass(w)]"
                        :title="warnBadgeTitle(w)"
                      >{{ warnBadgeLabel(w) }}</span>
                    </td>
                    <td class="center-cell">
                      <input type="checkbox" :checked="row.representative.excluded" @change="row.attacks.forEach(a => { if (a.excluded !== row.representative.excluded) planStore.toggleExclude(a.id) }); planStore.toggleExclude(row.representative.id)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ── BBCode tab ──────────────────────────────────────────────────── -->
    <template v-if="tab === 'bbcode'">
      <section class="panel bbcode-panel">
        <div class="bbcode-controls">
          <label class="f-label-inline">
            Игрок
            <select v-model="bbcodePlayer" class="input">
              <option value="">Все игроки</option>
              <option v-for="p in allPlayers" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
          <button class="btn btn-secondary" @click="copyBBCode">
            {{ copied ? 'Скопировано ✓' : 'Копировать' }}
          </button>
        </div>

        <textarea class="bbcode-area" readonly :value="bbcodeOutput" />

        <p class="bbcode-note" v-if="planStore.attacks.some(a => !a.excluded && !a.fromVillage.villageId)">
          ⚠ Некоторые ссылки Attack используют координаты вместо ID — загрузите карту деревень для точных ссылок.
        </p>
      </section>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlanStore } from '@/stores/planStore'
import type { Attack, AttackType, WarningCode, AttackComposition, GenerationIssue, GenerationIssueType } from '@/stores/planStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { UNIT_ICONS, attackSmall, attackMedium, attackLarge } from '@/utils/unitIcons'
import { useEnemyDataStore } from '@/stores/enemyDataStore'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()
const { formatDT } = useDateFormat()

// ── Tab state ──────────────────────────────────────────────────────────────

const tab = ref<'visual' | 'targets' | 'bbcode'>('visual')

// ── Train grouping ─────────────────────────────────────────────────────────

interface AttackRow {
  attacks: Attack[]   // 1 = single, >1 = grouped train
  representative: Attack
}

function groupAttacks(list: Attack[]): AttackRow[] {
  const rows: AttackRow[] = []
  const seen = new Set<string>()
  for (const atk of list) {
    if (atk.trainGroupId) {
      if (seen.has(atk.trainGroupId)) continue
      seen.add(atk.trainGroupId)
      const group = list.filter(a => a.trainGroupId === atk.trainGroupId)
      rows.push({ attacks: group, representative: atk })
    } else {
      rows.push({ attacks: [atk], representative: atk })
    }
  }
  return rows
}

// ── Generation issues ──────────────────────────────────────────────────────

function issueLabel(issue: GenerationIssue): string {
  switch (issue.type) {
    case 'OFFS_SHORT':
      return issue.generated === 0
        ? `Оффы: нет подходящих деревень (запрошено ${issue.requested})`
        : `Оффы: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
    case 'NOBLE_TRAIN_MISSING':
      return `Паровоз: нет деревни с достаточным кол-вом дворян (запрошено ${issue.requested})`
    case 'NOBLE_TRAIN_PARTIAL':
      return `Паровоз: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
    case 'NOBLES_SHORT':
      return `Зел. дворы: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
    case 'SPAM_SHORT':
      return `Спам: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
  }
}

function issueSeverity(issue: GenerationIssue): string {
  if (issue.type === 'NOBLE_TRAIN_MISSING' || (issue.type === 'OFFS_SHORT' && issue.generated === 0)) return 'issue-critical'
  return 'issue-warn'
}

// ── Visual tab ─────────────────────────────────────────────────────────────

const openPlayers = ref<Set<string>>(new Set())
const openTargets = ref<Set<string>>(new Set())

const attacksByTarget = computed(() => {
  const map = new Map<string, Attack[]>()
  for (const atk of planStore.attacks) {
    const key = atk.target.coords
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(atk)
  }
  // Sort each group by arrival time
  for (const attacks of map.values()) {
    attacks.sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
  }
  return map
})

function expandAll(players: Iterable<string>): void {
  openPlayers.value = new Set(players)
  openTargets.value = new Set(attacksByTarget.value.keys())
}
defineExpose({ expandAll })

function toggleTarget(coords: string): void {
  const next = new Set(openTargets.value)
  if (next.has(coords)) next.delete(coords)
  else next.add(coords)
  openTargets.value = next
}

function togglePlayer(player: string): void {
  const next = new Set(openPlayers.value)
  if (next.has(player)) next.delete(player)
  else next.add(player)
  openPlayers.value = next
}

interface TypeChip { label: string; count: number; cls: string }

function playerTypeChips(attacks: Attack[]): TypeChip[] {
  const rows = groupAttacks(attacks.filter(a => !a.excluded))
  const counts = new Map<string, { label: string; count: number; cls: string }>()
  for (const row of rows) {
    const isTrain = !!row.representative.trainGroupId
    const label   = isTrain ? 'Паровоз' : (row.representative.label ?? typeLabel(row.representative.type))
    const cls     = isTrain ? 'badge-off' : typeBadgeClass(row.representative.type)
    const n       = isTrain ? 1 : row.attacks.length
    const prev    = counts.get(label)
    if (prev) prev.count += n
    else counts.set(label, { label, count: n, cls })
  }
  return [...counts.values()]
}

function typeLabel(type: AttackType): string {
  switch (type) {
    case 'off':                return 'Офф'
    case 'paladin_off':        return 'Пал-Офф'
    case 'split_off_rams':     return 'Сплит (тараны)'
    case 'split_off_rest':     return 'Сплит (остальное)'
    case 'noble_green_strong': return 'Двор 999'
    case 'noble_green_weak':   return 'Двор ~50'
    case 'noble_orange':       return 'Двор 1001+'
    case 'noble_red':          return 'Двор'
    case 'spam':               return 'Спам'
    case 'spam_noble':         return 'Спам-двор'
  }
}

function attackLabel(atk: Attack): string {
  return atk.label ?? typeLabel(atk.type)
}

function typeBadgeClass(type: AttackType): string {
  switch (type) {
    case 'off':
    case 'paladin_off':
    case 'split_off_rams':
    case 'split_off_rest':    return 'badge-off'
    case 'noble_green_strong':
    case 'noble_green_weak':  return 'badge-noble-green'
    case 'noble_orange':      return 'badge-noble-orange'
    case 'noble_red':         return 'badge-noble-red'
    case 'spam':
    case 'spam_noble':        return 'badge-spam'
  }
}

function customBadgeStyle(color: string): Record<string, string> {
  return {
    background:  `${color}22`,
    color:       color,
    borderColor: `${color}77`,
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
    case 'SEND_IN_PAST':      return 'Прошло'
    case 'NIGHT_ARRIVAL':     return 'Ночь↓'
    case 'NIGHT_SEND':        return 'Ночь↑'
    case 'WATCHTOWER_HIT':    return 'Башня'
    case 'SNOB_TOO_FAR':      return 'Далеко'
    case 'MORALE_HIGH_RISK':  return 'Мораль!'
    case 'MORALE_MEDIUM':     return 'Мораль~'
  }
}

function warnBadgeTitle(code: WarningCode): string {
  switch (code) {
    case 'SEND_IN_PAST':      return 'Время отправки уже прошло'
    case 'NIGHT_ARRIVAL':     return 'Прибытие в ночное время'
    case 'NIGHT_SEND':        return 'Отправка в ночное время'
    case 'WATCHTOWER_HIT':    return 'Попадает под башню'
    case 'SNOB_TOO_FAR':      return 'Двор слишком далеко от цели'
    case 'MORALE_HIGH_RISK':  return 'Мораль < 100% — высокий риск'
    case 'MORALE_MEDIUM':     return 'Мораль < 150% — средний риск'
  }
}

function warnBadgeClass(code: WarningCode): string {
  switch (code) {
    case 'SEND_IN_PAST':      return 'warn-red'
    case 'NIGHT_ARRIVAL':     return 'warn-orange'
    case 'NIGHT_SEND':        return 'warn-orange'
    case 'WATCHTOWER_HIT':    return 'warn-yellow'
    case 'SNOB_TOO_FAR':      return 'warn-red'
    case 'MORALE_HIGH_RISK':  return 'warn-red'
    case 'MORALE_MEDIUM':     return 'warn-orange'
  }
}

function attackSizeIcon(color: 'green' | 'orange' | 'red'): string {
  if (color === 'green')  return attackSmall
  if (color === 'orange') return attackMedium
  return attackLarge
}

function groupedTotalUnits(row: AttackRow): number {
  if (row.attacks.length <= 1) return row.representative.totalUnits
  return row.attacks.reduce((sum, a) => sum + a.totalUnits, 0)
}

function compParts(c: AttackComposition): Array<{ key: string; icon: string; count: number; mult?: number }> {
  const order: Array<keyof AttackComposition> = [
    'axe', 'light', 'heavy', 'ram', 'spear', 'sword', 'spy', 'catapult', 'knight', 'snob',
  ]
  return order.filter((k) => c[k] > 0).map((k) => ({ key: k, icon: UNIT_ICONS[k], count: c[k] }))
}

function groupedCompParts(row: AttackRow): Array<{ key: string; icon: string; count: number; mult?: number }> {
  const N = row.attacks.length
  const order: Array<keyof AttackComposition> = [
    'axe', 'light', 'heavy', 'ram', 'spear', 'sword', 'spy', 'catapult', 'knight', 'snob',
  ]
  return order.flatMap((k) => {
    const counts = row.attacks.map((a) => a.composition[k])
    const total  = counts.reduce((s, v) => s + v, 0)
    if (total === 0) return []
    const allSame = N > 1 && counts.every((v) => v === counts[0])
    return [{ key: k, icon: UNIT_ICONS[k], count: allSame ? counts[0] : total, mult: allSame ? N : undefined }]
  })
}

// ── BBCode tab ─────────────────────────────────────────────────────────────

const bbcodePlayer = ref('')
const copied = ref(false)

const allPlayers = computed(() => [...planStore.attacksByPlayer.keys()])

interface BBMeta { unit: string; color: string; label: string }

function attackBBMeta(type: AttackType): BBMeta {
  switch (type) {
    case 'off':                return { unit: 'ram',   color: '#ff0000', label: 'ФУЛЛ_ОФФ' }
    case 'paladin_off':        return { unit: 'ram',   color: '#ff00ff', label: 'ФУЛЛ_ОФФ_(+ПАЛ)' }
    case 'split_off_rams':     return { unit: 'ram',   color: '#ff8800', label: 'ПОДЕЛЁНКА_(тараны)' }
    case 'split_off_rest':     return { unit: 'axe',   color: '#ff8800', label: 'ПОДЕЛЁНКА_(без_таранов)' }
    case 'noble_green_strong': return { unit: 'snob',  color: '#0000ff', label: 'ЗЕЛЁНЫЙ_ДВОР_(999юн)' }
    case 'noble_green_weak':   return { unit: 'snob',  color: '#0000ff', label: 'ЗЕЛЁНЫЙ_ДВОР_(~50юн)' }
    case 'noble_orange':       return { unit: 'snob',  color: '#5500ff', label: 'ДВОР_(1001-5000юн)' }
    case 'noble_red':          return { unit: 'snob',  color: '#aa00ff', label: 'КРАСНЫЙ_ДВОР' }
    case 'spam':               return { unit: 'spear', color: '#888888', label: 'СПАМ' }
    case 'spam_noble':         return { unit: 'snob',  color: '#666688', label: 'СПАМ_ДВОР' }
  }
}

function bbDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}

function bbTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}.000`
}

function bbAttackLink(atk: Attack): string {
  const vid = atk.fromVillage.villageId ?? enemyStore.lookupCoords(atk.fromVillage.coords)?.village.id ?? null
  const tid = atk.target.villageId ?? enemyStore.lookupCoords(atk.target.coords)?.village.id ?? null
  const url = vid !== null && tid !== null ? `game.php?village=${vid}&screen=place&target=${tid}` : null
  return url ? `[url=${url}]Attack[/url]` : `(нет ID: ${atk.fromVillage.coords}→${atk.target.coords})`
}

const WT_COLOR: Record<string, string> = { green: '#009900', orange: '#ff8800', red: '#ff0000' }

function attackToLine(atk: Attack): string {
  const base = attackBBMeta(atk.type)
  const unit  = base.unit
  const label = atk.customColor
    ? (atk.label ?? 'КАСТОМ').toUpperCase().replace(/ /g, '_')
    : base.label
  const color = atk.customColor ?? WT_COLOR[atk.watchtowerColor]
  const sd = bbDate(atk.sendTime), st = bbTime(atk.sendTime)
  const ad = bbDate(atk.arrivalTime), at = bbTime(atk.arrivalTime)
  return `[unit]${unit}[/unit]    [b][color=${color}]${label}[/color][/b]    |    ${sd}    [b]${st}[/b]    |    ${ad}    ${at}    |    ${atk.fromVillage.coords} -> ${atk.target.coords}    |    ${bbAttackLink(atk)}`
}

function trainToLine(row: AttackRow): string {
  const rep   = row.representative
  const n     = row.attacks.length
  const label = `ПАРОВОЗ_[ДВОР×${n}]`
  const sd = bbDate(rep.sendTime), st = bbTime(rep.sendTime)
  const first = rep.arrivalTime, last = row.attacks[row.attacks.length - 1].arrivalTime
  const arrStr = last.getTime() !== first.getTime()
    ? `${bbDate(first)}    ${bbTime(first)} – ${bbTime(last)}`
    : `${bbDate(first)}    ${bbTime(first)}`
  const totalUnits = row.attacks.reduce((s, a) => s + a.totalUnits, 0)
  const color = totalUnits <= 1000 ? WT_COLOR.green : totalUnits <= 5000 ? WT_COLOR.orange : WT_COLOR.red
  return `[unit]snob[/unit]    [b][color=${color}]${label}[/color][/b]    |    ${sd}    [b]${st}[/b]    |    ${arrStr}    |    ${rep.fromVillage.coords} -> ${rep.target.coords}    |    ${bbAttackLink(rep)}`
}

function rowToLine(row: AttackRow): string {
  return row.representative.trainGroupId ? trainToLine(row) : attackToLine(row.representative)
}

function openOrdersBlock(player: string): string {
  const targets = planStore.openOrdersTo.get(player)
  if (!targets || targets.size === 0) return ''
  const names = [...targets].map((p) => `[player]${p}[/player]`).join(', ')
  return `[b]━━━ Открытие приказов ━━━[/b]\n${names}`
}

function buildInstructionsBBCode(filterPlayer?: string): string {
  const nobles = filterPlayer
    ? planStore.noblePlacements.filter((np) => np.village.player === filterPlayer)
    : planStore.noblePlacements
  const paladins = filterPlayer
    ? planStore.paladinPlacements.filter((pp) => pp.village.player === filterPlayer)
    : planStore.paladinPlacements

  if (nobles.length === 0 && paladins.length === 0) return ''

  const lines: string[] = [`[b]━━━ Инструкции по строительству ━━━[/b]`]

  if (nobles.length > 0) {
    lines.push('[b]Дворяне (где строить)[/b]')
    for (const np of nobles) {
      lines.push(`[player]${np.village.player}[/player]    [coord]${np.village.coords}[/coord]    ×${np.count}`)
    }
  }

  if (paladins.length > 0) {
    if (nobles.length > 0) lines.push('')
    lines.push('[b]Паладины (для какой цели)[/b]')
    for (const pp of paladins) {
      const tgt = pp.forTarget.label
        ? `${pp.forTarget.label} [coord]${pp.forTarget.coords}[/coord]`
        : `[coord]${pp.forTarget.coords}[/coord]`
      lines.push(`[player]${pp.village.player}[/player]    [coord]${pp.village.coords}[/coord]    → ${tgt}`)
    }
  }

  return lines.join('\n')
}

const bbcodeOutput = computed(() => {
  if (bbcodePlayer.value) {
    const playerAttacks = planStore.attacksByPlayer.get(bbcodePlayer.value) ?? []
    const active = playerAttacks.filter((a) => !a.excluded)
    const lines: string[] = []
    const instructions = buildInstructionsBBCode(bbcodePlayer.value)
    if (instructions) lines.push(instructions)
    const orders = openOrdersBlock(bbcodePlayer.value)
    if (orders) lines.push(orders)
    lines.push('[b]━━━ План атак ━━━[/b]')
    groupAttacks(active).forEach((row) => lines.push(rowToLine(row)))
    return lines.join('\n')
  }

  // All players
  const lines: string[] = []
  for (const [player, playerAttacks] of planStore.attacksByPlayer) {
    const active = playerAttacks.filter((a) => !a.excluded)
    if (active.length === 0) continue
    lines.push(`[b]${player}[/b]`)
    const instructions = buildInstructionsBBCode(player)
    if (instructions) lines.push(instructions)
    const orders = openOrdersBlock(player)
    if (orders) lines.push(orders)
    lines.push('[b]━━━ План атак ━━━[/b]')
    groupAttacks(active).forEach((row) => lines.push(rowToLine(row)))
    lines.push('')
  }
  return lines.join('\n').trim()
})

function copyBBCode(): void {
  navigator.clipboard.writeText(bbcodeOutput.value).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}
</script>

<style lang="scss" scoped>
$purple-badge: #6450c8;
$yellow:       #f0c040;

// ── Generation issues banner ──────────────────────────────────────────────
.gen-issues-banner {
  background: a($accent, 0.08);
  border: 1px solid a($accent, 0.35);
  border-radius: 8px;
  padding: 0.65rem 1rem;
  margin-bottom: 1rem;
}

.gen-issues-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: $accent;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.45rem;
}

.gen-issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.gen-issue-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.gen-issue-coords {
  font-family: monospace;
  font-weight: 700;
  font-size: 0.82rem;
  min-width: 60px;
}

.gen-issue-sep { color: $text-faint; }

.gen-issue-msg { color: $text-dim; }

.issue-critical {
  .gen-issue-coords { color: $accent; }
  .gen-issue-msg    { color: $text; }
}

.issue-warn {
  .gen-issue-coords { color: $orange; }
  .gen-issue-msg    { color: $text-dim; }
}

// ── Tabs ──────────────────────────────────────────────────────────────────
.results-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.rtab {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 6px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.4rem 1rem;
  transition: border-color 0.15s, color 0.15s;

  &:hover { border-color: $accent; color: $text; }
  &.active { border-color: $accent; color: $accent; background: a($accent, 0.08); }
}

// ── Player blocks (visual tab) ────────────────────────────────────────────
.player-block {
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background: $bg-page;
}
.player-toggle          { font-size: 0.95rem; font-weight: 600; }
.target-player-label   { color: $orange; font-size: 0.82rem; font-weight: 400; margin: 0 0.5rem; }
.player-name-label   { color: $text; margin-right: 0.5rem; }
.player-attack-count { color: $text-dim; font-size: 0.82rem; font-weight: 400; }

.player-toggle-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-width: 0;
}

.player-type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-left: 0.25rem;
}

.player-chip {
  font-size: 0.68rem !important;
  padding: 0.1rem 0.35rem !important;
  font-weight: 600;
  opacity: 0.85;
}

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
.badge-off          { background: a($accent, 0.18); color: #ff4466; border: 1px solid a(#ff4466, 0.45); }
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
.warn-red    { background: a($accent, 0.2);  color: $accent;  border: 1px solid a($accent,  0.4); }
.warn-orange { background: a($orange, 0.2);  color: $orange;  border: 1px solid a($orange,  0.4); }
.warn-yellow { background: a($yellow, 0.18); color: $yellow;  border: 1px solid a($yellow,  0.38); }

// Attack size icon
.wt-icon         { display: inline-flex; align-items: center; margin-right: 0.3rem; }
.attack-size-icon { width: 14px; height: 14px; image-rendering: pixelated; }

.train-count {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: $purple;
  background: a($purple, 0.12);
  border: 1px solid a($purple, 0.3);
  border-radius: 8px;
  padding: 0.05rem 0.35rem;
  vertical-align: middle;
}

.arr-range {
  display: block;
  font-size: 0.68rem;
  color: $text-faint;
  margin-top: 1px;
}

.coords-link {
  color: $text-dim;
  text-decoration: none;
  border-bottom: 1px dotted a($text-dim, 0.4);
  transition: color 0.15s, border-color 0.15s;
  &:hover { color: $accent; border-bottom-color: $accent; }
}

.units-count  { font-weight: 700; color: $text; margin-right: 0.2rem; }
.units-sep    { color: $text-faint; margin: 0 0.3rem; font-size: 0.8rem; }
.units-detail { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0 6px; }
.comp-unit    { display: inline-flex; align-items: center; gap: 2px; color: #7a7a9a; font-size: 0.72rem; }
.unit-icon-xs { width: 13px; height: 13px; image-rendering: pixelated; }

// ── BBCode tab ────────────────────────────────────────────────────────────
.bbcode-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bbcode-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.f-label-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: $text-dim;
}

.bbcode-area {
  width: 100%;
  min-height: 340px;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 6px;
  color: $text;
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  line-height: 1.6;
  padding: 0.75rem;
  resize: vertical;
  box-sizing: border-box;
}

.bbcode-note {
  font-size: 0.78rem;
  color: $text-faint;
  margin: 0;
}
</style>
