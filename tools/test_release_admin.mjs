import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await readFile(path.join(root, "src/lib/release-admin.ts"), "utf8");
const output = ts.transpileModule(source.replace('import "server-only";', ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const admin = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

class Bucket {
  objects = new Map();
  async get(key) { const value = this.objects.get(key); return value == null ? null : { text: async () => value, etag: createHash("md5").update(value).digest("hex") }; }
  async put(key, value, options) {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    if (options?.onlyIf?.etagMatches && createHash("md5").update(this.objects.get(key) ?? "").digest("hex") !== options.onlyIf.etagMatches) return null;
    this.objects.set(key, value);
    return { key };
  }
  async list({ prefix }) { return { objects: [...this.objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }; }
}

async function release(id, votes = 10) {
  const data = {
    "geography/wards.json": [{ ward_code: "E1", ward_name: "Example" }],
    "geography/wards.geojson": { type: "FeatureCollection", features: [{ type: "Feature", id: "E1", geometry: { type: "Polygon", coordinates: [] }, properties: {} }] },
    "pulse/latest-results.json": { events: [], contests: [], candidates: [], parties: [] },
    "pulse/ward-history.json": { E1: [] },
    "elections/2026/local-council/events.json": [{ event_id: "a" }],
    "elections/2026/local-council/contests.json": [{ contest_id: "c", event_id: "a", ward_code: "E1", all_candidate_votes: votes }],
    "elections/2026/local-council/candidates.json": [{ contest_id: "c", votes }],
    "elections/2026/local-council/party-results.json": [{ contest_id: "c", candidate_votes: votes }],
  };
  const text = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)]));
  const hashes = Object.fromEntries(await Promise.all(Object.entries(text).map(async ([key, value]) => [key, await admin.sha256(value)])));
  const manifest = JSON.stringify({ package_id: id, publication_allowed: true, years: [2026], wards: 1, contests: 1, candidate_records: 1, release_limits: ["Synthetic test fixture"], object_sha256: hashes });
  return { id, manifest, text };
}
async function stage(bucket, fixture) {
  await admin.stageManifest(bucket, fixture.id, fixture.manifest);
  for (const [key, content] of Object.entries(fixture.text)) await admin.stageObject(bucket, fixture.id, key, content);
  return { package_id: fixture.id, manifest_sha256: await admin.sha256(fixture.manifest) };
}

test("a checked package can be approved, activated, audited and rolled back", async () => {
  const bucket = new Bucket();
  const first = await stage(bucket, await release("leeds-test-v1"));
  await bucket.put("active.json", JSON.stringify(first));
  const second = await stage(bucket, await release("leeds-test-v2", 14));
  await assert.rejects(admin.activateRelease(bucket, second.package_id, "owner@example.test", "Reviewed source audit", first), /approved first/);
  const checked = await admin.validateRelease(bucket, second.package_id);
  assert.equal(checked.objects_checked, 8);
  await admin.approveRelease(bucket, second.package_id, "owner@example.test", "Reviewed source audit");
  await admin.activateRelease(bucket, second.package_id, "owner@example.test", "Publish validated update", first);
  assert.deepEqual(await admin.activePointer(bucket), second);
  await assert.rejects(admin.activateRelease(bucket, first.package_id, "owner@example.test", "Outdated browser state", first), /changed/);
  await admin.rollbackRelease(bucket, "owner@example.test", "Restore earlier release", second);
  assert.deepEqual(await admin.activePointer(bucket), first);
  const listing = await admin.releaseList(bucket);
  assert.equal(listing.releases.length, 2);
  assert.deepEqual(listing.audit.map(item => item.action).sort(), ["rolled-back", "rollback-started", "activated", "activation-started", "approved", "approval-started"].sort());
});

test("tampered votes or objects cannot be approved", async () => {
  const bucket = new Bucket();
  const fixture = await release("leeds-test-bad");
  await stage(bucket, fixture);
  bucket.objects.set(`releases/${fixture.id}/elections/2026/local-council/candidates.json`, '[{"contest_id":"c","votes":999}]');
  await assert.rejects(admin.validateRelease(bucket, fixture.id), /Hash mismatch/);
  await assert.rejects(admin.approveRelease(bucket, fixture.id, "owner@example.test", "Reviewed all sources"), /Hash mismatch/);
});

test("staging is retryable for identical bytes, never overwriteable with different bytes", async () => {
  const bucket = new Bucket();
  const fixture = await release("leeds-test-retry");
  await stage(bucket, fixture);
  await stage(bucket, fixture);
  await assert.rejects(admin.stageObject(bucket, fixture.id, "geography/wards.json", "[]"), /does not match/);
  await assert.rejects(admin.stageManifest(bucket, fixture.id, (await release(fixture.id, 20)).manifest), /different manifest/);
});
