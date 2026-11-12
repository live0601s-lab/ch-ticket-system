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

## 埋点后端（已接入 Neon）

前端已接入 Neon 自建后端，自动上报 PV/UV、操作事件、提单流水，配置位于 `index.html` 顶部：

```js
window.__TRACK__ = {
  endpoint: 'https://br-floral-fire-ao5mpj63-collect.compute.c-2.ap-southeast-1.aws.neon.tech/collect',
  enabled: true
};
```

后端部署与查询说明见 `backend/neon/README.md`。上报内容仅含匿名访客 ID、动作类型、提单类型、内部记录引用，**不含玩家账号、大区、特权、道具等敏感信息**。若把 `endpoint` 留空并置 `enabled=false`，则静默不上报，不影响使用。
