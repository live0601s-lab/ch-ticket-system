import { neon } from "@neondatabase/serverless";

// DATABASE_URL 由 Neon 运行时自动注入，无需在代码里写死连接串
const sql = neon(process.env.DATABASE_URL as string);

const CLIP_TEXT = 200;
const CLIP_DETAIL = 4000;

function clip(v: unknown, n: number): string {
  const s = String(v ?? "");
  return s.length > n ? s.slice(0, n) : s;
}

function corsHeaders(): Record<string, string> {
  // 内部工具：上线后可把 * 替换为你的 GitHub Pages 具体域名
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ ok: true });
  }

  if (req.method !== "POST" || !url.pathname.endsWith("/collect")) {
    return json({ ok: false, error: "not found" }, 404);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const visitorId = clip(body.visitorId, 100);
  if (!visitorId) return json({ ok: false, error: "visitorId required" }, 400);

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
      await sql`
        INSERT INTO visit_logs (visitor_id, session_id, path, ua, referrer)
        VALUES (${visitorId}, ${sessionId}, ${clip(body.path, 100)}, ${ua}, ${clip(body.referrer, 200)})
      `;
    } else if (type === "event") {
      await sql`
        INSERT INTO event_logs (visitor_id, session_id, event_name, ticket_type, detail)
        VALUES (${visitorId}, ${sessionId}, ${clip(body.eventName, 100)}, ${clip(body.ticketType, 30)}, ${detail}::jsonb)
      `;
    } else if (type === "ticket") {
      await sql`
        INSERT INTO ticket_events (visitor_id, action, ticket_type, ticket_ref, detail)
        VALUES (${visitorId}, ${clip(body.action, 30)}, ${clip(body.ticketType, 30)}, ${clip(body.ticketRef, 100)}, ${detail}::jsonb)
      `;
    } else {
      return json({ ok: false, error: "unknown type" }, 400);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("collect error", e);
    return json({ ok: false, error: "insert failed" }, 500);
  }
}
