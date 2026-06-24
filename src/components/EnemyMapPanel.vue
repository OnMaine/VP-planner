<template>
  <section class="panel panel--compact">
    <button class="collapse-toggle" @click="open = !open">
      <span>
        Карта врага
        <span v-if="enemyStore.hasVillageData" class="tower-count-badge">
          {{ enemyStore.villages.length.toLocaleString() }} деревень
        </span>
        <span v-if="enemyStore.hasPlayerData" class="tower-count-badge">
          {{ enemyStore.players.length.toLocaleString() }} игроков
        </span>
        <span v-if="enemyStore.hasAllyData" class="tower-count-badge">
          {{ enemyStore.allies.length.toLocaleString() }} племён
        </span>
      </span>
      <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="mt">
      <p class="bulk-hint">
        Загрузи <code>village.txt</code> или <code>village.txt.gz</code> и <code>player.txt[.gz]</code> —
        полученные с <code>{world}.voynaplemyon.com/map/</code>. Данные хранятся только в памяти сессии.
      </p>
      <div class="map-upload-row">
        <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasVillageData }">
          <span>{{ enemyStore.hasVillageData ? `village.txt (${enemyStore.villages.length.toLocaleString()})` : 'village.txt[.gz]' }}</span>
          <input type="file" accept=".txt,.gz" class="hidden-input" @change="onVillageFile" />
        </label>
        <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат village.txt<br><code>id,name,x,y,player_id,points,type</code><br>Получить: <code>{world}.voynaplemyon.com/map/village.txt</code></span></span>
        <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasPlayerData }" style="margin-left:0.75rem">
          <span>{{ enemyStore.hasPlayerData ? `player.txt (${enemyStore.players.length.toLocaleString()})` : 'player.txt[.gz]' }}</span>
          <input type="file" accept=".txt,.gz" class="hidden-input" @change="onPlayerFile" />
        </label>
        <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат player.txt<br><code>id,name,ally_id,villages,points,rank</code><br>Получить: <code>{world}.voynaplemyon.com/map/player.txt</code></span></span>
        <label class="map-upload-btn" :class="{ 'map-btn--loaded': enemyStore.hasAllyData }" style="margin-left:0.75rem">
          <span>{{ enemyStore.hasAllyData ? `ally.txt (${enemyStore.allies.length.toLocaleString()})` : 'ally.txt[.gz]' }}</span>
          <input type="file" accept=".txt,.gz" class="hidden-input" @change="onAllyFile" />
        </label>
        <span class="fmt-tip">ⓘ<span class="fmt-tip-body">Формат ally.txt<br><code>id,name,tag,members,villages,points,rank</code><br>Получить: <code>{world}.voynaplemyon.com/map/ally.txt</code></span></span>
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
        <span v-if="!enemyStore.hasPlayerData || !enemyStore.hasAllyData" class="muted-text">
          ({{ [!enemyStore.hasPlayerData ? 'player.txt' : '', !enemyStore.hasAllyData ? 'ally.txt' : ''].filter(Boolean).join(', ') }} не загружено)
        </span>
      </div>

      <div v-if="enemyStore.loading" class="muted-text">Загрузка...</div>
      <div v-if="enemyStore.loadError" class="status-msg status-err">{{ enemyStore.loadError }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { useEnemyDataStore } from '@/stores/enemyDataStore'

const planStore = usePlanStore()
const enemyStore = useEnemyDataStore()

const open = ref(false)
const resolveCount = ref<number | null>(null)

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
  let count = 0
  for (const t of planStore.targets) {
    const info = enemyStore.lookupCoords(t.coords)
    if (!info?.player && !info?.ally) continue
    const patch: Parameters<typeof planStore.updateTarget>[1] = {}
    if (info.player) patch.enemyPlayer = info.player.name
    if (info.ally) patch.enemyAllyTag = info.ally.tag
    planStore.updateTarget(t.id, patch)
    const tower = planStore.watchtowerVillages.find((w) => w.coords === t.coords)
    if (tower && info.player) planStore.updateWatchtowerVillage(tower.id, { player: info.player.name })
    count++
  }
  for (const wt of planStore.watchtowerVillages) {
    const info = enemyStore.lookupCoords(wt.coords)
    if (!info?.player) continue
    if (!planStore.targets.find((t) => t.coords === wt.coords)) {
      planStore.updateWatchtowerVillage(wt.id, { player: info.player.name })
      count++
    }
  }
  resolveCount.value = count
}
</script>

<style lang="scss" scoped>
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
