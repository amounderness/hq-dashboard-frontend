import { NextRequest, NextResponse } from "next/server";
import { ownerEmail } from "@/lib/access-role";
import { ReleaseError, type Pointer, type ReleaseBucket } from "@/lib/release-admin";
import { viewerActivate, viewerApprove, viewerReleaseList, viewerRollback, viewerStageManifest, viewerStageObject, viewerValidate } from "@/lib/explorer-v2-viewer-release";

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
  return NextResponse.json({ error: error instanceof ReleaseError ? error.message : "Viewer release control failed; inspect the audit before retrying." },
    { status: error instanceof ReleaseError ? error.status : 500, headers: noStore });
}
export async function GET(request: NextRequest) {
  if (!await ownerEmail(request)) return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: noStore });
  try { return NextResponse.json(await viewerReleaseList(await bucket()), { headers: noStore }); }
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
      case "stage-manifest": result = await viewerStageManifest(store, id, body.content ?? "", actor); break;
      case "stage-object": result = await viewerStageObject(store, id, body.path ?? "", body.content ?? ""); break;
      case "validate": result = await viewerValidate(store, id, actor); break;
      case "approve": result = await viewerApprove(store, id, actor, body.reason ?? ""); break;
      case "activate": result = await viewerActivate(store, id, actor, body.reason ?? "", body.expected_active ?? null); break;
      case "rollback": result = await viewerRollback(store, actor, body.reason ?? "", body.expected_active ?? null); break;
      default: throw new ReleaseError("Unknown viewer release action.");
    }
    return NextResponse.json(result, { headers: noStore });
  } catch (error) { return failure(error); }
}
