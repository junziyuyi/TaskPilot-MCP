<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
      <p class="m-0 font-medium">TaskPilot</p>
      <template v-if="projects.length > 0">
        <select v-model="projectId" aria-label="当前项目">
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <p v-if="current" class="m-0 font-mono text-xs text-muted"
          >已完成 {{ current.doneCount }} / {{ current.taskCount }}</p
        >
        <button class="btn" type="button" @click="openProject('edit')">编辑项目</button>
      </template>
      <button class="btn" type="button" @click="openProject('create')">新建项目</button>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex border border-line">
          <button
            class="px-3 py-2"
            :class="view === 'gantt' ? 'bg-raise' : 'text-muted'"
            type="button"
            :aria-pressed="view === 'gantt'"
            @click="view = 'gantt'"
            >甘特</button
          >
          <button
            class="px-3 py-2"
            :class="view === 'kanban' ? 'bg-raise' : 'text-muted'"
            type="button"
            :aria-pressed="view === 'kanban'"
            @click="view = 'kanban'"
            >看板</button
          >
        </div>
        <button
          class="btn"
          type="button"
          :disabled="!nextUndo || undoing"
          :aria-label="nextUndo ? `上一步，撤回${nextUndo.label}` : '上一步，没有可撤回的操作'"
          :title="nextUndo ? `撤回：${nextUndo.label}` : '没有可撤回的操作'"
          @click="undo"
        >
          {{ undoing ? '正在撤回' : '上一步' }}
        </button>
        <button class="btn btn-copper" type="button" :disabled="!projectId" @click="openCreate">新建任务</button>
        <button class="btn" type="button" @click="onLogout">退出</button>
      </div>
    </header>

    <FilterBar v-if="projectId" v-model="filters" :assignees="assignees" @reset="resetFilters" />
    <p v-if="error" class="alert" role="alert">{{ error }}</p>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div v-if="!projectId" class="p-8">
          <p class="m-0 text-lg">还没有项目。</p>
          <p class="mt-2 text-sm text-muted">先建一个，任务都会放在它下面。</p>
          <button class="btn btn-copper mt-4" type="button" @click="openProject('create')">新建项目</button>
        </div>
        <p v-else-if="loading" class="p-6 text-sm text-muted">正在读取任务。</p>
        <div v-else-if="tasks.length === 0" class="p-6">
          <p class="m-0 text-sm text-muted">{{ filtering ? '没有任务符合当前筛选。' : '这个项目还没有任务。' }}</p>
        </div>
        <GanttView
          v-else-if="view === 'gantt'"
          class="h-full"
          :tasks="tasks"
          @edit="openEdit"
          @add-child="openChild"
          @change-status="onStatus"
          @schedule="onSchedule"
        />
        <KanbanView v-else class="h-full" :tasks="tasks" @edit="openEdit" @change-status="onStatus" />
      </section>
      <aside class="max-h-56 overflow-auto border-t border-line lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l">
        <h2 class="m-0 px-4 py-3 text-sm font-medium">可开工</h2>
        <p v-if="nextTasks.length === 0" class="m-0 px-4 pb-4 text-sm text-muted">没有可以开工的任务。</p>
        <button
          v-for="task in nextTasks"
          :key="task.id"
          class="block w-full border-t border-line bg-transparent px-4 py-3 text-left"
          type="button"
          @click="openEdit(task)"
        >
          <span class="block">{{ task.title }}</span>
          <span class="mt-1 block text-xs text-muted">{{ task.readyReason }}</span>
        </button>
      </aside>
    </div>

    <McpLogPanel :logs="logs" />

    <TaskDialog
      v-if="taskDialog"
      :mode="taskDialog.mode"
      :task="taskDialog.task"
      :parent-id="taskDialog.parentId"
      :options="options"
      :busy="busy"
      :error="dialogError"
      @close="taskDialog = null"
      @save="onSaveTask"
      @remove="onDeleteTask"
    />
    <ProjectDialog
      v-if="projectDialog"
      :mode="projectDialog"
      :project="projectDialog === 'edit' ? current : null"
      :busy="busy"
      :error="dialogError"
      @close="projectDialog = null"
      @save="onSaveProject"
      @remove="onDeleteProject"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FilterBar from '@/components/FilterBar.vue'
import GanttView from '@/components/GanttView.vue'
import KanbanView from '@/components/KanbanView.vue'
import McpLogPanel from '@/components/McpLogPanel.vue'
import ProjectDialog from '@/components/ProjectDialog.vue'
import TaskDialog from '@/components/TaskDialog.vue'
import { api, ApiError } from '@/api'
import { STATUS_LABEL } from '@/labels'
import { PROJECT_KEY, TOKEN_KEY, VIEW_KEY } from '@/session'
import type { Filters, McpLog, Project, Task, TaskDraft, TaskOption, TaskStatus } from '@/types'
import { outsideDependents, remapId, remapIds, subtreeInCreateOrder } from '@/undo'

const router = useRouter()
const projects = ref<Project[]>([])
const projectId = ref('')
const tasks = ref<Task[]>([])
const options = ref<TaskOption[]>([])
const nextTasks = ref<Task[]>([])
const logs = ref<McpLog[]>([])
const filters = ref<Filters>(emptyFilters())
const view = ref<'gantt' | 'kanban'>(localStorage.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'gantt')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const dialogError = ref('')
const taskDialog = ref<{ mode: 'create' | 'edit'; task: Task | null; parentId: string | null } | null>(null)
const projectDialog = ref<'create' | 'edit' | null>(null)
const undoing = ref(false)
const undoRevision = ref(0)

interface UndoStep {
  label: string
  run: () => Promise<void>
}

const undoStacks = new Map<string, UndoStep[]>()

const current = computed(() => projects.value.find((project) => project.id === projectId.value) ?? null)
const assignees = computed(() =>
  [...new Set(options.value.map((option) => option.assignee.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  )
)
const filtering = computed(() => Object.values(filters.value).some((value) => value.trim() !== ''))
const nextUndo = computed(() => {
  void undoRevision.value
  return undoStacks.get(projectId.value)?.at(-1) ?? null
})

let logTimer = 0
let filterTimer = 0
let ignoreFilter = false

onMounted(async () => {
  window.addEventListener('keydown', onUndoKey)
  try {
    await loadProjects()
  } catch (caught) {
    error.value = messageOf(caught)
  }
  logTimer = window.setInterval(() => {
    void loadLogs().catch((caught: unknown) => {
      error.value = messageOf(caught)
    })
  }, 5000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onUndoKey)
  window.clearInterval(logTimer)
  window.clearTimeout(filterTimer)
})

watch(projectId, () => {
  ignoreFilter = true
  localStorage.setItem(PROJECT_KEY, projectId.value)
  filters.value = emptyFilters()
  ignoreFilter = false
  window.clearTimeout(filterTimer)
  void loadBoard()
})

watch(
  filters,
  () => {
    if (ignoreFilter) return
    window.clearTimeout(filterTimer)
    filterTimer = window.setTimeout(() => {
      void loadTasks().catch((caught: unknown) => {
        error.value = messageOf(caught)
      })
    }, 250)
  },
  { deep: true }
)

watch(view, (value) => localStorage.setItem(VIEW_KEY, value))

async function loadProjects() {
  const result = await api<{ projects: Project[] }>('/api/projects')
  projects.value = result.projects
  const stored = projectId.value || localStorage.getItem(PROJECT_KEY) || ''
  const nextId = result.projects.some((project) => project.id === stored) ? stored : (result.projects[0]?.id ?? '')
  if (nextId === projectId.value) await loadBoard()
  else projectId.value = nextId
}

async function loadBoard() {
  if (!projectId.value) {
    tasks.value = []
    options.value = []
    nextTasks.value = []
    logs.value = []
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadTasks(), loadNext(), loadLogs()])
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

async function loadTasks() {
  if (!projectId.value) return
  const result = await api<{ tasks: Task[]; options: TaskOption[] }>(
    `/api/projects/${projectId.value}/tasks${taskQuery()}`
  )
  tasks.value = result.tasks
  options.value = result.options
}

async function loadNext() {
  if (!projectId.value) return
  const result = await api<{ tasks: Task[] }>(`/api/projects/${projectId.value}/next`)
  nextTasks.value = result.tasks
}

async function loadLogs() {
  const params = projectId.value ? `?projectId=${encodeURIComponent(projectId.value)}` : ''
  const result = await api<{ logs: McpLog[] }>(`/api/logs${params}`)
  logs.value = result.logs
}

function taskQuery(): string {
  const params = new URLSearchParams()
  if (filters.value.q.trim()) params.set('q', filters.value.q.trim())
  if (filters.value.assignee.trim()) params.set('assignee', filters.value.assignee.trim())
  if (filters.value.status) params.set('status', filters.value.status)
  if (filters.value.from) params.set('from', filters.value.from)
  if (filters.value.to) params.set('to', filters.value.to)
  const text = params.toString()
  return text ? `?${text}` : ''
}

function openProject(mode: 'create' | 'edit') {
  dialogError.value = ''
  projectDialog.value = mode
}

function openCreate() {
  dialogError.value = ''
  taskDialog.value = { mode: 'create', task: null, parentId: null }
}

function openEdit(task: Task) {
  dialogError.value = ''
  taskDialog.value = { mode: 'edit', task, parentId: task.parentId }
}

function openChild(task: Task) {
  dialogError.value = ''
  taskDialog.value = { mode: 'create', task: null, parentId: task.id }
}

async function onSaveProject(input: { name: string; description: string }) {
  busy.value = true
  dialogError.value = ''
  try {
    if (projectDialog.value === 'create') {
      const created = await api<{ id: string }>('/api/projects', { method: 'POST', body: JSON.stringify(input) })
      projectDialog.value = null
      await loadProjects()
      projectId.value = created.id
    } else if (current.value) {
      const project = current.value
      const previous = { name: project.name, description: project.description }
      await api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(input) })
      remember(project.id, {
        label: `修改项目「${previous.name}」`,
        run: () => api(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(previous) }),
      })
      projectDialog.value = null
      await loadProjects()
    }
  } catch (caught) {
    dialogError.value = messageOf(caught)
  } finally {
    busy.value = false
  }
}

async function onDeleteProject() {
  if (!current.value) return
  busy.value = true
  dialogError.value = ''
  try {
    undoStacks.delete(current.value.id)
    undoRevision.value += 1
    await api(`/api/projects/${current.value.id}`, { method: 'DELETE' })
    projectDialog.value = null
    localStorage.removeItem(PROJECT_KEY)
    projectId.value = ''
    await loadProjects()
  } catch (caught) {
    dialogError.value = messageOf(caught)
  } finally {
    busy.value = false
  }
}

async function onSaveTask(draft: TaskDraft) {
  if (!projectId.value || !taskDialog.value) return
  busy.value = true
  dialogError.value = ''
  try {
    const editing = taskDialog.value.task
    if (taskDialog.value.mode === 'create') {
      const created = await api<{ id: string }>(`/api/projects/${projectId.value}/tasks`, {
        method: 'POST',
        body: JSON.stringify(draft),
      })
      remember(projectId.value, {
        label: `新建「${draft.title}」`,
        run: () => api(`/api/tasks/${created.id}`, { method: 'DELETE' }),
      })
    } else if (editing) {
      const previous = draftOf(editing)
      await api(`/api/tasks/${editing.id}`, { method: 'PATCH', body: JSON.stringify(draft) })
      remember(projectId.value, {
        label: `修改「${previous.title}」`,
        run: () => api(`/api/tasks/${editing.id}`, { method: 'PATCH', body: JSON.stringify(previous) }),
      })
    }
    taskDialog.value = null
    await Promise.all([loadBoard(), refreshCounts()])
  } catch (caught) {
    dialogError.value = messageOf(caught)
  } finally {
    busy.value = false
  }
}

async function onDeleteTask() {
  const task = taskDialog.value?.task
  const ownerId = projectId.value
  if (!task || !ownerId) return
  busy.value = true
  dialogError.value = ''
  try {
    const all = await api<{ tasks: Task[] }>(`/api/projects/${ownerId}/tasks`)
    const removed = subtreeInCreateOrder(all.tasks, task.id)
    const removedIds = new Set(removed.map((item) => item.id))
    const dependents = outsideDependents(all.tasks, removedIds)
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' })
    remember(ownerId, {
      label: removed.length > 1 ? `删除「${task.title}」及其子任务` : `删除「${task.title}」`,
      run: () => restoreDeleted(ownerId, removed, dependents),
    })
    taskDialog.value = null
    await Promise.all([loadBoard(), refreshCounts()])
  } catch (caught) {
    dialogError.value = messageOf(caught)
  } finally {
    busy.value = false
  }
}

async function onSchedule(task: Task, startDate: string, endDate: string) {
  if (task.startDate === startDate && task.endDate === endDate) return
  const previous = { startDate: task.startDate, endDate: task.endDate }
  try {
    await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ startDate, endDate }) })
    remember(task.projectId, {
      label: `改「${task.title}」的日期`,
      run: () => api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(previous) }),
    })
    await Promise.all([loadBoard(), refreshCounts()])
  } catch (caught) {
    error.value = messageOf(caught)
    await loadBoard()
  }
}

async function onStatus(task: Task, status: TaskStatus) {
  if (task.status === status) return
  const previous = { status: task.status, progress: task.progress }
  try {
    await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    remember(task.projectId, {
      label: `把「${task.title}」标成${STATUS_LABEL[status]}`,
      run: () => api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(previous) }),
    })
    await Promise.all([loadBoard(), refreshCounts()])
  } catch (caught) {
    error.value = messageOf(caught)
  }
}

function remember(ownerId: string, step: UndoStep) {
  const stack = undoStacks.get(ownerId) ?? []
  stack.push(step)
  if (stack.length > 30) stack.shift()
  undoStacks.set(ownerId, stack)
  undoRevision.value += 1
}

async function undo() {
  const ownerId = projectId.value
  const stack = undoStacks.get(ownerId)
  if (!stack || stack.length === 0 || undoing.value) return
  const step = stack[stack.length - 1]!
  undoing.value = true
  error.value = ''
  try {
    await step.run()
    stack.pop()
    undoRevision.value += 1
    await Promise.all([loadBoard(), refreshCounts()])
  } catch (caught) {
    error.value = `没能撤回：${messageOf(caught)}`
  } finally {
    undoing.value = false
  }
}

function onUndoKey(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'z' || event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, dialog')))
    return
  event.preventDefault()
  void undo()
}

async function restoreDeleted(ownerId: string, removed: Task[], dependents: Task[]) {
  const idMap = new Map<string, string>()
  for (const item of removed) {
    const created = await api<{ id: string }>(`/api/projects/${ownerId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ ...draftOf(item), parentId: remapId(item.parentId, idMap), dependsOnTaskIds: [] }),
    })
    idMap.set(item.id, created.id)
  }
  for (const item of removed) {
    if (item.dependsOnTaskIds.length === 0) continue
    const id = idMap.get(item.id)
    if (!id) continue
    await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ dependsOnTaskIds: remapIds(item.dependsOnTaskIds, idMap) }),
    })
  }
  for (const item of dependents) {
    await api(`/api/tasks/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ dependsOnTaskIds: remapIds(item.dependsOnTaskIds, idMap) }),
    })
  }
}

function draftOf(task: Task): TaskDraft {
  return {
    title: task.title,
    parentId: task.parentId,
    assignee: task.assignee,
    status: task.status,
    progress: task.progress,
    startDate: task.startDate,
    endDate: task.endDate,
    note: task.note,
    dependsOnTaskIds: [...task.dependsOnTaskIds],
  }
}

async function refreshCounts() {
  const result = await api<{ projects: Project[] }>('/api/projects')
  projects.value = result.projects
}

function resetFilters() {
  filters.value = emptyFilters()
}

function onLogout() {
  sessionStorage.removeItem(TOKEN_KEY)
  void router.push('/login')
}

function emptyFilters(): Filters {
  return { q: '', assignee: '', status: '', from: '', to: '' }
}

function messageOf(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : '请求失败'
}
</script>
