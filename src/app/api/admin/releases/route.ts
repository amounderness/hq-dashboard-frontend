import { NextRequest, NextResponse } from "next/server";
import { activateRelease, approveRelease, releaseList, rollbackRelease, stageManifest, stageObject, validateRelease, type Pointer, type ReleaseBucket, ReleaseError } from "@/lib/release-admin";
import { ownerEmail } from "@/lib/access-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function bucket(): Promise<ReleaseBucket> {
  const { env } = await import("cloudflare:workers");
  const value = env.SWITCHBOARD_PACKAGES as ReleaseBucket | undefined;
  if (!value) throw new ReleaseError("Private package storage is unavailable.", 503);
  return value;
}
const noStore = { "Cache-Control": "private, no-store" };
function responseError(error: unknown) {
  const status = error instanceof ReleaseError ? error.status : 500;
  const message = error instanceof ReleaseError ? error.message : "Release control failed; check the audit record before retrying.";
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

export async function GET(request: NextRequest) {
  if (!await ownerEmail(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: noStore });
  try { return NextResponse.json(await releaseList(await bucket()), { headers: noStore }); }
  catch (error) { return responseError(error); }
}

export async function POST(request: NextRequest) {
  const actor = await ownerEmail(request);
  if (!actor) return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: noStore });
  if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "A same-origin JSON request is required." }, { status: 403, headers: noStore });
  try {
    const body = await request.json() as { action?: string; package_id?: string; path?: string; content?: string; reason?: string; expected_active?: Pointer };
    const store = await bucket();
    const id = body.package_id ?? "";
    let result: unknown;
    switch (body.action) {
      case "stage-manifest": result = await stageManifest(store, id, body.content ?? "", actor); break;
      case "stage-object": result = await stageObject(store, id, body.path ?? "", body.content ?? ""); break;
      case "validate": result = await validateRelease(store, id, actor); break;
      case "approve": result = await approveRelease(store, id, actor, body.reason ?? ""); break;
      case "activate": result = await activateRelease(store, id, actor, body.reason ?? "", body.expected_active as Pointer); break;
      case "rollback": result = await rollbackRelease(store, actor, body.reason ?? "", body.expected_active as Pointer); break;
      default: throw new ReleaseError("Unknown release action.");
    }
    return NextResponse.json(result, { headers: noStore });
  } catch (error) { return responseError(error); }
}
