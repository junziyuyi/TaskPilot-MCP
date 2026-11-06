<template>
  <main class="grid min-h-full lg:grid-cols-[minmax(320px,440px)_1fr]">
    <section class="flex flex-col justify-center px-8 py-12 sm:px-12">
      <p class="font-mono text-sm text-copper">TaskPilot</p>
      <h1 class="mt-3 max-w-sm text-4xl font-medium leading-tight">当前项目的任务、时间和依赖。</h1>
      <form class="mt-10 flex max-w-sm flex-col gap-4" @submit.prevent="onSubmit">
        <label class="field">
          站点密码
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="btn btn-copper" type="submit" :disabled="submitting">
          {{ submitting ? '正在进入' : '进入看板' }}
        </button>
        <p v-if="error" class="m-0 text-sm text-[#ffb1a8]" role="alert">{{ error }}</p>
      </form>
    </section>
    <section
      class="hidden border-l border-line bg-panel px-10 py-12 lg:flex lg:flex-col lg:justify-center"
      aria-hidden="true"
    >
      <p class="m-0 text-sm text-muted">示意，不是你的数据</p>
      <div class="sample">
        <div v-for="row in rows" :key="row.title" class="sample-row">
          <span>{{ row.title }}</span>
          <span class="sample-track">
            <i :style="{ width: row.width, background: row.color }" />
          </span>
        </div>
        <i class="sample-today" />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { TOKEN_KEY } from '@/session'

const router = useRouter()
const password = ref('')
const submitting = ref(false)
const error = ref('')

const rows = [
  { title: '定范围', width: '46%', color: '#2f9d78' },
  { title: '拆任务', width: '62%', color: '#3d7dff' },
  { title: '接上 MCP', width: '38%', color: '#d85a4c' },
  { title: '看进度', width: '24%', color: '#6e7c90' },
]

async function onSubmit() {
  submitting.value = true
  error.value = ''
  try {
    const result = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: password.value }),
    })
    sessionStorage.setItem(TOKEN_KEY, result.token)
    await router.replace('/')
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : '登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.sample {
  position: relative;
  margin-top: 28px;
  overflow: hidden;
}

.sample-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 16px;
  align-items: center;
  height: 52px;
  color: var(--color-text);
  border-top: 1px solid var(--color-line);
}

.sample-track {
  display: block;
  height: 18px;
}

.sample-track i {
  display: block;
  height: 100%;
}

.sample-today {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 68%;
  width: 2px;
  background: var(--color-copper);
}
</style>
