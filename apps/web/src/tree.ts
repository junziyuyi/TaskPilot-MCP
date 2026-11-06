import type { TaskOption } from './types'

/** 自己和自己的子孙不能再被选成父任务。 */
export function excludedParentIds(options: TaskOption[], taskId: string | null): Set<string> {
  const excluded = new Set<string>()
  if (!taskId) return excluded
  excluded.add(taskId)
  const children = new Map<string, string[]>()
  for (const option of options) {
    if (!option.parentId) continue
    const list = children.get(option.parentId) ?? []
    list.push(option.id)
    children.set(option.parentId, list)
  }
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (excluded.has(child)) continue
      excluded.add(child)
      visit(child)
    }
  }
  visit(taskId)
  return excluded
}
