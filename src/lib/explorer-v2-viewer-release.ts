import "server-only";
import { ReleaseError, sha256, validId, type Pointer, type ReleaseBucket } from "@/lib/release-admin";

const root = "v2/viewer/";
const leeds = "E08000035";
const yorkshire = "E12000003";
const sourceManifestHash = "5e50816f9f6c5e72f6236c06d172665a2556c3fd4fd18e253a41109010d3e660";
const years = [2021, 2022, 2023, 2024, 2025, 2026];
const auditedResultHashes: Record<number, string> = {
  2021: "2cd877f45e7e8c47c6fa5ed794196a9222d02800138aaf4db6cd2dd0a402922e",
  2022: "54941796150de6e0f744d404982c7526cd1d0f18cc78a3489e8b81eb49436cc0",
  2023: "30085a5f267edb886005d122a38a01c771f650959d75b93be74eb380c4515682",
  2024: "a62fc44d802153037c82bd56d3cf31dffa9f3cec2a261f6ed2aa6680d26d7046",
  2025: "fbd95cd884ed462d937f9e29f63ee87838f6e0482eb8793b8750d919cc84ebdf",
  2026: "91fd656ee0f6debcbd1c328bf094b14b097f9569fd527943162b32ea25930690",
};
const objects = ["catalog.json", "regions.geojson", "authorities.geojson", "yorkshire-wards.geojson",
  ...years.map(year => `results/${leeds}/${year}.json`)];
const paths = new Set(objects);
const hex = /^[a-f0-9]{64}$/;
type Manifest = { schema_version: number; package_id: string; release_status: string; audience_scope: string;
  pilot_region: string; released_authorities: string[]; source_package: string; source_manifest_sha256: string;
  leeds_result_sha256: Record<string, string>; limits: string[]; object_sha256: Record<string, string> };
type Audit = { id: string; at: string; action: string; actor: string; reason: string; from?: Pointer | null; to?: Pointer | null };
const same = (a: Pointer | null, b: Pointer | null) => a?.package_id === b?.package_id && a?.manifest_sha256 === b?.manifest_sha256;
const releaseKey = (id: string, path: string) => `${root}releases/${id}/${path}`;

function parse<T>(content: string, label: string): T {
  try { return JSON.parse(content) as T; } catch { throw new ReleaseError(`Invalid JSON: ${label}`); }
}
async function read(bucket: ReleaseBucket, key: string) {
  const found = await bucket.get(key);
  if (!found) throw new ReleaseError(`Missing private object: ${key}`, 404);
  return found.text();
}
async function keys(bucket: ReleaseBucket, prefix: string): Promise<string[]> {
  const result: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const listing = await bucket.list({ prefix, cursor, limit: 1000 });
    result.push(...listing.objects.map(item => item.key));
    if (!listing.truncated) return result;
    if (!listing.cursor || listing.cursor === cursor) throw new ReleaseError("Private storage listing is incomplete.", 503);
    cursor = listing.cursor;
  }
  throw new ReleaseError("Too many viewer package objects.", 503);
}
function checkManifest(value: Manifest, id: string) {
  if (!validId(id) || !id.startsWith("explorer-v2-leeds-viewer-") || value?.package_id !== id || value.schema_version !== 1
    || value.release_status !== "staged_not_published" || value.audience_scope !== "leeds_viewers"
    || value.pilot_region !== yorkshire || value.released_authorities?.length !== 1 || value.released_authorities[0] !== leeds
    || value.source_package !== "explorer-v2-yh-2026-10-05-rc9" || value.source_manifest_sha256 !== sourceManifestHash) {
    throw new ReleaseError("Manifest is not an approved-scope Leeds viewer candidate.");
  }
  if (!Array.isArray(value.limits) || !value.limits.length || value.limits.some(item => typeof item !== "string" || !item.trim())) throw new ReleaseError("Viewer release limits are required.");
  const entries = Object.entries(value.object_sha256 ?? {});
  if (entries.length !== objects.length || entries.some(([path, hash]) => !paths.has(path) || !hex.test(hash)) || objects.some(path => !value.object_sha256[path])) throw new ReleaseError("Viewer package must contain exactly the ten scoped objects.");
  if (Object.keys(value.leeds_result_sha256 ?? {}).length !== years.length || years.some(year => {
    const path = `results/${leeds}/${year}.json`;
    return value.leeds_result_sha256[path] !== auditedResultHashes[year] || value.object_sha256[path] !== auditedResultHashes[year];
  })) throw new ReleaseError("Leeds result source hashes are incomplete.");
}
async function manifestFor(bucket: ReleaseBucket, id: string) {
  if (!validId(id)) throw new ReleaseError("Invalid release ID.");
  const content = await read(bucket, releaseKey(id, "manifest.json"));
  const manifest = parse<Manifest>(content, "manifest.json");
  checkManifest(manifest, id);
  return { manifest, hash: await sha256(content) };
}
async function active(bucket: ReleaseBucket): Promise<{ pointer: Pointer | null; etag?: string }> {
  const found = await bucket.get(`${root}active.json`);
  if (!found) return { pointer: null };
  if (!found.etag) throw new ReleaseError("Viewer pointer storage version is unavailable.", 503);
  const pointer = parse<Pointer>(await found.text(), "viewer active pointer");
  if (!validId(pointer?.package_id) || !hex.test(pointer?.manifest_sha256)) throw new ReleaseError("Viewer pointer is invalid.", 503);
  return { pointer, etag: found.etag };
}
async function audit(bucket: ReleaseBucket, event: Omit<Audit, "id" | "at">) {
  const record: Audit = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
  const key = `${root}admin/audit/${record.at.replace(/[:.]/g, "-")}-${record.id}.json`;
  if (!await bucket.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Viewer audit could not be saved.", 503);
}
export async function viewerReleaseList(bucket: ReleaseBucket) {
  const pointer = (await active(bucket)).pointer;
  const ids = (await keys(bucket, `${root}releases/`))
    .filter(key => /^v2\/viewer\/releases\/[a-z0-9][a-z0-9.-]{0,79}\/manifest\.json$/.test(key)).map(key => key.split("/")[3]);
  const releases = await Promise.all(ids.map(async id => {
    try {
      const { manifest, hash } = await manifestFor(bucket, id);
      return { package_id: id, manifest_sha256: hash, objects: objects.length, limits: manifest.limits,
        active: same(pointer, { package_id: id, manifest_sha256: hash }),
        approved: !!await bucket.get(`${root}admin/approvals/${id}-${hash}.json`) };
    } catch { return null; }
  }));
  const entries = (await keys(bucket, `${root}admin/audit/`)).sort().reverse().slice(0, 30);
  return { active: pointer, releases: releases.filter(item => item !== null),
    audit: await Promise.all(entries.map(async key => parse<Audit>(await read(bucket, key), key))) };
}
export async function viewerStageManifest(bucket: ReleaseBucket, id: string, content: string, actor: string) {
  if (content.length > 100_000) throw new ReleaseError("Viewer manifest is too large.");
  checkManifest(parse<Manifest>(content, "manifest.json"), id);
  const hash = await sha256(content);
  const key = releaseKey(id, "manifest.json");
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== hash) throw new ReleaseError("This viewer release ID has different bytes.", 409);
  } else {
    if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Viewer manifest was staged concurrently.", 409);
    await audit(bucket, { action: "staged-manifest", actor, reason: "Owner staged immutable Leeds viewer manifest", to: { package_id: id, manifest_sha256: hash } });
  }
  return { package_id: id, manifest_sha256: hash, expected_objects: objects.length };
}
export async function viewerStageObject(bucket: ReleaseBucket, id: string, path: string, content: string) {
  if (!paths.has(path) || content.length > 5_000_000) throw new ReleaseError("Invalid or oversized viewer object.");
  const { manifest } = await manifestFor(bucket, id);
  if (await sha256(content) !== manifest.object_sha256[path]) throw new ReleaseError("Viewer object does not match its manifest hash.");
  parse(content, path);
  const key = releaseKey(id, path);
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== manifest.object_sha256[path]) throw new ReleaseError("Existing viewer object has different bytes.", 409);
  } else if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Viewer object was staged concurrently.", 409);
  return { path, sha256: manifest.object_sha256[path] };
}
export async function viewerValidate(bucket: ReleaseBucket, id: string, actor?: string) {
  const { manifest, hash } = await manifestFor(bucket, id);
  const expected = new Set([releaseKey(id, "manifest.json"), ...objects.map(path => releaseKey(id, path))]);
  const actual = await keys(bucket, `${root}releases/${id}/`);
  if (actual.length !== expected.size || actual.some(key => !expected.has(key))) throw new ReleaseError("Viewer release has missing or unlisted objects.");
  const data = new Map<string, unknown>();
  for (const path of objects) {
    const content = await read(bucket, releaseKey(id, path));
    if (await sha256(content) !== manifest.object_sha256[path]) throw new ReleaseError(`Checksum mismatch: ${path}`);
    data.set(path, parse(content, path));
  }
  const catalog = data.get("catalog.json") as { schema_version: number; audience_scope: string; released_authorities: string[];
    pilot_region: string; years: number[]; regions: { code: string }[];
    authorities: { code: string; region_code: string; coverage: Record<string, { status: string }> }[];
    pilot_wards: { code: string; authority_code: string }[]; activity: Record<string, Record<string, { contest_count: number }>> };
  if (catalog?.schema_version !== 1 || catalog.audience_scope !== "leeds_viewers" || catalog.pilot_region !== yorkshire
    || JSON.stringify(catalog.years) !== JSON.stringify(years) || JSON.stringify(catalog.released_authorities) !== JSON.stringify([leeds])
    || catalog.regions?.length !== 9 || catalog.authorities?.length !== 296 || catalog.pilot_wards?.length !== 33
    || Object.keys(catalog.activity ?? {}).length !== 1 || !catalog.activity[leeds]) throw new ReleaseError("Viewer catalogue has an invalid audience or geography scope.");
  const authorities = new Map(catalog.authorities.map(item => [item.code, item]));
  const wards = new Set(catalog.pilot_wards.map(item => item.code));
  if (new Set(catalog.regions.map(item => item.code)).size !== 9 || authorities.size !== 296 || wards.size !== 33
    || catalog.pilot_wards.some(item => item.authority_code !== leeds)
    || catalog.authorities.some(item => years.some(year => item.coverage?.[String(year)]?.status !== (item.code === leeds ? (year === 2025 ? "partial_by_election_only" : "checked_published") : "not_released")))) {
    throw new ReleaseError("Viewer catalogue coverage includes unapproved council data.");
  }
  for (const [path, codes] of [["regions.geojson", new Set(catalog.regions.map(item => item.code))],
    ["authorities.geojson", new Set(authorities.keys())], ["yorkshire-wards.geojson", wards]] as const) {
    const geometry = data.get(path) as { features: { properties: { code: string } }[] };
    const actualCodes = geometry?.features?.map(item => item.properties?.code);
    if (!Array.isArray(actualCodes) || actualCodes.length !== codes.size || new Set(actualCodes).size !== codes.size
      || actualCodes.some(code => !codes.has(code))) throw new ReleaseError(`Viewer geometry disagrees with catalogue: ${path}`);
  }
  let contests = 0, candidates = 0;
  for (const year of years) {
    const path = `results/${leeds}/${year}.json`;
    const result = data.get(path) as { authority_code: string; year: number; coverage: string; source_release: string;
      events: { event_id: string }[]; contests: { contest_id: string; event_id: string; ward_code: string; seats_available: number; candidate_votes: number }[];
      candidates: { contest_id: string; votes: number | null; elected: number }[] };
    if (result?.authority_code !== leeds || result.year !== year || result.source_release !== "leeds-pulse-v0.6.0"
      || result.coverage !== authorities.get(leeds)?.coverage[String(year)]?.status
      || !Array.isArray(result.events) || !Array.isArray(result.contests) || !Array.isArray(result.candidates)
      || result.contests.length !== catalog.activity[leeds]?.[String(year)]?.contest_count) throw new ReleaseError(`Invalid Leeds viewer result: ${path}`);
    const events = new Set(result.events.map(item => item.event_id));
    const contestIds = new Set(result.contests.map(item => item.contest_id));
    if (events.size !== result.events.length || contestIds.size !== result.contests.length
      || result.candidates.some(item => !contestIds.has(item.contest_id) || (item.votes !== null && (!Number.isInteger(item.votes) || item.votes < 0)))) throw new ReleaseError(`Invalid result references: ${path}`);
    for (const contest of result.contests) {
      const rows = result.candidates.filter(item => item.contest_id === contest.contest_id);
      if (!events.has(contest.event_id) || !wards.has(contest.ward_code) || contest.seats_available < 1
        || rows.filter(item => item.elected).length > contest.seats_available
        || rows.reduce((sum, item) => sum + (item.votes ?? 0), 0) !== contest.candidate_votes) throw new ReleaseError(`Invalid Leeds contest: ${contest.contest_id}`);
    }
    contests += result.contests.length; candidates += result.candidates.length;
  }
  const checked = { package_id: id, manifest_sha256: hash, objects_checked: objects.length, council_years: years.length, contests, candidates, limits: manifest.limits };
  if (actor) await audit(bucket, { action: "validated", actor, reason: `${objects.length} viewer object hashes and Leeds contests checked`, to: { package_id: id, manifest_sha256: hash } });
  return checked;
}
export async function viewerApprove(bucket: ReleaseBucket, id: string, actor: string, reason: string) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a Leeds source-review reason of at least 12 characters.");
  const checked = await viewerValidate(bucket, id);
  const pointer = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  const key = `${root}admin/approvals/${id}-${pointer.manifest_sha256}.json`;
  if (await bucket.get(key)) throw new ReleaseError("This exact viewer package is already approved.", 409);
  await audit(bucket, { action: "approval-started", actor, reason: reason.trim(), to: pointer });
  if (!await bucket.put(key, JSON.stringify({ ...pointer, actor, reason: reason.trim(), at: new Date().toISOString() }), { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Viewer approval was recorded concurrently.", 409);
  await audit(bucket, { action: "approved", actor, reason: reason.trim(), to: pointer });
  return checked;
}
export async function viewerActivate(bucket: ReleaseBucket, id: string, actor: string, reason: string, expected: Pointer | null) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a viewer activation reason of at least 12 characters.");
  const current = await active(bucket);
  if (!same(current.pointer, expected)) throw new ReleaseError("Viewer pointer changed. Refresh first.", 409);
  const checked = await viewerValidate(bucket, id);
  const next = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  if (same(current.pointer, next)) throw new ReleaseError("Viewer package is already active.", 409);
  if (!await bucket.get(`${root}admin/approvals/${id}-${next.manifest_sha256}.json`)) throw new ReleaseError("Exact viewer package approval is required.", 403);
  const before = await active(bucket);
  if (!same(before.pointer, current.pointer)) throw new ReleaseError("Viewer pointer changed during validation.", 409);
  await audit(bucket, { action: "activation-started", actor, reason: reason.trim(), from: current.pointer, to: next });
  const condition = before.etag ? { etagMatches: before.etag } : { etagDoesNotMatch: "*" };
  if (!await bucket.put(`${root}active.json`, JSON.stringify(next), { onlyIf: condition })) throw new ReleaseError("Viewer pointer changed during activation.", 409);
  await audit(bucket, { action: "activated", actor, reason: reason.trim(), from: current.pointer, to: next });
  return { from: current.pointer, to: next };
}
export async function viewerRollback(bucket: ReleaseBucket, actor: string, reason: string, expected: Pointer | null) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a viewer rollback reason of at least 12 characters.");
  const current = await active(bucket);
  if (!current.pointer || !same(current.pointer, expected)) throw new ReleaseError("Viewer pointer changed. Refresh first.", 409);
  let previous: Pointer | null | undefined;
  for (const key of (await keys(bucket, `${root}admin/audit/`)).sort().reverse()) {
    const event = parse<Audit>(await read(bucket, key), key);
    if (["activated", "rolled-back"].includes(event.action) && same(event.to ?? null, current.pointer)) { previous = event.from; break; }
  }
  if (!previous) throw new ReleaseError("No earlier viewer package exists; disable viewer feature flags for first-release recovery.", 409);
  const checked = await viewerValidate(bucket, previous.package_id);
  if (checked.manifest_sha256 !== previous.manifest_sha256) throw new ReleaseError("Prior viewer manifest changed.", 409);
  const before = await active(bucket);
  if (!same(before.pointer, current.pointer)) throw new ReleaseError("Viewer pointer changed during validation.", 409);
  await audit(bucket, { action: "rollback-started", actor, reason: reason.trim(), from: current.pointer, to: previous });
  if (!await bucket.put(`${root}active.json`, JSON.stringify(previous), { onlyIf: { etagMatches: before.etag } })) throw new ReleaseError("Viewer pointer changed during rollback.", 409);
  await audit(bucket, { action: "rolled-back", actor, reason: reason.trim(), from: current.pointer, to: previous });
  return { from: current.pointer, to: previous };
}
