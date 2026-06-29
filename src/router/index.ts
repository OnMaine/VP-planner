import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/WorldSettingsView.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
    },
    {
      path: '/planner',
      name: 'planner',
      component: () => import('@/views/PlannerView.vue'),
    },
    {
      path: '/presets',
      name: 'presets',
      component: () => import('@/views/PresetsView.vue'),
    },
    {
      path: '/mass-configs',
      name: 'mass-configs',
      component: () => import('@/views/MassConfigsView.vue'),
    },
  ],
})

export default router
