import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDemoPackage } from "./demo";

const years = new Set(["2021", "2022", "2023", "2024", "2025", "2026"]);

export class PackageUnavailable extends Error {}

async function packageRoot(): Promise<string> {
  const root = process.env.SWITCHBOARD_PACKAGE_DIR;
  if (!root) throw new PackageUnavailable("No local Leeds package is configured.");
  const manifest = await readJson<{ publication_allowed: boolean }>(path.join(root, "manifest.json"));
  // The current package has unresolved release gates. Never serve it from a hosted production build.
  if (process.env.NODE_ENV === "production" && !manifest.publication_allowed) {
    throw new PackageUnavailable("The configured data package has not passed its publication gates.");
  }
  return root;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function getPackage(kind: "manifest" | "wards" | "geo" | "year", year?: string) {
  if (process.env.SWITCHBOARD_DEMO_MODE === "true") return getDemoPackage(kind, year);
  const root = await packageRoot();
  if (kind === "manifest") return readJson(path.join(root, "manifest.json"));
  if (kind === "wards") return readJson(path.join(root, "geography", "wards.json"));
  if (kind === "geo") return readJson(path.join(root, "geography", "wards.geojson"));
  if (!year || !years.has(year)) throw new Error("Unsupported election year.");
  const prefix = path.join(root, "elections", year, "local-council");
  const [events, contests, candidates, parties] = await Promise.all([
    readJson(path.join(prefix, "events.json")),
    readJson(path.join(prefix, "contests.json")),
    readJson(path.join(prefix, "candidates.json")),
    readJson(path.join(prefix, "party-results.json")),
  ]);
  return { events, contests, candidates, parties };
}
