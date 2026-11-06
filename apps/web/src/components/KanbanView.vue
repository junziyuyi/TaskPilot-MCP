<template>
  <div
    class="grid h-full min-h-0 grid-cols-1 gap-px overflow-y-auto bg-line md:grid-cols-4 md:grid-rows-1 md:overflow-hidden"
  >
    <section v-for="column in columns" :key="column.status" class="flex min-h-64 flex-col bg-ink md:min-h-0">
      <header class="flex shrink-0 items-center justify-between border-b border-line px-3 py-3">
        <h2 class="m-0 text-sm font-medium">{{ column.label }}</h2>
        <span class="font-mono text-xs text-muted">{{ column.tasks.length }}</span>
      </header>
      <div class="flex flex-col gap-2 p-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
        <p v-if="column.tasks.length === 0" class="m-0 text-sm text-muted">没有</p>
        <article
          v-for="task in column.tasks"
          :key="task.id"
          class="border border-line bg-panel p-3"
          :style="{ borderLeft: `3px solid ${STATUS_BAR[task.status]}` }"
        >
          <div class="flex items-start justify-between gap-3">
            <button
              v-if="task.status !== 'done'"
              class="m-0 min-w-0 border-0 bg-transparent p-0 text-left"
              type="button"
              @click="emit('edit', task)"
            >
              {{ task.title }}
            </button>
            <span v-else class="min-w-0 text-left">{{ task.title }}</span>
            <button
              class="shrink-0 border-0 bg-transparent p-0 text-xs text-muted"
              type="button"
              :aria-label="copiedId === task.id ? `已复制${task.title}` : `复制${task.title}`"
              @click="copyTitle(task)"
            >
              {{ copiedId === task.id ? '已复制' : '复制' }}
            </button>
          </div>
          <p v-if="task.parentTitle" class="m-0 mt-1 text-xs text-muted">属于 {{ task.parentTitle }}</p>
          <p class="m-0 mt-2 flex gap-3 font-mono text-xs text-muted">
            <span>{{ task.assignee || '未指定' }}</span>
            <span>{{ formatSpan(task.startDate, task.endDate) }}</span>
            <span>{{ task.progress }}%</span>
          </p>
          <label class="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
            状态
            <select
              :aria-label="task.status === 'done' ? `${task.title}已完成，不能改状态` : `修改${task.title}的状态`"
              :disabled="task.status === 'done'"
              :title="task.status === 'done' ? '已完成，不能改状态' : undefined"
              :value="task.status"
              @change="onStatus(task, $event)"
            >
              <option v-for="status in forwardStatuses(task.status)" :key="status" :value="status">
                {{ STATUS_LABEL[status] }}
              </option>
            </select>
          </label>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { formatSpan, forwardStatuses, STATUS_BAR, STATUS_LABEL, STATUS_ORDER } from '@/labels'
import type { Task, TaskStatus } from '@/types'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  edit: [task: Task]
  'change-status': [task: Task, status: TaskStatus]
}>()

const columns = computed(() =>
  STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    tasks: props.tasks.filter((task) => task.status === status),
  }))
)

const copiedId = ref<string | null>(null)
let copiedTimer = 0

onUnmounted(() => window.clearTimeout(copiedTimer))

function onStatus(task: Task, event: Event) {
  emit('change-status', task, (event.target as HTMLSelectElement).value as TaskStatus)
}

async function copyTitle(task: Task) {
  const copied = await writeClipboard(task.title)
  if (!copied) return
  copiedId.value = task.id
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copiedId.value = null
  }, 1500)
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}
</script>
