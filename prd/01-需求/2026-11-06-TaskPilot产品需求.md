# TaskPilot 产品需求

状态：2026-11-06 已按三项拍板锁定，并作为第一版实现依据。

拍板记录：

1. 运行时走 Cloudflare 免费档，不照搬轻记的 NestJS / PostgreSQL。
2. 个人单用：站点密码 + 独立 MCP Token，责任人是文本。
3. 甘特可以拖动色条改日期。看板改状态仍用下拉，不拖卡片。

## 1. Executive Summary

- **Problem Statement**: 个人项目的任务、时间和依赖散落在对话里，AI 客户端无法按项目读进度，也无法安全地写回「下一步可以开工的任务」。
- **Proposed Solution**: 一个按当前项目隔离的任务板（甘特 + 看板），后端同时提供看板 API 和 Remote MCP。Cursor 等客户端通过 7 个工具读写同一份 D1 数据。
- **Success Criteria**:
  - 未登录调用 `/api/projects` 返回 401；密码正确后能创建项目、任务，并在甘特与看板之间切换。
  - 筛选同时作用于当前项目：关键字、责任人、状态、日期范围四项可组合，结果不包含其他项目的任务。
  - `get_next_tasks` 不返回已完成、进行中、或仍有未完成前置依赖的任务。
  - `tools/list` 恰好暴露下面 7 个工具，且错误凭证访问 `/mcp` 返回 401。
  - 领域规则由 `apps/server` 的单元测试覆盖：排序、筛选、循环依赖、可开工任务、完成时进度。

## 2. User Experience & Functionality

### 用户

只有一类人：维护自己项目进度的开发者。同一个人会打开看板，也会让 Cursor 通过 MCP 改任务。没有协作者账号，没有权限分级。

### 用户故事

**故事 1：按项目隔离**

作为使用者，我要建立并切换多个项目，这样「B2B 电商平台」和「个人作品集」的任务不会混在一起。

完成定义：

- 可以创建、改名、删除项目。删除项目会删掉它的任务和依赖，不删历史 MCP 日志。
- 顶栏始终有且只有一个当前项目。任务、筛选、可开工列表、甘特都只读这个项目。
- 没有项目时，主区域说明「还没有项目」，并提供创建入口。

**故事 2：拆任务并看时间**

作为使用者，我要把大任务拆成子任务，并看到开始日、结束日、责任人、进度、依赖和状态。

完成定义：

- 任务字段：标题、父任务、责任人（可空文本）、状态、进度 0–100 的整数、开始日、结束日、备注、零到多条前置任务。
- 状态只有 `todo`、`in_progress`、`blocked`、`done`。界面文案依次为待办、进行中、阻塞、完成。
- 甘特展示任务名、责任人、日期条、进度填充、状态色、依赖箭头。时间轴铺满甘特区域的剩余宽度；任务跨度很长时改为横向滚动。
- 拖动色条整体平移开始日和结束日，拖两端只改对应的那一天，松手后按天写回。没排期的行可以拖出一段日期。结束日不会被拖到开始日之前。
- 顶栏「上一步」撤回当前项目里刚刚在看板上做成的一步：改日期、改状态、保存或新建任务、删除任务、修改项目名称或说明。可以连续点，最多记住 30 步。刷新页面后清空。MCP 写入不从这里撤回。
- 看板按四种状态分列。在甘特或看板上改状态下拉，即写回同一条任务。看板不支持拖卡片。
- 结束日早于开始日时保存失败，并说明原因。
- 把任务设成自己的子孙、或把依赖连成环时保存失败。
- 不能在甘特上拖线建立依赖，依赖仍在表单里改。

**故事 3：缩小当前这张表**

作为使用者，我要按关键字、责任人、状态和日期范围缩小任务，以便只看这一周某个人的未完成工作。

完成定义：

- 关键字匹配标题和备注，不区分大小写。
- 责任人按包含匹配，不区分大小写。
- 状态是单选，空表示全部。
- 日期按区间重叠：任务的有效日期与 `[from, to]` 有交集才留下。只填了开始或结束的任务，另一头用已填的那一天补齐。
- 有日期条件时，完全没排期的任务不出现。没有日期条件时，它们保留。
- 父任务被筛掉时，命中的子任务仍然显示，缩进只计算仍可见的祖先。

**故事 4：看见 AI 改了什么**

作为使用者，我要在看板上看到 MCP 工具调用记录，以便确认 Cursor 刚才改的是哪条任务。

完成定义：

- 每次 MCP 工具调用写一条日志：工具名、关联项目（没有则为空）、成败、一行摘要、压缩后的参数。
- 看板上的手工编辑不写 `mcp_logs`。
- 日志面板默认展开当前项目的记录，并带上未绑定项目的调用（例如列出全部项目）。每 5 秒重新拉取。不建 WebSocket。
- 日志不保存整棵任务树，摘要和参数合计截断，避免大字段占满 D1。

**故事 5：让 AI 推进当前项目**

作为使用者，我要把 Cursor 接到 `/mcp`，让它列出项目、拆任务、改状态，并询问下一步可以开工的任务。

完成定义见第 3 节。MCP 不能删除项目或任务。

### 非目标

- 多用户、注册、角色、可撤销的多枚 Token。
- 拖拽看板卡片改状态、在甘特上绘制依赖。
- 父任务进度自动汇总子任务。
- SSE 长连接、MCP Resources、Prompts、Sampling。
- 邮件、文件上传、移动端独立 App。
- 把责任人做成账号。

## 3. AI System Requirements

### 传输与鉴权

- 入口：`POST /mcp`，`Content-Type: application/json`，body 为 JSON-RPC 2.0。
- 协议版本接受 `2025-03-26` 和 `2024-11-05`。
- 每个请求单独处理，不发 `Mcp-Session-Id`。`notifications/initialized` 返回 202，没有 body。
- 请求头 `Authorization: Bearer <MCP_TOKEN>`。Token 与站点密码不是同一个秘密。比较前用 `SESSION_SECRET` 做 HMAC，再做定长比较。
- 凭证错误返回 HTTP 401。工具参数或业务规则错误返回 HTTP 200，`result.isError = true`，方便客户端把原因展示给模型。
- 支持的方法：`initialize`、`notifications/initialized`、`ping`、`tools/list`、`tools/call`。

### 工具

工具入参用 snake_case，与下面的名字一致。模型读到的文本是一行中文摘要加 JSON。

| 工具 | 作用 | 关键入参 |
| --- | --- | --- |
| `list_projects` | 全部项目，含任务数和已完成数 | 无 |
| `create_project` | 新建项目 | `name`，可选 `description` |
| `get_project_tasks` | 当前项目的任务，树形顺序，可筛选 | `project_id`，可选 `status`、`q`、`assignee`、`from`、`to` |
| `create_task` | 新建任务或子任务 | `project_id`、`title`，可选 `parent_id`、`assignee`、`status`、`progress`、`start_date`、`end_date`、`note`、`depends_on_task_id`、`depends_on_task_ids` |
| `expand_task` | 给一条任务追加一批子任务 | `task_id`、`subtasks[]`（最多 20 条；`depends_on_index` 只能指向同批里更靠前的下标） |
| `update_task_status` | 改状态、进度、备注 | `task_id`，以及 `status` / `progress` / `note` 至少一项。状态改为 `done` 且没带进度时，进度写成 100 |
| `get_next_tasks` | 可以开工的任务 | `project_id`，可选 `limit`（默认 10，最大 50） |

`get_next_tasks` 的规则：

- 只考虑状态为 `todo` 或 `blocked` 的任务。
- 只要还有一条前置任务不是 `done`，这条任务就不能出现。前置被删掉则不再挡住它。
- `todo` 的说明是「前置已经完成，可以开始」。
- `blocked` 但前置都已完成时仍然返回，说明是「前置已经完成，但这条任务仍标记为阻塞」。
- 排序：有开始日的在前，开始日升序；没有开始日的在后；同一天再按 `sort_order`、创建时间。

### 评估

- 单元测试覆盖筛选、树顺序、循环依赖、父子成环、可开工规则、`done` 进度。
- 手工用 curl 走一遍：错误 Token、`initialize`、`tools/list`、`create_project`、`create_task`、`expand_task`、`update_task_status`、`get_next_tasks`。
- 看板上创建的任务必须能被 `get_project_tasks` 读到；MCP 改完状态后，刷新看板能看到新状态。

## 4. Technical Specifications

### 技术栈

| 部分 | 选择 | 原因 |
| --- | --- | --- |
| 仓库 | pnpm workspace，`apps/web` + `apps/server` | 和轻记一样前后端分开构建，但不拆公共包。状态枚举只有四个值，两边各写一份 |
| 后端 | Cloudflare Workers、Hono、D1 原生 SQL | 免费档能跑；查询不多，不引入 Drizzle 生成步骤 |
| MCP | 手写 JSON-RPC | 官方 SDK 的 Streamable HTTP 传输依赖 Node 的请求对象，并且常见示例要 Durable Objects。轻记是有会话进程的 Nest 服务，这里不能照搬 |
| 前端 | Vue 3、Vite、Vue Router、Tailwind CSS 4 | 与轻记同为 Vue。这个看板没有 Element Plus 后台组件体系，所以不使用 `the*` 状态名和 `Index.vue` 目录 |
| 甘特 | 自绘 HTML + SVG | 日期列铺满剩余宽度；拖动色条改期。不引入 Frappe Gantt |
| 部署 | `wrangler deploy` 发布 Worker；Pages 发布 `apps/web/dist` | 符合免费档。生产环境要把 `WEB_ORIGIN` 改成 Pages 域名 |

本地端口：看板 `http://127.0.0.1:5173`，Worker `http://127.0.0.1:8787`。开发时 Vite 把 `/api` 和 `/mcp` 代理到 Worker。

### 架构

```text
Cursor  --Bearer MCP_TOKEN-->  POST /mcp   --+
                                              +--> Hono Worker --> D1
浏览器 --Bearer 会话令牌----->  /api/*     --+
```

- 会话令牌格式 `tps.<过期毫秒>.<hmac>`，有效期 7 天，只用于看板 API。
- `SITE_PASSWORD`、`MCP_TOKEN`、`SESSION_SECRET` 放在 Wrangler secret / `.dev.vars`，不进仓库。
- 看板 API 与 MCP 调用同一套数据函数。筛选和可开工规则只写在 `domain.ts`。

### 数据模型

日期是 `YYYY-MM-DD` 日历日，不做时区换算。`created_at` / `updated_at` 是 UTC 毫秒时间戳。主键是文本 UUID。

`projects`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | UUID |
| name | text | 1–80 字 |
| description | text | 可空字符串，最长 500 |
| created_at / updated_at | integer | 毫秒 |

`tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | UUID |
| project_id | text | 所属项目 |
| parent_id | text null | 父任务，同项目 |
| title | text | 1–120 字 |
| assignee | text | 责任人文本，可空，最长 40 |
| status | text | `todo` / `in_progress` / `blocked` / `done` |
| progress | integer | 0–100 |
| start_date / end_date | text null | 日历日 |
| note | text | 备注，最长 1000。状态工具写的也是这一个字段 |
| sort_order | integer | 同一父任务下的顺序，创建时追加到末尾 |
| created_at / updated_at | integer | 毫秒 |

`task_dependencies`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | UUID |
| task_id | text | 被挡住的任务 |
| depends_on_task_id | text | 前置任务，必须同一项目，且不能等于 task_id |
| created_at | integer | 毫秒 |

一对 `(task_id, depends_on_task_id)` 唯一。更新依赖时先删掉该任务的旧行再插入新行。

`mcp_logs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | UUID |
| tool_name | text | 工具名 |
| project_id | text null | 能判断项目时写入；项目删除后日志保留 |
| ok | integer | 1 成功，0 失败 |
| summary | text | 一行摘要 |
| detail | text | 参数和简短结果，最长约 4000 字 |
| created_at | integer | 毫秒 |

不建 `users` 表。

### 看板 API

除登录和健康检查外，都要带会话 Bearer。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }`，无需登录 |
| POST | `/api/auth/login` | `{ password }` → `{ token, expiresAt }` |
| GET/POST | `/api/projects` | 列表 / 创建 |
| PATCH/DELETE | `/api/projects/:id` | 修改 / 删除 |
| GET/POST | `/api/projects/:id/tasks` | 筛选后的任务 / 创建 |
| GET | `/api/projects/:id/next` | 可开工任务 |
| PATCH/DELETE | `/api/tasks/:id` | 修改 / 删除（删除包含子任务） |
| GET | `/api/logs?projectId=` | MCP 日志 |

错误体为 `{ error: "人能看懂的原因" }`。成功的 JSON 用 camelCase。

### 安全

- SQL 只使用参数绑定。
- 两个入口的秘密分开，方便只轮换 MCP Token。
- 未配置秘密时拒绝登录和 MCP，不使用空密码。
- CORS 只放行 `WEB_ORIGIN`。
- 个人规模按单项目 2000 条任务以内设计。超出后仍能工作，但一次读出整个项目再筛选。

### 界面

暗色规划板，不是通用后台模板。

- 底色 `#10141a`，面板 `#171d26`，线条 `#313b4a`，文字 `#e7eef7`，次要文字 `#a3b0c2`。
- 主操作和「今天」竖线用 `#e0a15a`。状态色只表达状态：待办灰、进行中蓝、阻塞红、完成绿。
- 西文用 Sora，等宽数字用 Fragment Mono，中文回退到苹方。
- 甘特是整页的主体：左侧任务名，右侧按天滚动。看板是同一批数据的另一列视图。
- 登录页左侧是密码，右侧是一条静态示意时间轴，并写明那不是真实数据。

目录：

```text
TaskPilot-MCP/
├── prd/
├── apps/server/          # Worker、D1 migration、MCP、看板 API
└── apps/web/             # Vue 看板
```

## 5. Risks & Roadmap

### 分期

**第一版（本次）**

- PRD 中的项目、任务、筛选、甘特、看板、登录、7 个 MCP 工具、日志面板。

**v1.1**

- 拖动看板卡片改状态。
- 在甘特上新增依赖线。

**v2**

- 若不再是个人单用：用户表、可撤销 Token、按项目授权。那时候再评估要不要离开免费档。

### 风险

| 风险 | 应对 |
| --- | --- |
| 个别 MCP 客户端强制要求 SSE 会话 | 第一版以 Cursor 的 JSON 响应为准；若客户端拒绝无会话服务，再评估 Durable Objects（可能离开免费档） |
| Pages 与 Worker 不同源 | 构建时设置 `VITE_API_BASE`，Worker 的 `WEB_ORIGIN` 改成 Pages 地址 |
| D1 免费额度 | 个人项目足够。日志只留摘要 |
| 站点密码可被反复尝试 | 第一版不锁 IP。密码要长，并且不要和 MCP Token 相同 |
| 父任务进度与子任务不一致 | 接受。第一版不自动汇总，避免改一条子任务时悄悄改父任务 |
