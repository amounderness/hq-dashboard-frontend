import "server-only";
import { PackageUnavailable } from "./package-error";

type StoredObject = { text(): Promise<string> };
type Bucket = { get(key: string): Promise<StoredObject | null> };
type Pointer = { package_id: string; manifest_sha256: string };
type Manifest = { package_id: string; publication_allowed: boolean; years: number[]; demo?: boolean; object_sha256?: Record<string, string> };

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

export async function getR2PackageFromBucket(bucket: Bucket, kind: "manifest" | "wards" | "geo" | "year" | "forecast" | "pulse" | "history" | "composition" | "sdp-results" | "tribes-research", year?: string) {
  const { value: pointer } = await storedJson<Pointer>(bucket, "active.json");
  if (!pointer || !idPattern.test(pointer.package_id) || !/^[a-f0-9]{64}$/.test(pointer.manifest_sha256)) {
    throw new PackageUnavailable("The active release pointer is invalid.");
  }
  const base = `releases/${pointer.package_id}/`;
  const { value: manifest, text } = await storedJson<Manifest>(bucket, `${base}manifest.json`);
  if (await sha256(text) !== pointer.manifest_sha256 || manifest.package_id !== pointer.package_id || manifest.publication_allowed !== true) {
    throw new PackageUnavailable("The active release has not passed publication checks.");
  }
  if (!manifest.demo && !manifest.object_sha256) {
    throw new PackageUnavailable("The active factual release has no object integrity list.");
  }
  async function releaseJson<T>(relative: string): Promise<T> {
    const { value, text } = await storedJson<T>(bucket, `${base}${relative}`);
    const expected = manifest.object_sha256?.[relative];
    if (!manifest.demo && (!expected || !/^[a-f0-9]{64}$/.test(expected) || await sha256(text) !== expected)) {
      throw new PackageUnavailable("A release object failed its integrity check.");
    }
    return value;
  }
  if (kind === "manifest") return manifest;
  if (kind === "wards") return releaseJson("geography/wards.json");
  if (kind === "geo") return releaseJson("geography/wards.geojson");
  if (kind === "forecast") return releaseJson("forecast/backtest-summary.json");
  if (kind === "pulse") return releaseJson("pulse/ward-profiles.json");
  if (kind === "history") return releaseJson("pulse/ward-history.json");
  if (kind === "composition") return releaseJson("pulse/composition.json");
  if (kind === "sdp-results") return releaseJson("pulse/sdp-results.json");
  if (kind === "tribes-research") return releaseJson("pulse/tribes-research.json");
  if (year === "latest") return releaseJson("pulse/latest-results.json");
  if (!year || !years.has(year) || !manifest.years.includes(Number(year))) throw new PackageUnavailable("The requested election year is unavailable.");
  const [events, contests, candidates, parties] = await Promise.all([
    releaseJson(`elections/${year}/local-council/events.json`),
    releaseJson(`elections/${year}/local-council/contests.json`),
    releaseJson(`elections/${year}/local-council/candidates.json`),
    releaseJson(`elections/${year}/local-council/party-results.json`),
  ]);
  return { events, contests, candidates, parties };
}

export async function getR2Package(kind: "manifest" | "wards" | "geo" | "year" | "forecast" | "pulse" | "history" | "composition" | "sdp-results" | "tribes-research", year?: string) {
  const { env } = await import("cloudflare:workers");
  const bucket = env.SWITCHBOARD_PACKAGES as Bucket | undefined;
  if (!bucket) throw new PackageUnavailable("Private package storage is not configured.");
  return getR2PackageFromBucket(bucket, kind, year);
}
