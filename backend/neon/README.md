# Neon 后端部署说明（埋点收集）

本目录是 `index.html` 配套的自建后端：Neon Functions 提供上报接口，数据存入 Neon Postgres。

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

1. 打开 [neon.com](https://neon.com) 注册/登录，新建一个 Project（区域选离国内较近的 `aws-ap-southeast-1` 亦可）。
2. 进入项目，复制数据库连接串 `DATABASE_URL`（Connection string）。

## 二、建表

在 Neon 控制台 **SQL Editor** 中粘贴 `schema.sql` 全部内容并执行，生成：
- `visit_logs`（访问 PV/UV）
- `event_logs`（操作事件）
- `ticket_events`（提单流水）
- 视图 `daily_visit_summary`（每日 PV/UV 汇总）

## 三、部署 Functions

需要 Node.js 20.19+，在本目录执行：

```bash
npm install
npm i -g neon
neon login
neon link --project-name <你的项目名>
neon deploy
```

部署成功后终端会打印 `collect` 函数的公网 URL，形如：

```
https://<project>-<branch>.functions.neon.dev/collect
```

- `GET  /health` 健康检查
- `POST /collect` 上报数据

## 四、前端接入

把上一步拿到的 `/collect` 地址填到 `index.html` 顶部埋点配置：

```js
window.__TRACK__ = {
  endpoint: 'https://<project>-<branch>.functions.neon.dev/collect',
  enabled: true
};
```

`endpoint` 留空时前端静默不上报，不影响系统正常使用。

## 五、查询数据

- 直接在 Neon SQL Editor 查表，例如：

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
- 接口未做鉴权，内部小团队使用可接受；若公开暴露，建议在函数内加一个简单校验头（如固定 token），避免被刷库。
