-- TaskPilot 第一版。字段说明见 prd/01-需求/2026-11-06-TaskPilot产品需求.md
-- 依赖是多对多，不在 tasks 上放单个 depends_on_task_id。

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date TEXT,
  end_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE mcp_logs (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  project_id TEXT,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  summary TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_project ON tasks (project_id, parent_id, sort_order);
CREATE INDEX idx_dependencies_task ON task_dependencies (task_id);
CREATE INDEX idx_dependencies_predecessor ON task_dependencies (depends_on_task_id);
CREATE INDEX idx_logs_created ON mcp_logs (created_at);
