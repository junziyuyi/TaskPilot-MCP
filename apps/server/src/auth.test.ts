import { describe, expect, it } from "vitest"
import { issueSession, verifyMcpToken, verifySession } from "./auth"

describe("session", () => {
  it("在过期前有效，签名被改过则无效", async () => {
    const issued = await issueSession("secret", 1_000)
    expect(await verifySession("secret", issued.token, 1_000)).toBe(true)
    expect(await verifySession("secret", issued.token, issued.expiresAt + 1)).toBe(false)
    const [prefix, expiresAt] = issued.token.split(".")
    expect(await verifySession("secret", `${prefix}.${expiresAt}.deadbeef`, 1_000)).toBe(false)
  })

  it("MCP Token 必须和配置一致", async () => {
    expect(await verifyMcpToken("secret", "dev-mcp-token", "dev-mcp-token")).toBe(true)
    expect(await verifyMcpToken("secret", "dev-mcp-token", "other")).toBe(false)
    expect(await verifyMcpToken("secret", "dev-mcp-token", "")).toBe(false)
  })
})
