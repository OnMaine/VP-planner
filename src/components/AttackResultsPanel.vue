<template>
  <div v-if="planStore.attacks.length > 0" class="results-root">

    <!-- Tab switcher -->
    <div class="results-tabs">
      <button :class="['rtab', { active: tab === 'targets' }]" @click="tab = 'targets'">По деревням</button>
      <button :class="['rtab', { active: tab === 'visual' }]" @click="tab = 'visual'">По игрокам</button>
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
                    <th>В пути</th>
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

                      <span
                        :class="['type-badge', row.representative.color ? '' : typeBadgeClass(row.representative.type)]"
                        :style="row.representative.color ? customBadgeStyle(row.representative.color) : {}"
                      >{{ attackLabel(row.representative) }}</span>
                    </td>
                    <td class="mono">{{ formatDT(row.representative.sendTime) }}</td>
                    <td class="mono">
                      {{ formatDT(row.representative.arrivalTime) }}
                      <span v-if="row.lastArrival && row.lastArrival > row.representative.arrivalTime" class="train-range"> – {{ formatTime(row.lastArrival) }}</span>
                    </td>
                    <td class="mono dur">{{ formatDur(row.representative.sendTime, row.representative.arrivalTime) }}</td>
                    <td class="mono nowrap">
                      <RouterLink :to="`/import?highlight=${row.representative.fromVillage.coords}`" class="coords-link">{{ row.representative.fromVillage.coords }}</RouterLink> → {{ row.representative.target.coords }}
                      <span v-if="row.representative.target.label" class="muted-small">({{ row.representative.target.label }})</span>
                    </td>
                    <td class="nowrap">
                      <span class="wt-icon">
                        <img :src="attackSizeIcon(row.representative.watchtowerColor)" class="attack-size-icon" />
                      </span>
                      <template v-if="row.lastArrival">
                        <span class="train-count">×{{ row.attacks.length }}</span>
                        <template v-if="row.nobleCount">
                          <span class="units-sep">·</span>
                          <span class="comp-unit">
                            <img :src="UNIT_ICONS.snob" class="unit-icon-xs" title="snob" />{{ row.nobleCount }}
                          </span>
                        </template>
                      </template>
                      <template v-else>
                        <span class="units-count">{{ row.representative.totalUnits.toLocaleString() }}</span>
                        <span class="units-sep">·</span>
                        <span class="units-detail">
                          <span v-for="p in compParts(row.representative.composition)" :key="p.key" class="comp-unit">
                            <img :src="p.icon" class="unit-icon-xs" :title="p.key" />{{ p.count.toLocaleString() }}
                          </span>
                        </span>
                      </template>
                    </td>
                    <td>
                      <span
                        v-if="row.representative.buildNobles"
                        class="warn-badge badge-build-nobles"
                        :title="`Построить ${row.representative.buildNobles} дв. в ${row.representative.fromVillage.coords} до отправки`"
                      >🔨{{ row.representative.buildNobles }}</span>
                      <span
                        v-if="row.representative.buildPaladin"
                        class="warn-badge badge-build-paladin"
                        :title="`Завербовать паладина в ${row.representative.fromVillage.coords} до отправки`"
                      >🔨Пал</span>
                      <span
                        v-for="w in row.representative.warnings" :key="w"
                        :class="['warn-badge', warnBadgeClass(w)]"
                        :title="warnBadgeTitle(w)"
                      >{{ warnBadgeLabel(w) }}</span>
                    </td>
                    <td class="center-cell">
                      <input type="checkbox" :checked="row.representative.excluded" @change="row.attacks.forEach(a => planStore.toggleExclude(a.id))" />
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
                    <th>В пути</th>
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

                      <span
                        :class="['type-badge', row.representative.color ? '' : typeBadgeClass(row.representative.type)]"
                        :style="row.representative.color ? customBadgeStyle(row.representative.color) : {}"
                      >{{ attackLabel(row.representative) }}</span>
                    </td>
                    <td class="mono">{{ formatDT(row.representative.sendTime) }}</td>
                    <td class="mono">
                      {{ formatDT(row.representative.arrivalTime) }}
                      <span v-if="row.lastArrival && row.lastArrival > row.representative.arrivalTime" class="train-range"> – {{ formatTime(row.lastArrival) }}</span>
                    </td>
                    <td class="mono dur">{{ formatDur(row.representative.sendTime, row.representative.arrivalTime) }}</td>
                    <td class="mono nowrap">
                      <RouterLink :to="`/import?highlight=${row.representative.fromVillage.coords}`" class="coords-link">{{ row.representative.fromVillage.coords }}</RouterLink>
                    </td>
                    <td>{{ row.representative.fromVillage.player }}</td>
                    <td class="nowrap">
                      <span class="wt-icon">
                        <img :src="attackSizeIcon(row.representative.watchtowerColor)" class="attack-size-icon" />
                      </span>
                      <template v-if="row.lastArrival">
                        <span class="train-count">×{{ row.attacks.length }}</span>
                        <template v-if="row.nobleCount">
                          <span class="units-sep">·</span>
                          <span class="comp-unit">
                            <img :src="UNIT_ICONS.snob" class="unit-icon-xs" title="snob" />{{ row.nobleCount }}
                          </span>
                        </template>
                      </template>
                      <template v-else>
                        <span class="units-count">{{ row.representative.totalUnits.toLocaleString() }}</span>
                        <span class="units-sep">·</span>
                        <span class="units-detail">
                          <span v-for="p in compParts(row.representative.composition)" :key="p.key" class="comp-unit">
                            <img :src="p.icon" class="unit-icon-xs" :title="p.key" />{{ p.count.toLocaleString() }}
                          </span>
                        </span>
                      </template>
                    </td>
                    <td>
                      <span
                        v-if="row.representative.buildNobles"
                        class="warn-badge badge-build-nobles"
                        :title="`Построить ${row.representative.buildNobles} дв. в ${row.representative.fromVillage.coords} до отправки`"
                      >🔨{{ row.representative.buildNobles }}</span>
                      <span
                        v-if="row.representative.buildPaladin"
                        class="warn-badge badge-build-paladin"
                        :title="`Завербовать паладина в ${row.representative.fromVillage.coords} до отправки`"
                      >🔨Пал</span>
                      <span
                        v-for="w in row.representative.warnings" :key="w"
                        :class="['warn-badge', warnBadgeClass(w)]"
                        :title="warnBadgeTitle(w)"
                      >{{ warnBadgeLabel(w) }}</span>
                    </td>
                    <td class="center-cell">
                      <input type="checkbox" :checked="row.representative.excluded" @change="row.attacks.forEach(a => planStore.toggleExclude(a.id))" />
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
          <label class="bbcode-toggle" title="Добавить спойлер с картой всех атак на каждую цель — игрок видит свою очередность среди атак других игроков">
            <input type="checkbox" v-model="includeAttackMap" />
            Карта атак
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

function formatTime(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const p3 = (n: number) => String(n).padStart(3, '0')
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`
}

function formatDur(send: Date, arrival: Date): string {
  const s = Math.round((arrival.getTime() - send.getTime()) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// ── Tab state ──────────────────────────────────────────────────────────────

const tab = ref<'visual' | 'targets' | 'bbcode'>('targets')

// ── Attack row grouping ────────────────────────────────────────────────────

interface AttackRow {
  attacks: Attack[]
  representative: Attack
  lastArrival?: Date   // set when trainGroupId groups multiple attacks
  nobleCount?: number  // number of spam_noble attacks in group
}

function groupAttacks(list: Attack[]): AttackRow[] {
  const rows: AttackRow[] = []
  const seen = new Map<string, AttackRow>()
  for (const atk of list) {
    if (atk.trainGroupId) {
      const existing = seen.get(atk.trainGroupId)
      if (existing) {
        existing.attacks.push(atk)
        if (atk.arrivalTime > (existing.lastArrival ?? existing.representative.arrivalTime))
          existing.lastArrival = atk.arrivalTime
        existing.nobleCount = (existing.nobleCount ?? 0) + (atk.composition.snob ?? 0)
        continue
      }
      const row: AttackRow = { attacks: [atk], representative: atk, lastArrival: atk.arrivalTime, nobleCount: atk.composition.snob ?? 0 }
      seen.set(atk.trainGroupId, row)
      rows.push(row)
    } else {
      rows.push({ attacks: [atk], representative: atk })
    }
  }
  return rows
}

// ── Generation issues ──────────────────────────────────────────────────────

function issueLabel(issue: GenerationIssue): string {
  const slot = issue.slotName ? `[${issue.slotName}] ` : ''
  switch (issue.type) {
    case 'OFFS_SHORT': {
      if (issue.generated > 0)
        return `${slot}Оффы: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
      const reason =
        issue.offsReason === 'pool_depleted' ? 'все оффы уже заняты предыдущими целями' :
        issue.offsReason === 'night_excluded' ? 'все деревни заблокированы ночным режимом' :
        issue.offsReason === 'no_eligible'    ? 'нет деревень с подходящим составом' :
        'нет подходящих деревень'
      return `${slot}Оффы: ${reason} (запрошено ${issue.requested})`
    }
    case 'NOBLES_SHORT':
      return `${slot}Зел. дворы: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
    case 'SPAM_SHORT':
      return `${slot}Спам: запрошено ${issue.requested}, сгенерировано ${issue.generated}`
  }
}

function issueSeverity(issue: GenerationIssue): string {
  if (issue.type === 'OFFS_SHORT' && issue.generated === 0) return 'issue-critical'
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
    const label = row.representative.label ?? typeLabel(row.representative.type)
    const cls   = typeBadgeClass(row.representative.type)
    const prev  = counts.get(label)
    if (prev) prev.count++
    else counts.set(label, { label, count: 1, cls })
  }
  return [...counts.values()]
}

function typeLabel(type: AttackType): string {
  switch (type) {
    case 'off':            return 'Офф'
    case 'paladin_off':    return 'Пал-Офф'
    case 'split_off_rams': return 'Сплит (тараны)'
    case 'split_off_rest': return 'Сплит (остальное)'
    case 'spam':           return 'Спам'
    case 'spam_noble':     return 'Спам-двор'
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
    case 'split_off_rest': return 'badge-off'
    case 'spam':
    case 'spam_noble':     return 'badge-spam'
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

function compParts(c: AttackComposition): Array<{ key: string; icon: string; count: number }> {
  const order: Array<keyof AttackComposition> = [
    'axe', 'light', 'heavy', 'ram', 'spear', 'sword', 'spy', 'catapult', 'knight', 'snob',
  ]
  return order.filter((k) => c[k] > 0).map((k) => ({ key: k, icon: UNIT_ICONS[k], count: c[k] }))
}

// ── BBCode tab ─────────────────────────────────────────────────────────────

const bbcodePlayer    = ref('')
const copied          = ref(false)
const includeAttackMap = ref(false)

const allPlayers = computed(() => [...planStore.attacksByPlayer.keys()])

interface BBMeta { unit: string; color: string; label: string }

function attackBBMeta(type: AttackType): BBMeta {
  switch (type) {
    case 'off':            return { unit: 'ram',   color: '#ff0000', label: 'ФУЛЛ_ОФФ' }
    case 'paladin_off':    return { unit: 'ram',   color: '#ff00ff', label: 'ФУЛЛ_ОФФ_(+ПАЛ)' }
    case 'split_off_rams': return { unit: 'ram',   color: '#ff8800', label: 'ПОДЕЛЁНКА_(тараны)' }
    case 'split_off_rest': return { unit: 'axe',   color: '#ff8800', label: 'ПОДЕЛЁНКА_(без_таранов)' }
    case 'spam':           return { unit: 'spear', color: '#888888', label: 'СПАМ' }
    case 'spam_noble':     return { unit: 'snob',  color: '#666688', label: 'СПАМ_ДВОР' }
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

function attackBBColor(atk: Attack): string {
  return atk.color ?? '#e94560'
}

function attackToLine(atk: Attack): string {
  const base  = attackBBMeta(atk.type)
  const unit  = base.unit
  const raw   = atk.label ?? base.label
  const label = raw.toUpperCase().replace(/ /g, '_')
  const color = attackBBColor(atk)
  const sd = bbDate(atk.sendTime), st = bbTime(atk.sendTime)
  const ad = bbDate(atk.arrivalTime), at = bbTime(atk.arrivalTime)
  return `[unit]${unit}[/unit]    [b][color=${color}]${label}[/color][/b]    |    ${sd}    [b]${st}[/b]    |    ${ad}    ${at}    |    ${atk.fromVillage.coords} -> ${atk.target.coords}    |    ${bbAttackLink(atk)}`
}

function rowToLine(row: AttackRow): string {
  return attackToLine(row.representative)
}

function openOrdersBlock(player: string): string {
  const targets = planStore.openOrdersTo.get(player)
  if (!targets || targets.size === 0) return ''
  const names = [...targets].map((p) => `[player]${p}[/player]`).join(', ')
  return `[b]══════════ Открытие приказов ══════════[/b]\n${names}`
}

function buildInstructionsBBCode(filterPlayer?: string): string {
  const active = planStore.attacks.filter(a =>
    !a.excluded && (filterPlayer ? a.fromVillage.player === filterPlayer : true)
  )

  // Nobles: sum snob count per village across all attacks
  const nobleMap = new Map<string, { coords: string; player: string; count: number }>()
  for (const a of active) {
    const snobs = a.composition.snob ?? 0
    if (snobs === 0) continue
    const ex = nobleMap.get(a.fromVillage.coords)
    if (ex) ex.count += snobs
    else nobleMap.set(a.fromVillage.coords, { coords: a.fromVillage.coords, player: a.fromVillage.player, count: snobs })
  }

  // Paladins: unique villages that send a paladin (knight > 0)
  const palMap = new Map<string, string>()
  for (const a of active) {
    if ((a.composition.knight ?? 0) > 0) palMap.set(a.fromVillage.coords, a.fromVillage.coords)
  }

  if (nobleMap.size === 0 && palMap.size === 0) return ''

  const lines: string[] = [`[b]══════════ Инструкции по строительству ══════════[/b]`]

  if (nobleMap.size > 0) {
    lines.push('[b][unit]snob[/unit] Дворяне (где строить)[/b]')
    for (const np of nobleMap.values()) {
      lines.push(`[player]${np.player}[/player]    [coord]${np.coords}[/coord]    ×${np.count}`)
    }
  }

  if (palMap.size > 0) {
    if (nobleMap.size > 0) lines.push('')
    lines.push('[b][unit]knight[/unit] Паладины[/b]')
    for (const coords of palMap.keys()) {
      lines.push(`[coord]${coords}[/coord] — Офф паладин`)
    }
  }

  return lines.join('\n')
}

function attackMapBlock(filterPlayer?: string): string {
  const relevantTargetIds = filterPlayer
    ? new Set(
        planStore.attacks
          .filter(a => !a.excluded && a.fromVillage.player === filterPlayer)
          .map(a => a.target.id)
      )
    : null

  const targets = planStore.targets.filter(t =>
    t.coords && (relevantTargetIds ? relevantTargetIds.has(t.id) : true)
  )
  if (targets.length === 0) return ''

  const blocks: string[] = []

  for (const t of targets) {
    const atks = (planStore.attacksByTarget.get(t.id) ?? [])
      .filter(a => !a.excluded)
      .slice()
      .sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
    if (atks.length === 0) continue

    const tgtLabel = t.label ? `${t.label} ` : ''
    const tgtOwner = t.enemyPlayer ? ` (${t.enemyPlayer})` : ''
    const header = `[b]${tgtLabel}[coord]${t.coords}[/coord]${tgtOwner}[/b]`

    const rows: string[] = []
    for (const a of atks) {
      const d  = a.arrivalTime
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const dy = String(d.getDate()).padStart(2, '0')
      const time    = `${dy}.${mo} ${hh}:${mm}:${ss}`
      const label   = a.label ?? atkTypeLabelShort(a.type)
      const isMine  = filterPlayer ? a.fromVillage.player === filterPlayer : false
      const mark    = isMine ? '► ' : ''
      const typeCol = isMine ? `[b]${mark}${label}[/b]` : `${label}`
      const playerCol = filterPlayer
        ? (isMine ? '' : `[player]${a.fromVillage.player}[/player]`)
        : `[player]${a.fromVillage.player}[/player]`
      rows.push(`[*]${time}[|]${typeCol}[|][coord]${a.fromVillage.coords}[/coord][|]${playerCol}`)
    }

    blocks.push(`${header}\n[table]\n[**]Время[||]Тип[||]Деревня[||]Игрок[/**]\n${rows.join('\n')}\n[/table]`)
  }

  if (blocks.length === 0) return ''
  return `[spoiler=Карта атак]\n${blocks.join('\n\n')}\n[/spoiler]`
}

function atkTypeLabelShort(type: string): string {
  if (type === 'paladin_off')    return 'Пал-Офф'
  if (type === 'off')            return 'Офф'
  if (type === 'spam_noble')     return 'Спам-двор'
  if (type === 'spam')           return 'Спам'
  if (type === 'split_off_rams') return 'Медиум'
  if (type === 'split_off_rest') return 'Медиум-'
  return type
}

const bbcodeOutput = computed(() => {
  const bySendTime = (a: Attack, b: Attack) => a.sendTime.getTime() - b.sendTime.getTime()

  if (bbcodePlayer.value) {
    const playerAttacks = planStore.attacksByPlayer.get(bbcodePlayer.value) ?? []
    const active = playerAttacks.filter((a) => !a.excluded).slice().sort(bySendTime)
    const lines: string[] = []
    const instructions = buildInstructionsBBCode(bbcodePlayer.value)
    if (instructions) { lines.push(instructions); lines.push(''); lines.push('') }
    const orders = openOrdersBlock(bbcodePlayer.value)
    if (orders) { lines.push(orders); lines.push(''); lines.push('') }
    lines.push('[b]══════════ План атак ══════════[/b]')
    const planLines: string[] = []
    groupAttacks(active).forEach((row) => planLines.push(rowToLine(row)))
    lines.push(`[spoiler=Скопировать для вставки в блокнот]\n[code]\n${planLines.join('\n')}\n[/code]\n[/spoiler]`)
    if (includeAttackMap.value) {
      const map = attackMapBlock(bbcodePlayer.value)
      if (map) { lines.push(''); lines.push(map) }
    }
    return lines.join('\n')
  }

  // All players
  const lines: string[] = []
  for (const [player, playerAttacks] of planStore.attacksByPlayer) {
    const active = playerAttacks.filter((a) => !a.excluded).slice().sort(bySendTime)
    if (active.length === 0) continue
    lines.push(`[b]${player}[/b]`)
    const instructions = buildInstructionsBBCode(player)
    if (instructions) { lines.push(instructions); lines.push('') }
    const orders = openOrdersBlock(player)
    if (orders) { lines.push(orders); lines.push('') }
    lines.push('[b]══════════ План атак ══════════[/b]')
    groupAttacks(active).forEach((row) => lines.push(rowToLine(row)))
    if (includeAttackMap.value) {
      const map = attackMapBlock(player)
      if (map) { lines.push(''); lines.push(map) }
    }
    lines.push('')
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
.badge-off  { background: a($accent, 0.18); color: #ff4466; border: 1px solid a(#ff4466, 0.45); }
.badge-spam { background: a($text-dim, 0.15); color: $text-dim; border: 1px solid a($text-dim, 0.3); }

// Warning badges
.badge-build-nobles  { background: a($purple, 0.15); color: $purple; border: 1px solid a($purple, 0.35); cursor: help; }
.badge-build-paladin { background: a($orange, 0.15); color: $orange; border: 1px solid a($orange, 0.35); cursor: help; }

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

.dur {
  color: $text-faint;
  font-size: 0.8rem;
  white-space: nowrap;
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
.train-range  { color: $text-faint; font-size: 0.82rem; }
.train-count  { color: $text-dim; font-size: 0.75rem; font-weight: 700; margin-right: 0.2rem; }
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

.bbcode-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: $text-dim;
  cursor: pointer;
  user-select: none;
  input[type='checkbox'] { cursor: pointer; }
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
