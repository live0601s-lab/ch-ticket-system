import { neon } from "@neondatabase/serverless";

// DATABASE_URL 由 Neon 运行时自动注入；只读统计查询走 serverless HTTP 驱动（edge 友好）
const sql = neon(process.env.DATABASE_URL!);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return Response.json(body, { status, headers: corsHeaders(req!) });
}

// 口令比对（内部小团队使用；口令由后端环境变量注入，不落地前端）
function safeEqual(a: string, b: string): boolean {
  return a === b;
}

function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_TOKEN || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  let presented = "";
  if (auth.toLowerCase().startsWith("bearer ")) presented = auth.slice(7);
  if (!presented) presented = req.headers.get("x-admin-token") || "";
  return safeEqual(presented, secret);
}

const num = (v: unknown): number => Number(v || 0);

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({ ok: true }, 200, req);
  }

  if (req.method !== "GET") {
    return json({ ok: false, error: "method not allowed" }, 405, req);
  }

  if (!authorized(req)) {
    return json({ ok: false, error: "unauthorized" }, 401, req);
  }

  try {
    // 概览：总量 / 今日 / 事件数 / 提单数
    const overviewRows = await sql`SELECT
       (SELECT COUNT(*) FROM visit_logs)                              AS total_pv,
       (SELECT COUNT(DISTINCT visitor_id) FROM visit_logs)            AS total_uv,
       (SELECT COUNT(*) FROM visit_logs
          WHERE created_at >= date_trunc('day', now()))               AS today_pv,
       (SELECT COUNT(DISTINCT visitor_id) FROM visit_logs
          WHERE created_at >= date_trunc('day', now()))               AS today_uv,
       (SELECT COUNT(*) FROM event_logs)                              AS event_count,
       (SELECT COUNT(*) FROM ticket_events)                           AS ticket_count`;
    const o = overviewRows[0] || {};
    const overview = {
      totalPv: num(o.total_pv),
      totalUv: num(o.total_uv),
      todayPv: num(o.today_pv),
      todayUv: num(o.today_uv),
      eventCount: num(o.event_count),
      ticketCount: num(o.ticket_count),
    };

    // 最近 30 天每日 PV/UV
    const dailyRows = await sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, pv, uv
       FROM daily_visit_summary
       ORDER BY day DESC
       LIMIT 30`;
    const daily = dailyRows.map((r: Record<string, unknown>) => ({
      day: String(r.day),
      pv: num(r.pv),
      uv: num(r.uv),
    }));

    // 最近操作事件
    const eventRows = await sql`SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS created_at, event_name, ticket_type, detail
       FROM event_logs
       ORDER BY created_at DESC
       LIMIT 50`;
    const events = eventRows.map((r: Record<string, unknown>) => ({
      createdAt: r.created_at ? String(r.created_at) : null,
      eventName: r.event_name,
      ticketType: r.ticket_type,
      detail: r.detail,
    }));

    // 最近提单流水
    const ticketRows = await sql`SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS created_at, action, ticket_type, ticket_ref, detail
       FROM ticket_events
       ORDER BY created_at DESC
       LIMIT 50`;
    const tickets = ticketRows.map((r: Record<string, unknown>) => ({
      createdAt: r.created_at ? String(r.created_at) : null,
      action: r.action,
      ticketType: r.ticket_type,
      ticketRef: r.ticket_ref,
      detail: r.detail,
    }));

    return json({ ok: true, overview, daily, events, tickets }, 200, req);
  } catch (e) {
    console.error("admin query error", e);
    return json({ ok: false, error: "query failed" }, 500, req);
  }
}
