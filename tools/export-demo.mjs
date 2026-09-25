// Stage fictional records in the same immutable layout as a future release.
// This script never reads or uploads the real Leeds development package.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDemoPackage } from "../src/lib/demo.ts";

const root = path.resolve(process.argv[2] ?? ".local-data/demo-r2");
const manifest = getDemoPackage("manifest");
const base = `releases/${manifest.package_id}`;
const files = new Map([
  [`${base}/manifest.json`, manifest],
  [`${base}/geography/wards.json`, getDemoPackage("wards")],
  [`${base}/geography/wards.geojson`, getDemoPackage("geo")],
]);
for (const year of ["2021", "2022", "2023", "2024", "2025", "2026"]) {
  const data = getDemoPackage("year", year);
  for (const [key, value] of Object.entries({
    events: data.events, contests: data.contests, candidates: data.candidates,
    "party-results": data.parties,
  })) files.set(`${base}/elections/${year}/local-council/${key}.json`, value);
}
let manifestHash = "";
for (const [key, value] of files) {
  const destination = path.join(root, ...key.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(destination, text);
  if (key.endsWith("/manifest.json")) manifestHash = createHash("sha256").update(text).digest("hex");
}
await writeFile(path.join(root, "active.json"), `${JSON.stringify({ package_id: manifest.package_id, manifest_sha256: manifestHash }, null, 2)}\n`);
console.log(`Staged ${files.size} fictional release objects and an active pointer in ${root}`);
