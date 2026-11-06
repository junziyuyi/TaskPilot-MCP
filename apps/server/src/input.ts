import { AppError } from "./errors"
import { assertDateOrder, isDay, isStatus, type TaskStatus } from "./domain"

function textLength(value: string): number {
  return [...value].length
}

export function readText(value: unknown, label: string, max: number, required: boolean): string {
  if (value === undefined || value === null) {
    if (!required) return ""
    throw new AppError(`请填写${label}`)
  }
  if (typeof value !== "string") throw new AppError(`${label}格式不对`)
  const text = value.trim()
  if (required && text === "") throw new AppError(`请填写${label}`)
  if (textLength(text) > max) throw new AppError(`${label}不能超过 ${max} 个字`)
  return text
}

export function readOptionalDay(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string" || !isDay(value)) throw new AppError(`${label}要写成 YYYY-MM-DD`)
  return value
}

export function readRequiredDay(value: unknown, label: string): string | null {
  const day = readOptionalDay(value === undefined ? null : value, label)
  return day ?? null
}

export function readProgress(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new AppError("进度要是 0 到 100 的整数")
  }
  return value
}

export function readStatus(value: unknown): TaskStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (!isStatus(value)) throw new AppError("状态只能是 todo、in_progress、blocked、done")
  return value
}

export function readId(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string" || value.trim() === "") throw new AppError(`${label}格式不对`)
  return value.trim()
}

export function readIdList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new AppError("前置任务格式不对")
  }
  return [...new Set(value.map((item) => item.trim()))]
}

export interface ProjectWrite {
  name?: string
  description?: string
}

export function parseProject(body: Record<string, unknown>, partial: boolean): ProjectWrite {
  const result: ProjectWrite = {}
  if (!partial || body.name !== undefined) result.name = readText(body.name, "项目名称", 80, true)
  if (!partial || body.description !== undefined) result.description = readText(body.description, "项目说明", 500, false)
  if (result.name === undefined && result.description === undefined) throw new AppError("没有可以保存的内容")
  return result
}

export interface TaskWrite {
  title?: string
  parentId?: string | null
  assignee?: string
  status?: TaskStatus
  progress?: number
  startDate?: string | null
  endDate?: string | null
  note?: string
  dependsOnTaskIds?: string[]
}

export function parseTaskWrite(body: Record<string, unknown>, creating: boolean): TaskWrite {
  const write: TaskWrite = {}
  if (creating || body.title !== undefined) write.title = readText(body.title, "任务名称", 120, true)
  if (body.parentId !== undefined) write.parentId = readId(body.parentId, "父任务")
  if (body.assignee !== undefined) write.assignee = readText(body.assignee, "责任人", 40, false)
  if (body.status !== undefined) write.status = readStatus(body.status)
  if (body.progress !== undefined) write.progress = readProgress(body.progress)
  if (body.startDate !== undefined) write.startDate = readOptionalDay(body.startDate, "开始日期") ?? null
  if (body.endDate !== undefined) write.endDate = readOptionalDay(body.endDate, "结束日期") ?? null
  if (body.note !== undefined) write.note = readText(body.note, "备注", 1000, false)
  if (body.dependsOnTaskIds !== undefined) write.dependsOnTaskIds = readIdList(body.dependsOnTaskIds)
  if (creating && !write.title) throw new AppError("请填写任务名称")
  if (!creating && Object.keys(write).length === 0) throw new AppError("没有可以保存的内容")
  const start = write.startDate === undefined ? null : write.startDate
  const end = write.endDate === undefined ? null : write.endDate
  if (write.startDate !== undefined || write.endDate !== undefined) {
    if (creating) assertDateOrder(start, end)
  }
  return write
}

export interface TaskQueryInput {
  q?: string
  assignee?: string
  status?: string
  from?: string
  to?: string
}

export function parseTaskQuery(source: Record<string, unknown>): TaskQueryInput {
  const query: TaskQueryInput = {}
  if (typeof source.q === "string" && source.q.trim()) query.q = readText(source.q, "关键字", 80, false)
  if (typeof source.assignee === "string" && source.assignee.trim()) query.assignee = readText(source.assignee, "责任人", 40, false)
  if (source.status) {
    const status = readStatus(source.status)
    if (status) query.status = status
  }
  const from = readOptionalDay(source.from === "" ? undefined : source.from, "开始日期")
  const to = readOptionalDay(source.to === "" ? undefined : source.to, "结束日期")
  if (from) query.from = from
  if (to) query.to = to
  if (query.from && query.to) assertDateOrder(query.from, query.to)
  return query
}
