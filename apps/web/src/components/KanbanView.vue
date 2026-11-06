<template>
  <div class="grid h-full grid-cols-1 gap-px bg-line md:grid-cols-4">
    <section v-for="column in columns" :key="column.status" class="flex min-h-64 flex-col bg-ink">
      <header class="flex items-center justify-between border-b border-line px-3 py-3">
        <h2 class="m-0 text-sm font-medium">{{ column.label }}</h2>
        <span class="font-mono text-xs text-muted">{{ column.tasks.length }}</span>
      </header>
      <div class="flex flex-1 flex-col gap-2 p-3">
        <p v-if="column.tasks.length === 0" class="m-0 text-sm text-muted">没有</p>
        <article
          v-for="task in column.tasks"
          :key="task.id"
          class="border border-line bg-panel p-3"
          :style="{ borderLeft: `3px solid ${STATUS_BAR[task.status]}` }"
        >
          <button class="m-0 border-0 bg-transparent p-0 text-left" type="button" @click="emit('edit', task)">
            {{ task.title }}
          </button>
          <p v-if="task.parentTitle" class="m-0 mt-1 text-xs text-muted">属于 {{ task.parentTitle }}</p>
          <p class="m-0 mt-2 flex gap-3 font-mono text-xs text-muted">
            <span>{{ task.assignee || '未指定' }}</span>
            <span>{{ formatSpan(task.startDate, task.endDate) }}</span>
            <span>{{ task.progress }}%</span>
          </p>
          <label class="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
            状态
            <select :aria-label="`修改${task.title}的状态`" :value="task.status" @change="onStatus(task, $event)">
              <option v-for="status in STATUS_ORDER" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
            </select>
          </label>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatSpan, STATUS_BAR, STATUS_LABEL, STATUS_ORDER } from '@/labels'
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

function onStatus(task: Task, event: Event) {
  emit('change-status', task, (event.target as HTMLSelectElement).value as TaskStatus)
}
</script>
