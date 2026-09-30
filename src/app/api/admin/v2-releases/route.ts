import { NextRequest, NextResponse } from "next/server";
import { ownerEmail } from "@/lib/access-role";
import { ReleaseError, type Pointer, type ReleaseBucket } from "@/lib/release-admin";
import { v2Activate, v2Approve, v2ReleaseList, v2Rollback, v2StageManifest, v2StageObject, v2Validate } from "@/lib/explorer-v2-release-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

async function bucket(): Promise<ReleaseBucket> {
  const { env } = await import("cloudflare:workers");
  const value = env.SWITCHBOARD_PACKAGES as ReleaseBucket | undefined;
  if (!value) throw new ReleaseError("Private package storage is unavailable.", 503);
  return value;
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof ReleaseError ? error.message : "Explorer v2 release control failed; check the audit before retrying." },
    { status: error instanceof ReleaseError ? error.status : 500, headers: noStore });
}
export async function GET(request: NextRequest) {
  if (!await ownerEmail(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: noStore });
  try { return NextResponse.json(await v2ReleaseList(await bucket()), { headers: noStore }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const actor = await ownerEmail(request);
  if (!actor) return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: noStore });
  if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "A same-origin JSON request is required." }, { status: 403, headers: noStore });
  try {
    const body = await request.json() as { action?: string; package_id?: string; path?: string; content?: string; reason?: string; expected_active?: Pointer | null };
    const store = await bucket();
    const id = body.package_id ?? "";
    let result: unknown;
    switch (body.action) {
      case "stage-manifest": result = await v2StageManifest(store, id, body.content ?? "", actor); break;
      case "stage-object": result = await v2StageObject(store, id, body.path ?? "", body.content ?? ""); break;
      case "validate": result = await v2Validate(store, id, actor); break;
      case "approve": result = await v2Approve(store, id, actor, body.reason ?? ""); break;
      case "activate": result = await v2Activate(store, id, actor, body.reason ?? "", body.expected_active ?? null); break;
      case "rollback": result = await v2Rollback(store, actor, body.reason ?? "", body.expected_active ?? null); break;
      default: throw new ReleaseError("Unknown Explorer v2 release action.");
    }
    return NextResponse.json(result, { headers: noStore });
  } catch (error) { return failure(error); }
}
