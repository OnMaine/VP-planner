<template>
  <div v-if="planStore.attacks.length > 0" class="results-root">
    <LoadingOverlay :show="isExporting" text="Готовлю файл…" />

    <!-- Tab switcher -->
    <div class="results-tabs">
      <button :class="['rtab', { active: tab === 'targets' }]" @click="tab = 'targets'">По деревням</button>
      <button :class="['rtab', { active: tab === 'visual' }]" @click="tab = 'visual'">По игрокам</button>
      <button :class="['rtab', 'rtab-issues', { active: tab === 'issues' }]" @click="tab = 'issues'">
        Проблемные<span v-if="problemTargets.length" class="rtab-badge">{{ problemTargets.length }}</span>
      </button>
      <button :class="['rtab', { active: tab === 'bbcode' }]" @click="tab = 'bbcode'">Текст (BBCode)</button>
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
        <button class="collapse-toggle" @click="openPlayersPanel = !openPlayersPanel">
          <span>Результаты по игрокам</span>
          <span class="collapse-icon">{{ openPlayersPanel ? '▲' : '▼' }}</span>
        </button>
        <template v-if="openPlayersPanel">
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
                      <span v-if="waveOrdinalForTarget(row.representative.target)" class="wave-inline-tag" :title="`Волна ${waveOrdinalForTarget(row.representative.target)}`">в{{ waveOrdinalForTarget(row.representative.target) }}</span>
                      <span v-if="row.representative.target.label" class="muted-small">({{ row.representative.target.label }})</span>
                    </td>
                    <td class="units-cell">
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
        </template><!-- end openPlayersPanel -->
      </section>
    </template>

    <!-- ── Targets tab ───────────────────────────────────────────────────── -->
    <template v-if="tab === 'targets'">
      <section class="panel">
        <button class="collapse-toggle" @click="openResultsPanel = !openResultsPanel">
          <span>Результаты по деревням</span>
          <span class="collapse-icon">{{ openResultsPanel ? '▲' : '▼' }}</span>
        </button>
        <template v-if="openResultsPanel">
        <div v-if="multiWave" class="wave-mode-bar">
          <span class="wave-mode-label">Показ:</span>
          <button :class="['wave-mode-btn', { on: resultWaveMode === 'all' }]" @click="resultWaveMode = 'all'">Все волны</button>
          <button :class="['wave-mode-btn', { on: resultWaveMode === 'byWave' }]" @click="resultWaveMode = 'byWave'">По волнам</button>
          <span class="wave-mode-sep"></span>
          <button
            v-for="(w, i) in planStore.planWaves"
            :key="w.id"
            :class="['wave-mode-btn', 'wave-mode-btn--wave', { on: resultWaveMode === w.id }]"
            :title="`Только ${waveName(i)}`"
            @click="resultWaveMode = w.id"
          >{{ waveName(i) }}</button>
        </div>
        <template v-for="{ id, coords, attacks: tgtAttacks, waveHeader } in orderedTargetEntries" :key="id">
        <div v-if="waveHeader" class="wave-result-section-head">{{ waveHeader }}</div>
        <div
          :class="['player-block', { 'player-block--shortage': issueIds.has(id) }]"
        >
          <button :class="['collapse-toggle player-toggle', { 'toggle--shortage': issueIds.has(id) }]" @click="toggleTarget(id)">
            <span>
              <span class="player-name-label">{{ coords }}</span>
              <span v-if="tgtAttacks[0].target.enemyPlayer" class="target-player-label">{{ tgtAttacks[0].target.enemyPlayer }}</span>
              <span class="player-attack-count">({{ tgtAttacks.filter(a => !a.excluded).length }} / {{ tgtAttacks.length }} атак)</span>
              <span v-if="resultWaveMode === 'all' && waveLabelForTarget(tgtAttacks[0].target)" class="wave-result-tag">{{ waveLabelForTarget(tgtAttacks[0].target) }}</span>
              <span v-if="tgtAttacks.some(a => a.catMass)" class="cat-wave-tag">кат волна</span>
              <span v-if="issueIds.has(id)" class="shortage-tag" :title="issuesById.get(id)?.join('\n')">⚠ не хватило</span>
            </span>
            <span class="collapse-icon">{{ openTargets.has(id) ? '▲' : '▼' }}</span>
          </button>

          <div v-if="openTargets.has(id)" class="mt">
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
                    <td class="units-cell">
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
                  <tr
                    v-for="(ghost, gi) in ghostRowsFor(id, coords, tgtAttacks[0].target.arrivalTime)"
                    :key="`ghost-${id}-${gi}`"
                    class="row-ghost"
                  >
                    <td><span class="type-badge badge-ghost">{{ ghost.label }}</span></td>
                    <td class="mono ghost-cell">—</td>
                    <td class="mono ghost-cell">{{ formatDT(ghost.arrivalTime) }}</td>
                    <td class="ghost-cell">—</td>
                    <td class="ghost-cell">—</td>
                    <td class="ghost-cell">—</td>
                    <td class="ghost-cell">
                      <span class="ghost-missing">
                        {{ ghost.missing > 1 ? `×${ghost.missing} · ` : '' }}{{ ghost.reason }}
                      </span>
                    </td>
                    <td></td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </template><!-- end v-for orderedTargetEntries -->
        </template><!-- end v-if="openResultsPanel" -->
      </section>
    </template>

    <!-- ── Problem targets tab ─────────────────────────────────────────── -->
    <template v-if="tab === 'issues'">
      <section class="panel results-panel">
        <div class="issues-head-row">
          <h3 class="issues-title">Проблемные деревни ({{ problemTargets.length }})</h3>
          <span class="issues-hint">Для каждой цели — причина нехватки. «Заглушить» — выключить цель из генерации (войска свободны). Цель остаётся в списке и помечается «заглушена» — вернуть можно в «Целях».</span>
        </div>

        <div v-if="!problemTargets.length" class="issues-empty">Нет проблемных целей — всем хватило войск 🎉</div>

        <div v-for="p in problemTargets" :key="p.id" class="issue-block">
          <div class="issue-head">
            <span class="player-name-label">{{ p.coords }}</span>
            <span v-if="p.enemyPlayer" class="target-player-label">{{ p.enemyPlayer }}</span>
            <span class="player-attack-count">({{ p.assigned }} / {{ p.total }} атак)</span>
            <span v-if="p.waveLabel" class="wave-result-tag">{{ p.waveLabel }}</span>
            <span v-if="p.diag" class="issue-reason" :class="`reason--${p.diag.reason}`">{{ p.diag.label }}</span>
            <button class="issue-mute-btn" title="Выключить цель из генерации (обратимо) — войска свободны, цель остаётся в списке" @click="muteTarget(p.id)">🔇 Заглушить</button>
          </div>
          <div v-if="p.diag" class="issue-diag">
            <div class="issue-diag-text">{{ p.diag.detail }}</div>
            <div class="issue-diag-stats">
              <span title="Свободных легальных оффов / укладываются по времени / всего в пуле">оффы своб.: <b :class="{ 'stat-zero': p.diag.free === 0 }">{{ p.diag.free }}</b> <span class="stat-dim">/ {{ p.diag.reachable }} / {{ p.diag.eligible }}</span></span>
              <span v-if="p.diag.nobleVirtual" title="Офф-деревень в радиусе хода дворян, способных нести виртуальный паравоз (из них ещё свободных)">офф-дер в радиусе: <b :class="{ 'stat-zero': p.diag.nobleVilInRange === 0 }">{{ p.diag.nobleVilInRange }}</b> <span class="stat-dim">(своб. {{ p.diag.nobleSnobInRange }})</span></span>
              <span v-else title="Дворов в радиусе хода дворян (сумма / деревень)">дворы в радиусе: <b :class="{ 'stat-zero': p.diag.nobleVilInRange === 0 }">{{ p.diag.nobleSnobInRange }}</b> <span class="stat-dim">({{ p.diag.nobleVilInRange }} дер)</span></span>
              <span :title="p.diag.nobleVirtual ? 'Дворов разослано / виртуальный бюджет дворов игроков' : 'Дворов задействовано / всего физ. в пуле'">дворы в плане{{ p.diag.nobleVirtual ? ' (вирт.)' : '' }}: <b>{{ p.diag.noblesUsed }}</b> <span class="stat-dim">/ {{ p.diag.noblesTotal }}</span></span>
            </div>
          </div>
          <ul class="issue-list">
            <li v-for="(msg, i) in p.issues" :key="i">{{ msg }}</li>
          </ul>
        </div>
      </section>
    </template>

    <!-- ── BBCode tab ──────────────────────────────────────────────────── -->
    <template v-if="tab === 'bbcode'">
      <section class="panel bbcode-panel">
        <button class="collapse-toggle" @click="openBBPanel = !openBBPanel">
          <span>Текст (BBCode)</span>
          <span class="collapse-icon">{{ openBBPanel ? '▲' : '▼' }}</span>
        </button>
        <template v-if="openBBPanel">
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
          <button class="btn btn-secondary" @click="doExportXlsx" title="Экспорт в Excel (.xlsx) — формат для форума TW">
            Скачать xlsx
          </button>
        </div>

        <textarea class="bbcode-area" readonly :value="bbcodeOutput" />

        <p class="bbcode-note" v-if="planStore.attacks.some(a => !a.excluded && !a.fromVillage.villageId)">
          ⚠ Некоторые ссылки Attack используют координаты вместо ID — загрузите карту деревень для точных ссылок.
        </p>
        </template><!-- end openBBPanel -->
      </section>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlanStore } from '@/stores/planStore'
import { exportAttacksToXlsx } from '@/composables/useExcelExport'
import { nextPaint } from '@/utils/nextPaint'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import type { Attack, AttackType, WarningCode, AttackComposition } from '@/stores/planStore'
import { CAT_TARGET_LABELS } from '@/stores/presetsStore'
import type { CatTarget } from '@/stores/presetsStore'
import { useDateFormat } from '@/composables/useDateFormat'
import { UNIT_ICONS, attackSmall, attackMedium, attackLarge } from '@/utils/unitIcons'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useMassConfigStore } from '@/stores/massConfigStore'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()
const massConfigStore = useMassConfigStore()
const { formatDT } = useDateFormat()

// Метка волны цели (показываем только когда волн несколько).
function waveLabelForTarget(target: { waveId?: string }): string | null {
  if (planStore.planWaves.length <= 1) return null
  const idx = planStore.planWaves.findIndex(w => w.id === target.waveId)
  if (idx < 0) return null
  const cfg = massConfigStore.all.find(c => c.id === planStore.planWaves[idx].configId)
  return `волна ${idx + 1} · ${cfg?.name ?? '—'}`
}
// Метка волны по индексу — для кнопок фильтра («Волна N · конфиг»).
function waveName(i: number): string {
  const w = planStore.planWaves[i]
  if (!w) return `Волна ${i + 1}`
  const cfg = massConfigStore.all.find(c => c.id === w.configId)
  return `Волна ${i + 1} · ${cfg?.name ?? '—'}`
}
// Номер волны цели (для компактной метки в строках «По игрокам»).
function waveOrdinalForTarget(target: { waveId?: string }): number | null {
  if (planStore.planWaves.length <= 1) return null
  const i = planStore.planWaves.findIndex(w => w.id === target.waveId)
  return i < 0 ? null : i + 1
}

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

const tab = ref<'visual' | 'targets' | 'issues' | 'bbcode'>('targets')

// ── Attack row grouping ────────────────────────────────────────────────────

interface AttackRow {
  attacks: Attack[]
  representative: Attack
  lastArrival?: Date   // set when trainGroupId groups multiple attacks
  nobleCount?: number  // number of noble attacks in group
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

// ── Visual tab ─────────────────────────────────────────────────────────────

const openPlayers = ref<Set<string>>(new Set())
const openTargets = ref<Set<string>>(new Set())

function issueMsg(issue: typeof planStore.generationIssues[number]): string {
  const slot = issue.slotName ? `[${issue.slotName}] ` : ''
  if (issue.type === 'OFFS_SHORT') {
    if (issue.generated > 0) return `${slot}Оффы: нужно ${issue.requested}, получено ${issue.generated}`
    const reason =
      issue.offsReason === 'pool_depleted' ? 'пул исчерпан' :
      issue.offsReason === 'night_excluded' ? 'ночной режим' :
      issue.offsReason === 'no_eligible'    ? 'нет подходящих деревень' :
      'нет деревень'
    return `${slot}Оффы: 0 из ${issue.requested} (${reason})`
  }
  if (issue.type === 'NOBLES_SHORT') return `${slot}Дворяне: нужно ${issue.requested}, получено ${issue.generated}`
  return `${slot}Спам: нужно ${issue.requested}, получено ${issue.generated}`
}

// По конкретной цели (id) — чтобы при дублях кор между волнами проблемы не смешивались.
const issuesById = computed(() => {
  const m = new Map<string, string[]>()
  for (const issue of planStore.generationIssues) {
    if (!issue.targetId) continue
    if (!m.has(issue.targetId)) m.set(issue.targetId, [])
    m.get(issue.targetId)!.push(issueMsg(issue))
  }
  return m
})
const issueIds = computed(() => new Set(issuesById.value.keys()))

// Problem targets: по КОНКРЕТНОЙ цели (id) — дубли кор между волнами разнесены.
const problemTargets = computed(() => {
  const ids = [...new Set(planStore.generationIssues.map(i => i.targetId).filter((x): x is string => !!x))]
  return ids
    .map(id => {
      const target = planStore.targets.find(t => t.id === id)
      if (!target) return null
      const atks = planStore.attacksByTarget.get(id) ?? []
      // Диагностика пула (off-причина) нужна только для целей с офф/дворянским недобором.
      const hasOffIssue = planStore.generationIssues.some(i =>
        i.targetId === id && (i.type === 'OFFS_SHORT' || i.type === 'NOBLES_SHORT'))
      return {
        coords: target.coords,
        id,
        waveLabel: waveLabelForTarget(target),
        enemyPlayer: target.enemyPlayer ?? atks[0]?.target.enemyPlayer,
        assigned: atks.filter(a => !a.excluded).length,
        total: atks.length,
        issues: issuesById.value.get(id) ?? [],
        diag: hasOffIssue ? planStore.targetShortageDiagnosis.get(target.coords) : undefined,
      }
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
    // Most problems first; tie-break by coords for stable order.
    .sort((a, b) => b.issues.length - a.issues.length || a.coords.localeCompare(b.coords))
})

// Remove a problem target: frees its reserved troops (they return to the pool
// on the next generation) and drops it from the target list.
function muteTarget(id?: string): void {
  if (id) planStore.setTargetMuted(id, true)
}

interface GhostRow { label: string; arrivalTime: Date; missing: number; reason: string }

function ghostRowsFor(targetId: string, coords: string, arrivalTime: Date): GhostRow[] {
  // Фильтруем по конкретной цели (id); фолбэк на коры для старых issue без id.
  const issues = planStore.generationIssues.filter(i => i.targetId ? i.targetId === targetId : i.targetCoords === coords)
  const rows: GhostRow[] = []
  for (const issue of issues) {
    const missing = issue.requested - issue.generated
    if (missing <= 0) continue
    const label =
      issue.slotName ? issue.slotName :
      issue.type === 'NOBLES_SHORT' ? 'Дворяне' :
      issue.type === 'SPAM_SHORT'   ? 'Спам' :
      'Офф'
    const reason =
      issue.type === 'OFFS_SHORT' && issue.generated === 0
        ? (issue.offsReason === 'pool_depleted' ? 'пул исчерпан' :
           issue.offsReason === 'night_excluded' ? 'ночной режим' :
           issue.offsReason === 'no_eligible'    ? 'нет подходящих деревень' :
           'нет деревень')
        : `нужно ${issue.requested}, получено ${issue.generated}`
    rows.push({ label, arrivalTime, missing, reason })
  }
  return rows
}

const openPlayersPanel = ref(true)
const openResultsPanel = ref(true)
const openBBPanel = ref(true)

// Режим отображения результатов «По деревням»: 'all' — все подряд, 'byWave' —
// секциями по волнам, либо id конкретной волны — только её цели.
const resultWaveMode = ref<string>('all')
const multiWave = computed(() => planStore.planWaves.length > 1)

interface TargetEntry { id: string; coords: string; attacks: Attack[]; waveHeader?: string }
// Группируем по target.id (а не по корам) — одни коры в разных волнах = разные блоки.
const orderedTargetEntries = computed<TargetEntry[]>(() => {
  const byId = new Map<string, TargetEntry>()
  for (const atk of planStore.attacks) {
    const id = atk.target.id
    if (!byId.has(id)) byId.set(id, { id, coords: atk.target.coords, attacks: [] })
    byId.get(id)!.attacks.push(atk)
  }
  for (const e of byId.values()) e.attacks.sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
  const entries = [...byId.values()]
  const mode = resultWaveMode.value
  // Фильтр на конкретную волну (mode = её id)
  if (mode !== 'all' && mode !== 'byWave' && multiWave.value) {
    return entries.filter(e => (e.attacks[0]?.target.waveId ?? '') === mode)
  }
  if (mode !== 'byWave' || !multiWave.value) return entries
  const waveIdx = (wid?: string) => {
    const i = planStore.planWaves.findIndex(w => w.id === wid)
    return i < 0 ? 999 : i
  }
  const sorted = entries
    .map((e, origIdx) => ({ e, origIdx, wi: waveIdx(e.attacks[0]?.target.waveId) }))
    .sort((a, b) => a.wi - b.wi || a.origIdx - b.origIdx)
  const out: TargetEntry[] = []
  let lastWi = -1
  for (const { e, wi } of sorted) {
    if (wi !== lastWi) {
      if (wi === 999) e.waveHeader = 'Без волны'
      else {
        const w = planStore.planWaves[wi]
        const cfg = massConfigStore.all.find(c => c.id === w.configId)
        e.waveHeader = `Волна ${wi + 1} · ${cfg?.name ?? '—'}`
      }
      lastWi = wi
    }
    out.push(e)
  }
  return out
})

function expandAll(players: Iterable<string>): void {
  openPlayers.value = new Set(players)
  openTargets.value = new Set(planStore.attacks.map(a => a.target.id))  // openTargets ключ = target.id
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
    const label = attackLabel(row.representative)
    const cls   = typeBadgeClass(row.representative.type)
    const prev  = counts.get(label)
    if (prev) prev.count++
    else counts.set(label, { label, count: 1, cls })
  }
  return [...counts.values()]
}

function typeLabel(type: AttackType, catTarget?: CatTarget): string {
  switch (type) {
    case 'off':            return 'Офф'
    case 'paladin_off':    return 'Пал-Офф'
    case 'mid_off':        return 'Мид-Офф'
    case 'mini_off':       return 'Мини-Офф'
    case 'cat':            return catTarget ? `Каты (${CAT_TARGET_LABELS[catTarget]})` : 'Каты'
    case 'spam':           return 'Спам'
  }
}

function attackLabel(atk: Attack): string {
  if (atk.type === 'cat') return typeLabel('cat', atk.catTarget)
  return atk.label ?? typeLabel(atk.type, atk.catTarget)
}

function typeBadgeClass(type: AttackType): string {
  switch (type) {
    case 'off':
    case 'paladin_off':
    case 'mid_off':
    case 'mini_off':       return 'badge-off'
    case 'cat':            return 'badge-cat'
    case 'spam':           return 'badge-spam'
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
const isExporting     = ref(false)
const includeAttackMap = ref(false)

const allPlayers = computed(() => [...planStore.attacksByPlayer.keys()])

interface BBMeta { unit: string; color: string; label: string }

function attackBBMeta(atk: Attack): BBMeta {
  switch (atk.type) {
    case 'off':            return { unit: 'ram',   color: '#ff0000', label: 'ФУЛЛ_ОФФ' }
    case 'paladin_off':    return { unit: 'ram',   color: '#ff00ff', label: 'ФУЛЛ_ОФФ_(+ПАЛ)' }
    case 'mid_off':         return { unit: 'ram',   color: '#c87d3e', label: 'МИД_ОФФ' }
    case 'mini_off':        return { unit: 'ram',   color: '#b8a832', label: 'МИНИ_ОФФ' }
    case 'cat': {
      const b = atk.catTarget ? `_(${CAT_TARGET_LABELS[atk.catTarget].toUpperCase()})` : ''
      return { unit: 'catapult', color: '#89b4fa', label: `КАТЫ${b}` }
    }
    case 'spam':           return { unit: 'spear', color: '#888888', label: 'СПАМ' }
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
  const base  = attackBBMeta(atk)
  const unit  = atk.speedUnit
  const raw   = atk.type === 'cat' ? base.label : (atk.label ?? base.label)
  const catSuffix = atk.type !== 'cat' && atk.catTarget
    ? `_(${CAT_TARGET_LABELS[atk.catTarget].toUpperCase()})` : ''
  const label = (raw + catSuffix).toUpperCase().replace(/ /g, '_')
  const color = attackBBColor(atk)
  const sd = bbDate(atk.sendTime), st = bbTime(atk.sendTime)
  const ad = bbDate(atk.arrivalTime), at = bbTime(atk.arrivalTime)
  return `[unit]${unit}[/unit]    [b][color=${color}]${label}[/color][/b]    |    ${sd}    [b]${st}[/b]    |    ${ad}    ${at}    |    ${atk.fromVillage.coords} -> ${atk.target.coords}    |    ${bbAttackLink(atk)}`
}

function rowToLine(row: AttackRow): string {
  return attackToLine(row.representative)
}

// ── План атак блоками: по дню отправки → по часу, с нумерацией и статистикой ──
function isSpamRow(r: AttackRow): boolean {
  return r.representative.type === 'spam' || !!r.representative.countAsSpam
}
function rowNobleCount(r: AttackRow): number {
  return r.nobleCount ?? (r.representative.composition.snob ?? 0)
}
function buildPlanBlocks(rows: AttackRow[]): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  const sorted = [...rows].sort((a, b) => a.representative.sendTime.getTime() - b.representative.sendTime.getTime())
  // Группировка по дню отправки
  const byDay = new Map<string, AttackRow[]>()
  for (const r of sorted) {
    const d = r.representative.sendTime
    const key = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(r)
  }
  const out: string[] = []
  let num = 0
  for (const [, dayRows] of byDay) {
    const d = dayRows[0].representative.sendTime
    const dayLabel = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`
    // Непересекающиеся категории: всего = реалок + спама + дворов.
    const spam = dayRows.filter(isSpamRow).length
    const nobles = dayRows.filter(r => !isSpamRow(r) && rowNobleCount(r) > 0).length
    const real = dayRows.length - spam - nobles
    out.push(`========== Отправки ${dayLabel} — всего ${dayRows.length} / реалок ${real} / спама ${spam} / дворов ${nobles} ==========`)
    out.push('')
    // Группировка по часу отправки
    const byHour = new Map<number, AttackRow[]>()
    for (const r of dayRows) {
      const h = r.representative.sendTime.getHours()
      if (!byHour.has(h)) byHour.set(h, [])
      byHour.get(h)!.push(r)
    }
    for (const h of [...byHour.keys()].sort((a, b) => a - b)) {
      out.push(`${p2(h)}:00-${p2(h)}:59`)
      for (const r of byHour.get(h)!) {
        num++
        out.push(`#${num} | ${rowToLine(r)}`)
      }
      out.push('')
    }
  }
  return out.join('\n').replace(/\n+$/, '')
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
      const label   = a.label ?? (a.type === 'cat' ? typeLabel('cat', a.catTarget) : atkTypeLabelShort(a.type))
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
  if (type === 'spam')           return 'Спам'
  if (type === 'mid_off')  return 'Медиум'
  if (type === 'mini_off') return 'Мини'
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
    lines.push(`[spoiler=Скопировать для вставки в блокнот]\n[code]\n${buildPlanBlocks(groupAttacks(active))}\n[/code]\n[/spoiler]`)
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
    lines.push(buildPlanBlocks(groupAttacks(active)))
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

async function doExportXlsx(): Promise<void> {
  isExporting.value = true
  await nextPaint()
  try {
    const idLookup = (coords: string): number | null =>
      enemyStore.lookupCoords(coords)?.village.id ?? null

    const date = new Date()
    const ds = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}`
    const filename = `mass_plan_${ds}.xlsx`

    exportAttacksToXlsx(planStore.attacks, idLookup, bbcodePlayer.value, filename)
  } finally {
    isExporting.value = false
  }
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
.rtab-issues { display: inline-flex; align-items: center; gap: 0.4rem; }
.rtab-badge {
  background: #f38ba8; color: #1a1a2e; font-size: 0.72rem; font-weight: 700;
  border-radius: 10px; padding: 0.02rem 0.4rem; line-height: 1.3;
}

// ── Problem targets tab ───────────────────────────────────────────────────
.issues-head-row { display: flex; align-items: baseline; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.issues-title { font-size: 1rem; margin: 0; color: $text; }
.issues-hint { font-size: 0.78rem; color: $text-dim; }
.issues-empty { color: $text-dim; padding: 1.2rem; text-align: center; }
.issue-block {
  border: 1px solid a(#f38ba8, 0.35); border-left: 3px solid #f38ba8; border-radius: 6px;
  padding: 0.6rem 0.85rem; margin-bottom: 0.5rem; background: a(#f38ba8, 0.05);
}
.issue-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.issue-mute-btn {
  margin-left: auto; background: transparent; border: 1px solid #f38ba8; color: #f38ba8;
  border-radius: 5px; font-size: 0.8rem; font-weight: 600; padding: 0.2rem 0.6rem; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover { background: #f38ba8; color: #1a1a2e; }
}
.issue-list { margin: 0.4rem 0 0; padding-left: 1.1rem; color: $text-dim; font-size: 0.82rem; line-height: 1.5; }

.issue-reason {
  font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 10px; white-space: nowrap;
  &.reason--no_eligible  { background: a(#f38ba8, 0.18); color: #f38ba8; }
  &.reason--timing       { background: a(#fab387, 0.18); color: #fab387; }
  &.reason--depleted     { background: a(#89b4fa, 0.18); color: #89b4fa; }
  &.reason--no_noble     { background: a(#cba6f7, 0.18); color: #cba6f7; }
  &.reason--nobles_short { background: a(#cba6f7, 0.18); color: #cba6f7; }
  &.reason--partial      { background: a(#f9e2af, 0.18); color: #f9e2af; }
}
.issue-diag {
  margin-top: 0.4rem; padding: 0.45rem 0.6rem; background: a(#000, 0.18); border-radius: 5px;
  .issue-diag-text { font-size: 0.8rem; color: $text; line-height: 1.5; }
  .issue-diag-stats {
    display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.35rem; font-size: 0.74rem; color: $text-dim;
    b { color: $text; } .stat-zero { color: #f38ba8; } .stat-dim { color: a($text-dim, 0.6); }
  }
}

// ── Player blocks (visual tab) ────────────────────────────────────────────
.player-block {
  border: 1px solid $border;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background: $bg-page;
}
.collapse-toggle:not(.player-toggle) {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer;
  padding: 0; color: inherit; text-align: left; font-size: 1rem; font-weight: 600;
  margin-bottom: 0.75rem;
  &:hover { opacity: 0.85; }
}
.collapse-icon { font-size: 0.75rem; color: $text-faint; }

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
  table-layout: auto;
  td { vertical-align: middle; }
  // Колонка «△» (предпоследняя) не должна схлопываться под юнитами.
  th:nth-last-child(2), td:nth-last-child(2) { min-width: 96px; }
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
.badge-cat  { background: rgba(137,180,250,0.18); color: #89b4fa; border: 1px solid rgba(137,180,250,0.45); }
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
.units-cell { white-space: nowrap; vertical-align: middle; }
.units-cell .units-detail { max-width: 150px; white-space: normal; }
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

.player-block--shortage {
  background: rgba(233, 69, 96, 0.04);
  border-color: rgba(233, 69, 96, 0.4);
}

.player-block--shortage > .toggle--shortage {
  border-left: 3px solid rgba(233, 69, 96, 0.7);
  padding-left: 0.6rem;
}

.row-ghost {
  opacity: 0.6;
  td { text-decoration: line-through; color: #e94560 !important; }
  .ghost-cell { color: #e94560; }
}

.badge-ghost {
  background: rgba(233, 69, 96, 0.15);
  border: 1px solid rgba(233, 69, 96, 0.4);
  color: #e94560;
  text-decoration: line-through;
}

.ghost-missing {
  font-size: 0.72rem;
  color: #e94560;
  font-style: italic;
  text-decoration: none;
}

.shortage-tag {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.4rem;
  border-radius: 8px;
  background: rgba(233, 69, 96, 0.15);
  border: 1px solid rgba(233, 69, 96, 0.45);
  color: #e94560;
}

.wave-result-tag {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.4rem;
  border-radius: 8px;
  background: a($green, 0.12);
  border: 1px solid a($green, 0.35);
  color: $green;
  vertical-align: middle;
  letter-spacing: 0.02em;
}

.wave-inline-tag {
  display: inline-block; margin-left: 0.25rem;
  font-size: 0.6rem; font-weight: 700;
  padding: 0 0.3rem; border-radius: 6px;
  background: a($green, 0.14); border: 1px solid a($green, 0.35); color: $green;
  vertical-align: middle;
}

.wave-mode-bar {
  display: flex; align-items: center; gap: 0.4rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}
.wave-mode-label { font-size: 0.78rem; color: $text-faint; }
.wave-mode-sep { width: 1px; height: 16px; background: $border; margin: 0 0.2rem; }
.wave-mode-btn {
  font-size: 0.78rem; font-weight: 600; padding: 0.2rem 0.6rem;
  border-radius: 6px; cursor: pointer;
  background: a($text-dim, 0.06); border: 1px solid $border; color: $text-dim;
  &:hover { border-color: $text; color: $text; }
  &.on { background: a($accent, 0.12); border-color: a($accent, 0.5); color: $accent; }
  &--wave.on { background: a($green, 0.14); border-color: a($green, 0.5); color: $green; }
}
.wave-result-section-head {
  margin: 0.8rem 0 0.4rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.82rem; font-weight: 700; letter-spacing: 0.02em;
  color: $green;
  background: a($green, 0.08);
  border: 1px solid a($green, 0.3);
  border-radius: 6px;
  &:first-child { margin-top: 0; }
}

.cat-wave-tag {
  display: inline-block;
  margin-left: 0.3rem;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border-radius: 8px;
  background: rgba(137, 180, 250, 0.12);
  border: 1px solid rgba(137, 180, 250, 0.35);
  color: #89b4fa;
  vertical-align: middle;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
</style>
