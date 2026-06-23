<template>
  <div class="home">
    <h1>VP Attack Planner</h1>
    <p class="subtitle">Планер масових атак для гри Війна Племен</p>
    <div class="cards">
      <RouterLink to="/attack-planner" class="card">
        <span class="card-icon">⚔️</span>
        <h2>Планер атак</h2>
        <p>Створюй та організовуй масові атаки з точним таймінгом</p>
      </RouterLink>
      <RouterLink to="/villages" class="card">
        <span class="card-icon">🏰</span>
        <h2>Племена / Гравці</h2>
        <p>Керуй списком цілей та своїх сіл</p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
  padding-top: 3rem;
}

h1 {
  font-size: 2.5rem;
  color: #e94560;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #a0a0b0;
  font-size: 1.1rem;
  margin-bottom: 3rem;
}

.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.card {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 12px;
  padding: 2rem;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, transform 0.2s;
  display: block;
}

.card:hover {
  border-color: #e94560;
  transform: translateY(-2px);
}

.card-icon {
  font-size: 2.5rem;
}

.card h2 {
  color: #e0e0e0;
  margin: 0.75rem 0 0.5rem;
}

.card p {
  color: #a0a0b0;
  font-size: 0.9rem;
  margin: 0;
}
</style>
