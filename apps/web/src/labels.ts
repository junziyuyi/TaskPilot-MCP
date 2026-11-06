import type { TaskStatus } from './types'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '完成',
}

export const STATUS_BAR: Record<TaskStatus, string> = {
  todo: '#6e7c90',
  in_progress: '#3d7dff',
  blocked: '#d85a4c',
  done: '#2f9d78',
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

/** 当前状态，以及流程上更靠后的状态。已完成只剩自身。 */
export function forwardStatuses(current: TaskStatus): TaskStatus[] {
  return STATUS_ORDER.slice(STATUS_ORDER.indexOf(current))
}

export function formatWhen(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value)
}

export function formatSpan(start: string | null, end: string | null): string {
  if (!start && !end) return '未排期'
  if (start && end && start !== end) return `${start.slice(5)} – ${end.slice(5)}`
  return (start ?? end)!.slice(5)
}
