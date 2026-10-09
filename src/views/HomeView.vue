<template>
  <div class="home">
    <span class="app-version" :title="`Собрано: ${buildTime}`">v{{ appVersion }}</span>

    <div class="hero">
      <h1>VP Attack Planner</h1>
      <p class="subtitle">Планер массовых атак для игры Война Племён</p>
    </div>

    <!-- ── Последовательность работы ─────────────────────────────────────── -->
    <section class="guide-section">
      <h2 class="guide-title">Последовательность работы</h2>
      <div class="flow">
        <RouterLink to="/settings" class="flow-step">
          <span class="flow-num">1</span>
          <div class="flow-body">
            <h3>Настройки мира</h3>
            <p>Код мира, скорости юнитов, ночной бонус, размер карты, макс. ход дворян, мин. размер атаки. Основа всех расчётов таймингов.</p>
          </div>
        </RouterLink>

        <RouterLink to="/import" class="flow-step">
          <span class="flow-num">2</span>
          <div class="flow-body">
            <h3>Импорт войск</h3>
            <p>Загрузи CSV/XLSX с войсками своих деревень (пул, из которого раздаются атаки). Можно оставить только выбранные координаты.</p>
          </div>
        </RouterLink>

        <RouterLink to="/presets" class="flow-step">
          <span class="flow-num">3</span>
          <div class="flow-body">
            <h3>Пресеты войск</h3>
            <p>Типы атак: фулка оффа, Full_OFF, паравоз (офф + дворяне), кастомный состав, Time_SPAM (фейк). Задают, что именно летит.</p>
          </div>
        </RouterLink>

        <RouterLink to="/mass-configs" class="flow-step">
          <span class="flow-num">4</span>
          <div class="flow-body">
            <h3>Пресеты масса</h3>
            <p>Собери масс-конфиг из слотов: пресет × кол-во на цель, приоритет заполнения пула, смещение тайминга. Внутри — своя инструкция.</p>
          </div>
        </RouterLink>

        <RouterLink to="/planner" class="flow-step">
          <span class="flow-num">5</span>
          <div class="flow-body">
            <h3>Планер</h3>
            <p>Добавь цели, выбери масс-конфиг, задай время прихода — и сгенерируй план. Результаты по деревням/игрокам, вкладка «Проблемные» с причинами нехватки, экспорт BBCode.</p>
          </div>
        </RouterLink>

        <RouterLink to="/attack-map" class="flow-step">
          <span class="flow-num">6</span>
          <div class="flow-body">
            <h3>Карта атак</h3>
            <p>Визуализация готового плана: откуда → куда, засветы башен, фильтры по игроку/врагу, копирование координат источников.</p>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- ── Карты и анализ врага ──────────────────────────────────────────── -->
    <section class="guide-section">
      <h2 class="guide-title">Карты и анализ врага</h2>
      <div class="ref-grid">
        <RouterLink to="/world-map" class="ref-card">
          <h3>Карта мира</h3>
          <p>Все деревни мира, раскрашенные по племенам. Общий обзор театра действий.</p>
        </RouterLink>
        <RouterLink to="/def-map" class="ref-card">
          <h3>Карта дефа</h3>
          <p>Вражеский деф из выгрузки: где и сколько обороны, пустые деры (цели для масса), сравнение выгрузок.</p>
        </RouterLink>
        <RouterLink to="/def-analytics" class="ref-card">
          <h3>Аналитика</h3>
          <p>Разбор дефа по игрокам, доноры дефа, хабы поддержки, диффы между выгрузками.</p>
        </RouterLink>
        <RouterLink to="/attack-scout" class="ref-card">
          <h3>Засветы</h3>
          <p>Анализатор засвеченных атак врага: откуда били (красные/коричневые засветы), по кому, и где он держит офф-резервы.</p>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

const appVersion = __APP_VERSION__
const buildTime = new Date(__BUILD_TIME__).toLocaleString('ru-RU')
</script>

<style lang="scss" scoped>
.home {
  position: relative;
  max-width: 1000px;
  margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
}

.app-version {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: $text-md;
  opacity: 0.5;
  font-family: monospace;
  cursor: default;
}

// ── Hero ────────────────────────────────────────────────────────────────────
.hero {
  text-align: center;
  margin-bottom: 2.5rem;
  position: relative;

  &::after {
    content: '';
    display: block;
    width: 80px; height: 2px;
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
}
.subtitle {
  color: $text-dim;
  font-size: 1rem;
  margin: 0;
}

// ── Sections ─────────────────────────────────────────────────────────────────
.guide-section { margin-bottom: 2.5rem; }
.guide-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: $text;
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid $border;
}

// ── Flow (numbered steps) ────────────────────────────────────────────────────
.flow {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.flow-step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: $bg-panel;
  border: 1px solid $border;
  border-left: 3px solid $accent;
  border-radius: 8px;
  padding: 0.85rem 1.1rem;
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s, border-color 0.15s, background 0.15s;

  &:hover {
    transform: translateX(3px);
    border-color: $accent;
    background: a($accent, 0.05);
  }

  .flow-num {
    flex-shrink: 0;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: a($accent, 0.15);
    color: $accent;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .flow-body {
    h3 { font-size: 0.98rem; font-weight: 600; color: $text; margin: 0.15rem 0 0.25rem; }
    p  { font-size: 0.85rem; color: $text-dim; margin: 0; line-height: 1.55; }
  }
}

// ── Reference grid ───────────────────────────────────────────────────────────
.ref-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.ref-card {
  background: $bg-panel;
  border: 1px solid $border;
  border-radius: 8px;
  padding: 0.85rem 1.1rem;
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s, border-color 0.15s;

  &:hover { transform: translateY(-2px); border-color: #4ecca3; }

  h3 { font-size: 0.95rem; font-weight: 600; color: $text; margin: 0 0 0.3rem; }
  p  { font-size: 0.82rem; color: $text-dim; margin: 0; line-height: 1.5; }
}

@media (max-width: 640px) {
  .ref-grid { grid-template-columns: 1fr; }
}
</style>
