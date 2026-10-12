<template>
  <div class="planner-view">
    <Transition name="gen-overlay">
      <div v-if="isGenerating" class="gen-overlay">
        <div class="gen-overlay-box">
          <div class="gen-overlay-spinner"></div>
          <span class="gen-overlay-text">Генерация плана...</span>
        </div>
      </div>
    </Transition>

    <h1>Планер атак</h1>

    <!-- ── Инструкция (сворачиваемая) ────────────────────────────────────── -->
    <section class="help-box">
      <button class="help-toggle" @click="showHelp = !showHelp">
        <span>📖 Инструкция</span>
        <span class="help-caret">{{ showHelp ? '▲' : '▼' }}</span>
      </button>
      <div v-if="showHelp" class="help-content">
        <p>
          Здесь собирается план массовых атак. <b>Порядок:</b> собери <b>волны</b> (каждая со своим масс-конфигом) → выбери волну и задай её
          <b>настройки</b> и <b>цели</b> → <b>«Сгенерировать план»</b>. Результат — готовые атаки с точным таймингом, их можно экспортировать.
        </p>

        <h4>Волны плана (вверху слева)</h4>
        <ul>
          <li><b>План — это упорядоченный список волн.</b> Каждая волна = один масс-конфиг + свои настройки + свои цели.</li>
          <li><b>+ Добавить волну</b> — выбери конфиг и жми «Добавить». Новую волну можно добавить, только когда у текущей последней уже есть цели.</li>
          <li><b>Клик по волне</b> выбирает её (подсветка + метка «выбрана») — ниже редактируются настройки именно этой волны, а справа в «Целях» показываются её цели.</li>
          <li><b>↑ / ↓</b> — порядок волн (деры расходуются из общего пула по порядку), <b>✕</b> — удалить волну. Один конфиг можно использовать в нескольких волнах; одинаковые координаты целей допустимы в разных волнах.</li>
        </ul>

        <h4>Настройки выбранной волны</h4>
        <ul>
          <li><b>Тайминг</b> — опорное время прихода. <b>«→ целям волны N»</b> проставляет его всем целям этой волны (у каждой цели можно задать своё).</li>
          <li><b>🌙 Без ночных</b> — не отправлять атаки, чья отправка попадает в ночное окно (диапазон часов рядом).</li>
          <li><b>⏰ Старт не ранее</b> — не генерировать отправки раньше указанного времени.</li>
          <li><b>⚖ Мораль</b> — предупреждать, если очки атакующего сильно выше защитника (риск морали).</li>
          <li><b>🗼 Башни</b> — обходить сторожевые башни врага (засвеченные деры уходят в конец очереди подбора). Таблица ввода башен врага появляется под «Целями», когда хоть одна волна их обходит.</li>
          <li><b>🛡 Резерв фронта</b> — не брать как источники деры в радиусе N полей от целей <b>этой</b> волны (рядом — поле радиуса). Напр.: реальной волне резерв включён, спам-волне — выключен.</li>
          <li><b>Распределение</b>: <i>Максимальное покрытие</i> (по умолчанию — самые «зажатые» цели обслуживаются первыми, чтобы закрыть как можно больше целей), <i>Дальние вперёд</i> (дальним целям — первый выбор дер), <i>Справедливо</i> (равномерно), <i>Жадно</i> (по лучшему совпадению).</li>
          <li><b>Все эти настройки индивидуальны для каждой волны</b> — переключая волну, видишь её тайминг/ограничения/башни/резерв/распределение.</li>
        </ul>

        <h4>Общие для плана</h4>
        <ul>
          <li><b>Дворяне</b>: <i>Реальные</i> (по войскам из импорта) или <i>Виртуальные</i> (по счётчику дворов на игрока).</li>
          <li><b>Паладины</b>: <i>Не распределять</i> / <i>Вручную</i> / <i>Автоматически</i> (раздать пал-оффам).</li>
          <li class="help-note" style="margin:.3rem 0 0">Эти два — общие для всего плана (действуют на все волны), остальное выше — пер-волна.</li>
        </ul>

        <h4>Генерация и сохранение</h4>
        <ul>
          <li><b>Сгенерировать план</b> — рассчитать атаки по всем волнам. Если кнопка заблокирована — под ней причина и ссылки (нет волн / целей / войск).</li>
          <li><b>↓ Сохр. / ↑ Загр.</b> (вверху панели) — экспорт/импорт плана в файл.</li>
          <li>Счётчики пула: офы / дворы / пробои / каты — сколько задействовано из доступного.</li>
          <li><b>«Не задействованы в плане»</b> — отдельный блок внизу: клик по строке («N офов / N кат не в плане») копирует коры этих деревень в буфер.</li>
        </ul>

        <h4>Справа — цели и результаты</h4>
        <ul>
          <li><b>Цели</b> — список координат выбранной волны (вставка списком, импорт, авто-подстановка игрока/племени). <b>🔇</b> у цели — заглушить (обратимо): цель не участвует в генерации, но остаётся в списке и помечается «заглушена»; <b>🔈 Вернуть</b> — снова включить. <b>✕</b> — удалить совсем.</li>
          <li><b>Результаты</b> (после генерации): вкладки <b>По деревням</b> / <b>По игрокам</b> (кому что слать), <b>Проблемные</b> (цели, которым не хватило — с причиной: нет оффов / тайминг / дворы не достают / пул исчерпан), <b>Текст (BBCode)</b> — готовый код для игры/форума.</li>
          <li><b>Фильтр по волнам</b> в «Показ:» (когда волн несколько): <i>Все волны</i> / <i>По волнам</i> (секциями) / <i>Волна N · конфиг</i> (только одна волна). Такой же фильтр есть на «Карте атак».</li>
          <li><b>«Заглушить»</b> во вкладке «Проблемные» = тот же обратимый мьют: цель выключается из генерации (войска свободны), вернуть её можно в «Целях».</li>
          <li>Если двор не достаёт до цели (дальше <code>snobMaxDist</code>), деревня пропускается — ищется следующая; «ушедших без двора» атак не бывает.</li>
          <li><b>Башни врага</b> — таблица сторожевых башен (когда учёт башен включён).</li>
        </ul>

        <h4>Как поднять покрытие</h4>
        <ul>
          <li><b>Режимы подбора — главное.</b> Самый эффективный для большого числа целей: <i>Максимальное покрытие</i> (по войскам) + дворяне <i>Виртуальные</i>. Так самые «зажатые» цели берут деры первыми, а дворы не привязаны к конкретной дере.</li>
          <li><b>Глуши лишние цели в «Проблемных» и перегенери.</b> Заглушённая цель возвращает свои войска в пул — их получают другие цели. Да, итоговое число целей уменьшается, зато остальные закрываются.</li>
          <li>Крути пороги оффов на «Импорте» и приоритеты слотов в «Пресеты масса», а причины недобора смотри во вкладке «Проблемные».</li>
        </ul>
      </div>
    </section>

    <div class="planner-layout">
    <aside class="planner-sidebar">
    <section class="panel mode-bar">
      <button :class="['mode-btn', { active: aiStore.mode === 'manual' }]" @click="aiStore.setMode('manual')">Ручной</button>
      <button :class="['mode-btn', { active: aiStore.mode === 'ai' }]" disabled title="AI-режим в разработке" @click="aiStore.setMode('ai')">AI</button>
      <span class="mode-bar-spacer" />
      <span class="plan-file-group">
        <button v-if="planStore.attacks.length > 0" class="btn btn-secondary btn-io" title="Сохранить план в файл" @click="planStore.exportPlan()">↓ Сохр.</button>
        <label class="btn btn-secondary btn-io plan-import-label" title="Загрузить план из файла">
          ↑ Загр.
          <input type="file" accept=".json" class="plan-import-input" @change="onImportPlan" />
        </label>
        <span v-if="importError" class="import-error">{{ importError }}</span>
      </span>
    </section>

    <!-- ── Волны плана: билдер (над настройками) ──────────────────────────── -->
    <section class="panel waves-summary">
      <span class="section-label">Волны плана</span>

      <!-- Нет ни одного масс-конфига -->
      <div v-if="massConfigStore.all.length === 0" class="waves-empty">
        <p class="waves-empty-text">Сначала создай пресет масса — набор слотов атак. Потом собери из них волны плана.</p>
        <RouterLink to="/mass-configs" class="btn btn-primary waves-empty-btn">→ Пресеты масса</RouterLink>
      </div>

      <template v-else>
        <div v-if="!wavesSummary.length" class="waves-hint">
          План пуст. Добавь волну — выбери пресет масса. Волн может быть несколько (одна за другой выедают общий пул).
        </div>

        <div
          v-for="(w, i) in wavesSummary" :key="w.waveId"
          class="wave-row" :class="{ 'wave-row--missing': w.missing, 'wave-row--selected': w.waveId === selectedWaveId }"
          @click="planStore.setSelectedWave(w.waveId)"
          :title="w.waveId === selectedWaveId ? 'Активная волна — её настройки и цели показаны' : 'Выбрать волну (переключить настройки и цели на неё)'"
        >
          <div class="wave-head">
            <span class="wave-idx">{{ i + 1 }}</span>
            <span class="wave-name">{{ w.name }}</span>
            <span v-if="w.waveId === selectedWaveId" class="wave-sel-tag">выбрана</span>
            <span class="wave-count">{{ w.count }} цел.</span>
            <span class="wave-move" @click.stop>
              <button class="wave-ctrl" title="Выше (раньше выедает пул)" :disabled="i === 0" @click="planStore.moveWave(w.waveId, -1)">↑</button>
              <button class="wave-ctrl" title="Ниже" :disabled="i === wavesSummary.length - 1" @click="planStore.moveWave(w.waveId, 1)">↓</button>
              <button class="wave-ctrl wave-ctrl--del" title="Убрать волну (цели станут без волны)" @click="planStore.removeWave(w.waveId)">✕</button>
            </span>
          </div>
          <div v-if="w.slots.length" class="wave-chips">
            <span
              v-for="(c, ci) in w.slots" :key="ci"
              class="wave-chip"
              :style="{ color: c.color, borderColor: c.color + '66', background: c.color + '1a' }"
            >{{ c.label }} ×{{ c.count }}</span>
          </div>
        </div>

        <!-- Добавить волну (поэтапно: только когда у текущей волны есть цели) -->
        <div class="wave-add">
          <select v-model="newWaveConfigId" class="input wave-add-select" :disabled="!canAddWave">
            <option value="">+ Добавить волну…</option>
            <option v-for="c in massConfigStore.all" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="btn btn-primary btn-sm" :disabled="!newWaveConfigId || !canAddWave" @click="onAddWave">Добавить</button>
        </div>
        <div v-if="!canAddWave" class="wave-add-hint">Сначала добавь цели в текущую волну — потом можно создать следующую.</div>

        <div v-if="unassignedTargetCount > 0" class="waves-unassigned" title="Эти цели не привязаны к волне и не попадут в генерацию. Назначь им волну в «Цели».">
          ⚠ {{ unassignedTargetCount }} цел. без волны — не войдут в план
        </div>

        <RouterLink to="/mass-configs" class="wave-edit-link">Настроить конфиги →</RouterLink>
      </template>
    </section>

    <AIPlanPanel v-if="aiStore.mode === 'ai'" @generate="onGenerate" />

    <MassActivePanel />

    <!-- Generate -->
    <section class="panel generate-section">
      <div class="generate-main">
        <button
          :class="['btn', 'btn-primary', 'btn-generate', { 'btn-flash': justGenerated }]"
          :disabled="!canGenerate || isGenerating"
          :title="generateBlockReason ?? ''"
          @click="onGenerate"
        >Сгенерировать план</button>

        <div v-if="!canGenerate" class="generate-blocked">
          <span class="blocked-icon">⚠</span>
          <span>{{ generateBlockReason }}</span>
          <button v-if="needsDataRefresh" class="blocked-link blocked-btn" :disabled="refreshing" @click="refreshGameData">
            {{ refreshing ? 'Загрузка...' : 'Обновить игровые данные' }}
          </button>
          <span v-if="refreshError" class="refresh-error">{{ refreshError }}</span>
          <router-link v-for="link in generateBlockLinks" :key="link.to" :to="link.to" class="blocked-link">{{ link.label }}</router-link>
        </div>
      </div>

      <div v-if="showSpecialOffWarning" class="special-off-warning">
        <span class="warning-icon">⚠</span>
        <span class="warning-text">Есть неназначенные пал/пробои — задайте их в панели ниже.</span>
        <div class="warning-actions">
          <button class="btn btn-secondary btn-sm" @click="specialOffWarningDismissed = true; doGenerate()">Игнорировать</button>
          <button class="btn btn-primary btn-sm" @click="showSpecialOffWarning = false; palOffPanel?.expand()">Назначить</button>
        </div>
      </div>

      <div v-if="worldStore.settings.paladinMode === 'auto' && planStore.offDistribution === 'far_first' && !planStore.attacks.length && (planStore.offPoolStats.breachPal + planStore.offPoolStats.palOnly + planStore.offPoolStats.breachOnly) > 0" class="pal-dist-notice">
        <span class="blocked-icon">ℹ</span>
        <span>Пал-оффы и пробои в режиме «Дальние вперёд» распределяются по ближайшей дистанции — дальний порядок применяется только к обычным фулл-оффам.</span>
      </div>

      <div v-if="planStore.attacks.length > 0" class="generate-stat">
        Всего атак: <strong>{{ planStore.attacks.length }}</strong>
        &nbsp;·&nbsp; Активных: <strong>{{ activeAttackCount }}</strong>
        <span v-if="lastGeneratedAt" class="generate-ts">· обновлено {{ lastGeneratedAt }}</span>
      </div>

      <div v-if="planStore.attacks.length > 0" class="pool-stats">
        <span class="pool-item">
          Офы: <strong>{{ planStore.poolUsageStats.offsUsed }}</strong>/{{ planStore.poolUsageStats.offsTotal }}
        </span>
        <span class="pool-sep">·</span>
        <span class="pool-item">
          Дворы: <strong>{{ planStore.poolUsageStats.noblesUsed }}</strong>/{{ planStore.poolUsageStats.noblesTotal }}
        </span>
        <template v-if="palOffTotal > 0 || breachOffTotal > 0">
          <span class="pool-sep">·</span>
          <template v-if="palOffTotal > 0">
            <span class="pool-item pool-item--dim">
              Пал-оффы: <strong :class="palOffAssigned < palOffTotal ? 'stat-warn' : 'stat-ok'">{{ palOffAssigned }}</strong>/{{ palOffTotal }}
            </span>
          </template>
          <span v-if="palOffTotal > 0 && breachOffTotal > 0" class="pool-sep">·</span>
          <template v-if="breachOffTotal > 0">
            <span class="pool-item pool-item--dim">
              Пробои: <strong :class="breachOffAssigned < breachOffTotal ? 'stat-warn' : 'stat-ok'">{{ breachOffAssigned }}</strong>/{{ breachOffTotal }}
            </span>
          </template>
        </template>
        <template v-if="planStore.poolUsageStats.reservedOffCount > 0">
          <span class="pool-sep">·</span>
          <span class="pool-reserved">Резерв: {{ planStore.poolUsageStats.reservedOffCount }}</span>
        </template>
        <template v-if="planStore.poolUsageStats.catSquadsTotal > 0">
          <span class="pool-sep">·</span>
          <span class="pool-item">
            Каты: <strong>{{ planStore.poolUsageStats.catSquadsUsed }}</strong>/{{ planStore.poolUsageStats.catSquadsTotal }}
          </span>
        </template>
        <template v-if="shortageTargetCount > 0">
          <span class="pool-sep">·</span>
          <span class="pool-shortage" :title="'Основной масс: цели, для которых не хватило войск. Подробности — в результатах по деревням.'">⚠ {{ shortageTargetCount }} цел. не покрыто (осн.)</span>
        </template>
      </div>

      <!-- Неиспользованные коры — отдельный блок с копированием координат -->
      <div
        v-if="planStore.attacks.length > 0 && (planStore.poolUsageStats.offsAvailable > 0 || planStore.poolUsageStats.catSquadsLeft > 0)"
        class="pool-unused-block"
      >
        <div class="pool-unused-head">
          <span class="pool-unused-title">Не задействованы в плане</span>
          <span class="pool-unused-hint">нажми на строку — скопируются коры этих деревень</span>
        </div>
        <div class="pool-unused-rows">
          <button
            v-if="planStore.poolUsageStats.offsAvailable > 0"
            type="button"
            class="pool-unused pool-copy"
            :title="unusedOffTooltip"
            @click="copyCoords(planStore.poolUsageStats.unusedOffCoords, 'off')"
          >
            {{ planStore.poolUsageStats.offsAvailable }} офов не в плане
            <span class="pool-copy-icon">{{ copiedPool === 'off' ? '✓ скопировано' : '⧉ коры' }}</span>
          </button>
          <button
            v-if="planStore.poolUsageStats.catSquadsLeft > 0"
            type="button"
            class="pool-unused pool-copy"
            :title="unusedCatTooltip"
            @click="copyCoords(planStore.poolUsageStats.unusedCatCoords, 'cat')"
          >
            {{ planStore.poolUsageStats.catSquadsLeft }} кат не в плане
            <span class="pool-copy-icon">{{ copiedPool === 'cat' ? '✓ скопировано' : '⧉ коры' }}</span>
          </button>
        </div>
      </div>
    </section>

    <PalOffPanel v-if="worldStore.settings.paladinMode === 'manual'" ref="palOffPanel" />
    </aside>

    <main class="planner-main">
    <WatchtowerTable v-if="worldStore.settings.watchtowerEnabled && planStore.planWaves.some(w => w.settings.watchtowerAvoidEnabled)" />
    <TargetsTable />

    <AttackResultsPanel ref="resultsPanel" />
    </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlanStore } from '@/stores/planStore'
import { useAIPlanStore } from '@/stores/aiPlanStore'
import { useWorldStore } from '@/stores/worldStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useMassConfigStore } from '@/stores/massConfigStore'
import { usePresetsStore, defaultColorForRole } from '@/stores/presetsStore'
import MassActivePanel from '@/components/MassActivePanel.vue'
import TargetsTable from '@/components/TargetsTable.vue'
import PalOffPanel from '@/components/PalOffPanel.vue'
import WatchtowerTable from '@/components/WatchtowerTable.vue'
import AttackResultsPanel from '@/components/AttackResultsPanel.vue'
import AIPlanPanel from '@/components/AIPlanPanel.vue'

const planStore = usePlanStore()
const showHelp = ref(false)   // инструкция свёрнута по умолчанию
const aiStore = useAIPlanStore()
const worldStore = useWorldStore()
const enemyStore = useEnemyDataStore()
const massConfigStore = useMassConfigStore()
const presetsStore = usePresetsStore()

// Waves = mass-configs actually used by targets (active first), with counts.
// Явный список волн плана (из planStore.planWaves). Порядок = приоритет выедания пула.
const wavesSummary = computed(() => {
  const single = planStore.planWaves.length === 1
  const countByWave = new Map<string, number>()
  if (single) {
    // Одна волна — все цели принадлежат ей.
    countByWave.set(planStore.planWaves[0].id, planStore.targets.length)
  } else {
    for (const t of planStore.targets) {
      if (!t.waveId) continue
      countByWave.set(t.waveId, (countByWave.get(t.waveId) ?? 0) + 1)
    }
  }
  return planStore.planWaves.map(w => {
    const cfg = massConfigStore.all.find(c => c.id === w.configId)
    const slots = (cfg?.slots ?? []).filter(s => s.enabled).map(s => {
      const p = presetsStore.all.find(pp => pp.id === s.presetId)
      const color = p?.color ?? (p ? defaultColorForRole(p.role.type, p.role) : '#8a8aa0')
      return { label: p?.name ?? '—', count: s.count, color }
    })
    return {
      waveId: w.id, configId: w.configId, name: cfg?.name ?? '(конфиг удалён)',
      missing: !cfg, slots, count: countByWave.get(w.id) ?? 0,
    }
  })
})
// Цели без волны (не попадут в генерацию). При одной волне все цели принадлежат ей → 0.
const unassignedTargetCount = computed(() => {
  if (planStore.planWaves.length <= 1) return 0
  return planStore.targets.filter(t => !t.waveId || !planStore.planWaves.some(w => w.id === t.waveId)).length
})
// Поэтапно: новую волну можно добавить, только если у текущей последней волны есть цели.
const lastWaveTargetCount = computed(() => {
  const waves = planStore.planWaves
  if (!waves.length) return 0
  if (waves.length === 1) return planStore.targets.length   // одна волна — все цели её
  const last = waves[waves.length - 1]
  return planStore.targets.filter(t => t.waveId === last.id).length
})
const canAddWave = computed(() => planStore.planWaves.length === 0 || lastWaveTargetCount.value > 0)

// Выбранная волна (с фолбэком на первую) — для подсветки.
const selectedWaveId = computed(() => planStore.selectedWaveId ?? planStore.planWaves[0]?.id ?? null)

const newWaveConfigId = ref('')
function onAddWave(): void {
  if (!newWaveConfigId.value || !canAddWave.value) return
  planStore.addWave(newWaveConfigId.value)
  newWaveConfigId.value = ''
}
const resultsPanel   = ref<InstanceType<typeof AttackResultsPanel> | null>(null)
const palOffPanel    = ref<InstanceType<typeof PalOffPanel> | null>(null)
const isGenerating   = ref(false)

const activeAttackCount = computed(() => planStore.attacks.filter((a) => !a.excluded).length)
const shortageTargetCount = computed(() => new Set(planStore.generationIssues.map(i => i.targetCoords)).size)

function buildUnusedTooltip(s: { noSlots: number; nightExcluded: number; earliestExcluded: number }, fallback: string): string {
  const parts: string[] = []
  if (s.noSlots > 0)          parts.push(`${s.noSlots} — все цели уже покрыты`)
  if (s.nightExcluded > 0)    parts.push(`${s.nightExcluded} — ночной режим`)
  if (s.earliestExcluded > 0) parts.push(`${s.earliestExcluded} — ранний старт`)
  return parts.length ? parts.join('\n') : fallback
}
const unusedOffTooltip = computed(() => buildUnusedTooltip(planStore.unusedOffStats, 'Оффы не распределены по целям') + '\nКлик — скопировать координаты')
const unusedCatTooltip = computed(() => buildUnusedTooltip(planStore.unusedCatStats, 'Каты не распределены по кат-целям') + '\nКлик — скопировать координаты')

// Copy coords of villages left out of the plan.
const copiedPool = ref('')
async function copyCoords(list: string[], key: string): Promise<void> {
  if (!list.length) return
  try {
    await navigator.clipboard.writeText(list.join(' '))
    copiedPool.value = key
    setTimeout(() => { if (copiedPool.value === key) copiedPool.value = '' }, 1500)
  } catch { /* clipboard unavailable */ }
}

const palOffTotal    = computed(() => planStore.offPoolStats.breachPal + planStore.offPoolStats.palOnly)
const breachOffTotal = computed(() => planStore.offPoolStats.breachPal + planStore.offPoolStats.breachOnly)
const palOffAssigned = computed(() => {
  if (worldStore.settings.paladinMode === 'auto')
    return planStore.attacks.filter(a => a.type === 'paladin_off').length
  return planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0)
})
const breachOffAssigned = computed(() => {
  if (worldStore.settings.paladinMode === 'auto')
    return planStore.attacks.filter(a => a.label?.includes('+Пробой')).length
  return planStore.targets.reduce((s, t) => s + (t.breachOffCount ?? 0), 0)
})

const activeWaveCount = computed(() =>
  planStore.planWaves.filter(w => massConfigStore.all.some(c => c.id === w.configId)).length)

const generateBlockLinks = computed<Array<{ to: string; label: string }>>(() => {
  const links: Array<{ to: string; label: string }> = []
  if (!worldStore.settings.worldCode) links.push({ to: '/settings', label: 'Настройки мира →' })
  if (massConfigStore.all.length === 0) links.push({ to: '/mass-configs', label: 'Конфигуратор масса →' })
  return links
})

const generateBlockReason = computed<string | null>(() => {
  const missing: string[] = []
  if (!worldStore.settings.worldCode) missing.push('настройки мира')
  if (!enemyStore.hasVillageData)      missing.push('village.txt')
  if (activeWaveCount.value === 0)     missing.push('хотя бы одна волна плана')
  if (missing.length === 0) return null
  return `Не хватает: ${missing.join(', ')}`
})

const needsDataRefresh = computed(() => !!worldStore.settings.worldCode && !enemyStore.hasVillageData)
const refreshing   = ref(false)
const refreshError = ref('')

async function refreshGameData(): Promise<void> {
  const code = worldStore.settings.worldCode
  if (!code) return
  refreshing.value = true
  refreshError.value = ''
  try {
    const base = `/game-proxy/${code}/map`
    const [vRes, pRes, aRes] = await Promise.all([
      fetch(`${base}/village.txt.gz`),
      fetch(`${base}/player.txt.gz`),
      fetch(`${base}/ally.txt.gz`),
    ])
    if (!vRes.ok) throw new Error(`village.txt: HTTP ${vRes.status}`)
    if (!pRes.ok) throw new Error(`player.txt: HTTP ${pRes.status}`)
    if (!aRes.ok) throw new Error(`ally.txt: HTTP ${aRes.status}`)
    const [vBlob, pBlob, aBlob] = await Promise.all([vRes.blob(), pRes.blob(), aRes.blob()])
    await Promise.all([
      enemyStore.loadVillageFile(new File([vBlob], 'village.txt.gz')),
      enemyStore.loadPlayerFile(new File([pBlob], 'player.txt.gz')),
      enemyStore.loadAllyFile(new File([aBlob], 'ally.txt.gz')),
    ])
    planStore.resolveAllFromMap()
  } catch (err) {
    refreshError.value = err instanceof Error ? err.message : String(err)
  } finally {
    refreshing.value = false
  }
}

const canGenerate = computed(() => generateBlockReason.value === null)

const lastGeneratedAt = ref<string>('')
const justGenerated   = ref(false)
const showSpecialOffWarning    = ref(false)
const specialOffWarningDismissed = ref(false)
const importError = ref<string>('')

const unassignedSpecialOffs = computed(() => {
  if (worldStore.settings.paladinMode === 'auto') return false
  if (worldStore.settings.paladinMode === 'none') return false
  const pool = planStore.offPoolStats
  if (pool.breachPal + pool.palOnly + pool.breachOnly === 0) return false
  const totalPal    = planStore.targets.reduce((s, t) => s + (t.palOffCount ?? 0), 0)
  const totalBreach = planStore.targets.reduce((s, t) => s + (t.breachOffCount ?? 0), 0)
  return (pool.breachPal + pool.palOnly > 0 && totalPal === 0) ||
         (pool.breachPal + pool.breachOnly > 0 && totalBreach === 0)
})

async function onImportPlan(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importError.value = ''
  try {
    await planStore.importPlan(file)
    resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
  } catch (err: any) {
    importError.value = err?.message ?? 'Ошибка импорта'
  }
  ;(e.target as HTMLInputElement).value = ''
}

async function doGenerate(): Promise<void> {
  if (isGenerating.value) return
  showSpecialOffWarning.value = false
  isGenerating.value = true
  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, 30))
  planStore.resolveAllFromMap()
  planStore.generate()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
  const now = new Date()
  lastGeneratedAt.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  justGenerated.value = true
  specialOffWarningDismissed.value = false
  isGenerating.value = false
  setTimeout(() => { justGenerated.value = false }, 600)
}


function onGenerate(): void {
  if (!canGenerate.value) return
  if (unassignedSpecialOffs.value && !specialOffWarningDismissed.value) {
    showSpecialOffWarning.value = true
    return
  }
  doGenerate()
}
</script>

<style lang="scss" scoped>
.planner-view {
  max-width: 1600px;
  margin: 0 auto;
}

// ── Инструкция ───────────────────────────────────────────────────────────────
.help-box {
  border: 1px solid $border;
  border-radius: 8px;
  background: a($bg-page, 0.4);
  margin-bottom: 1.25rem;
  overflow: hidden;
}
.help-toggle {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  background: none; border: none; color: $text;
  font-size: 0.95rem; font-weight: 600; padding: 0.7rem 1rem; cursor: pointer;
  &:hover { color: $accent; }
  .help-caret { color: $text-dim; font-size: 0.8rem; }
}
.help-content {
  padding: 0.25rem 1.1rem 1rem;
  font-size: 0.86rem; line-height: 1.6; color: $text-dim;
  border-top: 1px solid a($border, 0.7);
  b { color: $text; } i { color: $text; font-style: italic; }
  code { background: a($accent, 0.12); color: $accent; padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.82em; }
  h4 { color: $text; font-size: 0.9rem; margin: 1rem 0 0.4rem; padding-top: 0.6rem; border-top: 1px dashed a($border, 0.5); }
  p { margin: 0.5rem 0; }
  ul { margin: 0.4rem 0; padding-left: 1.2rem; li { margin-bottom: 0.4rem; } }
  .help-note { font-size: 0.82rem; font-style: italic; opacity: .9; border-top: 1px solid a($border, 0.5); padding-top: 0.6rem; margin-top: 0.8rem; }
}

.planner-layout {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
}

.planner-sidebar {
  width: 400px;
  flex-shrink: 0;
  position: sticky;
  top: 0.75rem;
  align-self: flex-start;
  max-height: calc(100vh - 66px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.35rem;

  // panels stack tightly in the rail
  :deep(.panel) { margin-bottom: 0.9rem; padding: 1rem; }
  .generate-section { gap: 0.9rem; }

  // Compact the mass-active panel for the narrow rail
  :deep(.active-mass-panel) {
    display: flex; flex-direction: column; gap: 0.7rem;

    .panel-row { margin: 0; }
    .row-spacer, .v-sep, .v-sep-tall { display: none !important; }

    .panel-row-main {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.45rem;
      .section-label { width: 100%; margin: 0; }
      .active-chips { width: 100%; display: flex; flex-wrap: wrap; gap: 0.3rem; }
      .time-label { width: 100%; margin-top: 0.15rem; }
      .arrival-input { flex: 1 1 150px; min-width: 0; }
      .btn-sm { margin-left: auto; }
    }

    .panel-row-opts {
      display: flex; flex-wrap: wrap; gap: 0.35rem;
      .toggle-btn { flex: 0 0 auto; }
      .earliest-input, .front-dist-input { flex: 1 1 100%; }
    }

    .panel-row-selects {
      display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0.45rem 0.6rem;
      .opts-label { margin: 0; }
      .dist-select { width: 100%; }
    }
  }
}

.planner-main {
  flex: 1;
  min-width: 0;
}

@media (max-width: 1180px) {
  .planner-layout { flex-direction: column; }
  .planner-sidebar {
    width: 100%; position: static; max-height: none; overflow: visible; padding-right: 0;
  }
}

.waves-summary {
  .section-label { display: block; margin-bottom: 0.5rem; }
  .wave-row {
    padding: 0.4rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    &:hover { background: a($accent, 0.05); }
  }
  .wave-row--selected { background: a($green, 0.08); border-color: a($green, 0.4); }
  .wave-sel-tag {
    font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
    color: $green; background: a($green, 0.16); border-radius: 999px; padding: 0.05rem 0.4rem;
  }
  .wave-head {
    display: flex; align-items: center; gap: 0.5rem; width: 100%;
    font-size: 0.85rem; color: inherit;
  }
  .wave-idx {
    width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(233, 69, 96, 0.15); color: $accent; border-radius: 4px; font-size: 0.72rem; font-weight: 700;
  }
  .wave-name { color: $text; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wave-active-tag {
    font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
    color: $green; background: a($green, 0.14); border-radius: 999px; padding: 0.05rem 0.4rem;
  }
  .wave-count { margin-left: auto; color: $text-dim; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .wave-move { display: inline-flex; gap: 0.15rem; flex-shrink: 0; }
  .wave-ctrl {
    width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
    background: a($border, 0.6); border: 1px solid $border; color: $text-dim; border-radius: 4px;
    cursor: pointer; font-size: 0.7rem; line-height: 1;
    &:hover:not(:disabled) { border-color: $accent; color: $text; }
    &:disabled { opacity: 0.3; cursor: not-allowed; }
    &.wave-ctrl--del:hover:not(:disabled) { border-color: $accent; color: $accent; }
  }
  .wave-row--missing { opacity: 0.6; .wave-name { color: $accent; font-style: italic; } }
  .wave-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem; padding-left: 26px; }
  .wave-chip {
    font-size: 0.72rem; font-weight: 600; border: 1px solid; border-radius: 999px; padding: 0.05rem 0.45rem;
  }
  .wave-add { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
  .wave-add-select { flex: 1; min-width: 0; }
  .wave-add-hint { margin-top: 0.3rem; font-size: 0.74rem; color: $text-faint; line-height: 1.3; }
  .waves-hint { font-size: 0.8rem; color: $text-dim; line-height: 1.35; margin-bottom: 0.4rem; }
  .waves-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
  .waves-empty-text { margin: 0; font-size: 0.82rem; color: $text-dim; line-height: 1.4; }
  .waves-empty-btn { text-decoration: none; }
  .waves-unassigned { margin-top: 0.5rem; font-size: 0.78rem; color: $orange; font-weight: 600; cursor: default; }
  .wave-edit-link { display: inline-block; margin-top: 0.5rem; font-size: 0.8rem; color: $accent; text-decoration: none; &:hover { text-decoration: underline; } }
}

.generate-section {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.generate-main {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-generate {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 170px;
  justify-content: center;
}

.plan-file-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.plan-import-label {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.plan-import-input {
  display: none;
}

.import-error {
  font-size: 0.8rem;
  color: $orange;
}

.generate-blocked {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: $text-dim;
}

.blocked-icon { color: $orange; }

.blocked-link {
  color: $accent;
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
}

.blocked-btn {
  background: none;
  border: 1px solid a($accent, 0.4);
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  font-size: 0.82rem;
  transition: border-color 0.15s;
  &:hover:not(:disabled) { border-color: $accent; text-decoration: none; }
  &:disabled { opacity: 0.55; cursor: default; }
}

.refresh-error {
  color: $accent;
  font-size: 0.8rem;
}

.generate-stat {
  color: $text-dim;
  font-size: 0.95rem;

  strong { color: $text; }
}

.generate-ts {
  color: $text-faint;
  font-size: 0.82rem;
  margin-left: 0.2rem;
}

.pool-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  color: $text-dim;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 0.35rem;

  strong { color: $text; }
}

.pool-item  { display: flex; align-items: center; gap: 0.25rem; }
.pool-item--dim { font-size: 0.82rem; color: $text-faint; strong { color: $text-dim; } }
.pool-sep   { color: $text-faint; }
.pool-unused    { color: $orange; font-weight: 600; }
.pool-copy      {
  cursor: pointer; border-radius: 4px; padding: 0 0.15rem;
  &:hover { background: rgba(245, 166, 35, 0.12); }
  .pool-copy-icon { font-size: 0.85em; opacity: 0.7; margin-left: 0.15rem; }
}
.pool-reserved  { color: #c8a020; font-weight: 600; }

/* Отдельный блок неиспользованных кор */
.pool-unused-block {
  margin-top: 0.6rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgba(245, 166, 35, 0.35);
  border-radius: 8px;
  background: rgba(245, 166, 35, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.pool-unused-head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.pool-unused-title { font-size: 0.82rem; font-weight: 700; color: $orange; }
.pool-unused-hint  { font-size: 0.74rem; color: $text-faint; line-height: 1.25; }
.pool-unused-rows  { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pool-unused-rows .pool-copy {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font: inherit; color: $orange; font-weight: 600;
  background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.3);
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  &:hover { background: rgba(245, 166, 35, 0.2); }
  .pool-copy-icon { opacity: 0.85; font-weight: 500; }
}
.pool-shortage  { color: #e94560; font-weight: 700; cursor: default; }

.stat-ok   { color: $green !important; }
.stat-warn { color: $orange !important; }

.special-off-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: a($orange, 0.08);
  border: 1px solid a($orange, 0.3);
  font-size: 0.85rem;

  .warning-icon { color: $orange; flex-shrink: 0; }
  .warning-text { flex: 1; color: $text-dim; }
  .warning-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
}

.pal-dist-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: $text-faint;
  width: 100%;
}

.pool-stats-special {
  font-size: 0.82rem;
  color: $text-faint;
  strong { color: $text-dim; }
}

@keyframes btn-flash {
  0%   { box-shadow: 0 0 0 0 rgba(78, 204, 163, 0.7); }
  60%  { box-shadow: 0 0 0 8px rgba(78, 204, 163, 0); }
  100% { box-shadow: 0 0 0 0 rgba(78, 204, 163, 0); }
}

.btn-flash {
  animation: btn-flash 0.6s ease-out;
}

.mode-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem;
  margin-bottom: 0;
}

.btn-io {
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  line-height: 1;
  font-weight: 600;
  white-space: nowrap;
}

.mode-bar-spacer {
  flex: 1;
}

.mode-btn {
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 6px;
  color: $text-dim;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.3rem 1rem;
  transition: border-color 0.15s, color 0.15s;

  &:hover { border-color: $accent; color: $text; }
  &.active { border-color: $accent; color: $accent; background: rgba(100, 80, 200, 0.08); }
  &:disabled { opacity: 0.4; cursor: not-allowed; &:hover { border-color: $border; color: $text-dim; } }
}

// ── Generation overlay ─────────────────────────────────────────────────────
.gen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 16, 32, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.gen-overlay-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  background: #101828;
  border: 1px solid rgba(100, 80, 200, 0.3);
  border-radius: 14px;
  padding: 2.5rem 3.5rem;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

@keyframes gen-spin { to { transform: rotate(360deg) } }
.gen-overlay-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(255,255,255,0.12);
  border-top-color: #6450c8;
  border-radius: 50%;
  animation: gen-spin 0.75s linear infinite;
}

.gen-overlay-text {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255,255,255,0.75);
  letter-spacing: 0.02em;
}

.gen-overlay-enter-active,
.gen-overlay-leave-active { transition: opacity 0.15s ease }
.gen-overlay-enter-from,
.gen-overlay-leave-to   { opacity: 0 }

.btn-generate { min-width: 170px; }
</style>
