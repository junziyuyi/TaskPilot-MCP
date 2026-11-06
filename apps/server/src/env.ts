export interface Env {
  DB: D1Database
  /** 看板登录密码。 */
  SITE_PASSWORD: string
  /** Remote MCP 的 Bearer Token，和站点密码分开。 */
  MCP_TOKEN: string
  /** 签发会话、比较秘密时使用的 HMAC 密钥。 */
  SESSION_SECRET: string
  /** 允许的看板源，例如 http://localhost:5173。 */
  WEB_ORIGIN: string
}
