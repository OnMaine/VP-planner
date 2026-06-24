<template>
  <div class="planner-view">
    <h1>Планер атак</h1>

    <MassConfigPanel />
    <EnemyMapPanel />
    <TargetsTable />
    <SpamNobleTargetsTable />
    <WatchtowerTable />
    <PalOffPanel />

    <!-- Generate -->
    <section class="panel generate-section">
      <button class="btn btn-primary btn-generate" @click="onGenerate">Сгенерировать план</button>
      <div v-if="planStore.attacks.length > 0" class="generate-stat">
        Всего атак: <strong>{{ planStore.attacks.length }}</strong>
        &nbsp;·&nbsp; Активных: <strong>{{ activeAttackCount }}</strong>
      </div>
    </section>

    <AttackResultsPanel ref="resultsPanel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import MassConfigPanel from '@/components/MassConfigPanel.vue'
import EnemyMapPanel from '@/components/EnemyMapPanel.vue'
import TargetsTable from '@/components/TargetsTable.vue'
import SpamNobleTargetsTable from '@/components/SpamNobleTargetsTable.vue'
import WatchtowerTable from '@/components/WatchtowerTable.vue'
import PalOffPanel from '@/components/PalOffPanel.vue'
import AttackResultsPanel from '@/components/AttackResultsPanel.vue'

const planStore = usePlanStore()
const resultsPanel = ref<InstanceType<typeof AttackResultsPanel> | null>(null)

const activeAttackCount = computed(() => planStore.attacks.filter((a) => !a.excluded).length)

function onGenerate(): void {
  planStore.generate()
  resultsPanel.value?.expandAll(planStore.attacksByPlayer.keys())
}
</script>

<style lang="scss" scoped>
.planner-view {
  max-width: 1300px;
  margin: 0 auto;
}

.generate-section {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.generate-stat {
  color: $text-dim;
  font-size: 0.95rem;

  strong { color: $text; }
}
</style>
