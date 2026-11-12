# Neon 后端部署说明（埋点收集）

本目录是 `index.html` 配套的自建后端：Neon Functions 提供上报接口，数据存入 Neon Postgres。

## 当前部署状态（已上线）

- Neon 项目：`ch-ticket-track`（区域 `aws-ap-southeast-1` 新加坡）
- 收集接口公网地址：

```
https://br-floral-fire-ao5mpj63-collect.compute.c-2.ap-southeast-1.aws.neon.tech/collect
```

- 健康检查：`GET https://br-floral-fire-ao5mpj63-collect.compute.c-2.ap-southeast-1.aws.neon.tech/health`
- 数据表已建好：`visit_logs`、`event_logs`、`ticket_events`，视图 `daily_visit_summary`
- 前端 `index.html` 顶部 `window.__TRACK__` 已填入上述 `/collect` 地址并启用

## 目录结构

```
backend/neon/
├── neon.ts              # Neon 后端声明（函数路由）
├── schema.sql           # 建表 SQL（三张表 + 每日汇总视图）
├── functions/
│   └── collect.ts       # 上报接口（PV/UV、事件、提单流水）
└── package.json
```

## 一、准备 Neon 项目

1. 打开 [neon.com](https://neon.com) 注册/登录，新建一个 Project（区域选 `aws-ap-southeast-1` 新加坡，Functions 在该区域可用）。
2. 复制数据库连接串 `DATABASE_URL`，供建表与本地调试使用（函数运行时由 Neon 自动注入，无需写进代码）。

## 二、建表

在 Neon 控制台 **SQL Editor** 中粘贴 `schema.sql` 全部内容并执行，生成：
- `visit_logs`（访问 PV/UV）
- `event_logs`（操作事件）
- `ticket_events`（提单流水）
- 视图 `daily_visit_summary`（每日 PV/UV 汇总）

## 三、部署 Functions

需要 Node.js 20.19+。在本目录执行：

```bash
npm install
npm i -g neonctl
neon login
neon link --project-id <项目ID> --yes
neon deploy --config ./neon.ts -y
```

部署成功后终端会打印 `collect` 函数的公网 URL。接口：

- `GET  /health` 健康检查
- `POST /collect` 上报数据（`pageview` / `event` / `ticket` 三类）

## 四、前端接入

`index.html` 顶部埋点配置（已接入线上地址）：

```js
window.__TRACK__ = {
  endpoint: 'https://br-floral-fire-ao5mpj63-collect.compute.c-2.ap-southeast-1.aws.neon.tech/collect',
  enabled: true
};
```

`endpoint` 留空且 `enabled=false` 时前端静默不上报，不影响系统正常使用。

## 五、查询数据

在 Neon SQL Editor 查表，例如：

```sql
-- 每日 PV/UV
SELECT * FROM daily_visit_summary ORDER BY day DESC;

-- 最近操作事件
SELECT created_at, event_name, ticket_type, detail FROM event_logs ORDER BY created_at DESC LIMIT 50;

-- 最近提单流水
SELECT created_at, action, ticket_type, ticket_ref FROM ticket_events ORDER BY created_at DESC LIMIT 50;
```

## 六、隐私与安全

- 上报内容只含匿名访客 ID、动作类型、提单类型、内部记录引用，**不含玩家账号、大区、特权、道具**。
- 接口当前未做鉴权，内部小团队使用可接受；若公开暴露，建议在函数内加一个简单校验头（如固定 token），避免被刷库。
- CORS 按请求 Origin 回显，兼容 `file://` 与 GitHub Pages 站点来源。
