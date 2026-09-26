import "server-only";

export type Pointer = { package_id: string; manifest_sha256: string };
type StoredObject = { text(): Promise<string>; etag?: string };
export type ReleaseBucket = {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: string, options?: { onlyIf?: { etagDoesNotMatch?: string; etagMatches?: string } }): Promise<unknown>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};
type Manifest = {
  package_id: string; publication_allowed: boolean; demo?: boolean; years: number[];
  wards: number; contests: number; candidate_records: number;
  release_limits: string[]; object_sha256: Record<string, string>;
};
export type ReleaseInfo = { package_id: string; assembled_on?: string; wards?: number; contests?: number; candidate_records?: number; manifest_sha256: string; active: boolean; approved: boolean; changed_paths: string[]; added_paths: string[]; removed_paths: string[]; release_limits: string[] };
type Approval = { package_id: string; manifest_sha256: string; actor: string; approved_at: string; reason: string };
type Audit = { id: string; action: string; actor: string; at: string; reason: string; from?: Pointer; to?: Pointer; package_id?: string };

const idPattern = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const pathPattern = /^[a-z0-9][a-z0-9._/-]*\.json$|^[a-z0-9][a-z0-9._/-]*\.geojson$/;
const digestPattern = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

export class ReleaseError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const validId = (id: string) => idPattern.test(id);
export const validPath = (path: string) => pathPattern.test(path) && !path.includes("..") && !path.includes("//") && !path.startsWith("/");
export async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function readText(bucket: ReleaseBucket, key: string) {
  const object = await bucket.get(key);
  if (!object) throw new ReleaseError(`Missing private object: ${key}`, 404);
  return object.text();
}
async function readJson<T>(bucket: ReleaseBucket, key: string): Promise<T> {
  try { return JSON.parse(await readText(bucket, key)) as T; }
  catch (error) { if (error instanceof ReleaseError) throw error; throw new ReleaseError(`Invalid JSON: ${key}`); }
}
async function objectKeys(bucket: ReleaseBucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const result = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...result.objects.map(item => item.key));
    if (!result.truncated) return keys;
    if (!result.cursor || result.cursor === cursor) throw new ReleaseError("Private storage listing could not be completed.", 503);
    cursor = result.cursor;
  }
  throw new ReleaseError("Too many release objects to list safely.", 503);
}
function checkManifest(manifest: Manifest, id: string) {
  if (!validId(id) || manifest.package_id !== id || manifest.publication_allowed !== true || manifest.demo === true) throw new ReleaseError("The manifest is not a publishable factual release.");
  if (!Array.isArray(manifest.years) || !manifest.years.length || !manifest.years.every(year => Number.isInteger(year) && year >= 2000 && year <= 2100)) throw new ReleaseError("Manifest election years are invalid.");
  if (![manifest.wards, manifest.contests, manifest.candidate_records].every(value => Number.isInteger(value) && value > 0)) throw new ReleaseError("Manifest counts are invalid.");
  if (!Array.isArray(manifest.release_limits) || !manifest.release_limits.length) throw new ReleaseError("Manifest must disclose release limits.");
  const objects = manifest.object_sha256;
  if (!objects || typeof objects !== "object" || Object.keys(objects).length < 6 || Object.entries(objects).some(([path, digest]) => !validPath(path) || !digestPattern.test(digest))) throw new ReleaseError("Manifest object hashes are invalid.");
  const required = ["geography/wards.json", "geography/wards.geojson", "pulse/latest-results.json", "pulse/ward-history.json", ...manifest.years.flatMap(year => ["events", "contests", "candidates", "party-results"].map(kind => `elections/${year}/local-council/${kind}.json`))];
  if (required.some(path => !objects[path])) throw new ReleaseError("Manifest omits required release objects.");
}
async function manifestFor(bucket: ReleaseBucket, id: string): Promise<{ manifest: Manifest; hash: string }> {
  if (!validId(id)) throw new ReleaseError("Invalid release ID.");
  const text = await readText(bucket, `releases/${id}/manifest.json`);
  let manifest: Manifest;
  try { manifest = JSON.parse(text) as Manifest; } catch { throw new ReleaseError("Manifest is not valid JSON."); }
  checkManifest(manifest, id);
  return { manifest, hash: await sha256(text) };
}
async function activeWithEtag(bucket: ReleaseBucket): Promise<{ pointer: Pointer; etag: string }> {
  const object = await bucket.get("active.json");
  if (!object || !object.etag) throw new ReleaseError("Active pointer or its storage version is unavailable.", 503);
  let pointer: Pointer;
  try { pointer = JSON.parse(await object.text()) as Pointer; } catch { throw new ReleaseError("Active pointer is invalid JSON.", 503); }
  if (!pointer || !validId(pointer.package_id) || !digestPattern.test(pointer.manifest_sha256)) throw new ReleaseError("Active pointer is invalid.", 503);
  return { pointer, etag: object.etag };
}
export async function activePointer(bucket: ReleaseBucket): Promise<Pointer> {
  return (await activeWithEtag(bucket)).pointer;
}
async function approvalFor(bucket: ReleaseBucket, pointer: Pointer) {
  return bucket.get(`admin/approvals/${pointer.package_id}-${pointer.manifest_sha256}.json`);
}
export async function releaseList(bucket: ReleaseBucket) {
  const active = await activePointer(bucket);
  const { manifest: activeManifest, hash: activeHash } = await manifestFor(bucket, active.package_id);
  if (activeHash !== active.manifest_sha256) throw new ReleaseError("The active manifest does not match its pointer.", 503);
  const keys = await objectKeys(bucket, "releases/");
  const ids = keys.filter(key => /^releases\/[a-z0-9][a-z0-9.-]{0,79}\/manifest\.json$/.test(key)).map(key => key.split("/")[1]);
  const releases: ReleaseInfo[] = [];
  for (const id of [...new Set(ids)].sort().reverse()) {
    try {
      const { manifest, hash } = await manifestFor(bucket, id);
      const raw = await readJson<{ assembled_on?: string }>(bucket, `releases/${id}/manifest.json`);
      const pointer = { package_id: id, manifest_sha256: hash };
      releases.push({ ...pointer, assembled_on: raw.assembled_on, wards: manifest.wards, contests: manifest.contests, candidate_records: manifest.candidate_records, active: active.package_id === id && active.manifest_sha256 === hash, approved: !!await approvalFor(bucket, pointer), changed_paths: Object.keys(manifest.object_sha256).filter(path => activeManifest.object_sha256[path] && activeManifest.object_sha256[path] !== manifest.object_sha256[path]), added_paths: Object.keys(manifest.object_sha256).filter(path => !activeManifest.object_sha256[path]), removed_paths: Object.keys(activeManifest.object_sha256).filter(path => !manifest.object_sha256[path]), release_limits: manifest.release_limits });
    } catch { /* A broken staged manifest is shown by validation, never as a selectable release. */ }
  }
  const auditKeys = (await objectKeys(bucket, "admin/audit/")).sort().reverse().slice(0, 30);
  const audit = await Promise.all(auditKeys.map(async key => readJson<Audit>(bucket, key)));
  return { active, releases, audit };
}
export async function stageManifest(bucket: ReleaseBucket, id: string, content: string, actor?: string) {
  if (content.length > 200_000) throw new ReleaseError("Manifest is too large.");
  let manifest: Manifest;
  try { manifest = JSON.parse(content) as Manifest; } catch { throw new ReleaseError("Manifest is not valid JSON."); }
  checkManifest(manifest, id);
  const key = `releases/${id}/manifest.json`;
  const hash = await sha256(content);
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== hash) throw new ReleaseError("This release ID already contains a different manifest.", 409);
  } else {
    if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Manifest was staged concurrently; refresh and retry.", 409);
    if (actor) await appendAudit(bucket, { action: "staged-manifest", actor, reason: "Owner uploaded an immutable manifest", package_id: id, to: { package_id: id, manifest_sha256: hash } });
  }
  return { package_id: id, manifest_sha256: hash, expected_objects: Object.keys(manifest.object_sha256).length };
}
export async function stageObject(bucket: ReleaseBucket, id: string, path: string, content: string) {
  if (!validPath(path) || path === "manifest.json") throw new ReleaseError("Invalid package path.");
  if (content.length > 12_000_000) throw new ReleaseError("Package object is too large.");
  const { manifest } = await manifestFor(bucket, id);
  const expected = manifest.object_sha256[path];
  if (!expected || await sha256(content) !== expected) throw new ReleaseError("Object does not match the manifest hash.");
  try { JSON.parse(content); } catch { throw new ReleaseError("Package object is not valid JSON."); }
  const key = `releases/${id}/${path}`;
  const existing = await bucket.get(key);
  if (existing) {
    if (await sha256(await existing.text()) !== expected) throw new ReleaseError("This package path already contains different bytes.", 409);
  } else if (!await bucket.put(key, content, { onlyIf: { etagDoesNotMatch: "*" } })) throw new ReleaseError("Object was staged concurrently; refresh and retry.", 409);
  return { path, sha256: expected };
}
export async function validateRelease(bucket: ReleaseBucket, id: string, actor?: string) {
  const { manifest, hash } = await manifestFor(bucket, id);
  const parsed = new Map<string, unknown>();
  for (const [path, expected] of Object.entries(manifest.object_sha256)) {
    const text = await readText(bucket, `releases/${id}/${path}`);
    if (await sha256(text) !== expected) throw new ReleaseError(`Hash mismatch: ${path}`);
    try { parsed.set(path, JSON.parse(text)); } catch { throw new ReleaseError(`Invalid JSON: ${path}`); }
  }
  const wards = parsed.get("geography/wards.json") as { ward_code: string }[];
  if (!Array.isArray(wards) || wards.length !== manifest.wards || new Set(wards.map(row => row.ward_code)).size !== wards.length) throw new ReleaseError("Ward list does not match the manifest.");
  const geo = parsed.get("geography/wards.geojson") as { features: { id: string }[] };
  if (!Array.isArray(geo?.features) || geo.features.length !== wards.length || new Set(geo.features.map(item => item.id)).size !== wards.length || geo.features.some(item => !wards.some(ward => ward.ward_code === item.id))) throw new ReleaseError("Map features do not match the ward list.");
  let contests = 0, candidates = 0;
  for (const year of manifest.years) {
    const base = `elections/${year}/local-council/`;
    const events = parsed.get(`${base}events.json`) as { event_id: string }[];
    const rows = parsed.get(`${base}contests.json`) as { contest_id: string; event_id: string; ward_code: string; all_candidate_votes: number }[];
    const people = parsed.get(`${base}candidates.json`) as { contest_id: string; votes: number }[];
    const parties = parsed.get(`${base}party-results.json`) as { contest_id: string; candidate_votes: number }[];
    if (![events, rows, people, parties].every(Array.isArray)) throw new ReleaseError(`Invalid election arrays for ${year}.`);
    if (new Set(rows.map(row => row.contest_id)).size !== rows.length) throw new ReleaseError(`Duplicate contests for ${year}.`);
    const ids = new Set(rows.map(row => row.contest_id));
    const eventIds = new Set(events.map(row => row.event_id));
    if (rows.some(row => !eventIds.has(row.event_id) || !wards.some(ward => ward.ward_code === row.ward_code)) || people.some(row => !ids.has(row.contest_id)) || parties.some(row => !ids.has(row.contest_id))) throw new ReleaseError(`Broken election references for ${year}.`);
    for (const row of rows) {
      const candidateVotes = people.filter(item => item.contest_id === row.contest_id).reduce((total, item) => total + item.votes, 0);
      const partyVotes = parties.filter(item => item.contest_id === row.contest_id).reduce((total, item) => total + item.candidate_votes, 0);
      if (candidateVotes <= 0 || candidateVotes !== partyVotes || candidateVotes !== row.all_candidate_votes) throw new ReleaseError(`Vote totals disagree in ${row.contest_id}.`);
    }
    contests += rows.length; candidates += people.length;
  }
  if (contests !== manifest.contests || candidates !== manifest.candidate_records) throw new ReleaseError("Manifest election counts do not match the data.");
  const result = { package_id: id, manifest_sha256: hash, objects_checked: parsed.size, wards: wards.length, contests, candidates, release_limits: manifest.release_limits };
  if (actor) await appendAudit(bucket, { action: "validated", actor, reason: `${parsed.size} objects and election invariants checked`, package_id: id, to: { package_id: id, manifest_sha256: hash } });
  return result;
}
async function appendAudit(bucket: ReleaseBucket, event: Omit<Audit, "id" | "at">) {
  const record: Audit = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() };
  const key = `admin/audit/${record.at.replace(/[:.]/g, "-")}-${record.id}.json`;
  await bucket.put(key, JSON.stringify(record), { onlyIf: { etagDoesNotMatch: "*" } });
  return record;
}
export async function approveRelease(bucket: ReleaseBucket, id: string, actor: string, reason: string) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a reason of at least 12 characters.");
  const checked = await validateRelease(bucket, id);
  const pointer = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  if (await approvalFor(bucket, pointer)) throw new ReleaseError("This exact package is already approved.", 409);
  const approval: Approval = { ...pointer, actor, approved_at: new Date().toISOString(), reason: reason.trim() };
  await appendAudit(bucket, { action: "approval-started", actor, reason: approval.reason, to: pointer, package_id: id });
  await bucket.put(`admin/approvals/${id}-${pointer.manifest_sha256}.json`, JSON.stringify(approval), { onlyIf: { etagDoesNotMatch: "*" } });
  await appendAudit(bucket, { action: "approved", actor, reason: approval.reason, to: pointer, package_id: id });
  return checked;
}
export async function activateRelease(bucket: ReleaseBucket, id: string, actor: string, reason: string, expectedActive: Pointer) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a reason of at least 12 characters.");
  const { pointer: current } = await activeWithEtag(bucket);
  if (JSON.stringify(current) !== JSON.stringify(expectedActive)) throw new ReleaseError("The active release changed. Refresh before publishing.", 409);
  const checked = await validateRelease(bucket, id);
  const next = { package_id: id, manifest_sha256: checked.manifest_sha256 };
  if (JSON.stringify(current) === JSON.stringify(next)) throw new ReleaseError("This release is already active.", 409);
  if (!await approvalFor(bucket, next)) throw new ReleaseError("The exact package hash must be approved first.", 403);
  const beforeWrite = await activeWithEtag(bucket);
  if (JSON.stringify(beforeWrite.pointer) !== JSON.stringify(current)) throw new ReleaseError("The active release changed during validation.", 409);
  await appendAudit(bucket, { action: "activation-started", actor, reason: reason.trim(), from: current, to: next, package_id: id });
  if (!await bucket.put("active.json", JSON.stringify(next), { onlyIf: { etagMatches: beforeWrite.etag } })) throw new ReleaseError("The active release changed during publication.", 409);
  await appendAudit(bucket, { action: "activated", actor, reason: reason.trim(), from: current, to: next, package_id: id });
  return { from: current, to: next };
}
export async function rollbackRelease(bucket: ReleaseBucket, actor: string, reason: string, expectedActive: Pointer) {
  if (reason.trim().length < 12) throw new ReleaseError("Record a reason of at least 12 characters.");
  const { pointer: current } = await activeWithEtag(bucket);
  if (JSON.stringify(current) !== JSON.stringify(expectedActive)) throw new ReleaseError("The active release changed. Refresh before rollback.", 409);
  const history = (await objectKeys(bucket, "admin/audit/")).sort().reverse();
  let previous: Pointer | undefined;
  for (const key of history) {
    const event = await readJson<Audit>(bucket, key);
    if (event.action === "activated" && JSON.stringify(event.to) === JSON.stringify(current)) { previous = event.from; break; }
  }
  if (!previous) throw new ReleaseError("No prior release is recorded by these controls; use the documented manual recovery path.", 409);
  const checked = await validateRelease(bucket, previous.package_id);
  if (checked.manifest_sha256 !== previous.manifest_sha256) throw new ReleaseError("The prior release manifest has changed.", 409);
  const beforeWrite = await activeWithEtag(bucket);
  if (JSON.stringify(beforeWrite.pointer) !== JSON.stringify(current)) throw new ReleaseError("The active release changed during validation.", 409);
  await appendAudit(bucket, { action: "rollback-started", actor, reason: reason.trim(), from: current, to: previous });
  if (!await bucket.put("active.json", JSON.stringify(previous), { onlyIf: { etagMatches: beforeWrite.etag } })) throw new ReleaseError("The active release changed during rollback.", 409);
  await appendAudit(bucket, { action: "rolled-back", actor, reason: reason.trim(), from: current, to: previous });
  return { from: current, to: previous };
}
