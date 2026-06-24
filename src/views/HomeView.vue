<template>
  <div class="home">
    <h1>VP Attack Planner</h1>
    <p class="subtitle">Планер масових атак для гри Війна Племен</p>
    <div class="cards">
      <RouterLink to="/settings" class="card">
        <span class="card-icon">🌍</span>
        <h2>Налаштування світу</h2>
        <p>Вкажи код світу, швидкості та параметри нічного бонусу</p>
      </RouterLink>
      <RouterLink to="/import" class="card">
        <span class="card-icon">📋</span>
        <h2>Імпорт військ</h2>
        <p>Завантаж CSV з військами гравців племені</p>
      </RouterLink>
      <RouterLink to="/planner" class="card">
        <span class="card-icon">⚔️</span>
        <h2>Планер атак</h2>
        <p>Створюй масові атаки з точним таймінгом</p>
      </RouterLink>
      <RouterLink to="/presets" class="card">
        <span class="card-icon">📁</span>
        <h2>Пресети атак</h2>
        <p>Збережені конфігурації для швидкого застосування</p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style lang="scss" scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
  padding-top: 3rem;
}

h1 {
  font-size: 2.5rem;
  color: $accent;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: $text-dim;
  font-size: 1.1rem;
  margin-bottom: 3rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.5rem;
}

.card {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 12px;
  padding: 2rem;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, transform 0.2s;
  display: block;

  &:hover { border-color: $accent; transform: translateY(-2px); }

  h2 { color: $text; margin: 0.75rem 0 0.5rem; }
  p  { color: $text-dim; font-size: 0.9rem; margin: 0; }
}

.card-icon { font-size: 2.5rem; }
</style>
