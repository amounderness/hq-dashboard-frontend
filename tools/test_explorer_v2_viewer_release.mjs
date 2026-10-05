import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const base = compile((await readFile(path.join(root, "src/lib/release-admin.ts"), "utf8")).replace('import "server-only";', ""));
const baseUrl = `data:text/javascript;base64,${Buffer.from(base).toString("base64")}`;
const source = (await readFile(path.join(root, "src/lib/explorer-v2-viewer-release.ts"), "utf8"))
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
const packageRoot = path.join(root, "data/explorer-v2/viewer-releases/explorer-v2-leeds-viewer-2026-10-05-rc2");
const reason = "Audited Leeds v0.6.0 source hashes confirmed";
async function stage(bucket, id, manifestText, files) {
  await admin.viewerStageManifest(bucket, id, manifestText, "owner@example.test");
  for (const [relative, content] of files) await admin.viewerStageObject(bucket, id, relative, content);
  return { package_id: id, manifest_sha256: await (await import(baseUrl)).sha256(manifestText) };
}

test("audited Leeds viewer candidate validates, needs approval and stays in its own pointer", async t => {
  if (!existsSync(packageRoot)) return t.skip("Ignored local Leeds viewer candidate is unavailable");
  const manifestText = await readFile(path.join(packageRoot, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  const files = await Promise.all(Object.keys(manifest.object_sha256).map(async relative => [relative, await readFile(path.join(packageRoot, relative), "utf8")]));
  const bucket = new Bucket();
  const pointer = await stage(bucket, manifest.package_id, manifestText, files);
  await assert.rejects(admin.viewerStageObject(bucket, manifest.package_id, "results/E08000032/2026.json", "{}"), /Invalid or oversized viewer object/);
  const checked = await admin.viewerValidate(bucket, manifest.package_id);
  assert.equal(checked.objects_checked, 10);
  assert.equal(checked.council_years, 6);
  assert.ok(checked.contests > 100 && checked.candidates > 500);
  await assert.rejects(admin.viewerActivate(bucket, manifest.package_id, "owner@example.test", reason, null), /approval is required/);
  await admin.viewerApprove(bucket, manifest.package_id, "owner@example.test", reason);
  await admin.viewerActivate(bucket, manifest.package_id, "owner@example.test", reason, null);
  assert.deepEqual(JSON.parse(bucket.objects.get("v2/viewer/active.json")), pointer);
  assert.equal(bucket.objects.has("v2/active.json"), false);
  assert.equal(bucket.objects.has("active.json"), false);
  await assert.rejects(admin.viewerRollback(bucket, "owner@example.test", "First activation recovery", pointer), /No earlier viewer package/);
  const list = await admin.viewerReleaseList(bucket);
  assert.equal(list.releases.length, 1);
  assert.equal(list.releases[0].active, true);
  assert.ok(list.audit.some(item => item.action === "activated"));
});

test("viewer scope and audited hashes reject widened or modified releases", async t => {
  if (!existsSync(packageRoot)) return t.skip("Ignored local Leeds viewer candidate is unavailable");
  const original = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
  const bucket = new Bucket();
  const expanded = { ...original, package_id: "explorer-v2-leeds-viewer-expanded", released_authorities: ["E08000035", "E08000032"] };
  await assert.rejects(admin.viewerStageManifest(bucket, expanded.package_id, JSON.stringify(expanded), "owner@example.test"), /approved-scope/);
  const changed = { ...original, package_id: "explorer-v2-leeds-viewer-changed", object_sha256: { ...original.object_sha256,
    "results/E08000035/2026.json": "0".repeat(64) } };
  await assert.rejects(admin.viewerStageManifest(bucket, changed.package_id, JSON.stringify(changed), "owner@example.test"), /source hashes/);
  const extra = { ...original, package_id: "explorer-v2-leeds-viewer-extra", object_sha256: { ...original.object_sha256,
    "results/E08000032/2026.json": "0".repeat(64) } };
  await assert.rejects(admin.viewerStageManifest(bucket, extra.package_id, JSON.stringify(extra), "owner@example.test"), /exactly the ten scoped objects/);
});
