-- =============================================================
-- 超核一站式服务系统 · Neon Postgres 埋点统计库建表脚本
-- 说明：仅记录访问量、操作事件与提单流水的脱敏动作信息，
--       不存储玩家账号、大区、特权、道具等敏感业务字段。
-- 执行方式：Neon 控制台 SQL Editor 粘贴执行，或 neon CLI 连接后 psql 执行。
-- =============================================================

-- 1) 访问记录（PV/UV）：每条浏览一条记录；UV 按 visitor_id + 日期聚合
CREATE TABLE IF NOT EXISTS visit_logs (
  id          BIGSERIAL PRIMARY KEY,
  visitor_id  TEXT NOT NULL,                 -- 前端 localStorage 生成的匿名访客 ID
  session_id  TEXT,                         -- 会话 ID（刷新不变，关闭重开生成新的）
  path        TEXT,                         -- 视图/标签页标识，如 ticket / dataflow / marvis
  ua          TEXT,                         -- 浏览器 UA（服务端截取，截断存储）
  referrer    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_visitor_time ON visit_logs (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_visit_created_at    ON visit_logs (created_at);

-- 2) 操作事件汇总：按钮点击、视图切换、弹窗打开等行为事件
CREATE TABLE IF NOT EXISTS event_logs (
  id          BIGSERIAL PRIMARY KEY,
  visitor_id  TEXT NOT NULL,
  session_id  TEXT,
  event_name  TEXT NOT NULL,                -- 如 switch_tab / open_biz_modal / click_save
  ticket_type TEXT,                         -- deposit_del / biz，非事件相关可为空
  detail      JSONB,                        -- 脱敏后的附加参数
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_visitor_time ON event_logs (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_name_time     ON event_logs (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_event_created_at   ON event_logs (created_at);

-- 3) 提单流水明细：哪次提单被新建/更新，只记动作类型与内部记录引用
CREATE TABLE IF NOT EXISTS ticket_events (
  id          BIGSERIAL PRIMARY KEY,
  visitor_id  TEXT NOT NULL,
  action      TEXT NOT NULL,                -- create / update / close 等
  ticket_type TEXT,                         -- deposit_del / biz
  ticket_ref  TEXT,                         -- 内部提单记录 id（非玩家账号）
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_visitor_time ON ticket_events (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_type_time   ON ticket_events (ticket_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_created_at   ON ticket_events (created_at);

-- 可选：每日访问汇总视图（PV 数 / 独立访客数），便于直接查询
CREATE OR REPLACE VIEW daily_visit_summary AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(*)                          AS pv,
  COUNT(DISTINCT visitor_id)        AS uv
FROM visit_logs
GROUP BY 1
ORDER BY 1 DESC;
