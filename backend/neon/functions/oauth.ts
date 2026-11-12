// 企业微信 OAuth 换码函数：前端在企微内完成授权后回跳本站，地址栏带 code；
// 后端用 code 换取成员 UserId，再拉取姓名/头像，只向前端返回身份信息。
// CorpID / AgentId / Secret 由 Neon 环境变量注入，不落地前端公开仓库。

const WECOM_API = "https://qyapi.weixin.qq.com/cgi-bin";

// 模块级 access_token 缓存（edge 实例复用时减少 gettoken 调用；实例重建后自动重取）
let cachedToken = "";
let cachedTokenExp = 0;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return Response.json(body, { status, headers: corsHeaders(req!) });
}

async function fetchJson(url: string): Promise<Record<string, any>> {
  const r = await fetch(url, { method: "GET" });
  return r.json();
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedTokenExp > now + 60_000) return cachedToken;
  const corpid = process.env.WECOM_CORPID || "";
  const secret = process.env.WECOM_SECRET || "";
  if (!corpid || !secret) throw new Error("wecom_not_configured");
  const data = await fetchJson(
    `${WECOM_API}/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(secret)}`
  );
  if (data.errcode) throw new Error("gettoken_failed:" + data.errcode);
  cachedToken = String(data.access_token);
  cachedTokenExp = now + (Number(data.expires_in) || 7200) * 1000;
  return cachedToken;
}

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ ok: true }, 200, req);
  }

  // 取 code：POST body 或 GET query（回跳场景）
  let code = "";
  if (req.method === "POST") {
    try {
      const b = await req.json();
      code = String(b.code || "");
    } catch {
      return json({ ok: false, error: "bad json" }, 400, req);
    }
  } else if (req.method === "GET") {
    code = url.searchParams.get("code") || "";
  } else {
    return json({ ok: false, error: "method not allowed" }, 405, req);
  }
  code = code.trim();
  if (!code) return json({ ok: false, error: "code required" }, 400, req);

  const corpid = process.env.WECOM_CORPID || "";
  const secret = process.env.WECOM_SECRET || "";
  if (!corpid || !secret) {
    return json({ ok: false, error: "wecom not configured" }, 503, req);
  }

  try {
    const token = await getAccessToken();

    // 1) code 换成员身份
    const ui = await fetchJson(
      `${WECOM_API}/user/getuserinfo?access_token=${token}&code=${encodeURIComponent(code)}`
    );
    if (ui.errcode) {
      return json(
        { ok: false, error: "getuserinfo_failed", errcode: ui.errcode, errmsg: ui.errmsg },
        401,
        req
      );
    }
    const userId = String(ui.UserId || "");
    if (!userId) {
      return json(
        { ok: false, error: "not a member", externalUserid: ui.external_userid || null },
        403,
        req
      );
    }

    // 2) 拉成员资料（姓名、头像）
    const u = await fetchJson(
      `${WECOM_API}/user/get?access_token=${token}&userid=${encodeURIComponent(userId)}`
    );
    if (u.errcode) {
      return json(
        { ok: false, error: "user_get_failed", errcode: u.errcode, errmsg: u.errmsg },
        401,
        req
      );
    }

    const user = {
      userId,
      name: String(u.name || ""),
      avatar: String(u.avatar || ""),
      account: String(u.alias || userId),
    };
    return json({ ok: true, user }, 200, req);
  } catch (e: any) {
    console.error("oauth error", e);
    return json(
      { ok: false, error: "oauth failed", detail: String((e && e.message) || e) },
      500,
      req
    );
  }
}
