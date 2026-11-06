/** 与服务端 TaskStatus 保持一致。 */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export interface Project {
  id: string
  name: string
  description: string
  taskCount: number
  doneCount: number
  createdAt: number
  updatedAt: number
}

export interface Task {
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
  readyReason?: string
}

export interface TaskOption {
  id: string
  title: string
  parentId: string | null
  status: TaskStatus
  assignee: string
}

export interface McpLog {
  id: string
  toolName: string
  projectId: string | null
  ok: boolean
  summary: string
  detail: string
  createdAt: number
}

export interface Filters {
  q: string
  assignee: string
  status: '' | TaskStatus
  from: string
  to: string
}

export interface TaskDraft {
  title: string
  parentId: string | null
  assignee: string
  status: TaskStatus
  progress: number
  startDate: string | null
  endDate: string | null
  note: string
  dependsOnTaskIds: string[]
}
