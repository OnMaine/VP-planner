<template>
  <section class="panel panel--compact">
    <h2 class="panel-title">
      Игровые данные
      <span v-if="enemyStore.hasVillageData" class="tower-count-badge">{{ enemyStore.villages.length.toLocaleString() }} деревень</span>
      <span v-if="enemyStore.hasPlayerData"  class="tower-count-badge">{{ enemyStore.players.length.toLocaleString() }} игроков</span>
      <span v-if="enemyStore.hasAllyData"    class="tower-count-badge">{{ enemyStore.allies.length.toLocaleString() }} племён</span>
    </h2>

    <p class="bulk-hint">
      Данные по деревням, игрокам и племенам мира. Нужны для генерации ссылок атак и привязки деревень к игрокам.
      Источник: <code>{{ worldCode() }}.voynaplemyon.com/map/</code>. Хранятся только в памяти сессии.
    </p>

    <div class="map-auto-row">
      <button class="btn btn-primary btn-sm" :disabled="autoLoading || !worldStore.settings.worldCode" :title="!worldStore.settings.worldCode ? 'Укажи код мира в настройках' : ''" @click="autoLoad">
        {{ autoLoading ? 'Загрузка...' : '↓ Скачать с сервера' }}
      </button>
      <span v-if="autoLoadMsg" :class="['auto-load-msg', autoLoadOk ? 'msg-ok' : 'msg-err']">{{ autoLoadMsg }}</span>
    </div>

    <div class="map-upload-row">
      <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasVillageData }">
        <span>{{ enemyStore.hasVillageData ? `village.txt (${enemyStore.villages.length.toLocaleString()})` : 'village.txt[.gz]' }}</span>
        <input type="file" accept=".txt,.gz" class="hidden-input" @change="onVillageFile" />
      </label>
      <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат village.txt<br><code>id,name,x,y,player_id,points,type</code><br>Получить: <code>{{ worldCode() }}.voynaplemyon.com/map/village.txt</code></span></span>

      <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasPlayerData }" style="margin-left:0.75rem">
        <span>{{ enemyStore.hasPlayerData ? `player.txt (${enemyStore.players.length.toLocaleString()})` : 'player.txt[.gz]' }}</span>
        <input type="file" accept=".txt,.gz" class="hidden-input" @change="onPlayerFile" />
      </label>
      <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат player.txt<br><code>id,name,ally_id,villages,points,rank</code><br>Получить: <code>{{ worldCode() }}.voynaplemyon.com/map/player.txt</code></span></span>

      <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasAllyData }" style="margin-left:0.75rem">
        <span>{{ enemyStore.hasAllyData ? `ally.txt (${enemyStore.allies.length.toLocaleString()})` : 'ally.txt[.gz]' }}</span>
        <input type="file" accept=".txt,.gz" class="hidden-input" @change="onAllyFile" />
      </label>
      <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат ally.txt<br><code>id,name,tag,members,villages,points,rank</code><br>Получить: <code>{{ worldCode() }}.voynaplemyon.com/map/ally.txt</code></span></span>

      <button
        v-if="enemyStore.hasVillageData || enemyStore.hasPlayerData || enemyStore.hasAllyData"
        class="btn btn-danger btn-sm"
        @click="enemyStore.clearAll()"
      >Очистить</button>
    </div>

    <div
      v-if="enemyStore.hasVillageData && (planStore.targets.length > 0 || planStore.watchtowerVillages.length > 0)"
      class="mt"
      style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap"
    >
      <button class="btn btn-secondary" @click="resolveAllFromMap">Подтянуть игроков из файла</button>
      <span v-if="resolveCount !== null && resolveCount > 0" class="muted-text">Обновлено: {{ resolveCount }}</span>
      <span v-if="resolveCount === 0" class="status-msg status-warn" style="margin:0">
        Ничего не обновлено — для имён игроков нужен player.txt
      </span>
    </div>

    <div v-if="enemyStore.loading" class="muted-text mt">Загрузка...</div>
    <div v-if="enemyStore.loadError" class="status-msg status-err">{{ enemyStore.loadError }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'
import { useWorldStore } from '@/stores/worldStore'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()
const worldStore = useWorldStore()
const worldCode = () => worldStore.settings.worldCode || '{world}'

const resolveCount = ref<number | null>(null)
const autoLoading = ref(false)
const autoLoadMsg = ref('')
const autoLoadOk = ref(true)

async function fetchMapFile(name: string): Promise<File> {
  const url = `/game-proxy/${worldCode()}/map/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type })
}

async function autoLoad(): Promise<void> {
  if (!worldStore.settings.worldCode) {
    autoLoadMsg.value = 'Сначала укажи код мира в настройках'
    autoLoadOk.value = false
    return
  }
  autoLoading.value = true
  autoLoadMsg.value = ''
  try {
    const [vf, pf, af] = await Promise.all([
      fetchMapFile('village.txt.gz'),
      fetchMapFile('player.txt.gz'),
      fetchMapFile('ally.txt.gz'),
    ])
    await Promise.all([
      enemyStore.loadVillageFile(vf),
      enemyStore.loadPlayerFile(pf),
      enemyStore.loadAllyFile(af),
    ])
    autoLoadMsg.value = `Загружено: ${enemyStore.villages.length.toLocaleString()} деревень`
    autoLoadOk.value = true
  } catch (err) {
    autoLoadMsg.value = err instanceof Error ? err.message : String(err)
    autoLoadOk.value = false
  } finally {
    autoLoading.value = false
  }
}

async function onVillageFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await enemyStore.loadVillageFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

async function onPlayerFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await enemyStore.loadPlayerFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

async function onAllyFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await enemyStore.loadAllyFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

function resolveAllFromMap(): void {
  resolveCount.value = planStore.resolveAllFromMap()
}
</script>

<style lang="scss" scoped>
.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: $text;
  margin: 0 0 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.map-auto-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.auto-load-msg {
  font-size: 0.82rem;
  &.msg-ok  { color: $green; }
  &.msg-err { color: #e05050; }
}

.map-upload-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.map-upload-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 1rem;
  background: $bg-page;
  border: 1px dashed $border;
  border-radius: 4px;
  color: $text-dim;
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;

  &:hover { border-color: $accent; color: $text; }
}

.map-btn--loaded { border-style: solid; border-color: $green; color: $green; }
</style>
