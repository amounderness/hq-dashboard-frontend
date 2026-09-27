import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

type StoredObject = { text(): Promise<string> };
type Bucket = { get(key: string): Promise<StoredObject | null> };
type Pointer = { package_id: string; manifest_sha256: string };
type Manifest = { package_id: string; schema_version: number; object_sha256: Record<string, string> };
type Catalog = { years: number[]; pilot_region: string; authorities: { code: string; region_code: string; coverage: Record<string, { status: string; reason: string }> }[] };

const releaseId = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const areaCode = /^E\d{8}$/;
const yearPattern = /^20\d{2}$/;

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

async function source(): Promise<{ manifest: Manifest; read: (relative: string) => Promise<string> }> {
  if (process.env.SWITCHBOARD_V2_PACKAGE_DIR && process.env.NODE_ENV === "development") {
    const root = process.env.SWITCHBOARD_V2_PACKAGE_DIR;
    const read = (relative: string) => readFile(path.join(root, relative), "utf8");
    return { manifest: JSON.parse(await read("manifest.json")) as Manifest, read };
  }
  if (process.env.SWITCHBOARD_V2_ENABLED !== "true") throw new Error("Explorer v2 has not been activated.");
  const { env } = await import("cloudflare:workers");
  const bucket = env.SWITCHBOARD_PACKAGES as Bucket | undefined;
  if (!bucket) throw new Error("Private package storage is unavailable.");
  const pointerObject = await bucket.get("v2/active.json");
  if (!pointerObject) throw new Error("No Explorer v2 release is active.");
  const pointer = JSON.parse(await pointerObject.text()) as Pointer;
  if (!releaseId.test(pointer.package_id) || !/^[a-f0-9]{64}$/.test(pointer.manifest_sha256)) {
    throw new Error("Invalid Explorer v2 release pointer.");
  }
  const prefix = `v2/releases/${pointer.package_id}/`;
  const read = async (relative: string) => {
    const object = await bucket.get(prefix + relative);
    if (!object) throw new Error("Explorer v2 release object is missing.");
    return object.text();
  };
  const manifestText = await read("manifest.json");
  if (await digest(manifestText) !== pointer.manifest_sha256) throw new Error("Explorer v2 manifest checksum failed.");
  return { manifest: JSON.parse(manifestText) as Manifest, read };
}

export async function explorerV2Resource(kind: string, authority?: string, year?: string): Promise<unknown> {
  const { manifest, read } = await source();
  if (manifest.schema_version !== 1 || !releaseId.test(manifest.package_id)) throw new Error("Unsupported Explorer v2 release.");
  const verified = async (relative: string): Promise<string> => {
    const expected = manifest.object_sha256[relative];
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("Explorer v2 object is not in the manifest.");
    const content = await read(relative);
    if (await digest(content) !== expected) throw new Error("Explorer v2 object checksum failed.");
    return content;
  };
  let relative: string;
  if (kind === "catalog") relative = "catalog.json";
  else if (kind === "regions") relative = "regions.geojson";
  else if (kind === "authorities") relative = "authorities.geojson";
  else if (kind === "wards") relative = "yorkshire-wards.geojson";
  else if (kind === "results" && authority && areaCode.test(authority) && year && yearPattern.test(year)) {
    const catalog = JSON.parse(await verified("catalog.json")) as Catalog;
    const area = catalog.authorities.find(item => item.code === authority && item.region_code === catalog.pilot_region);
    if (!area || !catalog.years.includes(Number(year))) throw new Error("Authority or year is outside the Explorer v2 pilot.");
    relative = `results/${authority}/${year}.json`;
    if (!manifest.object_sha256[relative]) {
      return { authority_code: authority, year: Number(year), election_type: "local_council",
        coverage: area.coverage[year]?.status ?? "not_audited", events: [], contests: [], candidates: [],
        explanation: area.coverage[year]?.reason ?? "No result package is available for this authority and year." };
    }
  } else throw new Error("Unsupported Explorer v2 query.");
  return JSON.parse(await verified(relative)) as unknown;
}
