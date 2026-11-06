import {
  applyStatusPatch,
  assertDateOrder,
  assertDeletable,
  assertTaskMutable,
  createsCycle,
  createsParentCycle,
  matchesTask,
  presentTasks,
  selectNextTasks,
  subtreeIds,
  type Dependency,
  type TaskDto,
  type TaskQuery,
  type TaskRecord,
  type TaskStatus,
} from "./domain"
import { AppError } from "./errors"
import type { TaskWrite } from "./input"

export interface ProjectDto {
  id: string
  name: string
  description: string
  taskCount: number
  doneCount: number
  createdAt: number
  updatedAt: number
}

export interface NextTaskDto extends TaskDto {
  readyReason: string
}

export interface LogDto {
  id: string
  toolName: string
  projectId: string | null
  ok: boolean
  summary: string
  detail: string
  createdAt: number
}

interface ProjectRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
  task_count: number
  done_count: number
}

interface TaskRow {
  id: string
  project_id: string
  parent_id: string | null
  title: string
  assignee: string
  status: TaskStatus
  progress: number
  start_date: string | null
  end_date: string | null
  note: string
  sort_order: number
  created_at: number
  updated_at: number
}

interface DependencyRow {
  task_id: string
  depends_on_task_id: string
}

interface LogRow {
  id: string
  tool_name: string
  project_id: string | null
  ok: number
  summary: string
  detail: string
  created_at: number
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    progress: row.progress,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listProjects(db: D1Database): Promise<ProjectDto[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
       FROM projects p
       ORDER BY p.updated_at DESC, p.created_at DESC`,
    )
    .all<ProjectRow>()
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    taskCount: row.task_count,
    doneCount: row.done_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function createProject(db: D1Database, input: { name: string; description: string }): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await db
    .prepare(`INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.description, now, now)
    .run()
  return id
}

export async function updateProject(
  db: D1Database,
  id: string,
  input: { name?: string; description?: string },
): Promise<void> {
  const existing = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(id).first()
  if (!existing) throw new AppError("项目不存在", 404)
  const sets = ["updated_at = ?"]
  const values: Array<string | number> = [Date.now()]
  if (input.name !== undefined) {
    sets.push("name = ?")
    values.push(input.name)
  }
  if (input.description !== undefined) {
    sets.push("description = ?")
    values.push(input.description)
  }
  values.push(id)
  await db
    .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run()
}

export async function deleteProject(db: D1Database, id: string): Promise<void> {
  const existing = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(id).first()
  if (!existing) throw new AppError("项目不存在", 404)
  const tasks = await listTaskRecords(db, id)
  const statements: D1PreparedStatement[] = []
  if (tasks.length > 0) {
    const ids = tasks.map((task) => task.id)
    const marks = ids.map(() => "?").join(", ")
    statements.push(
      db
        .prepare(`DELETE FROM task_dependencies WHERE task_id IN (${marks}) OR depends_on_task_id IN (${marks})`)
        .bind(...ids, ...ids),
      db.prepare(`DELETE FROM tasks WHERE project_id = ?`).bind(id),
    )
  }
  statements.push(db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id))
  await db.batch(statements)
}

async function requireProject(db: D1Database, projectId: string): Promise<void> {
  const project = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).first()
  if (!project) throw new AppError("项目不存在", 404)
}

async function listTaskRecords(db: D1Database, projectId: string): Promise<TaskRecord[]> {
  const rows = await db.prepare(`SELECT * FROM tasks WHERE project_id = ?`).bind(projectId).all<TaskRow>()
  return (rows.results ?? []).map(mapTask)
}

async function listDependencies(db: D1Database, projectId: string): Promise<Dependency[]> {
  const rows = await db
    .prepare(
      `SELECT d.task_id, d.depends_on_task_id
       FROM task_dependencies d
       JOIN tasks t ON t.id = d.task_id
       WHERE t.project_id = ?`,
    )
    .bind(projectId)
    .all<DependencyRow>()
  return (rows.results ?? []).map((row) => ({ taskId: row.task_id, dependsOnTaskId: row.depends_on_task_id }))
}

async function findTask(db: D1Database, taskId: string): Promise<TaskRecord | null> {
  const row = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first<TaskRow>()
  return row ? mapTask(row) : null
}

export async function getProjectTasks(db: D1Database, projectId: string, query: TaskQuery): Promise<TaskDto[]> {
  await requireProject(db, projectId)
  const tasks = await listTaskRecords(db, projectId)
  const dependencies = await listDependencies(db, projectId)
  const visible = new Set(tasks.filter((task) => matchesTask(task, query)).map((task) => task.id))
  return presentTasks(tasks, dependencies, visible)
}

export async function getNextTasks(db: D1Database, projectId: string, limit: number): Promise<NextTaskDto[]> {
  await requireProject(db, projectId)
  const tasks = await listTaskRecords(db, projectId)
  const dependencies = await listDependencies(db, projectId)
  const presented = new Map(presentTasks(tasks, dependencies, null).map((task) => [task.id, task]))
  return selectNextTasks(tasks, dependencies)
    .slice(0, limit)
    .map((item) => ({ ...presented.get(item.task.id)!, readyReason: item.readyReason }))
}

function assertLinks(
  tasks: TaskRecord[],
  dependencies: Dependency[],
  taskId: string,
  parentId: string | null,
  dependsOn: string[] | undefined,
): void {
  if (parentId) {
    if (!tasks.some((task) => task.id === parentId)) throw new AppError("父任务不在这个项目里")
    if (createsParentCycle(tasks, taskId, parentId)) throw new AppError("不能把任务放到自己的子任务下面")
  }
  if (!dependsOn) return
  if (dependsOn.includes(taskId)) throw new AppError("任务不能依赖自己")
  const ids = new Set(tasks.map((task) => task.id))
  if (dependsOn.some((id) => !ids.has(id))) throw new AppError("前置任务不在这个项目里")
  if (createsCycle(dependencies, taskId, dependsOn)) throw new AppError("这样依赖会形成循环")
}

async function nextSortOrder(db: D1Database, projectId: string, parentId: string | null): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
       FROM tasks
       WHERE project_id = ?1 AND ((?2 IS NULL AND parent_id IS NULL) OR parent_id = ?2)`,
    )
    .bind(projectId, parentId)
    .first<{ max_sort: number }>()
  return (row?.max_sort ?? 0) + 1
}

export async function createTask(
  db: D1Database,
  projectId: string,
  input: TaskWrite & { title: string },
): Promise<string> {
  await requireProject(db, projectId)
  const tasks = await listTaskRecords(db, projectId)
  const dependencies = await listDependencies(db, projectId)
  const id = crypto.randomUUID()
  const parentId = input.parentId ?? null
  assertLinks(tasks, dependencies, id, parentId, input.dependsOnTaskIds ?? [])
  assertDateOrder(input.startDate ?? null, input.endDate ?? null)
  const statusPatch = applyStatusPatch(
    { status: "todo", progress: 0, note: "" },
    { status: input.status, progress: input.progress, note: input.note },
  )
  const now = Date.now()
  const sortOrder = await nextSortOrder(db, projectId, parentId)
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO tasks (
           id, project_id, parent_id, title, assignee, status, progress,
           start_date, end_date, note, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        projectId,
        parentId,
        input.title,
        input.assignee ?? "",
        statusPatch.status,
        statusPatch.progress,
        input.startDate ?? null,
        input.endDate ?? null,
        statusPatch.note,
        sortOrder,
        now,
        now,
      ),
  ]
  for (const predecessor of input.dependsOnTaskIds ?? []) {
    statements.push(
      db
        .prepare(`INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, predecessor, now),
    )
  }
  statements.push(db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, projectId))
  await db.batch(statements)
  return id
}

export async function updateTask(db: D1Database, taskId: string, input: TaskWrite): Promise<void> {
  const existing = await findTask(db, taskId)
  if (!existing) throw new AppError("任务不存在", 404)
  assertTaskMutable(existing.status)
  const tasks = await listTaskRecords(db, existing.projectId)
  const dependencies = await listDependencies(db, existing.projectId)
  const parentId = input.parentId === undefined ? existing.parentId : input.parentId
  assertLinks(tasks, dependencies, taskId, parentId, input.dependsOnTaskIds)
  const startDate = input.startDate === undefined ? existing.startDate : input.startDate
  const endDate = input.endDate === undefined ? existing.endDate : input.endDate
  assertDateOrder(startDate, endDate)
  const statusPatch = applyStatusPatch(existing, {
    status: input.status,
    progress: input.progress,
    note: input.note,
  })
  const now = Date.now()
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE tasks
         SET parent_id = ?, title = ?, assignee = ?, status = ?, progress = ?,
             start_date = ?, end_date = ?, note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        parentId,
        input.title ?? existing.title,
        input.assignee ?? existing.assignee,
        statusPatch.status,
        statusPatch.progress,
        startDate,
        endDate,
        statusPatch.note,
        now,
        taskId,
      ),
  ]
  if (input.dependsOnTaskIds) {
    statements.push(db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`).bind(taskId))
    for (const predecessor of input.dependsOnTaskIds) {
      statements.push(
        db
          .prepare(`INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), taskId, predecessor, now),
      )
    }
  }
  statements.push(db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, existing.projectId))
  await db.batch(statements)
}

export async function deleteTask(db: D1Database, taskId: string): Promise<void> {
  const existing = await findTask(db, taskId)
  if (!existing) throw new AppError("任务不存在", 404)
  const tasks = await listTaskRecords(db, existing.projectId)
  assertDeletable(tasks, taskId)
  const ids = subtreeIds(tasks, taskId)
  const marks = ids.map(() => "?").join(", ")
  const now = Date.now()
  await db.batch([
    db
      .prepare(`DELETE FROM task_dependencies WHERE task_id IN (${marks}) OR depends_on_task_id IN (${marks})`)
      .bind(...ids, ...ids),
    db.prepare(`UPDATE tasks SET parent_id = NULL WHERE parent_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM tasks WHERE id IN (${marks})`).bind(...ids),
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, existing.projectId),
  ])
}

export interface ExpandSubtask {
  title: string
  assignee: string
  startDate: string | null
  endDate: string | null
  dependsOnIndex: number | null
}

/** 给已有任务追加一批子任务。父任务若还是待办，改为进行中。 */
export async function expandTask(db: D1Database, taskId: string, subtasks: ExpandSubtask[]): Promise<string[]> {
  if (subtasks.length === 0 || subtasks.length > 20) throw new AppError("一次拆成 1 到 20 条子任务")
  const parent = await findTask(db, taskId)
  if (!parent) throw new AppError("任务不存在", 404)
  assertTaskMutable(parent.status)
  subtasks.forEach((subtask) => assertDateOrder(subtask.startDate, subtask.endDate))
  const now = Date.now()
  let sortOrder = await nextSortOrder(db, parent.projectId, parent.id)
  const ids = subtasks.map(() => crypto.randomUUID())
  const statements: D1PreparedStatement[] = []
  subtasks.forEach((subtask, index) => {
    const id = ids[index]!
    statements.push(
      db
        .prepare(
          `INSERT INTO tasks (
             id, project_id, parent_id, title, assignee, status, progress,
             start_date, end_date, note, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'todo', 0, ?, ?, '', ?, ?, ?)`,
        )
        .bind(id, parent.projectId, parent.id, subtask.title, subtask.assignee, subtask.startDate, subtask.endDate, sortOrder, now, now),
    )
    sortOrder += 1
    if (subtask.dependsOnIndex !== null) {
      statements.push(
        db
          .prepare(`INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), id, ids[subtask.dependsOnIndex], now),
      )
    }
  })
  if (parent.status === "todo") {
    statements.push(db.prepare(`UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?`).bind(now, parent.id))
  }
  statements.push(db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, parent.projectId))
  await db.batch(statements)
  return ids
}

export async function taskProjectId(db: D1Database, taskId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT project_id FROM tasks WHERE id = ?`).bind(taskId).first<{ project_id: string }>()
  return row?.project_id ?? null
}

export async function writeLog(
  db: D1Database,
  input: { toolName: string; projectId: string | null; ok: boolean; summary: string; detail: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO mcp_logs (id, tool_name, project_id, ok, summary, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.toolName,
      input.projectId,
      input.ok ? 1 : 0,
      input.summary.slice(0, 200),
      input.detail.slice(0, 4000),
      Date.now(),
    )
    .run()
}

export async function listLogs(db: D1Database, projectId: string | null, limit: number): Promise<LogDto[]> {
  const rows = await db
    .prepare(
      `SELECT id, tool_name, project_id, ok, summary, detail, created_at
       FROM mcp_logs
       WHERE ?1 IS NULL OR project_id = ?1 OR project_id IS NULL
       ORDER BY created_at DESC
       LIMIT ?2`,
    )
    .bind(projectId, limit)
    .all<LogRow>()
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    toolName: row.tool_name,
    projectId: row.project_id,
    ok: row.ok === 1,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.created_at,
  }))
}
