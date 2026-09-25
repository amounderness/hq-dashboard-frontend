import { NextRequest, NextResponse } from "next/server";
import { getPackage, PackageUnavailable } from "@/lib/package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ year: string }> }) {
  const { year } = await context.params;
  if (year !== "latest" && !/^202[1-6]$/.test(year)) return NextResponse.json({ error: "Unsupported election year" }, { status: 404 });
  try {
    return NextResponse.json(await getPackage("year", year), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PackageUnavailable ? 503 : 500;
    return NextResponse.json({ error: error instanceof PackageUnavailable ? error.message : "Unable to read package." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
