import { verifyMcpToken } from "../auth"
import type { Env } from "../env"
import { callTool, TOOLS } from "./tools"

/**
 * 无状态 JSON-RPC。
 * 轻记用 MCP SDK 的 Streamable HTTP；Workers 免费档不绑 Durable Object，
 * 所以这里按同一协议返回 JSON，不用 SSE。见 prd/01-需求/2026-11-06-TaskPilot产品需求.md。
 */
export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_TOKEN || !env.SESSION_SECRET) {
    return rpcResponse(null, -32603, "服务还没有配置 MCP_TOKEN 或 SESSION_SECRET", 500)
  }
  const header = request.headers.get("Authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!(await verifyMcpToken(env.SESSION_SECRET, env.MCP_TOKEN, token))) {
    return rpcResponse(null, -32001, "MCP 凭证不正确", 401)
  }
  if (request.method !== "POST") {
    return rpcResponse(null, -32600, "MCP 只接受 POST JSON", 405)
  }

  const payload = await request.json().catch(() => undefined)
  if (payload === undefined) return rpcResponse(null, -32700, "JSON 无法解析", 400)
  if (Array.isArray(payload)) {
    const responses = []
    for (const item of payload) {
      const response = await dispatchMessage(item, env)
      if (response) responses.push(response)
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: mcpHeaders() })
    return Response.json(responses, { headers: mcpHeaders() })
  }
  const response = await dispatchMessage(payload, env)
  if (!response) return new Response(null, { status: 202, headers: mcpHeaders() })
  return Response.json(response, { headers: mcpHeaders() })
}

async function dispatchMessage(payload: unknown, env: Env): Promise<Record<string, unknown> | null> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return rpcBody(null, -32600, "请求格式不对")
  }
  const message = payload as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown }
  const hasId = Object.prototype.hasOwnProperty.call(message, "id")
  const id = hasId ? normalizeId(message.id) : null
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcBody(id, -32600, "请求格式不对")
  if (!hasId) return null

  if (message.method === "initialize") {
    return { jsonrpc: "2.0", id, result: initializeResult(message.params) }
  }
  if (message.method === "ping") return { jsonrpc: "2.0", id, result: {} }
  if (message.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } }
  if (message.method === "tools/call") {
    const params = asRecord(message.params)
    if (typeof params.name !== "string") return rpcBody(id, -32602, "缺少工具名")
    const outcome = await callTool(env.DB, params.name, params.arguments)
    const result: Record<string, unknown> = { content: [{ type: "text", text: outcome.text }] }
    if (outcome.isError) result.isError = true
    return { jsonrpc: "2.0", id, result }
  }
  return rpcBody(id, -32601, "不支持这个方法")
}

function initializeResult(params: unknown) {
  const requested = asRecord(params).protocolVersion
  const protocolVersion = requested === "2024-11-05" ? "2024-11-05" : "2025-03-26"
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: "taskpilot", version: "0.1.0" },
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeId(id: unknown): number | string | null {
  if (typeof id === "string" || typeof id === "number" || id === null) return id
  return null
}

function rpcBody(id: number | string | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function rpcResponse(id: number | string | null, code: number, message: string, status: number) {
  return Response.json(rpcBody(id, code, message), { status, headers: mcpHeaders() })
}

function mcpHeaders(): HeadersInit {
  return { "MCP-Protocol-Version": "2025-03-26" }
}
