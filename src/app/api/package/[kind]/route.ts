import { NextRequest, NextResponse } from "next/server";
import { getPackage, PackageUnavailable } from "@/lib/package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  if (!["manifest", "wards", "geo", "forecast", "pulse", "history", "composition", "sdp-results", "tribes-research"].includes(kind)) return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  try {
    return NextResponse.json(await getPackage(kind as "manifest" | "wards" | "geo" | "forecast" | "pulse" | "history" | "composition" | "sdp-results" | "tribes-research"), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PackageUnavailable ? 503 : 500;
    return NextResponse.json({ error: error instanceof PackageUnavailable ? error.message : "Unable to read package." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
