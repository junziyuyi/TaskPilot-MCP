import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { TOKEN_KEY } from './session'
import './styles.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue') },
    { path: '/', component: () => import('./views/BoardView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const authed = Boolean(sessionStorage.getItem(TOKEN_KEY))
  if (to.path !== '/login' && !authed) return '/login'
  if (to.path === '/login' && authed) return '/'
  return true
})

createApp(App).use(router).mount('#app')
