import { Hono } from "hono"
import type { Env } from "./env"
import { api } from "./http/api"
import { handleMcp } from "./mcp/http"

const app = new Hono<{ Bindings: Env }>()

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(c.env.WEB_ORIGIN) })
  }
  await next()
  for (const [key, value] of Object.entries(corsHeaders(c.env.WEB_ORIGIN))) {
    c.header(key, value)
  }
})

app.route("/api", api)
app.all("/mcp", (c) => handleMcp(c.req.raw, c.env))
app.get("/", (c) => c.json({ service: "taskpilot", health: "/api/health", mcp: "/mcp" }))

export default app

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "http://localhost:5173",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}
