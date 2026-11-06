---
name: git-commit
description: >-
  按规范执行 git commit：仅提交暂存区；禁止关闭 husky；前端须通过 Prettier / ESLint /
  Stylelint / 类型检查，后端仅拦截 error。在用户要求提交、commit、pnpm cz、git cz、
  输入提交信息、绕过钩子、--no-verify，或说不要 code review / skip review / skip-review /
  跳过审查时使用。本仓库以此 skill 为准。
---

# Git 规范提交（对齐 cz，禁止关钩子）

人类本地推荐：`git add` → `pnpm cz`。Agent **无法可靠驱动交互式 Commitizen**，须用下方等价流程；**质量门禁与 `pnpm cz` / 手动 `git commit` 相同**。

细则：`commitlint.config.mjs`、`lint-staged.config.mjs`、`.husky/pre-commit`、`.husky/commit-msg`。

## 与手动提交对齐的门禁（必须完整走）

无论入口是 `pnpm cz` 还是 `git commit -m`，**必须**触发 husky，禁止 `--no-verify`：

| 钩子         | 作用                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `lint-staged`：前端 Prettier + ESLint + Stylelint + 受影响 workspace 类型检查；后端只拦 ESLint / tsc **error** |
| `commit-msg` | `commitlint`（Conventional Commits，`type(scope): subject`）                                                   |

`pnpm cz` 会设 `CZ_COMMIT=1`，避免 `prepare-commit-msg` 再提示；Agent 用 `-m` 时可能看到该提示，**忽略即可**，勿因此改用 `--no-verify`。

### 前端 vs 后端

| 范围 | 路径               | 门禁                                                                                         |
| ---- | ------------------ | -------------------------------------------------------------------------------------------- |
| 前端 | `apps/web`、根配置 | Prettier、ESLint、Stylelint、类型检查；error 阻断。warning 打印不阻断（`--max-warnings=-1`） |
| 后端 | `apps/server`      | 只跑 ESLint + `tsc --noEmit`；**仅 error 阻断**；不跑 Stylelint                              |
| 需求 | `prd/**`           | 不参与 lint-staged                                                                           |

钩子失败：修本次暂存文件后重新 `git add` 已改文件，再 **NEW** `git commit`（不要 `--no-verify`，不要擅自 amend）。

## 铁律（不可破）

1. **只提交暂存区**：用户说「commit / 提交」= 提交**当前已 `git add` 的内容**；**禁止**擅自 `git add` / `git add -A` / `git add .`。
2. **暂存区为空则停**：告知用户先自行暂存，**不要**代为 add 后提交。
3. **禁止**绕过钩子：`--no-verify` / `-n`、`HUSKY=0`、`HUSKY_SKIP_HOOKS=1`、改 `core.hooksPath`、删改 `.husky/` 后再提交。
4. **禁止**钩子失败后跳过钩子强行提交。
5. **仅当用户本轮明文要求**「跳过钩子 / `--no-verify`」时才可例外。
6. message 必须过 commitlint：`type(scope): subject`（`type`/`scope` 小写、`scope` 必填、`subject` 无句末 `.`、header ≤ 100）。

用户**另说**「一起提交 / 全部提交 / 帮我 add」时，才可暂存；仍勿加入 `.env` 等密钥文件。

## 跳过 code review 标记（`[skip-review]`）

用户在**同一次**说 commit / 提交时，若带有忽略审查意图，则 **header（标题）末尾**必须追加 ` [skip-review]`（空格 + 标记），供后续 Agent 识别并跳过审查。

### 何时追加

同句或同轮出现下列任一（大小写不敏感；中英文空格可有可无）即视为要跳过审查：

| 类别      | 示例                                                                 |
| --------- | -------------------------------------------------------------------- |
| 明确否定  | 不要 code review、不要code review、不需要 code review、不用 review   |
| 跳过/忽略 | 跳过 review、跳过 code review、忽略 review、忽略 code review、不审查 |
| 英文标记  | skip review、skip-review、skip code review、`[skip-review]`          |
| 简写      | 与 commit/提交同句的 **skip**（且语境是审查，不是跳过钩子）          |

**不算**跳过审查（勿加标记）：

- 仅说「跳过钩子 / `--no-verify` / 绕过 husky」
- 用户未说 commit/提交，只说 skip / 跳过

### 怎么写进标题

- 格式：`type(scope): subject [skip-review]`
- 已有 `[skip-review]` 则不再重复追加
- 标记计入 `header-max-length`（≤ 100）：不够则**缩短 subject**，保留 ` [skip-review]`，勿把标记挪到 body
- 用户已给完整 header 时：在其 subject 末尾追加（去句末 `.` 后再加）

示例：

```text
docs(repo): 补充提交规范说明 [skip-review]
```

## 用户已给出 message

用户消息中含完整 header（如 `fix(web): 修复看板筛选`）或明确写出提交说明时：

- **优先使用**用户 message；仅做格式微调（去句末 `.`、校 header ≤ 100）
- 若本轮触发「跳过 code review」→ 按上一节在标题末追加 `[skip-review]`
- 仍**只提交暂存区**；与暂存 diff 明显不符时简短确认，勿擅自改语义
- 用户只说「提交」未给 message → 走下方「自拟 message」

## Agent 等价流程（替代交互 `pnpm cz`）

交互式 `pnpm cz` 依次问 **type → scope → subject → body**；Agent 对照 **暂存区** diff 自行填写（勿用未暂存 diff 拟 message）。

| cz 步 | 字段        | 怎么写                                                                                                                                                                         |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | **type**    | `feat` 新功能、`update` 已有功能迭代、`fix` 修缺陷、`docs` 文档、`refactor` 重构、`style` 纯格式、`perf` 性能、`test` 测试、`build` 构建、`ci` CI、`chore` 杂务、`revert` 回滚 |
| 2     | **scope**   | **必填**。优先：`web` / `server` / `repo`。允许自定义 scope                                                                                                                    |
| 3     | **subject** | 一句中文概括暂存区做了什么；无句末 `.`；header 合计 ≤ 100；需跳过审查时末尾加 ` [skip-review]`                                                                                 |
| 4     | **body**    | 建议写：why / 影响面；勿重复 subject。breaking change 在此说明。**不要**用 body 代替标题里的 `[skip-review]`                                                                   |

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject

- 说明动机或关键取舍
- 列出主要影响面（仍只描述暂存区变更）
EOF
)"
```

跳过审查时：

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject [skip-review]
EOF
)"
```

无 body 时 header 单独一行即可。禁止 `echo \| pnpm cz` 等伪交互。

```
Task Progress:
- [ ] 仅用户明确要求提交时才 commit
- [ ] git status + git diff --cached + git log
- [ ] 暂存区为空 → 停止并提示用户先 git add；不执行 git add
- [ ] 用户已给 message → 直接用；否则自拟 type / scope / subject / body
- [ ] 同轮有跳过审查意图 → header 末尾加 [skip-review]（去重；保 header ≤ 100）
- [ ] git commit -m HEREDOC（禁止 --no-verify；禁止先 git add 再 commit，除非用户要求暂存）
- [ ] 钩子失败 → 只修暂存相关文件后 NEW commit
- [ ] git status 确认成功；未暂存改动在回复中列出，勿擅自纳入
- [ ] 若 header 含 [skip-review] → 本轮不做 code review
```

## 钩子失败时

| 现象                                           | 处理                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| lint-staged / ESLint / Stylelint error（前端） | 修代码后把**已修复文件**重新暂存再 commit               |
| 后端 ESLint / tsc error                        | 修 `apps/server` 的 error 后重提；warning 不阻断        |
| commitlint 失败                                | 改正 message 后重提                                     |
| 钩子未跑到                                     | `pnpm setup-hooks`；确认 `core.hooksPath` 为 `.husky/_` |

## 回复格式

提交成功后写清：最终提交文案、短哈希；若带 `[skip-review]`，注明本轮已跳过 code review。若工作区仍有未暂存改动，列出来。未提交时说明原因，不要伪造「已提交」。
