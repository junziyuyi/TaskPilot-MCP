import { describe, expect, it } from "vitest"
import {
  applyStatusPatch,
  assertDateOrder,
  createsCycle,
  createsParentCycle,
  isDay,
  matchesTask,
  orderTasks,
  presentTasks,
  selectNextTasks,
  subtreeIds,
  type Dependency,
  type TaskRecord,
} from "./domain"

function task(partial: Partial<TaskRecord> & Pick<TaskRecord, "id" | "title">): TaskRecord {
  return {
    projectId: "p1",
    parentId: null,
    assignee: "",
    status: "todo",
    progress: 0,
    startDate: null,
    endDate: null,
    note: "",
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe("orderTasks", () => {
  it("父任务排在子任务前面，断掉的父级不会把列表走死", () => {
    const tasks = [
      task({ id: "child", title: "子", parentId: "parent", sortOrder: 0, createdAt: 2 }),
      task({ id: "parent", title: "父", sortOrder: 1, createdAt: 1 }),
      task({ id: "root", title: "根", sortOrder: 0, createdAt: 3 }),
      task({ id: "orphan", title: "孤儿", parentId: "missing", sortOrder: 0, createdAt: 4 }),
    ]
    expect(orderTasks(tasks).map((item) => item.id)).toEqual(["root", "parent", "child", "orphan"])
  })
})

describe("matchesTask", () => {
  const sample = task({
    id: "a",
    title: "设计表",
    note: "含索引",
    assignee: "Ada",
    status: "todo",
    startDate: "2026-11-01",
    endDate: "2026-11-05",
  })

  it("关键字匹配标题和备注，责任人忽略大小写", () => {
    expect(matchesTask(sample, { q: "索引" })).toBe(true)
    expect(matchesTask(sample, { q: "不存在" })).toBe(false)
    expect(matchesTask(sample, { assignee: "ada" })).toBe(true)
  })

  it("日期按重叠判断，没排期的任务在有日期条件时排除", () => {
    expect(matchesTask(sample, { from: "2026-11-05", to: "2026-11-06" })).toBe(true)
    expect(matchesTask(sample, { from: "2026-11-06" })).toBe(false)
    const unscheduled = task({ id: "b", title: "未排期" })
    expect(matchesTask(unscheduled, {})).toBe(true)
    expect(matchesTask(unscheduled, { from: "2026-11-01" })).toBe(false)
  })
})

describe("presentTasks", () => {
  it("父任务被筛掉后，子任务缩进只计算可见祖先", () => {
    const tasks = [
      task({ id: "root", title: "根" }),
      task({ id: "parent", title: "父", parentId: "root" }),
      task({ id: "child", title: "子", parentId: "parent" }),
    ]
    const shown = presentTasks(tasks, [], new Set(["root", "child"]))
    expect(shown.map((item) => [item.id, item.depth])).toEqual([
      ["root", 0],
      ["child", 1],
    ])
  })
})

describe("dependencies", () => {
  const dependencies: Dependency[] = [
    { taskId: "a", dependsOnTaskId: "b" },
    { taskId: "b", dependsOnTaskId: "c" },
  ]

  it("识别会闭合的依赖，并允许指向更下游的前置", () => {
    expect(createsCycle(dependencies, "c", ["a"])).toBe(true)
    expect(createsCycle(dependencies, "a", ["c"])).toBe(false)
    expect(createsCycle(dependencies, "a", ["a"])).toBe(true)
  })

  it("不能把任务挂到自己的子孙下面", () => {
    const tasks = [
      task({ id: "parent", title: "父" }),
      task({ id: "child", title: "子", parentId: "parent" }),
    ]
    expect(createsParentCycle(tasks, "parent", "child")).toBe(true)
    expect(createsParentCycle(tasks, "child", "parent")).toBe(false)
  })
})

describe("selectNextTasks", () => {
  it("跳过仍被挡住的任务，保留前置已完成但还标着阻塞的任务", () => {
    const tasks = [
      task({ id: "done", title: "已完成", status: "done", startDate: "2026-11-01" }),
      task({ id: "ready", title: "可开始", status: "todo", startDate: "2026-11-03", sortOrder: 2 }),
      task({ id: "waiting", title: "还在等", status: "todo", startDate: "2026-11-02" }),
      task({ id: "stuck", title: "标记阻塞", status: "blocked", startDate: "2026-11-02" }),
      task({ id: "doing", title: "进行中", status: "in_progress", startDate: "2026-11-01" }),
      task({ id: "later", title: "没日期", status: "todo" }),
    ]
    const dependencies = [
      { taskId: "waiting", dependsOnTaskId: "doing" },
      { taskId: "stuck", dependsOnTaskId: "done" },
      { taskId: "ready", dependsOnTaskId: "done" },
    ]
    const next = selectNextTasks(tasks, dependencies)
    expect(next.map((item) => item.task.id)).toEqual(["stuck", "ready", "later"])
    expect(next[0]?.readyReason).toContain("仍标记为阻塞")
  })
})

describe("applyStatusPatch", () => {
  const current = task({ id: "a", title: "a", status: "todo", progress: 20, note: "旧备注" })

  it("完成且没带进度时写成 100，显式进度保持原值", () => {
    expect(applyStatusPatch(current, { status: "done" }).progress).toBe(100)
    expect(applyStatusPatch(current, { status: "done", progress: 40 }).progress).toBe(40)
    expect(applyStatusPatch(current, { status: "in_progress" }).progress).toBe(20)
  })
})

describe("dates and subtree", () => {
  it("拒绝不存在的日历日和颠倒的区间", () => {
    expect(isDay("2026-02-31")).toBe(false)
    expect(isDay("2026-11-06")).toBe(true)
    expect(() => assertDateOrder("2026-11-06", "2026-11-05")).toThrow("结束日期不能早于开始日期")
  })

  it("子树包含子孙，不包含兄弟", () => {
    const tasks = [
      task({ id: "root", title: "根" }),
      task({ id: "child", title: "子", parentId: "root" }),
      task({ id: "leaf", title: "叶", parentId: "child" }),
      task({ id: "sibling", title: "兄弟" }),
    ]
    expect(subtreeIds(tasks, "root")).toEqual(["root", "child", "leaf"])
  })
})
