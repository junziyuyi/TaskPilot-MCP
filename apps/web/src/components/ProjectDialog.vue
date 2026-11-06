<template>
  <dialog ref="dialogEl" class="modal" @cancel="onCancel" @click="onBackdrop">
    <form class="bg-panel p-5" @submit.prevent="onSubmit">
      <h2 class="m-0 text-lg">{{ mode === 'create' ? '新建项目' : '编辑项目' }}</h2>
      <div class="mt-4 grid gap-3">
        <label class="field">
          项目名称
          <input v-model="name" required maxlength="80" />
        </label>
        <label class="field">
          说明
          <textarea v-model="description" maxlength="500" />
        </label>
      </div>
      <p v-if="error" class="text-sm text-[#ffb1a8]" role="alert">{{ error }}</p>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button class="btn btn-copper" type="submit" :disabled="busy">保存</button>
        <button class="btn" type="button" @click="emit('close')">取消</button>
        <button
          v-if="mode === 'edit' && !confirmingDelete"
          class="btn ml-auto"
          type="button"
          @click="confirmingDelete = true"
          >删除项目</button
        >
        <template v-if="confirmingDelete">
          <span class="ml-auto text-sm text-muted">会删除其中的全部任务</span>
          <button class="btn btn-danger" type="button" :disabled="busy" @click="emit('remove')">确认删除</button>
        </template>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Project } from '@/types'

const props = defineProps<{
  mode: 'create' | 'edit'
  project: Project | null
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  save: [input: { name: string; description: string }]
  remove: []
}>()

const dialogEl = ref<HTMLDialogElement | null>(null)
const name = ref(props.project?.name ?? '')
const description = ref(props.project?.description ?? '')
const confirmingDelete = ref(false)

onMounted(() => dialogEl.value?.showModal())

function onSubmit() {
  if (!name.value.trim()) return
  emit('save', { name: name.value.trim(), description: description.value.trim() })
}

function onCancel(event: Event) {
  event.preventDefault()
  emit('close')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialogEl.value) emit('close')
}
</script>
