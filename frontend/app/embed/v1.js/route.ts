import { promises as fs } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filePath = path.join(process.cwd(), "public", "embed", "v1", "embed.js");
  const raw = await fs.readFile(filePath, "utf8");
  const origin = process.env.NEXT_PUBLIC_EMBED_ORIGIN || request.nextUrl.origin;
  const body = raw.replace(/__EMBED_ORIGIN__/g, origin);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
