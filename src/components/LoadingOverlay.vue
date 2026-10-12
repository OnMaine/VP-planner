<template>
  <Transition name="lo-overlay">
    <div v-if="show" class="lo-overlay">
      <div class="lo-overlay-box">
        <div class="lo-overlay-spinner"></div>
        <span class="lo-overlay-text">{{ text || 'Обработка…' }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ show: boolean; text?: string }>()
</script>

<style lang="scss" scoped>
.lo-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 16, 32, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.lo-overlay-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  background: #101828;
  border: 1px solid rgba(100, 80, 200, 0.3);
  border-radius: 14px;
  padding: 2.5rem 3.5rem;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
@keyframes lo-spin { to { transform: rotate(360deg) } }
.lo-overlay-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(255, 255, 255, 0.12);
  border-top-color: #6450c8;
  border-radius: 50%;
  animation: lo-spin 0.75s linear infinite;
}
.lo-overlay-text {
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  letter-spacing: 0.02em;
}
.lo-overlay-enter-active,
.lo-overlay-leave-active { transition: opacity 0.15s ease }
.lo-overlay-enter-from,
.lo-overlay-leave-to { opacity: 0 }
</style>
