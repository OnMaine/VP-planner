<template>
  <section class="panel mass-comp-panel">
    <button class="collapse-toggle" @click="open = !open">
      <span>Состав масса</span>
      <span class="collapse-icon">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="comp-body mt">
      <p v-if="planStore.massSlots.length === 0" class="empty-hint">
        Пресеты не выбраны — добавьте один или несколько пресетов, чтобы сформировать состав атак на каждую цель.
      </p>

      <div class="slot-list">
        <div v-for="slot in planStore.massSlots" :key="slot.id" class="slot-row">
          <div class="slot-icons">
            <img
              v-for="(ico, i) in iconsForPreset(slot.presetId)"
              :key="i"
              :src="ico"
              class="slot-icon"
            />
          </div>
          <select
            class="input slot-select"
            :value="slot.presetId"
            @change="onPresetChange(slot.id, ($event.target as HTMLSelectElement).value)"
          >
            <optgroup label="Одиночные атаки">
              <option v-for="p in singlePresets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
            <optgroup label="Комбинированные пресеты">
              <option v-for="p in combinedPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
          </select>
          <button class="btn-remove" @click="planStore.removeMassSlot(slot.id)" title="Удалить">✕</button>
        </div>
      </div>

      <button class="btn btn-secondary btn-sm add-btn" @click="addSlot">+ Добавить пресет</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlanStore } from '@/stores/planStore'
import { usePresetsStore } from '@/stores/presetsStore'
import type { AttackPreset, VillageRole } from '@/stores/presetsStore'
import attackLarge  from '@/assets/images/attack_large.webp'
import attackMedium from '@/assets/images/attack_medium.webp'
import attackSmall  from '@/assets/images/attack_small.webp'
import catapultIcon from '@/assets/images/unit_catapult@2x.webp'
import snobIcon     from '@/assets/images/unit_snob.webp'
import knightIcon   from '@/assets/images/unit_knight.webp'
import ramIcon      from '@/assets/images/unit_ram@2x.webp'
import lightIcon    from '@/assets/images/unit_light@2x.webp'

const planStore = usePlanStore()
const presetsStore = usePresetsStore()
const open = ref(true)

const isCombined = (p: AttackPreset) => p.role.type === 'train' || p.combined
const singlePresets   = computed(() => presetsStore.all.filter(p => !isCombined(p)))
const combinedPresets = computed(() => presetsStore.all.filter(p => isCombined(p)))

function roleIcons(role: VillageRole): string[] {
  switch (role.type) {
    case 'full_off':   return role.nobleIncluded ? [attackLarge, snobIcon] : [attackLarge]
    case 'breach_off': return [attackLarge, ramIcon]
    case 'pal_off':    return [attackLarge, knightIcon]
    case 'half_off':   return [attackMedium]
    case 'green_off':  return [attackSmall, snobIcon]
    case 'cat_squad':  return [catapultIcon]
    case 'spike':      return [ramIcon, lightIcon]
    case 'train': {
      const attacks = role.trainAttacks ?? []
      const allGreen = attacks.length > 0 && attacks.every(a => a.type === 'green_off')
      const hasRed = attacks.some(a => a.type === 'full_off' || a.type === 'pal_off' || a.type === 'breach_off')
      return [allGreen ? attackSmall : hasRed ? attackLarge : attackMedium, snobIcon]
    }
    case 'split':      return [attackMedium, snobIcon]
    case 'spam': {
      const base = role.spamStrength === 'full' ? attackLarge : role.spamStrength === 'strong' ? attackMedium : attackSmall
      return (role.spamNobleCount ?? 0) > 0 ? [base, snobIcon] : [base]
    }
    default: return []
  }
}

function iconsForPreset(presetId: string): string[] {
  const preset = presetsStore.all.find(p => p.id === presetId)
  return preset ? roleIcons(preset.role) : []
}

function onPresetChange(slotId: string, presetId: string): void {
  planStore.updateMassSlot(slotId, { presetId })
}

function addSlot(): void {
  const firstPreset = singlePresets.value[0] ?? combinedPresets.value[0]
  if (firstPreset) planStore.addMassSlot(firstPreset.id)
}
</script>

<style lang="scss" scoped>
.mass-comp-panel {
  margin-bottom: 1rem;
}

.comp-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.empty-hint {
  color: $text-faint;
  font-size: 0.88rem;
  margin: 0;
  padding: 0.5rem 0;
}

.slot-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.slot-icons {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 42px;
}

.slot-icon {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  flex-shrink: 0;
}

.slot-select {
  flex: 1 1 200px;
  min-width: 180px;
}

.btn-remove {
  background: none;
  border: none;
  color: $text-faint;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: color 0.15s;
  flex-shrink: 0;

  &:hover { color: $accent; }
}

.add-btn {
  align-self: flex-start;
}
</style>
