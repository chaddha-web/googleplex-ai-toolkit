import { NextRequest } from "next/server";
import { readSite } from "@/lib/sites-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a published GoogolPlex Studio store as a standalone live page at
 * /store/<slug>. Returns the raw self-contained HTML (not wrapped in the app
 * layout), so it renders exactly as generated.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const html = await readSite(params.slug);
  if (!html) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
        `<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0E1326;color:#fff">` +
        `<div style="text-align:center"><h1 style="font-weight:500">404</h1>` +
        `<p style="opacity:.6">No store published at this address yet.</p></div></body>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
