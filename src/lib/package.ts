import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDemoPackage } from "./demo";
import { PackageUnavailable } from "./package-error";

export { PackageUnavailable } from "./package-error";

const years = new Set(["2021", "2022", "2023", "2024", "2025", "2026"]);

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

export async function getPackage(kind: "manifest" | "wards" | "geo" | "year" | "forecast" | "pulse" | "history", year?: string) {
  if (process.env.SWITCHBOARD_DEMO_MODE === "true") {
    if (kind === "forecast") throw new PackageUnavailable("No Forecast research is available in the fictional preview.");
    return getDemoPackage(kind, year);
  }
  if (process.env.SWITCHBOARD_PACKAGE_STORE === "r2") {
    const { getR2Package } = await import("./r2-package");
    return getR2Package(kind, year);
  }
  const root = await packageRoot();
  if (kind === "manifest") return readJson(path.join(root, "manifest.json"));
  if (kind === "wards") return readJson(path.join(root, "geography", "wards.json"));
  if (kind === "geo") return readJson(path.join(root, "geography", "wards.geojson"));
  if (kind === "forecast") return readJson(path.join(root, "forecast", "backtest-summary.json"));
  if (kind === "pulse") return readJson(path.join(root, "pulse", "ward-profiles.json"));
  if (kind === "history") return readJson(path.join(root, "pulse", "ward-history.json"));
  if (year === "latest") return readJson(path.join(root, "pulse", "latest-results.json"));
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
