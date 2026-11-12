import { defineConfig } from "@neon/config/v1";

// Neon 后端声明：Postgres 默认开启，此处声明上报收集函数与管理员查询函数
export default defineConfig({
  functions: {
    collect: {
      name: "埋点收集接口",
      source: "./functions/collect.ts",
    },
    admin: {
      name: "管理员后台查询接口",
      source: "./functions/admin.ts",
      env: {
        ADMIN_TOKEN: { value: process.env.ADMIN_TOKEN, required: true },
      },
    },
  },
});
