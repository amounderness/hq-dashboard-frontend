import "server-only";
import { ReleaseError, sha256, validId, type Pointer, type ReleaseBucket } from "@/lib/release-admin";

type Manifest = {
  schema_version: number; package_id: string; release_status: string; pilot_region: string;
  created_at?: string; limits: string[]; object_sha256: Record<string, string>;
  review_status?: string;
};
type Area = { code: string; region_code: string; coverage: Record<string, { status: string }>;
  ward_edition_by_year?: Record<string, string> };
type Catalog = {
  pilot_region: string; years: number[]; regions: { code: string }[];
  authorities: Area[]; pilot_wards: { code: string; authority_code: string }[];
  pilot_wards_by_edition?: Record<string, { code: string; authority_code: string }[]>;
  ward_editions?: { id: string; object: string; ward_count: number }[];
  activity: Record<string, Record<string, { contest_count: number }>>;
};
type Geo = { features: { properties: { code: string } }[] };
type Result = {
  authority_code: string; year: number; coverage: string;
  events: { event_id: string; election_date: string }[];
  contests: { contest_id: string; event_id: string; ward_code: string; seats_available: number;
    candidate_votes: number | null; result_boundary_id?: string | null; display_boundary_id?: string | null }[];
  candidates: { result_id: string; contest_id: string; votes: number | null; elected: boolean }[];
};
type Audit = { id: string; at: string; action: string; actor: string; reason: string; from?: Pointer | null; to?: Pointer | null; package_id?: string };

const prefix = "v2/";
const digestPattern = /^[a-f0-9]{64}$/;
const resultPath = /^results\/(E\d{8})\/(20\d{2})\.json$/;
const geographyPaths = ["catalog.json", "regions.geojson", "authorities.geojson", "yorkshire-wards.geojson"];
const datedWardsPath = "yorkshire-wards-2026.geojson";
const revised2026 = new Set(["E08000032", "E08000033", "E08000034", "E08000036", "E08000038"]);
const validV2Path = (path: string) => geographyPaths.includes(path) || path === datedWardsPath || resultPath.test(path);
const releaseKey = (id: string, path: string) => `${prefix}releases/${id}/${path}`;
const same = (a: Pointer | null, b: Pointer | null) => a?.package_id === b?.package_id && a?.manifest_sha256 === b?.manifest_sha256;

async function read(bucket: ReleaseBucket, key: string) {
  const object = await bucket.get(key);
  if (!object) throw new ReleaseError(`Missing private object: ${key}`, 404);
  return object.text();
}
async function keys(bucket: ReleaseBucket, path: string): Promise<string[]> {
  const output: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const listing = await bucket.list({ prefix: path, cursor, limit: 1000 });
    output.push(...listing.objects.map(item => item.key));
    if (!listing.truncated) return output;
    if (!listing.cursor || listing.cursor === cursor) throw new ReleaseError("Private storage listing is incomplete.", 503);
    cursor = listing.cursor;
  }
  throw new ReleaseError("Too many package objects to list safely.", 503);
}
function parse<T>(text: string, label: string): T {
  try { return JSON.parse(text) as T; }
  catch { throw new ReleaseError(`Invalid JSON: ${label}`); }
}
function checkManifest(value: Manifest, id: string) {
  if (!validId(id) || value?.package_id !== id || ![1, 2].includes(value.schema_version) || value.release_status !== "staged_not_published" || value.pilot_region !== "E12000003") throw new ReleaseError("Unsupported Yorkshire Explorer v2 manifest.");
  if (value.schema_version === 2 && !["council_source_review_pending", "source_reviewed"].includes(value.review_status ?? "")) throw new ReleaseError("Dated-ward release review status is missing.");
  if (!Array.isArray(value.limits) || !value.limits.length || value.limits.some(item => typeof item !== "string" || !item.trim())) throw new ReleaseError("Manifest must describe release limits.");
  const objects = value.object_sha256;
  if (!objects || typeof objects !== "object" || Array.isArray(objects) || Object.keys(objects).length < 4 || Object.entries(objects).some(([path, hash]) => !validV2Path(path) || !digestPattern.test(hash))) throw new ReleaseError("Manifest object hashes are invalid.");
  if (geographyPaths.some(path => !objects[path])) throw new ReleaseError("Manifest omits required geography objects.");
  if (value.schema_version === 2 && !objects[datedWardsPath]) throw new ReleaseError("Manifest omits the 2026 ward edition.");
  if (value.schema_version === 1 && objects[datedWardsPath]) throw new ReleaseError("Schema 1 cannot include the 2026 ward edition.");
}
async function manifestFor(bucket: ReleaseBucket, id: string) {
  if (!validId(id)) throw new ReleaseError("Invalid release ID.");
  const text = await read(bucket, releaseKey(id, "manifest.json"));
  const manifest = parse<Manifest>(text, "manifest.json");
  checkManifest(manifest, id);
  return { manifest, hash: await sha256(text) };
}
async function activeWithEtag(bucket: ReleaseBucket): Promise<{ pointer: Pointer | null; etag?: string }> {
  const object = await bucket.get(`${prefix}active.json`);
  if (!object) return { pointer: null };
  if (!object.etag) throw new ReleaseError("Active pointer storage version is unavailable.", 503);
  const pointer = parse<Pointer>(await object.text(), "v2/active.json");
  if (!validId(pointer?.package_id) || !digestPattern.test(pointer?.manifest_sha256)) throw new ReleaseError("Active Explorer v2 pointer is invalid.", 503);
  return { pointer, etag: object.etag };
}
export async function v2ActivePointer(bucket: ReleaseBucket) { return (await activeWithEtag(bucket)).pointer; }
async function approved(bucket: ReleaseBucket, pointer: Pointer) {
  return !!await bucket.get(`${prefix}admin/approvals/${pointer.package_id}-${pointer.manifest_sha256}.json`);
}
async function audit(bucket: ReleaseBucket, event: Omit<Audit, "id" | "at">) {
  const record: Audit = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
  const key = `${prefix}admin/audit/${record.at.replace(/[:.]/g, "-")}-${record.id}.json`;
  if (!await bucket.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Release audit could not be saved.", 503);
  return record;
}

export async function v2ReleaseList(bucket: ReleaseBucket) {
  const active = await v2ActivePointer(bucket);
  const manifests = (await keys(bucket, `${prefix}releases/`)).filter(key => /^v2\/releases\/[a-z0-9][a-z0-9.-]{0,79}\/manifest\.json$/.test(key));
  const releases = await Promise.all(manifests.map(async key => {
    const id = key.split("/")[2];
    try {
      const { manifest, hash } = await manifestFor(bucket, id);
      const pointer = { package_id: id, manifest_sha256: hash };
      return { ...pointer, created_at: manifest.created_at, objects: Object.keys(manifest.object_sha256).length,
        limits: manifest.limits, active: same(active, pointer), approved: await approved(bucket, pointer) };
    } catch { return null; }
  }));
  const recent = (await keys(bucket, `${prefix}admin/audit/`)).sort().reverse().slice(0, 30);
  const history = await Promise.all(recent.map(async key => parse<Audit>(await read(bucket, key), key)));
  return { active, releases: releases.filter(item => item !== null).sort((a, b) => b.package_id.localeCompare(a.package_id)), audit: history };
}

export async function v2StageManifest(bucket: ReleaseBucket, id: string, content: string, actor: string) {
  if (content.length > 200_000) throw new ReleaseError("Manifest is too large.");
  const manifest = parse<Manifest>(content, "manifest.json");
  checkManifest(manifest, id);
  const hash = await sha256(content);
  const key = releaseKey(id, "manifest.json");
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== hash) throw new ReleaseError("This release ID already contains a different manifest.", 409);
  } else {
    if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Manifest was staged concurrently.", 409);
    await audit(bucket, { action: "staged-manifest", actor, reason: "Owner uploaded an immutable v2 manifest", package_id: id, to: { package_id: id, manifest_sha256: hash } });
  }
  return { package_id: id, manifest_sha256: hash, expected_objects: Object.keys(manifest.object_sha256).length };
}
export async function v2StageObject(bucket: ReleaseBucket, id: string, path: string, content: string) {
  if (!validV2Path(path) || content.length > 5_000_000) throw new ReleaseError("Invalid or oversized package object.");
  const { manifest } = await manifestFor(bucket, id);
  const expected = manifest.object_sha256[path];
  if (!expected || await sha256(content) !== expected) throw new ReleaseError("Object does not match the manifest hash.");
  parse(content, path);
  const key = releaseKey(id, path);
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== expected) throw new ReleaseError("This release path already contains different bytes.", 409);
  } else if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Object was staged concurrently.", 409);
  return { path, sha256: expected };
}

export async function v2Validate(bucket: ReleaseBucket, id: string, actor?: string) {
  const { manifest, hash } = await manifestFor(bucket, id);
  const expected = new Set([releaseKey(id, "manifest.json"), ...Object.keys(manifest.object_sha256).map(path => releaseKey(id, path))]);
  const actual = await keys(bucket, `${prefix}releases/${id}/`);
  if (actual.length !== expected.size || actual.some(key => !expected.has(key))) throw new ReleaseError("Release has missing or unlisted objects.");
  const objects = new Map<string, unknown>();
  for (const [path, digest] of Object.entries(manifest.object_sha256)) {
    const text = await read(bucket, releaseKey(id, path));
    if (await sha256(text) !== digest) throw new ReleaseError(`Checksum mismatch: ${path}`);
    objects.set(path, parse(text, path));
  }
  const catalog = objects.get("catalog.json") as Catalog;
  if (catalog?.pilot_region !== manifest.pilot_region || !Array.isArray(catalog.years) || !catalog.years.length || !catalog.years.every(year => Number.isInteger(year) && year >= 2021 && year <= 2100)) throw new ReleaseError("Catalog scope or years are invalid.");
  const regions = new Set(catalog.regions?.map(item => item.code));
  const authorities = new Map(catalog.authorities?.map(item => [item.code, item]));
  const wards = new Map(catalog.pilot_wards?.map(item => [item.code, item]));
  if (!regions.size || !regions.has(manifest.pilot_region) || !authorities.size || !wards.size || regions.size !== catalog.regions.length || authorities.size !== catalog.authorities.length || wards.size !== catalog.pilot_wards.length) throw new ReleaseError("Catalog geography is incomplete or duplicated.");
  for (const area of authorities.values()) if (!regions.has(area.region_code) || catalog.years.some(year => !area.coverage?.[String(year)])) throw new ReleaseError("Council coverage register is incomplete.");
  for (const ward of wards.values()) if (authorities.get(ward.authority_code)?.region_code !== manifest.pilot_region) throw new ReleaseError("Pilot ward lacks a matching council.");
  for (const [path, codes] of [["regions.geojson", regions], ["authorities.geojson", new Set(authorities.keys())], ["yorkshire-wards.geojson", new Set(wards.keys())]] as const) {
    const geo = objects.get(path) as Geo;
    const found = geo?.features?.map(item => item.properties?.code);
    if (!Array.isArray(found) || found.length !== codes.size || new Set(found).size !== codes.size || found.some(code => !codes.has(code))) throw new ReleaseError(`Geometry and catalog disagree: ${path}`);
  }
  const wards2026 = new Map(catalog.pilot_wards_by_edition?.["2026-05"]?.map(item => [item.code, item]));
  if (manifest.schema_version === 2) {
    if (catalog.ward_editions?.length !== 2 || catalog.ward_editions[0]?.object !== "yorkshire-wards.geojson"
      || catalog.ward_editions[1]?.object !== datedWardsPath || wards2026.size !== 411
      || catalog.pilot_wards_by_edition?.["2025-05"]?.length !== wards.size
      || catalog.pilot_wards_by_edition?.["2026-05"]?.length !== 411) throw new ReleaseError("Dated ward catalogue is incomplete.");
    const geo = objects.get(datedWardsPath) as Geo;
    const codes = geo?.features?.map(item => item.properties?.code);
    if (!Array.isArray(codes) || codes.length !== 411 || new Set(codes).size !== 411 || codes.some(code => !wards2026.has(code))) throw new ReleaseError("2026 ward geometry disagrees with catalog.");
    for (const area of authorities.values()) {
      const expected = revised2026.has(area.code) ? "2026-05" : "2025-05";
      if (area.ward_edition_by_year?.["2026"] !== expected) throw new ReleaseError("Council default ward edition is invalid.");
    }
  }
  let contests = 0, candidates = 0, councilYears = 0;
  for (const [path, value] of objects) {
    const match = resultPath.exec(path);
    if (!match) continue;
    const [, code, yearText] = match;
    const year = Number(yearText);
    const area = authorities.get(code);
    const result = value as Result;
    if (area?.region_code !== manifest.pilot_region || !catalog.years.includes(year) || result?.authority_code !== code || result.year !== year || result.coverage !== area.coverage[yearText]?.status) throw new ReleaseError(`Result scope does not match catalog: ${path}`);
    if (!Array.isArray(result.events) || !Array.isArray(result.contests) || !Array.isArray(result.candidates)) throw new ReleaseError(`Invalid result arrays: ${path}`);
    const events = new Map(result.events.map(item => [item.event_id, item]));
    const contestIds = new Set(result.contests.map(item => item.contest_id));
    if (events.size !== result.events.length || contestIds.size !== result.contests.length || catalog.activity?.[code]?.[yearText]?.contest_count !== result.contests.length) throw new ReleaseError(`Result activity or IDs disagree: ${path}`);
    if (result.candidates.some(item => !contestIds.has(item.contest_id) || (item.votes !== null && (!Number.isInteger(item.votes) || item.votes < 0)))) throw new ReleaseError(`Invalid candidate records: ${path}`);
    for (const contest of result.contests) {
      if (!events.has(contest.event_id) || (!wards.has(contest.ward_code) && !wards2026.has(contest.ward_code) && !contest.ward_code.startsWith("historic:")) || !Number.isInteger(contest.seats_available) || contest.seats_available < 1) throw new ReleaseError(`Invalid contest reference: ${path}`);
      if (manifest.schema_version === 2 && revised2026.has(code) && year === 2026) {
        const date = events.get(contest.event_id)?.election_date;
        const boundary = `${contest.ward_code}:${date && date >= "2026-05-07" ? "2026-05" : "2025-05"}`;
        if (!date || (date >= "2026-05-07" && (wards2026.get(contest.ward_code)?.authority_code !== code || contest.result_boundary_id !== boundary))
          || (date < "2026-05-07" && wards.get(contest.ward_code)?.authority_code !== code)
          || contest.display_boundary_id !== boundary) throw new ReleaseError(`Dated ward reference is invalid: ${contest.contest_id}`);
      }
      const rows = result.candidates.filter(item => item.contest_id === contest.contest_id);
      if (rows.filter(item => item.elected).length > contest.seats_available || (contest.candidate_votes !== null && rows.reduce((sum, item) => sum + (item.votes ?? 0), 0) !== contest.candidate_votes)) throw new ReleaseError(`Contest totals disagree: ${path}`);
    }
    councilYears++; contests += result.contests.length; candidates += result.candidates.length;
  }
  for (const area of authorities.values()) {
    if (area.region_code !== manifest.pilot_region) continue;
    for (const year of catalog.years) {
      const status = area.coverage[String(year)]?.status;
      const hasResult = objects.has(`results/${area.code}/${year}.json`);
      if (hasResult === (["not_audited", "no_record_in_annual_source"].includes(status))) throw new ReleaseError(`Council-year coverage and result disagree: ${area.code}/${year}`);
    }
  }
  const result = { package_id: id, manifest_sha256: hash, objects_checked: objects.size, council_years: councilYears, contests, candidates, limits: manifest.limits };
  if (actor) await audit(bucket, { action: "validated", actor, reason: `${objects.size} hashes and result references checked`, package_id: id, to: { package_id: id, manifest_sha256: hash } });
  return result;
}

export async function v2Approve(bucket: ReleaseBucket, id: string, actor: string, reason: string) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a source-review reason of at least 12 characters.");
  const { manifest } = await manifestFor(bucket, id);
  if (manifest.schema_version === 2 && manifest.review_status !== "source_reviewed") throw new ReleaseError("Council source review is still pending for this dated-ward package.", 409);
  const checked = await v2Validate(bucket, id);
  const pointer = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  if (await approved(bucket, pointer)) throw new ReleaseError("This exact v2 package is already approved.", 409);
  await audit(bucket, { action: "approval-started", actor, reason: reason.trim(), package_id: id, to: pointer });
  if (!await bucket.put(`${prefix}admin/approvals/${id}-${pointer.manifest_sha256}.json`, JSON.stringify({ ...pointer, actor, reason: reason.trim(), approved_at: new Date().toISOString() }), { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Approval was recorded concurrently.", 409);
  await audit(bucket, { action: "approved", actor, reason: reason.trim(), package_id: id, to: pointer });
  return checked;
}
export async function v2Activate(bucket: ReleaseBucket, id: string, actor: string, reason: string, expectedActive: Pointer | null) {
  if (reason.trim().length < 12) throw new ReleaseError("Record an activation reason of at least 12 characters.");
  const current = await activeWithEtag(bucket);
  if (!same(current.pointer, expectedActive)) throw new ReleaseError("Active Explorer v2 release changed. Refresh first.", 409);
  const checked = await v2Validate(bucket, id);
  const next = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  if (same(current.pointer, next)) throw new ReleaseError("This v2 package is already active.", 409);
  if (!await approved(bucket, next)) throw new ReleaseError("The exact v2 package hash must be approved first.", 403);
  const before = await activeWithEtag(bucket);
  if (!same(before.pointer, current.pointer)) throw new ReleaseError("Active Explorer v2 release changed during validation.", 409);
  await audit(bucket, { action: "activation-started", actor, reason: reason.trim(), from: current.pointer, to: next, package_id: id });
  const condition = before.etag ? { etagMatches: before.etag } : { etagDoesNotMatch: "*" };
  if (!await bucket.put(`${prefix}active.json`, JSON.stringify(next), { onlyIf: condition })) throw new ReleaseError("Active Explorer v2 release changed during publication.", 409);
  await audit(bucket, { action: "activated", actor, reason: reason.trim(), from: current.pointer, to: next, package_id: id });
  return { from: current.pointer, to: next };
}
export async function v2Rollback(bucket: ReleaseBucket, actor: string, reason: string, expectedActive: Pointer | null) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a rollback reason of at least 12 characters.");
  const current = await activeWithEtag(bucket);
  if (!current.pointer || !same(current.pointer, expectedActive)) throw new ReleaseError("Active Explorer v2 release changed. Refresh first.", 409);
  let previous: Pointer | null | undefined;
  for (const key of (await keys(bucket, `${prefix}admin/audit/`)).sort().reverse()) {
    const entry = parse<Audit>(await read(bucket, key), key);
    if (["activated", "rolled-back"].includes(entry.action) && same(entry.to ?? null, current.pointer)) { previous = entry.from; break; }
  }
  if (!previous) throw new ReleaseError("No earlier active v2 package is recorded; disable the v2 feature flags to recover from the first activation.", 409);
  const checked = await v2Validate(bucket, previous.package_id);
  if (checked.manifest_sha256 !== previous.manifest_sha256) throw new ReleaseError("Prior v2 manifest changed.", 409);
  const before = await activeWithEtag(bucket);
  if (!same(before.pointer, current.pointer)) throw new ReleaseError("Active Explorer v2 release changed during validation.", 409);
  await audit(bucket, { action: "rollback-started", actor, reason: reason.trim(), from: current.pointer, to: previous });
  if (!await bucket.put(`${prefix}active.json`, JSON.stringify(previous), { onlyIf: { etagMatches: before.etag } })) throw new ReleaseError("Active Explorer v2 release changed during rollback.", 409);
  await audit(bucket, { action: "rolled-back", actor, reason: reason.trim(), from: current.pointer, to: previous });
  return { from: current.pointer, to: previous };
}
