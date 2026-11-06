# TaskPilot PRD

冲突时以本目录为准。没有单独的原型目录，验收看 PRD 里的完成定义和看板上的真实行为。

## 已锁定决策

| 决策 | 结论 |
| --- | --- |
| 运行时 | Cloudflare Workers + Hono + D1。前端 Vue 3 + Vite + Tailwind，部署到 Pages |
| 工程组织 | 只借轻记的做法：先写 PRD、再锁技术栈、`apps/web` 与 `apps/server` 分开。不照搬 NestJS、Prisma、PostgreSQL |
| 谁能改数据 | 个人单用。看板凭站点密码换会话，MCP 另用 Bearer Token。责任人是自由文本，不建用户表 |
| 第一版编辑 | 表单创建和编辑。甘特与看板可切换，并能改状态。拖动改日期、拖卡片、在图上拉依赖线放到下一期 |
| MCP 传输 | 无状态 JSON-RPC（Streamable HTTP 的 JSON 响应）。不用 SSE，不绑 Durable Objects，以便留在 Workers 免费档 |
| 依赖 | 多对多，落在 `task_dependencies`。工具入参同时接受 `depends_on_task_id` 和 `depends_on_task_ids` |
| 删除 | 看板可以删项目和任务。MCP 不提供删除工具 |

## 文档

| 文档 | 说明 |
| --- | --- |
| [2026-11-06-TaskPilot产品需求.md](01-需求/2026-11-06-TaskPilot产品需求.md) | 产品需求、技术栈、表结构、接口与分期 |
