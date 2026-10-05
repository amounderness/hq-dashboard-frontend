import { NextRequest, NextResponse } from "next/server";
import { explorerV2Resource } from "@/lib/explorer-v2-package";
import { ownerEmail, verifiedAccessEmail } from "@/lib/access-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const localPreview = process.env.NODE_ENV === "development"
    && ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)
    && process.env.SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED === "true";
  const viewer = localPreview ? process.env.SWITCHBOARD_V2_LOCAL_VIEWER === "true" : process.env.SWITCHBOARD_V2_VIEWER_ENABLED === "true";
  if (!localPreview && !(viewer ? await verifiedAccessEmail(request) : await ownerEmail(request))) {
    return NextResponse.json({ error: "Verified access required for Explorer v2." }, {
      status: 403, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const { kind } = await context.params;
  const authority = request.nextUrl.searchParams.get("authority") ?? undefined;
  const year = request.nextUrl.searchParams.get("year") ?? undefined;
  const edition = request.nextUrl.searchParams.get("edition") ?? undefined;
  if (viewer && kind === "results" && authority !== "E08000035") {
    return NextResponse.json({ error: "Results outside the Leeds viewer release are unavailable." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!["catalog", "regions", "authorities", "wards", "results"].includes(kind)) {
    return NextResponse.json({ error: "Unknown Explorer resource." }, { status: 404 });
  }
  try {
    return NextResponse.json(await explorerV2Resource(kind, authority, year, edition, viewer), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Explorer v2 is unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
