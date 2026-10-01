import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const base = compile((await readFile(path.join(root, "src/lib/release-admin.ts"), "utf8")).replace('import "server-only";', ""));
const baseUrl = `data:text/javascript;base64,${Buffer.from(base).toString("base64")}`;
const source = (await readFile(path.join(root, "src/lib/explorer-v2-release-admin.ts"), "utf8"))
  .replace('import "server-only";', "")
  .replace(/from "@\/lib\/release-admin";/, `from "${baseUrl}";`);
const admin = await import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`);

class Bucket {
  objects = new Map();
  async get(key) { const value = this.objects.get(key); return value == null ? null : { text: async () => value, etag: createHash("md5").update(value).digest("hex") }; }
  async put(key, value, options) {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    if (options?.onlyIf?.etagMatches && createHash("md5").update(this.objects.get(key) ?? "").digest("hex") !== options.onlyIf.etagMatches) return null;
    this.objects.set(key, value); return { key };
  }
  async list({ prefix }) { return { objects: [...this.objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }; }
}
const actor = "owner@example.test";
const reason = "Council sources reviewed";
const geo = codes => ({ type: "FeatureCollection", features: codes.map(code => ({ type: "Feature", properties: { code }, geometry: { type: "Polygon", coordinates: [] } })) });
async function fixture(id, votes = 100) {
  const data = {
    "regions.geojson": geo(["E12000003", "E12000004"]),
    "authorities.geojson": geo(["E08000035", "E08000036"]),
    "yorkshire-wards.geojson": geo(["E05000001"]),
    "catalog.json": { pilot_region: "E12000003", years: [2026], regions: [{ code: "E12000003" }, { code: "E12000004" }], authorities: [
      { code: "E08000035", region_code: "E12000003", coverage: { "2026": { status: "secondary_source_staged" } } },
      { code: "E08000036", region_code: "E12000004", coverage: { "2026": { status: "not_audited" } } },
    ], pilot_wards: [{ code: "E05000001", authority_code: "E08000035" }], activity: { E08000035: { "2026": { contest_count: 1 } } } },
    "results/E08000035/2026.json": { authority_code: "E08000035", year: 2026, coverage: "secondary_source_staged", events: [{ event_id: "e" }], contests: [{ contest_id: "c", event_id: "e", ward_code: "E05000001", seats_available: 1, candidate_votes: votes }], candidates: [{ result_id: "r", contest_id: "c", votes, elected: true }] },
  };
  const objects = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)]));
  const object_sha256 = Object.fromEntries(await Promise.all(Object.entries(objects).map(async ([key, text]) => [key, await (await import(baseUrl)).sha256(text)])));
  const manifest = JSON.stringify({ schema_version: 1, package_id: id, release_status: "staged_not_published", pilot_region: "E12000003", limits: ["Synthetic test package"], object_sha256 });
  return { manifest, objects };
}
async function stage(bucket, id, data) {
  await admin.v2StageManifest(bucket, id, data.manifest, actor);
  for (const [key, text] of Object.entries(data.objects)) await admin.v2StageObject(bucket, id, key, text);
  return { package_id: id, manifest_sha256: await (await import(baseUrl)).sha256(data.manifest) };
}

test("v2 release requires exact approval, checks stale pointers and can roll back", async () => {
  const bucket = new Bucket();
  const first = await stage(bucket, "v2-test-one", await fixture("v2-test-one"));
  await assert.rejects(admin.v2Activate(bucket, first.package_id, actor, reason, null), /approved first/);
  const checked = await admin.v2Validate(bucket, first.package_id);
  assert.deepEqual([checked.objects_checked, checked.council_years, checked.contests, checked.candidates], [5, 1, 1, 1]);
  await admin.v2Approve(bucket, first.package_id, actor, reason);
  await admin.v2Activate(bucket, first.package_id, actor, "Owner test activation", null);
  assert.deepEqual(await admin.v2ActivePointer(bucket), first);
  await assert.rejects(admin.v2Rollback(bucket, actor, "First activation recovery", first), /No earlier active/);
  const second = await stage(bucket, "v2-test-two", await fixture("v2-test-two", 125));
  await admin.v2Approve(bucket, second.package_id, actor, reason);
  await assert.rejects(admin.v2Activate(bucket, second.package_id, actor, "Stale browser state", null), /changed/);
  await admin.v2Activate(bucket, second.package_id, actor, "Publish checked update", first);
  await admin.v2Rollback(bucket, actor, "Restore prior package", second);
  assert.deepEqual(await admin.v2ActivePointer(bucket), first);
  const list = await admin.v2ReleaseList(bucket);
  assert.equal(list.releases.length, 2);
  assert.equal(list.releases.find(item => item.package_id === first.package_id).active, true);
  assert.ok(list.audit.some(item => item.action === "rolled-back"));
});

test("v2 staging is immutable and tampering blocks approval", async () => {
  const bucket = new Bucket(); const data = await fixture("v2-test-tamper");
  await stage(bucket, "v2-test-tamper", data);
  await stage(bucket, "v2-test-tamper", data);
  await assert.rejects(admin.v2StageManifest(bucket, "v2-test-tamper", (await fixture("v2-test-tamper", 3)).manifest, actor), /different manifest/);
  await assert.rejects(admin.v2StageObject(bucket, "v2-test-tamper", "catalog.json", "{}"), /manifest hash/);
  bucket.objects.set("v2/releases/v2-test-tamper/catalog.json", "{}");
  await assert.rejects(admin.v2Approve(bucket, "v2-test-tamper", actor, reason), /Checksum mismatch/);
});

for (const [label, packageRoot, expected] of [
  ["rc3", path.join(root, "data/explorer-v2/releases/explorer-v2-yh-2026-09-29-rc3"), [58, 54, 1278, 7809]],
  ["rc4", path.join(root, "data/explorer-v2/work-2026-10-01-byelections/releases/explorer-v2-yh-2026-10-01-rc4"), [62, 58, 1283, 7842]],
]) test(`recovered Yorkshire ${label} validates in the same R2 contract when locally available`, async t => {
  if (!existsSync(packageRoot)) return t.skip("Ignored local release is not installed");
  const bucket = new Bucket();
  const manifest = await readFile(path.join(packageRoot, "manifest.json"), "utf8");
  const { package_id: id, object_sha256 } = JSON.parse(manifest);
  await admin.v2StageManifest(bucket, id, manifest, actor);
  for (const relative of Object.keys(object_sha256)) {
    try { await admin.v2StageObject(bucket, id, relative, await readFile(path.join(packageRoot, relative), "utf8")); }
    catch (cause) { throw new Error(`${relative}: ${cause.message}`); }
  }
  const checked = await admin.v2Validate(bucket, id);
  assert.deepEqual([checked.objects_checked, checked.council_years, checked.contests, checked.candidates], expected);
});
