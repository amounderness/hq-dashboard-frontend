import "server-only";
import { PackageUnavailable } from "./package-error";

type StoredObject = { text(): Promise<string> };
type Bucket = { get(key: string): Promise<StoredObject | null> };
type Pointer = { package_id: string; manifest_sha256: string };

const years = new Set(["2021", "2022", "2023", "2024", "2025", "2026"]);
const idPattern = /^[a-z0-9][a-z0-9.-]{0,79}$/;

async function storedJson<T>(bucket: Bucket, key: string): Promise<{ value: T; text: string }> {
  const object = await bucket.get(key);
  if (!object) throw new PackageUnavailable("The selected release is incomplete in private storage.");
  const text = await object.text();
  return { value: JSON.parse(text) as T, text };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function getR2PackageFromBucket(bucket: Bucket, kind: "manifest" | "wards" | "geo" | "year", year?: string) {
  const { value: pointer } = await storedJson<Pointer>(bucket, "active.json");
  if (!pointer || !idPattern.test(pointer.package_id) || !/^[a-f0-9]{64}$/.test(pointer.manifest_sha256)) {
    throw new PackageUnavailable("The active release pointer is invalid.");
  }
  const base = `releases/${pointer.package_id}/`;
  const { value: manifest, text } = await storedJson<{ package_id: string; publication_allowed: boolean; years: number[] }>(bucket, `${base}manifest.json`);
  if (await sha256(text) !== pointer.manifest_sha256 || manifest.package_id !== pointer.package_id || manifest.publication_allowed !== true) {
    throw new PackageUnavailable("The active release has not passed publication checks.");
  }
  if (kind === "manifest") return manifest;
  if (kind === "wards") return (await storedJson(bucket, `${base}geography/wards.json`)).value;
  if (kind === "geo") return (await storedJson(bucket, `${base}geography/wards.geojson`)).value;
  if (!year || !years.has(year) || !manifest.years.includes(Number(year))) throw new PackageUnavailable("The requested election year is unavailable.");
  const prefix = `${base}elections/${year}/local-council/`;
  const [events, contests, candidates, parties] = await Promise.all([
    storedJson(bucket, `${prefix}events.json`),
    storedJson(bucket, `${prefix}contests.json`),
    storedJson(bucket, `${prefix}candidates.json`),
    storedJson(bucket, `${prefix}party-results.json`),
  ]);
  return { events: events.value, contests: contests.value, candidates: candidates.value, parties: parties.value };
}

export async function getR2Package(kind: "manifest" | "wards" | "geo" | "year", year?: string) {
  const { env } = await import("cloudflare:workers");
  const bucket = env.SWITCHBOARD_PACKAGES as Bucket | undefined;
  if (!bucket) throw new PackageUnavailable("Private package storage is not configured.");
  return getR2PackageFromBucket(bucket, kind, year);
}
