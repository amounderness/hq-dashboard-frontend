"use client";

import { useEffect, useRef, useState } from "react";
import ExplorerV2ReleaseAdminPage from "./ExplorerV2ReleaseAdminPage";

type Pointer = { package_id: string; manifest_sha256: string };
type ReleaseInfo = Pointer & { assembled_on?: string; wards?: number; contests?: number; candidate_records?: number; active: boolean; approved: boolean; changed_paths: string[]; added_paths: string[]; removed_paths: string[]; release_limits: string[] };
type Audit = { id: string; action: string; actor: string; at: string; reason: string; from?: Pointer; to?: Pointer };
type State = { active: Pointer; releases: ReleaseInfo[]; audit: Audit[] };

async function request(body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("/api/admin/releases", body ? { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body), cache: "no-store" } : { credentials: "same-origin", cache: "no-store" });
  if (response.type === "opaqueredirect" || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign-in has expired. Reload Switchboard to sign in again.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export default function ReleaseAdminPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const canRollback = state?.audit.some(item => item.action === "activated" &&
    item.to?.package_id === state.active.package_id &&
    item.to?.manifest_sha256 === state.active.manifest_sha256) ?? false;
  useEffect(() => { picker.current?.setAttribute("webkitdirectory", ""); }, []);
  async function refresh() {
    try { setState(await request() as State); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load releases."); }
  }
  useEffect(() => {
    request().then(result => setState(result as State)).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load releases."));
  }, []);
  async function action(name: string, id?: string) {
    if (!state) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await request({ action: name, package_id: id, reason, expected_active: state.active });
      const checked = result as { package_id?: string; objects_checked?: number; contests?: number; candidates?: number };
      setMessage(name === "validate" ? `Validation passed for ${checked.package_id}: ${checked.objects_checked} checked files, ${checked.contests} contests and ${checked.candidates} candidate records.` : `${name.replace("-", " ")} completed.`);
      await refresh();
      if (name === "activate" || name === "rollback") window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Release action failed."); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!files.length) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const paths = files.map(file => ({ file, path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name }));
      const manifestFile = paths.find(item => item.path === "manifest.json");
      if (!manifestFile) throw new Error("Select a package folder containing manifest.json.");
      const manifestText = await manifestFile.file.text();
      const manifest = JSON.parse(manifestText) as { package_id?: string; object_sha256?: Record<string, string> };
      if (!manifest.package_id || !manifest.object_sha256) throw new Error("The selected manifest is incomplete.");
      const required = Object.keys(manifest.object_sha256);
      if (required.some(path => !paths.some(item => item.path === path))) throw new Error("The folder is missing files listed in the manifest.");
      await request({ action: "stage-manifest", package_id: manifest.package_id, content: manifestText });
      for (const [index, path] of required.entries()) {
        const file = paths.find(item => item.path === path)?.file;
        if (!file) throw new Error(`Missing file: ${path}`);
        await request({ action: "stage-object", package_id: manifest.package_id, path, content: await file.text() });
        setMessage(`Uploaded ${index + 1} of ${required.length} checked objects…`);
      }
      const checked = await request({ action: "validate", package_id: manifest.package_id }) as { objects_checked: number };
      setMessage(`Staged ${manifest.package_id}; ${checked.objects_checked} objects passed validation. Review the source decisions before approval.`);
      setFiles([]);
      if (picker.current) picker.current.value = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Package staging failed. Uploaded objects remain immutable; inspect before retrying with a new release ID."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="eyebrow">Switchboard / owner</div><h1>Release controls</h1>
    <p className="muted research-intro">Stage a built, audited package in private storage, validate every object, record approval, then switch the live package. Only the named owner can use these controls. Source files and source decisions are prepared outside this page.</p>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    {!state ? !error && <p role="status">Loading owner releases…</p> : <>
      <div className="development-summary card"><div><span className="eyebrow">Active package</span><strong>{state.active.package_id}</strong></div><div><span className="eyebrow">Available packages</span><strong>{state.releases.length}</strong></div></div>
      <section className="card release-stage"><h2>1 · Stage an immutable package</h2><p>Select a folder containing <code>manifest.json</code> and every JSON object named in it. Upload validates each file against its manifest hash. Keep the original sources, audit and local copy.</p><input ref={picker} type="file" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} aria-label="Select a built package folder" /><button className="button" disabled={busy || !files.length} onClick={() => void upload()}>Stage and validate folder</button><p className="footnote">An interrupted upload can be retried with the same folder. Existing objects must have exactly the same hashes; changed data need a new release ID.</p></section>
      <section className="card release-stage"><h2>2 · Review and approve</h2><label className="field">Decision reason<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe the source review and why this release is ready…" rows={3} /></label><p className="footnote">Approval records the exact manifest hash and owner identity. Activation repeats all checks and requires this approval.</p>
        <div className="table-wrap"><table className="results-table"><thead><tr><th>Package and differences from live</th><th>Assembled</th><th>Records</th><th>Status</th><th>Actions</th></tr></thead><tbody>{state.releases.map(item => <tr key={item.package_id}><td><strong>{item.package_id}</strong><details><summary>{item.changed_paths.length} changed · {item.added_paths.length} added · {item.removed_paths.length} removed objects</summary><p className="footnote">Changed: {item.changed_paths.join(", ") || "none"}</p><p className="footnote">Added: {item.added_paths.join(", ") || "none"}</p><p className="footnote">Removed: {item.removed_paths.join(", ") || "none"}</p><strong>Release limits</strong><ul>{item.release_limits.map(limit => <li key={limit}>{limit}</li>)}</ul></details></td><td>{item.assembled_on ?? "—"}</td><td>{item.wards} wards · {item.contests} contests · {item.candidate_records} candidates</td><td>{item.active ? "Live" : item.approved ? "Approved here" : "Not approved here"}</td><td><div className="release-actions"><button className="link-button" disabled={busy} onClick={() => void action("validate", item.package_id)}>Validate</button>{!item.approved && !item.active && <button className="link-button" disabled={busy || reason.trim().length < 12} onClick={() => void action("approve", item.package_id)}>Approve</button>}{item.approved && !item.active && <button className="link-button" disabled={busy || reason.trim().length < 12} onClick={() => void action("activate", item.package_id)}>Activate</button>}</div></td></tr>)}</tbody></table></div>
      </section>
      <section className="card release-stage"><h2>3 · Recover and audit</h2><p>Rollback restores the previous package recorded by these controls, after checking its objects again. The pre-existing manual recovery route remains documented for releases activated before this screen existed.</p><button className="button" disabled={busy || reason.trim().length < 12 || !canRollback} onClick={() => void action("rollback")}>Rollback last activation</button><h3>Recent owner actions</h3><div className="table-wrap"><table className="results-table"><thead><tr><th>When</th><th>Action</th><th>From → to</th><th>Reason</th></tr></thead><tbody>{state.audit.map(item => <tr key={item.id}><td>{new Date(item.at).toLocaleString("en-GB")}</td><td>{item.action}</td><td>{item.from?.package_id ?? "—"} → {item.to?.package_id ?? "—"}</td><td>{item.reason}</td></tr>)}</tbody></table></div></section>
    </>}
    <ExplorerV2ReleaseAdminPage audience="viewer" />
    <ExplorerV2ReleaseAdminPage />
  </>;
}
