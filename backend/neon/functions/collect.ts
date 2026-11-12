import { Pool } from "pg";

// DATABASE_URL 由 Neon 运行时自动注入；函数跨请求复用，模块级建池一次
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const CLIP_TEXT = 200;
const CLIP_DETAIL = 4000;

function clip(v: unknown, n: number): string {
  const s = String(v ?? "");
  return s.length > n ? s.slice(0, n) : s;
}

function corsHeaders(req: Request): Record<string, string> {
  // 回显具体 Origin（file:// 下 origin 为 null），避免通配 * 在凭证模式下被拦
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

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ ok: true }, 200, req);
  }

  if (req.method !== "POST" || !url.pathname.endsWith("/collect")) {
    return json({ ok: false, error: "not found" }, 404, req);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400, req);
  }

  const visitorId = clip(body.visitorId, 100);
  if (!visitorId) return json({ ok: false, error: "visitorId required" }, 400, req);

  const sessionId = clip(body.sessionId, 100);
  const type = clip(body.type, 20);
  const ua = clip(req.headers.get("user-agent") || body.ua, CLIP_TEXT);
  const detailRaw = body.detail;
  const detail =
    detailRaw && typeof detailRaw === "object"
      ? JSON.stringify(detailRaw).slice(0, CLIP_DETAIL)
      : null;

  try {
    if (type === "pageview") {
      await pool.query(
        `INSERT INTO visit_logs (visitor_id, session_id, path, ua, referrer)
         VALUES ($1, $2, $3, $4, $5)`,
        [visitorId, sessionId, clip(body.path, 100), ua, clip(body.referrer, 200)]
      );
    } else if (type === "event") {
      await pool.query(
        `INSERT INTO event_logs (visitor_id, session_id, event_name, ticket_type, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [visitorId, sessionId, clip(body.eventName, 100), clip(body.ticketType, 30), detail]
      );
    } else if (type === "ticket") {
      await pool.query(
        `INSERT INTO ticket_events (visitor_id, action, ticket_type, ticket_ref, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          visitorId,
          clip(body.action, 30),
          clip(body.ticketType, 30),
          clip(body.ticketRef, 100),
          detail,
        ]
      );
    } else {
      return json({ ok: false, error: "unknown type" }, 400, req);
    }
    return json({ ok: true }, 200, req);
  } catch (e) {
    console.error("collect error", e);
    return json({ ok: false, error: "insert failed" }, 500, req);
  }
}
