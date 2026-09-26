import { NextRequest, NextResponse } from "next/server";
import { ownerEmail } from "@/lib/access-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json({ owner: !!await ownerEmail(request) }, { headers: { "Cache-Control": "private, no-store" } });
}
