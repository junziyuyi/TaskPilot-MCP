import {
  createProject,
  createTask,
  expandTask,
  getNextTasks,
  getProjectTasks,
  listProjects,
  taskProjectId,
  updateTask,
  writeLog,
  type NextTaskDto,
  type ProjectDto,
} from "../data"
import { assertExpandIndexes, isDay, type TaskDto } from "../domain"
import { AppError } from "../errors"
import { parseProject, parseTaskQuery, parseTaskWrite, readText, type TaskWrite } from "../input"
import type { ExpandSubtask } from "../data"

export interface ToolOutcome {
  text: string
  summary: string
  projectId: string | null
  isError?: boolean
}

interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const daySchema = { type: "string", description: "日历日，格式 YYYY-MM-DD" }

export const TOOLS: ToolSchema[] = [
  {
    name: "list_projects",
    description: "获取全部项目，包含每个项目的任务数和已完成数。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_project",
    description: "创建一个项目。任务都属于某个项目。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "项目名称，1 到 80 个字" },
        description: { type: "string", description: "项目说明，可空" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_project_tasks",
    description: "获取一个项目的任务，按父任务在前的顺序返回。可按状态、关键字、责任人、日期范围过滤。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        q: { type: "string", description: "匹配任务名称或备注" },
        assignee: { type: "string" },
        from: daySchema,
        to: daySchema,
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_task",
    description: "在项目中创建任务或子任务。前置任务用 depends_on_task_id 或 depends_on_task_ids，必须属于同一个项目。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        parent_id: { type: "string" },
        title: { type: "string" },
        assignee: { type: "string", description: "责任人姓名，纯文本" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        progress: { type: "integer", minimum: 0, maximum: 100 },
        start_date: daySchema,
        end_date: daySchema,
        note: { type: "string" },
        depends_on_task_id: { type: "string" },
        depends_on_task_ids: { type: "array", items: { type: "string" } },
      },
      required: ["project_id", "title"],
    },
  },
  {
    name: "expand_task",
    description: "把一条任务拆成最多 20 条子任务。depends_on_index 从 0 开始，只能依赖同一批里更靠前的子任务。父任务如果还是待办，会改成进行中。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              assignee: { type: "string" },
              start_date: daySchema,
              end_date: daySchema,
              depends_on_index: { type: "integer", minimum: 0 },
            },
            required: ["title"],
          },
        },
      },
      required: ["task_id", "subtasks"],
    },
  },
  {
    name: "update_task_status",
    description: "更新任务状态、进度或备注。状态改为 done 且没有带 progress 时，进度会写成 100。不能删除任务。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        progress: { type: "integer", minimum: 0, maximum: 100 },
        note: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_next_tasks",
    description: "返回当前项目里前置依赖已经完成、可以优先开始的任务。进行中和已完成的任务不会出现。",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["project_id"],
    },
  },
]

/** 执行一个 MCP 工具，并把成败写入 mcp_logs。看板上的手工编辑不会走这里。 */
export async function callTool(db: D1Database, name: string, args: unknown): Promise<ToolOutcome> {
  try {
    const outcome = await dispatchTool(db, name, asRecord(args))
    await safeLog(db, name, outcome.projectId, true, outcome.summary, args, outcome.log)
    return outcome
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error)
    const message = error instanceof AppError ? error.message : "工具执行失败"
    const record = asRecord(args)
    const projectId = typeof record.project_id === "string" ? record.project_id : null
    await safeLog(db, name, projectId, false, message, args, { error: message })
    return { text: message, summary: message, projectId, isError: true }
  }
}

async function dispatchTool(db: D1Database, name: string, args: Record<string, unknown>): Promise<ToolOutcome & { log: unknown }> {
  switch (name) {
    case "list_projects": {
      const projects = await listProjects(db)
      return payload(null, `共 ${projects.length} 个项目`, projects.map(toMcpProject), { count: projects.length })
    }
    case "create_project": {
      const input = parseProject({ name: args.name, description: args.description }, false)
      if (!input.name) throw new AppError("请填写项目名称")
      const id = await createProject(db, { name: input.name, description: input.description ?? "" })
      return payload(id, `已创建项目「${input.name}」`, { id, name: input.name }, { id })
    }
    case "get_project_tasks": {
      const projectId = requiredId(args.project_id, "project_id")
      const tasks = await getProjectTasks(db, projectId, parseTaskQuery({
        q: args.q,
        assignee: args.assignee,
        status: args.status,
        from: args.from,
        to: args.to,
      }))
      return payload(projectId, `返回 ${tasks.length} 条任务`, tasks.map(toMcpTask), { count: tasks.length })
    }
    case "create_task": {
      const projectId = requiredId(args.project_id, "project_id")
      const write = taskWriteFromArgs(args, true)
      if (!write.title) throw new AppError("请填写任务名称")
      const id = await createTask(db, projectId, { ...write, title: write.title })
      return payload(projectId, `已创建任务「${write.title}」`, { id, title: write.title }, { id })
    }
    case "expand_task": {
      const taskId = requiredId(args.task_id, "task_id")
      const subtasks = parseSubtasks(args.subtasks)
      const ids = await expandTask(db, taskId, subtasks)
      const projectId = await taskProjectId(db, taskId)
      return payload(projectId, `已拆出 ${ids.length} 条子任务`, { task_id: taskId, subtask_ids: ids }, { count: ids.length })
    }
    case "update_task_status": {
      const taskId = requiredId(args.task_id, "task_id")
      if (args.status === undefined && args.progress === undefined && args.note === undefined) {
        throw new AppError("请提供状态、进度或备注")
      }
      const write = taskWriteFromArgs(args, false)
      await updateTask(db, taskId, write)
      const projectId = await taskProjectId(db, taskId)
      return payload(projectId, "已更新任务", { task_id: taskId, status: write.status ?? null, progress: write.progress ?? null }, { task_id: taskId })
    }
    case "get_next_tasks": {
      const projectId = requiredId(args.project_id, "project_id")
      const tasks = await getNextTasks(db, projectId, readLimit(args.limit))
      return payload(projectId, tasks.length > 0 ? `${tasks.length} 条任务可以开始` : "没有可以开工的任务", tasks.map(toMcpNext), { count: tasks.length })
    }
    default:
      throw new AppError(`未知工具 ${name}`)
  }
}

function taskWriteFromArgs(args: Record<string, unknown>, creating: boolean): TaskWrite {
  const body: Record<string, unknown> = {}
  if (args.title !== undefined) body.title = args.title
  if (args.parent_id !== undefined) body.parentId = args.parent_id
  if (args.assignee !== undefined) body.assignee = args.assignee
  if (args.status !== undefined) body.status = args.status
  if (args.progress !== undefined) body.progress = args.progress
  if (args.start_date !== undefined) body.startDate = args.start_date
  if (args.end_date !== undefined) body.endDate = args.end_date
  if (args.note !== undefined) body.note = args.note
  const dependencies = readDependencies(args)
  if (dependencies) body.dependsOnTaskIds = dependencies
  return parseTaskWrite(body, creating)
}

function readDependencies(args: Record<string, unknown>): string[] | undefined {
  const ids: string[] = []
  if (typeof args.depends_on_task_id === "string" && args.depends_on_task_id.trim()) ids.push(args.depends_on_task_id.trim())
  if (Array.isArray(args.depends_on_task_ids)) {
    for (const id of args.depends_on_task_ids) {
      if (typeof id !== "string" || id.trim() === "") throw new AppError("前置任务格式不对")
      ids.push(id.trim())
    }
  }
  if (ids.length === 0 && args.depends_on_task_id === undefined && args.depends_on_task_ids === undefined) return undefined
  return [...new Set(ids)]
}

function parseSubtasks(value: unknown): ExpandSubtask[] {
  if (!Array.isArray(value)) throw new AppError("subtasks 要是数组")
  const indexes: Array<number | null> = []
  const subtasks = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AppError(`第 ${index + 1} 条子任务格式不对`)
    const record = item as Record<string, unknown>
    let dependsOnIndex: number | null = null
    if (record.depends_on_index !== undefined && record.depends_on_index !== null) {
      if (typeof record.depends_on_index !== "number") throw new AppError(`第 ${index + 1} 条子任务的依赖序号不对`)
      dependsOnIndex = record.depends_on_index
    }
    indexes.push(dependsOnIndex)
    return {
      title: readText(record.title, `第 ${index + 1} 条子任务名称`, 120, true),
      assignee: readText(record.assignee, "责任人", 40, false),
      startDate: optionalDay(record.start_date, "开始日期"),
      endDate: optionalDay(record.end_date, "结束日期"),
      dependsOnIndex,
    }
  })
  assertExpandIndexes(indexes)
  return subtasks
}

function optionalDay(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string" || !isDay(value)) throw new AppError(`${label}要写成 YYYY-MM-DD`)
  return value
}

function payload(projectId: string | null, summary: string, data: unknown, log: unknown): ToolOutcome & { log: unknown } {
  return { projectId, summary, text: `${summary}\n${JSON.stringify(data, null, 2)}`, log }
}

function toMcpProject(project: ProjectDto) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    task_count: project.taskCount,
    done_count: project.doneCount,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }
}

function toMcpTask(task: TaskDto) {
  return {
    id: task.id,
    project_id: task.projectId,
    parent_id: task.parentId,
    parent_title: task.parentTitle,
    title: task.title,
    assignee: task.assignee,
    status: task.status,
    progress: task.progress,
    start_date: task.startDate,
    end_date: task.endDate,
    note: task.note,
    depth: task.depth,
    depends_on_task_ids: task.dependsOnTaskIds,
  }
}

function toMcpNext(task: NextTaskDto) {
  return { ...toMcpTask(task), ready_reason: task.readyReason }
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new AppError(`请填写 ${label}`)
  return value.trim()
}

function readLimit(value: unknown): number {
  if (value === undefined) return 10
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
    throw new AppError("limit 要是 1 到 50 的整数")
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

async function safeLog(db: D1Database, toolName: string, projectId: string | null, ok: boolean, summary: string, args: unknown, result: unknown) {
  try {
    await writeLog(db, {
      toolName,
      projectId,
      ok,
      summary,
      detail: JSON.stringify({ arguments: args ?? {}, result }),
    })
  } catch (error) {
    console.error(error)
  }
}
