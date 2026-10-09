<template>
  <div class="settings-view">
    <h1>Настройки мира</h1>

    <!-- ── Инструкция (сворачиваемая) ────────────────────────────────────── -->
    <section class="help-box">
      <button class="help-toggle" @click="showHelp = !showHelp">
        <span>📖 Инструкция</span>
        <span class="help-caret">{{ showHelp ? '▲' : '▼' }}</span>
      </button>
      <div v-if="showHelp" class="help-content">
        <p>
          Это <b>база всех расчётов</b>: по этим параметрам считаются время полёта, тайминги отправки и ограничения атак.
          Задай их <b>первым шагом</b> — лучше всего ввести <b>код мира</b> (напр. <code>ru100</code>) и нажать «Загрузить настройки»: подтянутся готовые значения.
        </p>

        <h4>Параметры мира</h4>
        <ul>
          <li><b>Мир</b> — код сервера (<code>ru100</code> и т.п.). Используется для ссылок в игру и загрузки данных карты.</li>
          <li><b>Скорость мира</b> / <b>Скорость юнитов</b> — множители скорости из настроек сервера. Прямо влияют на время полёта атак.</li>
          <li><b>Размер карты</b> — сторона мира (обычно 1000). Нужен для расчёта расстояний.</li>
          <li><b>Ночной бонус</b> — окно ночного бонуса (напр. 1:00–8:00). Используется опциями «Без ночных» в Планере.</li>
          <li><b>Макс. дальность двора</b> — на сколько клеток летит дворянин. Дальше этого паравоз/дворы не отправить — частая причина недобора на дальних целях.</li>
          <li><b>Разрыв паравоза</b> — минимальный интервал между дворянами в цепочке (мс).</li>
          <li><b>Мин. войск в атаке</b> — нижний порог размера атаки (фильтрует слишком мелкие).</li>
          <li><b>Сторожевая башня</b> — есть ли в мире башни наблюдения (включает учёт засветов в Планере и на Карте атак).</li>
        </ul>

        <h4>Время юнитов и усадьба</h4>
        <p>Плитки (копья, мечи, …, двор) — <b>базовое время хода</b> юнита (мин/клетка) и его <b>вес в усадьбе</b> (число внизу). Скорость атаки = по самому медленному юниту в составе. Эти значения подставляются из пресета мира, но их можно поправить вручную.</p>

        <h4>Игровые данные</h4>
        <p><b>village.txt / player.txt / ally.txt</b> — выгрузки мира (деревни, игроки, племена). Нужны для привязки координат к игрокам/племенам, ссылок в игру и раскраски карт. Кнопка «↓ Скачать с сервера» тянет их по коду мира. Хранятся только в памяти сессии (сбрасываются при перезагрузке).</p>

        <h4>Сохранение / загрузка</h4>
        <p><b>«Загрузить настройки»</b> — подставить готовый пресет по коду мира. Изменения сохраняются автоматически; статус отображается под формой.</p>
      </div>
    </section>

    <!-- Load settings + game data by world code — entry point, kept on top -->
    <section class="panel panel-load">
      <h2>Загрузить мир</h2>
      <p class="load-hint">
        Введи код мира и выбери источник:
      </p>
      <ul class="load-opts">
        <li><b>Из API</b> — тянет <b>актуальные</b> данные прямо с сервера мира: настройки (тайминги, скорости) <b>и</b> игровые данные (деревни, игроки, племена) одним кликом. Рекомендуется.</li>
        <li><b>Из пресета</b> — подставляет <b>заготовленные</b> значения мира в форму ручного ввода (разворачивает её ниже). Игровые данные не грузит. Нужно проверить и нажать «Сохранить». Используй, если API недоступен.</li>
        <li><b>Сбросить всё</b> — вернуть настройки к значениям по умолчанию и очистить игровые данные (чистый лист).</li>
      </ul>
      <div class="row">
        <input
          v-model="worldCodeInput"
          type="text"
          placeholder="Код мира, напр. ru100"
          class="input"
          @keydown.enter="doFetch"
        />
        <button class="btn btn-primary" :disabled="fetching" @click="doFetch">
          {{ fetching ? 'Загрузка…' : 'Из API' }}
        </button>
        <button class="btn btn-secondary" :disabled="!hasPreset" @click="doPreset" :title="hasPreset ? '' : 'Пресет для этого мира не найден'">
          Из пресета
        </button>
        <button class="btn btn-danger" title="Сбросить настройки мира к значениям по умолчанию и очистить игровые данные" @click="resetAll">
          Сбросить всё
        </button>
      </div>
      <div v-if="statusMsg" :class="['status-msg', statusClass]">{{ statusMsg }}</div>

      <div class="load-div" />

      <!-- Игровые данные (деревни/игроки/племена) — часть этого же блока -->
      <WorldMapPanel ref="mapPanel" class="nested-panel" />
    </section>

    <!-- Current settings summary (priority display) -->
    <section class="panel panel-summary">
      <h2>Текущие настройки</h2>
      <div v-if="worldStore.settings.worldCode" class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Мир</span>
          <span class="summary-value highlight">{{ worldStore.settings.worldCode }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Скорость мира</span>
          <span class="summary-value">×{{ worldStore.settings.worldSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Скорость юнитов</span>
          <span class="summary-value">×{{ worldStore.settings.unitSpeed }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Размер карты</span>
          <span class="summary-value">{{ worldStore.settings.mapSize }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Ночной бонус</span>
          <button
            :class="['summary-toggle', worldStore.settings.nightActive ? 'toggle-on' : 'toggle-off']"
            @click="worldStore.updateSettings({ nightActive: !worldStore.settings.nightActive })"
          >
            {{ worldStore.settings.nightActive
              ? `${worldStore.settings.nightFrom}:00 – ${worldStore.settings.nightTo}:00`
              : 'отключён' }}
          </button>
        </div>
        <div class="summary-item">
          <span class="summary-label">Макс. дальность двора</span>
          <span class="summary-value">{{ worldStore.settings.snobMaxDist }} клеток</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Разрыв паровоза</span>
          <span class="summary-value">{{ worldStore.settings.snobIntervalMs }} мс</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Мин. войск в атаке</span>
          <input
            type="number" min="1"
            class="summary-inline-input"
            :value="worldStore.settings.minAttackSize"
            @change="worldStore.updateSettings({ minAttackSize: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="summary-item">
          <span class="summary-label">Сторожевая башня</span>
          <button
            :class="['summary-toggle', worldStore.settings.watchtowerEnabled ? 'toggle-on' : 'toggle-off']"
            @click="worldStore.updateSettings({ watchtowerEnabled: !worldStore.settings.watchtowerEnabled })"
          >
            {{ worldStore.settings.watchtowerEnabled ? 'есть в игре' : 'отключена' }}
          </button>
        </div>
      </div>
      <div v-else class="no-settings">
        Мир не настроен — загрузите через API или пресет ниже
      </div>

      <div class="unit-times-row" v-if="worldStore.settings.worldCode">
        <span v-for="(label, key) in UNIT_LABELS" :key="key" class="unit-chip">
          <img :src="UNIT_ICONS[key]" class="unit-chip-img" :alt="label" />
          <span class="unit-chip-name">{{ label }}</span>
          <span class="unit-chip-val">{{ Math.round(worldStore.settings.unitTimes[key] / 60) }}<span class="unit-chip-unit">мин</span></span>
          <span class="unit-chip-pop"><span class="pop-icon-sprite" :style="{ backgroundImage: `url(${headerSprite})` }"></span>{{ worldStore.settings.unitPop[key] }}</span>
        </span>
      </div>
    </section>

    <!-- Manual settings (collapsible) -->
    <section ref="manualSection" class="panel">
      <button class="manual-toggle" @click="showManual = !showManual">
        <span>Ручной ввод</span>
        <span class="manual-caret">{{ showManual ? '▲' : '▼' }}</span>
      </button>
      <div v-if="showManual" class="collapse-body">
        <div class="form-grid mt">
          <label>
            Код мира
            <input v-model="form.worldCode" type="text" class="input" />
          </label>
          <label>
            Скорость мира
            <input v-model.number="form.worldSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Скорость юнитов
            <input v-model.number="form.unitSpeed" type="number" min="0.1" step="0.1" class="input" />
          </label>
          <label>
            Размер карты
            <input v-model.number="form.mapSize" type="number" min="100" class="input" />
          </label>
          <label>
            Макс. дальность двора (клеток)
            <input v-model.number="form.snobMaxDist" type="number" min="1" class="input" />
          </label>
          <label>
            Разрыв паровоза (мс)
            <input v-model.number="form.snobIntervalMs" type="number" min="0" step="50" class="input" />
          </label>
          <label class="checkbox-label">
            <input v-model="form.watchtowerEnabled" type="checkbox" />
            Сторожевая башня есть в игре
          </label>
          <label class="checkbox-label">
            <input v-model="form.nightActive" type="checkbox" />
            Ночной бонус активен
          </label>
          <label>
            Ночь от (часов)
            <input v-model.number="form.nightFrom" type="number" min="0" max="23" class="input" />
          </label>
          <label>
            Ночь до (часов)
            <input v-model.number="form.nightTo" type="number" min="0" max="23" class="input" />
          </label>
        </div>

        <h3>Время юнитов (минут/клетку)</h3>
        <div class="form-grid">
          <label v-for="(label, key) in UNIT_LABELS" :key="key">
            <span class="unit-form-label">
              <img :src="UNIT_ICONS[key]" class="unit-icon-sm" :alt="label" />{{ label }}
            </span>
            <input v-model.number="form.unitTimesMin[key]" type="number" min="1" class="input" />
          </label>
        </div>

        <h3>Усадьба юнитов (мест/юнит)</h3>
        <div class="form-grid">
          <label v-for="(label, key) in UNIT_LABELS" :key="key">
            <span class="unit-form-label">
              <img :src="UNIT_ICONS[key]" class="unit-icon-sm" :alt="label" />{{ label }}
            </span>
            <input v-model.number="form.unitPop[key]" type="number" min="1" class="input" />
          </label>
        </div>

        <button class="btn btn-primary mt" @click="saveManual">Сохранить</button>
        <div v-if="savedMsg" class="status-msg status-ok">{{ savedMsg }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, nextTick } from 'vue'
import { useWorldStore } from '@/stores/worldStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { KNOWN_WORLDS } from '@/stores/worldStore'
import type { UnitTimes, UnitPop } from '@/stores/worldStore'
import { UNIT_ICONS } from '@/utils/unitIcons'
import headerSprite from '@/assets/images/header.webp'
import WorldMapPanel from '@/components/WorldMapPanel.vue'

const enemyStore = useEnemyDataStore()
const mapPanel = ref<InstanceType<typeof WorldMapPanel> | null>(null)
const manualSection = ref<HTMLElement | null>(null)
const showManual = ref(false)   // ручной ввод свёрнут по умолчанию

const worldStore = useWorldStore()

const showHelp = ref(false)   // инструкция свёрнута по умолчанию
const worldCodeInput = ref(worldStore.settings.worldCode || '')
const fetching = ref(false)
const statusMsg = ref('')
const statusClass = ref('')
const savedMsg = ref('')


const hasPreset = computed(() => Boolean(worldCodeInput.value && KNOWN_WORLDS[worldCodeInput.value.trim()]))

const UNIT_LABELS: Record<keyof UnitTimes, string> = {
  spear: 'Копья',
  sword: 'Мечи',
  axe: 'Топоры',
  spy: 'Лазы',
  light: 'ЛК',
  heavy: 'ТК',
  ram: 'Тараны',
  catapult: 'Каты',
  knight: 'Пал',
  snob: 'Двор',
}

const form = reactive({
  worldCode: worldStore.settings.worldCode,
  worldSpeed: worldStore.settings.worldSpeed,
  unitSpeed: worldStore.settings.unitSpeed,
  mapSize: worldStore.settings.mapSize,
  nightActive: worldStore.settings.nightActive,
  nightFrom: worldStore.settings.nightFrom,
  nightTo: worldStore.settings.nightTo,
  snobMaxDist: worldStore.settings.snobMaxDist,
  snobIntervalMs: worldStore.settings.snobIntervalMs,
  watchtowerEnabled: worldStore.settings.watchtowerEnabled,
  unitTimesMin: Object.fromEntries(
    Object.entries(worldStore.settings.unitTimes).map(([k, v]) => [k, Math.round(v / 60)])
  ) as unknown as UnitTimes,
  unitPop: { ...worldStore.settings.unitPop } as UnitPop,
})

function secToMin(times: UnitTimes): UnitTimes {
  return Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v / 60)])) as unknown as UnitTimes
}

watch(
  () => worldStore.settings,
  (s) => {
    form.worldCode = s.worldCode
    form.worldSpeed = s.worldSpeed
    form.unitSpeed = s.unitSpeed
    form.mapSize = s.mapSize
    form.nightActive = s.nightActive
    form.nightFrom = s.nightFrom
    form.nightTo = s.nightTo
    form.snobMaxDist = s.snobMaxDist
    form.snobIntervalMs = s.snobIntervalMs
    form.watchtowerEnabled = s.watchtowerEnabled
    Object.assign(form.unitTimesMin, secToMin(s.unitTimes))
    Object.assign(form.unitPop, s.unitPop)
  },
  { deep: true },
)

async function doFetch() {
  const code = worldCodeInput.value.trim()
  if (!code) {
    statusMsg.value = 'Введите код мира'
    statusClass.value = 'status-err'
    return
  }
  fetching.value = true
  statusMsg.value = ''
  try {
    await worldStore.fetchFromApi(code)
    // Тем же кликом тянем игровые данные (деревни/игроки/племена).
    statusMsg.value = `Настройки загружены, тяну игровые данные…`
    statusClass.value = 'status-ok'
    try {
      await mapPanel.value?.autoLoad()
      statusMsg.value = `Настройки и данные мира "${code}" загружены`
    } catch {
      statusMsg.value = `Настройки для "${code}" загружены, но игровые данные не подтянулись — скачай вручную ниже`
      statusClass.value = 'status-warn'
    }
  } catch (err) {
    statusMsg.value = `Ошибка: ${err instanceof Error ? err.message : String(err)}. Попробуйте пресет или ручной ввод.`
    statusClass.value = 'status-err'
  } finally {
    fetching.value = false
  }
}

function doPreset() {
  const code = worldCodeInput.value.trim()
  const preset = KNOWN_WORLDS[code]
  if (!preset) {
    statusMsg.value = `Пресет для "${code}" не найден`
    statusClass.value = 'status-err'
    return
  }
  // Грузим значения пресета в форму ручного ввода (НЕ применяем сразу) —
  // пользователь проверяет и жмёт «Сохранить» внутри формы.
  form.worldCode = preset.worldCode ?? code
  if (preset.worldSpeed        !== undefined) form.worldSpeed        = preset.worldSpeed
  if (preset.unitSpeed         !== undefined) form.unitSpeed         = preset.unitSpeed
  if (preset.mapSize           !== undefined) form.mapSize           = preset.mapSize
  if (preset.nightActive       !== undefined) form.nightActive       = preset.nightActive
  if (preset.nightFrom         !== undefined) form.nightFrom         = preset.nightFrom
  if (preset.nightTo           !== undefined) form.nightTo           = preset.nightTo
  if (preset.snobMaxDist       !== undefined) form.snobMaxDist       = preset.snobMaxDist
  if (preset.snobIntervalMs    !== undefined) form.snobIntervalMs    = preset.snobIntervalMs
  if (preset.watchtowerEnabled !== undefined) form.watchtowerEnabled = preset.watchtowerEnabled
  if (preset.unitTimes) Object.assign(form.unitTimesMin, secToMin(preset.unitTimes))
  if (preset.unitPop)   Object.assign(form.unitPop, preset.unitPop)

  statusMsg.value = `Пресет "${code}" загружен в форму — проверь и нажми «Сохранить»`
  statusClass.value = 'status-ok'

  // Развернуть ручной ввод и проскроллить к нему
  showManual.value = true
  nextTick(() => {
    manualSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function resetAll() {
  if (!confirm('Сбросить все настройки мира к значениям по умолчанию и очистить игровые данные (деревни/игроки/племена)? Это начнёт с чистого листа.')) return
  worldStore.reset()
  enemyStore.clearAll()
  worldCodeInput.value = ''
  statusMsg.value = 'Всё сброшено к значениям по умолчанию'
  statusClass.value = 'status-ok'
}

function saveManual() {
  worldStore.updateSettings({
    worldCode: form.worldCode,
    worldSpeed: form.worldSpeed,
    unitSpeed: form.unitSpeed,
    mapSize: form.mapSize,
    nightActive: form.nightActive,
    nightFrom: form.nightFrom,
    nightTo: form.nightTo,
    snobMaxDist: form.snobMaxDist,
    snobIntervalMs: form.snobIntervalMs,
    watchtowerEnabled: form.watchtowerEnabled,
    unitTimes: Object.fromEntries(
      Object.entries(form.unitTimesMin).map(([k, v]) => [k, v * 60])
    ) as unknown as UnitTimes,
    unitPop: { ...form.unitPop },
  })
  savedMsg.value = 'Сохранено!'
  setTimeout(() => { savedMsg.value = '' }, 2000)
}
</script>

<style lang="scss" scoped>
.settings-view {
  max-width: 900px;
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
  b { color: $text; }
  code { background: a($accent, 0.12); color: $accent; padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.82em; }
  h4 { color: $text; font-size: 0.9rem; margin: 1rem 0 0.4rem; padding-top: 0.6rem; border-top: 1px dashed a($border, 0.5); }
  p { margin: 0.5rem 0; }
  ul { margin: 0.4rem 0; padding-left: 1.2rem; li { margin-bottom: 0.4rem; } }
}

// Panel accent override
.panel-summary { border-color: $accent; }
.panel-load { border-color: a($accent, 0.5); }
.load-hint { color: $text-dim; font-size: 0.85rem; margin: 0 0 0.5rem; }
.load-opts {
  margin: 0 0 0.9rem; padding-left: 1.1rem; color: $text-dim; font-size: 0.83rem; line-height: 1.55;
  li { margin-bottom: 0.3rem; } b { color: $text; }
}

// Summary block
.summary-grid { display: flex; flex-wrap: wrap; gap: 1rem 2rem; margin-bottom: 1rem; }

.summary-item { display: flex; flex-direction: column; gap: 0.2rem; }

.summary-label {
  font-size: 0.75rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-value {
  font-size: 1rem;
  font-weight: 600;
  color: $text;
  &.highlight { color: $accent; font-size: 1.15rem; }
}

.summary-toggle {
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;

  &.toggle-on  { color: $orange; background: a($orange, 0.1); border-color: a($orange, 0.4); }
  &.toggle-off { color: #555570; background: a(#555570, 0.08); border-color: a(#555570, 0.25);
    &:hover { border-color: $accent; color: $text-dim; }
  }
}

.summary-inline-input {
  width: 72px;
  padding: 0.2rem 0.4rem;
  font-size: 1rem;
  font-weight: 600;
  color: $text;
  background: $bg-page;
  border: 1px solid $border;
  border-radius: 4px;
  text-align: center;
  &:focus { outline: none; border-color: $accent; }
}

.text-ok  { color: $orange; }
.text-dim { color: #555570; }

.no-settings { color: $text-faint; font-style: italic; font-size: 0.9rem; }

// Unit chips
.unit-times-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.unit-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.15rem;
  background: a($accent, 0.06);
  border: 1px solid a($accent, 0.15);
  border-radius: 8px;
  padding: 0.5rem 0.6rem 0.4rem;
  min-width: 64px;
  transition: border-color 0.15s;

  &:hover { border-color: a($accent, 0.35); }
}

.unit-chip-img  {
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
  margin-bottom: 0.1rem;
}

.unit-chip-name {
  font-size: 0.65rem;
  color: $text-faint;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.unit-chip-val {
  font-size: 1rem;
  color: $text;
  font-weight: 700;
  line-height: 1;
}

.unit-chip-unit {
  font-size: 0.65rem;
  font-weight: 400;
  color: $text-dim;
  margin-left: 1px;
}

.unit-chip-pop {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  color: $text-dim;
  background: a($border, 0.6);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  margin-top: 0.1rem;
  min-width: 32px;
  justify-content: center;
}

.pop-icon-sprite {
  display: inline-block;
  width: 18px;
  height: 18px;
  background-repeat: no-repeat;
  background-position: -72px 0;
  background-size: auto 18px;
  flex-shrink: 0;
}

.unit-form-label { display: inline-flex; align-items: center; gap: 5px; }
.unit-icon-sm    { width: 16px; height: 16px; image-rendering: pixelated; }

// Fetch row
.row {
  display: flex; gap: 0.75rem; align-items: stretch;
  .input { flex: 1; min-width: 0; }
  .btn { white-space: nowrap; flex-shrink: 0; }
}

// Collapse body
.collapse-body { margin-top: 1rem; border-top: 1px solid $border; padding-top: 1rem; }

// Form
.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: $text-dim;
}

.checkbox-label { flex-direction: row; align-items: center; gap: 0.5rem; color: $text; font-size: 0.9rem; }

// Wider padding for this view's inputs
.input { padding: 0.4rem 0.6rem; font-size: 0.9rem; width: 100%; }

// Disabled state
.btn:disabled { opacity: 0.4; cursor: default; }
.btn-primary:hover:not(:disabled)  { opacity: 0.85; }
.btn-secondary:hover:not(:disabled) { opacity: 0.85; }

// status-msg margin override (shared uses margin-bottom, here we need margin-top)
.status-msg { margin-top: 0.75rem; margin-bottom: 0; }

// status-ok is unique to this view
.status-ok { background: rgba(0, 200, 100, 0.15); color: $green; }
.status-warn { background: rgba(250, 179, 50, 0.14); color: #fab387; }

// Разделитель и сброс вложенной панели «Игровые данные» внутри блока загрузки
.load-div { height: 1px; background: $border; margin: 1.25rem 0; }
.panel-load {
  :deep(.nested-panel) {
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    border-radius: 0;
  }
}

// Тумблер ручного ввода
.manual-toggle {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  background: none; border: none; color: $text;
  font-size: 1rem; font-weight: 600; padding: 0; cursor: pointer;
  &:hover { color: $accent; }
  .manual-caret { color: $text-dim; font-size: 0.8rem; }
}
</style>
