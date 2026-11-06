import { AppError } from "./errors"

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskRecord {
  id: string
  projectId: string
  parentId: string | null
  title: string
  assignee: string
  status: TaskStatus
  progress: number
  startDate: string | null
  endDate: string | null
  note: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Dependency {
  taskId: string
  dependsOnTaskId: string
}

export interface TaskQuery {
  q?: string
  assignee?: string
  status?: string
  from?: string
  to?: string
}

export interface TaskDto {
  id: string
  projectId: string
  parentId: string | null
  parentTitle: string | null
  title: string
  assignee: string
  status: TaskStatus
  progress: number
  startDate: string | null
  endDate: string | null
  note: string
  depth: number
  sortOrder: number
  dependsOnTaskIds: string[]
  createdAt: number
  updatedAt: number
}

export function isStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value)
}

export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
}

export function assertDateOrder(start: string | null, end: string | null): void {
  if (start && end && end < start) throw new AppError("结束日期不能早于开始日期")
}

/** 只填了一头时，另一头用同一天，便于做区间重叠。 */
export function effectiveRange(task: Pick<TaskRecord, "startDate" | "endDate">): { start: string; end: string } | null {
  if (!task.startDate && !task.endDate) return null
  const start = task.startDate ?? task.endDate!
  const end = task.endDate ?? task.startDate!
  return start <= end ? { start, end } : { start: end, end: start }
}

export function matchesTask(task: TaskRecord, query: TaskQuery): boolean {
  const keyword = query.q?.trim().toLowerCase() ?? ""
  if (keyword && !`${task.title}\n${task.note}`.toLowerCase().includes(keyword)) return false
  const assignee = query.assignee?.trim().toLowerCase() ?? ""
  if (assignee && !task.assignee.toLowerCase().includes(assignee)) return false
  if (query.status && task.status !== query.status) return false
  if (!query.from && !query.to) return true
  const range = effectiveRange(task)
  if (!range) return false
  if (query.from && range.end < query.from) return false
  if (query.to && range.start > query.to) return false
  return true
}

/** 先父后子。出现环或断掉的父任务时，剩余任务补到末尾，避免死循环。 */
export function orderTasks(tasks: TaskRecord[]): TaskRecord[] {
  const byParent = new Map<string | null, TaskRecord[]>()
  for (const task of tasks) {
    const list = byParent.get(task.parentId) ?? []
    list.push(task)
    byParent.set(task.parentId, list)
  }
  for (const list of byParent.values()) {
    list.sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
  }
  const result: TaskRecord[] = []
  const seen = new Set<string>()
  const visit = (parentId: string | null) => {
    for (const task of byParent.get(parentId) ?? []) {
      if (seen.has(task.id)) continue
      seen.add(task.id)
      result.push(task)
      visit(task.id)
    }
  }
  visit(null)
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    seen.add(task.id)
    result.push(task)
    visit(task.id)
  }
  return result
}

function visibleDepth(task: TaskRecord, byId: Map<string, TaskRecord>, visible: Set<string>): number {
  let depth = 0
  let parentId = task.parentId
  const seen = new Set<string>()
  while (parentId) {
    if (seen.has(parentId)) break
    seen.add(parentId)
    if (visible.has(parentId)) depth += 1
    parentId = byId.get(parentId)?.parentId ?? null
  }
  return depth
}

/** 按树顺序输出。visible 为空表示全部可见；缩进只数仍在结果里的祖先。 */
export function presentTasks(tasks: TaskRecord[], dependencies: Dependency[], visible: Set<string> | null): TaskDto[] {
  const ordered = orderTasks(tasks).filter((task) => !visible || visible.has(task.id))
  const shown = new Set(ordered.map((task) => task.id))
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const depends = new Map<string, string[]>()
  for (const dependency of dependencies) {
    const list = depends.get(dependency.taskId) ?? []
    list.push(dependency.dependsOnTaskId)
    depends.set(dependency.taskId, list)
  }
  return ordered.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    parentId: task.parentId,
    parentTitle: task.parentId ? (byId.get(task.parentId)?.title ?? null) : null,
    title: task.title,
    assignee: task.assignee,
    status: task.status,
    progress: task.progress,
    startDate: task.startDate,
    endDate: task.endDate,
    note: task.note,
    depth: visibleDepth(task, byId, shown),
    sortOrder: task.sortOrder,
    dependsOnTaskIds: depends.get(task.id) ?? [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }))
}

export function createsCycle(dependencies: Dependency[], taskId: string, nextPredecessors: string[]): boolean {
  if (nextPredecessors.includes(taskId)) return true
  const graph = new Map<string, string[]>()
  for (const dependency of dependencies) {
    if (dependency.taskId === taskId) continue
    const list = graph.get(dependency.taskId) ?? []
    list.push(dependency.dependsOnTaskId)
    graph.set(dependency.taskId, list)
  }
  const seen = new Set<string>()
  const stack = [...nextPredecessors]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === taskId) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of graph.get(current) ?? []) stack.push(next)
  }
  return false
}

export function createsParentCycle(
  tasks: Array<Pick<TaskRecord, "id" | "parentId">>,
  taskId: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false
  if (parentId === taskId) return true
  const parents = new Map(tasks.map((task) => [task.id, task.parentId]))
  const seen = new Set<string>()
  let current: string | null = parentId
  while (current) {
    if (current === taskId) return true
    if (seen.has(current)) return true
    seen.add(current)
    current = parents.get(current) ?? null
  }
  return false
}

export function subtreeIds(tasks: Array<Pick<TaskRecord, "id" | "parentId">>, rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const list = children.get(task.parentId) ?? []
    list.push(task.id)
    children.set(task.parentId, list)
  }
  const ids: string[] = []
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    ids.push(id)
    for (const child of children.get(id) ?? []) visit(child)
  }
  visit(rootId)
  return ids
}

/** 状态改成 done 且调用方没带进度时，进度写成 100。 */
export function applyStatusPatch(
  task: Pick<TaskRecord, "status" | "progress" | "note">,
  patch: { status?: TaskStatus; progress?: number; note?: string },
): { status: TaskStatus; progress: number; note: string } {
  const status = patch.status ?? task.status
  let progress = patch.progress ?? task.progress
  if (patch.status === "done" && patch.progress === undefined) progress = 100
  const note = patch.note === undefined ? task.note : patch.note
  return { status, progress, note }
}

export interface NextPick {
  task: TaskRecord
  readyReason: string
}

/** 前置都已完成的待办，以及前置已完成但仍标成阻塞的任务。 */
export function selectNextTasks(tasks: TaskRecord[], dependencies: Dependency[]): NextPick[] {
  const statusById = new Map(tasks.map((task) => [task.id, task.status]))
  const waiting = new Set<string>()
  for (const dependency of dependencies) {
    const predecessor = statusById.get(dependency.dependsOnTaskId)
    if (predecessor && predecessor !== "done") waiting.add(dependency.taskId)
  }
  return tasks
    .filter((task) => (task.status === "todo" || task.status === "blocked") && !waiting.has(task.id))
    .map((task) => ({
      task,
      readyReason: task.status === "blocked" ? "前置已经完成，但这条任务仍标记为阻塞" : "前置已经完成，可以开始",
    }))
    .sort((left, right) => compareReady(left.task, right.task))
}

function compareReady(left: TaskRecord, right: TaskRecord): number {
  const leftStart = left.startDate ?? "9999-99-99"
  const rightStart = right.startDate ?? "9999-99-99"
  if (leftStart !== rightStart) return leftStart < rightStart ? -1 : 1
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
  return left.createdAt - right.createdAt
}

export function assertExpandIndexes(indexes: Array<number | null>): void {
  indexes.forEach((dependencyIndex, index) => {
    if (dependencyIndex === null) return
    if (!Number.isInteger(dependencyIndex) || dependencyIndex < 0 || dependencyIndex >= index) {
      throw new AppError(`第 ${index + 1} 条子任务只能依赖排在它前面的子任务`)
    }
  })
}
