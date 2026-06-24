<template>
  <section class="panel">
    <button class="collapse-toggle" @click="open = !open">
      <span>Настройки масса</span>
      <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="config-body mt">

      <fieldset class="config-group">
        <legend>Оффы</legend>
        <div class="form-row">
          <label>Обычных оффов на цель</label>
          <input type="number" class="input" style="width:80px" min="0"
            :value="store.massConfig.regularOffsPerTarget"
            @change="store.updateMassConfig({ regularOffsPerTarget: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-row form-row--check">
          <label>
            <input type="checkbox" :checked="store.massConfig.splitOff"
              @change="store.updateMassConfig({ splitOff: ($event.target as HTMLInputElement).checked })" />
            Сплитовать офф
          </label>
        </div>
      </fieldset>

      <fieldset class="config-group">
        <legend>Дворяне</legend>
        <div class="form-row">
          <label>Размер паровоза</label>
          <input type="number" class="input" style="width:80px" min="1"
            :value="store.massConfig.nobleTrainSize"
            @change="store.updateMassConfig({ nobleTrainSize: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-row">
          <label>Отступ после оффа (мс)</label>
          <input type="number" class="input" style="width:100px" min="0" step="100"
            :value="store.massConfig.offsetAfterOffMs"
            @change="store.updateMassConfig({ offsetAfterOffMs: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-row">
          <label>Макс двор/деревня</label>
          <input type="number" class="input" style="width:80px" min="1"
            :value="store.massConfig.maxNoblesPerVillage"
            @change="store.updateMassConfig({ maxNoblesPerVillage: +($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-row">
          <label>Эскортный юнит</label>
          <select class="input select-input" :value="store.massConfig.nobleComposition.escortUnit"
            @change="onEscortUnitChange(($event.target as HTMLSelectElement).value)">
            <option value="light">ЛК</option>
            <option value="axe">Топоры</option>
            <option value="sword">Мечи</option>
            <option value="spear">Копья</option>
          </select>
        </div>
        <div class="form-row">
          <label title="noble_green_strong: noble + 999 эскорта">Зелёный сильный (999) %</label>
          <input type="number" class="input" style="width:80px" min="0" max="100"
            :value="store.massConfig.nobleComposition.greenStrongPct"
            @change="onNobleCompositionChange('greenStrongPct', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="form-row">
          <label title="noble_green_weak: noble + ~50 эскорта">Зелёный слабый (~50) %</label>
          <input type="number" class="input" style="width:80px" min="0" max="100"
            :value="store.massConfig.nobleComposition.greenWeakPct"
            @change="onNobleCompositionChange('greenWeakPct', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="form-row">
          <label title="noble_orange: noble + 1001-5000 юнитов">Серый (1001–5000) %</label>
          <input type="number" class="input" style="width:80px" min="0" max="100"
            :value="store.massConfig.nobleComposition.orangePct"
            @change="onNobleCompositionChange('orangePct', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="form-row">
          <label title="noble_red: noble + full off (5001+)">Красный (5001+) %</label>
          <input type="number" class="input" style="width:80px" min="0" max="100"
            :value="store.massConfig.nobleComposition.redPct"
            @change="onNobleCompositionChange('redPct', +($event.target as HTMLInputElement).value)" />
        </div>
      </fieldset>

      <fieldset class="config-group">
        <legend>Спамы</legend>
        <div class="form-row form-row--check">
          <label>
            <input type="checkbox" :checked="store.massConfig.useSpamAttacks"
              @change="store.updateMassConfig({ useSpamAttacks: ($event.target as HTMLInputElement).checked })" />
            Использовать спам-атаки
          </label>
        </div>
        <div v-if="store.massConfig.useSpamAttacks" class="form-row">
          <label>Спамов на цель</label>
          <input type="number" class="input" style="width:80px" min="0"
            :value="store.massConfig.spamCountPerTarget"
            @change="store.updateMassConfig({ spamCountPerTarget: +($event.target as HTMLInputElement).value })" />
        </div>
        <div class="form-row form-row--check">
          <label>
            <input type="checkbox" :checked="store.massConfig.useSpamNobles"
              @change="store.updateMassConfig({ useSpamNobles: ($event.target as HTMLInputElement).checked })" />
            Использовать спам-дворы
          </label>
        </div>
        <div v-if="store.massConfig.useSpamNobles" class="form-row">
          <label>Спам-дворов на цель</label>
          <input type="number" class="input" style="width:80px" min="0"
            :value="store.massConfig.spamNobleCountPerTarget"
            @change="store.updateMassConfig({ spamNobleCountPerTarget: +($event.target as HTMLInputElement).value })" />
        </div>
      </fieldset>

    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePlanStore } from '@/stores/planStore'

const store = usePlanStore()
const open = ref(true)

function onEscortUnitChange(val: string): void {
  const unit = val as 'light' | 'axe' | 'sword' | 'spear'
  store.updateMassConfig({ nobleComposition: { ...store.massConfig.nobleComposition, escortUnit: unit } })
}

function onNobleCompositionChange(
  key: 'greenStrongPct' | 'greenWeakPct' | 'orangePct' | 'redPct',
  val: number,
): void {
  store.updateMassConfig({ nobleComposition: { ...store.massConfig.nobleComposition, [key]: val } })
}
</script>
