# TaskPilot

个人用的项目任务板。看板和 Remote MCP 读写同一份 Cloudflare D1 数据。需求见 [prd/01-需求/2026-11-06-TaskPilot产品需求.md](prd/01-需求/2026-11-06-TaskPilot产品需求.md)。

## 技术栈

| 部分 | 选择                                                            |
| ---- | --------------------------------------------------------------- |
| 后端 | Cloudflare Workers、Hono、D1                                    |
| MCP  | `POST /mcp`，无状态 JSON-RPC                                    |
| 前端 | Vue 3、Vite、Tailwind CSS                                       |
| 部署 | Workers 免费档：静态看板 + API + MCP，域名 `task.junziyuyi.top` |

不使用 NestJS、Prisma 或 PostgreSQL。甘特图是自绘的：拖动色条改日期，拖两端改开始或结束。顶栏「上一步」撤回刚刚在看板上做成的一步。

## 本地运行

需要 Node.js 22 和 pnpm 9。

```bash
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars
pnpm db:migrate:local
pnpm dev
```

| 服务     | 地址                             |
| -------- | -------------------------------- |
| 看板     | http://127.0.0.1:5173            |
| Worker   | http://127.0.0.1:8787            |
| 健康检查 | http://127.0.0.1:8787/api/health |
| MCP      | http://127.0.0.1:8787/mcp        |

本地示例密码是 `taskpilot`，MCP Token 是 `dev-mcp-token`。这两个值只在 `.dev.vars` 里，不要提交真实密码。

Vite 会把 `/api` 和 `/mcp` 代理到 Worker。

## 部署

只用 Cloudflare 免费档：Workers、D1、自定义域名。不要开通 Workers Paid，也不要把 `junziyuyi.top` 升级成付费套餐，不要加 R2、Queues、Durable Objects。

看板和接口都在 `https://task.junziyuyi.top`。`/api`、`/mcp` 进 Worker，其余路径是构建好的静态页面。域名需要在当前账号里，套餐保持 Free Website。

```bash
cd apps/server
npx wrangler d1 create taskpilot
```

把返回的 `database_id` 写进 `apps/server/wrangler.toml`。

```bash
pnpm --filter @taskpilot/web build
pnpm --filter @taskpilot/server db:migrate:remote
cd apps/server
npx wrangler secret put SITE_PASSWORD
npx wrangler secret put MCP_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

## 接入 Cursor

生产地址必须是 HTTPS。

```json
{
  "mcpServers": {
    "taskpilot": {
      "url": "https://task.junziyuyi.top/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

可用工具：`list_projects`、`create_project`、`get_project_tasks`、`create_task`、`expand_task`、`update_task_status`、`get_next_tasks`。MCP 不能删除数据，删除在看板上做。

本地如果要用 Cursor 连本机，把 url 换成 `http://127.0.0.1:8787/mcp`。

## 检查

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

## Git 提交

安装依赖后 Husky 会自动启用。提交前只检查本次暂存内容，`git commit` 和 `pnpm cz` 走同一套门禁：

- 前端（`apps/web` 和根目录配置）：Prettier、ESLint、Stylelint，以及受影响 workspace 的类型检查。error 阻断，warning 不阻断。
- 后端（`apps/server`）：ESLint 和 `tsc --noEmit`，只阻断 error，不跑 Stylelint。
- `prd/` 不参与提交前检查。
- commitlint 要求 Conventional Commits，格式是 `type(scope): subject`，scope 必填。常用 scope：`web`、`server`、`repo`。

```bash
pnpm cz
```

```text
feat(web): 增加任务筛选
fix(server): 拒绝无效的 MCP token
chore(repo): 接入提交校验
```
