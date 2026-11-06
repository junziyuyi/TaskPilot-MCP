const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function timingEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

/** 签发给看板的会话。MCP Token 不能拿来冒充它。 */
export async function issueSession(secret: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + SESSION_TTL_MS
  const signature = await hmacHex(secret, String(expiresAt))
  return { token: `tps.${expiresAt}.${signature}`, expiresAt }
}

export async function verifySession(secret: string, token: string, now = Date.now()): Promise<boolean> {
  const [prefix, expiresText, signature] = token.split(".")
  if (prefix !== "tps" || !expiresText || !signature || token.split(".").length !== 3) return false
  const expiresAt = Number(expiresText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false
  const expected = await hmacHex(secret, expiresText)
  return timingEqual(expected, signature)
}

/** 用 HMAC 比较调用方带来的 MCP Token，避免直接比较原文。 */
export async function verifyMcpToken(secret: string, configured: string, presented: string): Promise<boolean> {
  if (!secret || !configured || !presented || presented.length > 256) return false
  const expected = await hmacHex(secret, configured)
  const actual = await hmacHex(secret, presented)
  return timingEqual(expected, actual)
}
