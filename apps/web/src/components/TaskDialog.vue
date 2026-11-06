<template>
  <dialog ref="dialogEl" class="modal" @cancel="onCancel" @click="onBackdrop">
    <form class="bg-panel p-5" @submit.prevent="onSubmit">
      <h2 class="m-0 text-lg">{{ mode === 'create' ? '新建任务' : '编辑任务' }}</h2>
      <div class="mt-4 grid gap-3">
        <label class="field">
          任务名称
          <input v-model="form.title" required maxlength="120" />
        </label>
        <label class="field">
          父任务
          <select :value="form.parentId ?? ''" @change="form.parentId = valueOf($event) || null">
            <option value="">无</option>
            <option v-for="option in parentChoices" :key="option.id" :value="option.id">{{ option.title }}</option>
          </select>
        </label>
        <label class="field">
          责任人
          <input v-model="form.assignee" maxlength="40" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="field">
            状态
            <select
              v-model="form.status"
              :disabled="statusLocked"
              :title="statusLocked ? '已完成，不能改状态' : undefined"
            >
              <option v-for="status in statusChoices" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
            </select>
          </label>
          <label class="field">
            进度 {{ form.progress }}%
            <input v-model.number="form.progress" type="range" min="0" max="100" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="field">
            开始日期
            <input :value="form.startDate ?? ''" type="date" @input="form.startDate = valueOf($event) || null" />
          </label>
          <label class="field">
            结束日期
            <input :value="form.endDate ?? ''" type="date" @input="form.endDate = valueOf($event) || null" />
          </label>
        </div>
        <fieldset class="max-h-40 overflow-auto border border-line p-3">
          <legend class="px-1 text-sm text-muted">前置任务</legend>
          <p v-if="dependencyChoices.length === 0" class="m-0 text-sm text-muted">还没有其他任务。</p>
          <label
            v-for="option in dependencyChoices"
            :key="option.id"
            class="mt-2 flex items-center gap-2 text-sm text-text"
          >
            <input
              type="checkbox"
              :checked="form.dependsOnTaskIds.includes(option.id)"
              @change="toggleDependency(option.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ option.title }}
          </label>
        </fieldset>
        <label class="field">
          备注
          <textarea v-model="form.note" maxlength="1000" />
        </label>
      </div>
      <p v-if="error || localError" class="text-sm text-[#ffb1a8]" role="alert">{{ localError || error }}</p>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn btn-copper" type="submit" :disabled="busy">保存</button>
        <button class="btn" type="button" @click="emit('close')">取消</button>
        <button
          v-if="mode === 'edit' && !confirmingDelete && !blockedDelete"
          class="btn ml-auto"
          type="button"
          @click="confirmingDelete = true"
          >删除任务</button
        >
        <span v-if="mode === 'edit' && !confirmingDelete && blockedDelete" class="ml-auto text-sm text-muted">
          {{ blockedDelete }}
        </span>
        <template v-if="confirmingDelete">
          <span class="ml-auto text-sm text-muted">同时删除它的子任务</span>
          <button class="btn btn-danger" type="button" :disabled="busy" @click="emit('remove')">确认删除</button>
        </template>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { forwardStatuses, STATUS_LABEL, STATUS_ORDER } from '@/labels'
import { excludedParentIds } from '@/tree'
import type { Task, TaskDraft, TaskOption } from '@/types'

const props = defineProps<{
  mode: 'create' | 'edit'
  task: Task | null
  parentId: string | null
  options: TaskOption[]
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  save: [draft: TaskDraft]
  remove: []
}>()

const dialogEl = ref<HTMLDialogElement | null>(null)
const confirmingDelete = ref(false)
const localError = ref('')
const form = reactive<TaskDraft>({
  title: props.task?.title ?? '',
  parentId: props.task?.parentId ?? props.parentId,
  assignee: props.task?.assignee ?? '',
  status: props.task?.status ?? 'todo',
  progress: props.task?.progress ?? 0,
  startDate: props.task?.startDate ?? null,
  endDate: props.task?.endDate ?? null,
  note: props.task?.note ?? '',
  dependsOnTaskIds: [...(props.task?.dependsOnTaskIds ?? [])],
})

const statusLocked = computed(() => props.mode === 'edit' && props.task?.status === 'done')
const statusChoices = computed(() => (props.task ? forwardStatuses(props.task.status) : STATUS_ORDER))
const blockedDelete = computed(() => {
  if (props.mode !== 'edit' || !props.task) return ''
  if (props.task.status === 'done') return '已完成的任务不能删除'
  const children = new Map<string, TaskOption[]>()
  for (const option of props.options) {
    if (!option.parentId) continue
    const list = children.get(option.parentId) ?? []
    list.push(option)
    children.set(option.parentId, list)
  }
  const stack = [...(children.get(props.task.id) ?? [])]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (seen.has(current.id)) continue
    seen.add(current.id)
    if (current.status === 'done') return '子任务里有已完成的任务，不能删除'
    stack.push(...(children.get(current.id) ?? []))
  }
  return ''
})

const parentChoices = computed(() => {
  const excluded = excludedParentIds(props.options, props.task?.id ?? null)
  return props.options.filter((option) => !excluded.has(option.id))
})

const dependencyChoices = computed(() => props.options.filter((option) => option.id !== props.task?.id))

onMounted(() => dialogEl.value?.showModal())

function valueOf(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function toggleDependency(id: string, checked: boolean) {
  form.dependsOnTaskIds = checked
    ? [...new Set([...form.dependsOnTaskIds, id])]
    : form.dependsOnTaskIds.filter((item) => item !== id)
}

function onSubmit() {
  localError.value = ''
  if (!form.title.trim()) {
    localError.value = '请填写任务名称'
    return
  }
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    localError.value = '结束日期不能早于开始日期'
    return
  }
  if (!Number.isInteger(form.progress) || form.progress < 0 || form.progress > 100) {
    localError.value = '进度要是 0 到 100 的整数'
    return
  }
  emit('save', {
    ...form,
    title: form.title.trim(),
    parentId: form.parentId || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  })
}

function onCancel(event: Event) {
  event.preventDefault()
  emit('close')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialogEl.value) emit('close')
}
</script>
