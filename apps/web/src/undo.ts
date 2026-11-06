import type { Task } from '@/types'

/** 父任务在前，同一层按原排序，方便按这个顺序重新创建。 */
export function subtreeInCreateOrder(tasks: Task[], rootId: string): Task[] {
  const children = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const list = children.get(task.parentId) ?? []
    list.push(task)
    children.set(task.parentId, list)
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  }
  const root = tasks.find((task) => task.id === rootId)
  if (!root) return []
  const ordered: Task[] = []
  const visit = (task: Task) => {
    ordered.push(task)
    for (const child of children.get(task.id) ?? []) visit(child)
  }
  visit(root)
  return ordered
}

/** 没被删掉、但前置里包含被删任务的任务。撤回时要把这些前置指回新 id。 */
export function outsideDependents(tasks: Task[], removedIds: ReadonlySet<string>): Task[] {
  return tasks.filter((task) => !removedIds.has(task.id) && task.dependsOnTaskIds.some((id) => removedIds.has(id)))
}

export function remapId(id: string | null, idMap: ReadonlyMap<string, string>): string | null {
  if (!id) return null
  return idMap.get(id) ?? id
}

export function remapIds(ids: string[], idMap: ReadonlyMap<string, string>): string[] {
  return ids.map((id) => idMap.get(id) ?? id)
}
