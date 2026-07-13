<template>
  <div class="home">
    <div class="hero">
      <h1>VP Attack Planner</h1>
      <p class="subtitle">Планер массовых атак для игры Война Племён</p>
    </div>

    <div class="cards">
      <RouterLink to="/settings" class="card" style="--card-accent: #4ecca3">
        <div class="card-step">01</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
        </svg>
        <div class="card-body">
          <h2>Настройки мира</h2>
          <p>Код мира, скорости, ночной бонус, усадьба юнитов</p>
        </div>
      </RouterLink>

      <RouterLink to="/import" class="card" style="--card-accent: #a78bfa">
        <div class="card-step">02</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h16M4 10h16M4 14h10"/><path d="M16 18l2 2 4-4"/>
        </svg>
        <div class="card-body">
          <h2>Импорт войск</h2>
          <p>Загрузи CSV с войсками игроков племени</p>
        </div>
      </RouterLink>

      <RouterLink to="/presets" class="card" style="--card-accent: #f5a623">
        <div class="card-step">03</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <div class="card-body">
          <h2>Пресеты войск</h2>
          <p>Настрой типы атак: офф, кастомный состав, спам</p>
        </div>
      </RouterLink>

      <RouterLink to="/mass-configs" class="card" style="--card-accent: #e94560">
        <div class="card-step">04</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
        </svg>
        <div class="card-body">
          <h2>Конфигуратор масса</h2>
          <p>Слоты атак, кол-во на цель, тайминг</p>
        </div>
      </RouterLink>

      <RouterLink to="/planner" class="card" style="--card-accent: #e94560">
        <div class="card-step">05</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 19V5m0 0-7 7m7-7 7 7"/>
        </svg>
        <div class="card-body">
          <h2>Планер атак</h2>
          <p>Создавай массовые атаки с точным таймингом</p>
        </div>
      </RouterLink>

      <RouterLink to="/attack-map" class="card" style="--card-accent: #4ecca3">
        <div class="card-step">06</div>
        <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z"/><path d="M9 3v14m6-10v14"/>
        </svg>
        <div class="card-body">
          <h2>Карта атак</h2>
          <p>Визуализация плана на карте мира</p>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style lang="scss" scoped>
.home {
  max-width: 900px;
  margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
}

// ── Hero ────────────────────────────────────────────────────────────────────

.hero {
  text-align: center;
  margin-bottom: 3rem;
  position: relative;

  &::after {
    content: '';
    display: block;
    width: 80px;
    height: 2px;
    background: $accent;
    margin: 1.25rem auto 0;
    border-radius: 2px;
  }
}

h1 {
  font-size: 2.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: $text;
  margin: 0 0 0.5rem;

  // subtle red gradient on first word
  span {
    color: $accent;
  }
}

.subtitle {
  color: $text-dim;
  font-size: 1rem;
  margin: 0;
}

// ── Cards grid ───────────────────────────────────────────────────────────────

.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
}

.card {
  position: relative;
  background: $bg-panel;
  border: 1px solid $border;
  border-top: 2px solid var(--card-accent);
  border-radius: 10px;
  padding: 1.25rem 1.25rem 1.4rem;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    border-color: var(--card-accent);
    border-top-color: var(--card-accent);
  }
}

.card-step {
  position: absolute;
  top: 0.75rem;
  right: 0.9rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--card-accent);
  opacity: 0.5;
}

.card-icon {
  width: 36px;
  height: 36px;
  color: var(--card-accent);
  opacity: 0.85;
  flex-shrink: 0;
}

.card-body {
  h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: $text;
    margin: 0 0 0.3rem;
  }

  p {
    font-size: 0.82rem;
    color: $text-dim;
    margin: 0;
    line-height: 1.45;
  }
}
</style>
