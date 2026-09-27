import { NextRequest, NextResponse } from "next/server";
import { explorerV2Resource } from "@/lib/explorer-v2-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  const authority = request.nextUrl.searchParams.get("authority") ?? undefined;
  const year = request.nextUrl.searchParams.get("year") ?? undefined;
  if (!["catalog", "regions", "authorities", "wards", "results"].includes(kind)) {
    return NextResponse.json({ error: "Unknown Explorer resource." }, { status: 404 });
  }
  try {
    return NextResponse.json(await explorerV2Resource(kind, authority, year), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Explorer v2 is unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
