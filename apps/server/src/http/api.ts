import { Hono } from "hono"
import { hmacHex, issueSession, timingEqual, verifySession } from "../auth"
import {
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getNextTasks,
  getProjectTasks,
  listLogs,
  listProjects,
  updateProject,
  updateTask,
} from "../data"
import type { Env } from "../env"
import { AppError } from "../errors"
import { parseProject, parseTaskQuery, parseTaskWrite } from "../input"

export const api = new Hono<{ Bindings: Env }>()

api.use("*", async (c, next) => {
  if (isPublic(c.req.path)) return next()
  if (!c.env.SESSION_SECRET) return c.json({ error: "服务还没有配置 SESSION_SECRET" }, 500)
  const header = c.req.header("Authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!(await verifySession(c.env.SESSION_SECRET, token))) return c.json({ error: "需要登录" }, 401)
  await next()
})

api.get("/health", (c) => c.json({ ok: true, service: "taskpilot" }))

api.post("/auth/login", async (c) => {
  if (!c.env.SITE_PASSWORD || !c.env.SESSION_SECRET) {
    return c.json({ error: "服务还没有配置 SITE_PASSWORD 或 SESSION_SECRET" }, 500)
  }
  return run(c, async () => {
    const body = await readBody(c)
    const password = typeof body.password === "string" ? body.password : ""
    if (!password || password.length > 256) throw new AppError("密码不正确", 401)
    const actual = await hmacHex(c.env.SESSION_SECRET, password)
    const expected = await hmacHex(c.env.SESSION_SECRET, c.env.SITE_PASSWORD)
    if (!timingEqual(actual, expected)) throw new AppError("密码不正确", 401)
    return c.json(await issueSession(c.env.SESSION_SECRET))
  })
})

api.get("/projects", (c) => run(c, async () => c.json({ projects: await listProjects(c.env.DB) })))

api.post("/projects", (c) =>
  run(c, async () => {
    const input = parseProject(await readBody(c), false)
    if (!input.name) throw new AppError("请填写项目名称")
    const id = await createProject(c.env.DB, { name: input.name, description: input.description ?? "" })
    return c.json({ id }, 201)
  }),
)

api.patch("/projects/:id", (c) =>
  run(c, async () => {
    await updateProject(c.env.DB, c.req.param("id"), parseProject(await readBody(c), true))
    return c.json({ ok: true })
  }),
)

api.delete("/projects/:id", (c) =>
  run(c, async () => {
    await deleteProject(c.env.DB, c.req.param("id"))
    return c.json({ ok: true })
  }),
)

api.get("/projects/:id/tasks", (c) =>
  run(c, async () => {
    const query = parseTaskQuery({
      q: c.req.query("q"),
      assignee: c.req.query("assignee"),
      status: c.req.query("status"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    })
    const projectId = c.req.param("id")
    const [tasks, options] = await Promise.all([
      getProjectTasks(c.env.DB, projectId, query),
      getProjectTasks(c.env.DB, projectId, {}),
    ])
    return c.json({
      tasks,
      options: options.map((task) => ({
        id: task.id,
        title: task.title,
        parentId: task.parentId,
        status: task.status,
        assignee: task.assignee,
      })),
    })
  }),
)

api.post("/projects/:id/tasks", (c) =>
  run(c, async () => {
    const write = parseTaskWrite(await readBody(c), true)
    if (!write.title) throw new AppError("请填写任务名称")
    const id = await createTask(c.env.DB, c.req.param("id"), { ...write, title: write.title })
    return c.json({ id }, 201)
  }),
)

api.get("/projects/:id/next", (c) =>
  run(c, async () => {
    const limit = readLimit(c.req.query("limit"))
    return c.json({ tasks: await getNextTasks(c.env.DB, c.req.param("id"), limit) })
  }),
)

api.patch("/tasks/:id", (c) =>
  run(c, async () => {
    await updateTask(c.env.DB, c.req.param("id"), parseTaskWrite(await readBody(c), false))
    return c.json({ ok: true })
  }),
)

api.delete("/tasks/:id", (c) =>
  run(c, async () => {
    await deleteTask(c.env.DB, c.req.param("id"))
    return c.json({ ok: true })
  }),
)

api.get("/logs", (c) =>
  run(c, async () => {
    const projectId = c.req.query("projectId")?.trim() || null
    return c.json({ logs: await listLogs(c.env.DB, projectId, 30) })
  }),
)

function isPublic(path: string): boolean {
  return path.endsWith("/health") || path.endsWith("/auth/login")
}

function readLimit(value: string | undefined): number {
  if (!value) return 10
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError("limit 要是 1 到 50 的整数")
  return limit
}

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("请求体要是 JSON 对象")
  return body as Record<string, unknown>
}

async function run(c: { json: (body: unknown, status?: number) => Response }, action: () => Promise<Response>) {
  try {
    return await action()
  } catch (error) {
    if (error instanceof AppError) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: "服务器出错了" }, 500)
  }
}
