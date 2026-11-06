/** 业务规则失败。status 给看板 API 用，MCP 只取 message。 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}
