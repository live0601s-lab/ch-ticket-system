# 超核一站式服务系统

单文件前端工单系统（`index.html`），配套 Neon 自建后端收集访问量与操作埋点。

## 在线访问

仓库：https://github.com/live0601s-lab/ch-ticket-system

GitHub Pages 开启后访问地址：

```
https://live0601s-lab.github.io/ch-ticket-system/
```

## 目录结构

```
├── index.html          # 系统主文件（前端，含全部页面与脚本）
├── version.json       # 版本信息，用于刷新时的版本自检
├── README.md
└── backend/
    └── neon/           # Neon Functions + Postgres 埋点收集后端
        ├── schema.sql
        ├── neon.ts
        ├── functions/collect.ts
        ├── package.json
        └── README.md   # 后端部署说明
```

## 版本自检（刷新即最新版）

- `index.html` 内置当前版本号 `APP_VERSION`，页面加载时自动拉取同目录 `version.json` 比对。
- 若版本不一致，页面自动刷新一次加载最新版；会话内只自动刷新一次，避免死循环。
- **每次发版需要同步改两处**：
  1. `index.html` 里的 `var APP_VERSION = 'v1.64'`
  2. `version.json` 里的 `version` 字段

## 埋点后端（可选，默认关闭）

前端埋点默认 `endpoint` 留空、`enabled=false`，不上报任何数据，不影响使用。

需要收集 PV/UV、操作事件、提单流水时：

1. 按 `backend/neon/README.md` 部署 Neon 后端并建表。
2. 把部署后得到的 `/collect` 公网地址填入 `index.html` 顶部配置：

```js
window.__TRACK__ = {
  endpoint: 'https://<project>-<branch>.functions.neon.dev/collect',
  enabled: true
};
```

上报内容仅含匿名访客 ID、动作类型、提单类型、内部记录引用，**不含玩家账号、大区、特权、道具等敏感信息**。
