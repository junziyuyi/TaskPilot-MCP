<template>
  <form class="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3" @submit.prevent>
    <label class="field min-w-48 flex-1">
      搜索任务
      <input :value="modelValue.q" type="search" placeholder="名称或备注" @input="update('q', text($event))" />
    </label>
    <label class="field w-36">
      责任人
      <input :value="modelValue.assignee" list="assignee-options" @input="update('assignee', text($event))" />
      <datalist id="assignee-options">
        <option v-for="name in assignees" :key="name" :value="name" />
      </datalist>
    </label>
    <label class="field w-32">
      状态
      <select :value="modelValue.status" @change="update('status', text($event))">
        <option value="">全部</option>
        <option v-for="status in STATUS_ORDER" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
      </select>
    </label>
    <label class="field">
      从
      <input :value="modelValue.from" type="date" @input="update('from', text($event))" />
    </label>
    <label class="field">
      到
      <input :value="modelValue.to" type="date" @input="update('to', text($event))" />
    </label>
    <button class="btn" type="button" @click="emit('reset')">清空筛选</button>
  </form>
</template>

<script setup lang="ts">
import { STATUS_LABEL, STATUS_ORDER } from '@/labels'
import type { Filters } from '@/types'

const props = defineProps<{
  modelValue: Filters
  assignees: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Filters]
  reset: []
}>()

function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function update(key: keyof Filters, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value } as Filters)
}
</script>
