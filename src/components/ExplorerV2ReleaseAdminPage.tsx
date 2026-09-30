"use client";

import { useEffect, useRef, useState } from "react";

type Pointer = { package_id: string; manifest_sha256: string };
type Release = Pointer & { created_at?: string; objects: number; limits: string[]; active: boolean; approved: boolean };
type Audit = { id: string; at: string; action: string; actor: string; reason: string; from?: Pointer | null; to?: Pointer | null };
type State = { active: Pointer | null; releases: Release[]; audit: Audit[] };

async function request(body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("/api/admin/v2-releases", body ? { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(body) } : { credentials: "same-origin", cache: "no-store" });
  if (response.type === "opaqueredirect" || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign-in has expired. Reload Switchboard to sign in again.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export default function ExplorerV2ReleaseAdminPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { picker.current?.setAttribute("webkitdirectory", ""); }, []);
  async function refresh() {
    try { setState(await request() as State); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Explorer v2 releases."); }
  }
  useEffect(() => { request().then(value => setState(value as State)).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load Explorer v2 releases.")); }, []);
  async function upload() {
    if (!files.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const paths = files.map(file => ({ file, path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name }));
      const manifestFile = paths.find(item => item.path === "manifest.json");
      if (!manifestFile) throw new Error("Select a staged Explorer v2 folder containing manifest.json.");
      const content = await manifestFile.file.text();
      const manifest = JSON.parse(content) as { package_id?: string; object_sha256?: Record<string, string> };
      if (!manifest.package_id || !manifest.object_sha256) throw new Error("The selected manifest is incomplete.");
      const required = Object.keys(manifest.object_sha256);
      if (required.some(path => !paths.some(item => item.path === path))) throw new Error("The folder is missing files listed in the manifest.");
      await request({ action: "stage-manifest", package_id: manifest.package_id, content });
      for (const [index, path] of required.entries()) {
        const file = paths.find(item => item.path === path)?.file;
        if (!file) throw new Error(`Missing file: ${path}`);
        await request({ action: "stage-object", package_id: manifest.package_id, path, content: await file.text() });
        setMessage(`Uploaded ${index + 1} of ${required.length} checked v2 objects…`);
      }
      const checked = await request({ action: "validate", package_id: manifest.package_id }) as { objects_checked: number; council_years: number };
      setMessage(`Staged ${manifest.package_id}: ${checked.objects_checked} objects and ${checked.council_years} council-years checked. Review sources before approval.`);
      setFiles([]); if (picker.current) picker.current.value = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "V2 staging failed; check the audit before retrying."); }
    finally { setBusy(false); }
  }
  async function action(name: string, id?: string) {
    if (!state) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request({ action: name, package_id: id, reason, expected_active: state.active });
      const checked = result as { objects_checked?: number; council_years?: number };
      setMessage(name === "validate" ? `Validated ${checked.objects_checked} objects and ${checked.council_years} council-years.` : `${name.replace("-", " ")} completed.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "V2 release action failed; check the audit before retrying."); }
    finally { setBusy(false); }
  }
  const canRollback = !!state?.active && state.audit.some(item => ["activated", "rolled-back"].includes(item.action) && item.to?.package_id === state.active?.package_id && item.to?.manifest_sha256 === state.active?.manifest_sha256 && item.from);
  return <section className="card release-stage" aria-label="Explorer v2 release controls">
    <h2>Explorer v2 · Yorkshire owner test</h2>
    <p>Stage the verified package folder in private storage. Approval records your source-review decision against its exact checksum. Activation only switches the v2 pointer; the live Leeds package and v2 feature flags stay separate.</p>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    {!state ? !error && <p role="status">Loading v2 releases…</p> : <>
      <p><strong>Active v2 package:</strong> {state.active?.package_id ?? "None"}</p>
      <label className="field">Staged package folder<input ref={picker} type="file" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} aria-label="Select a staged Explorer v2 package folder" /></label>
      <button className="button" disabled={busy || !files.length} onClick={() => void upload()}>Stage and validate v2 folder</button>
      <p className="footnote">Upload is retryable with identical files. Changed files need a new release ID. Run the local package verifier and finish council-source review before approval.</p>
      <label className="field">Source-review or release reason<textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Record what you checked and why this action is appropriate…" /></label>
      <div className="table-wrap"><table className="results-table"><thead><tr><th>Package</th><th>Checked objects</th><th>State</th><th>Actions</th></tr></thead><tbody>{state.releases.map(item => <tr key={item.package_id}><td><strong>{item.package_id}</strong><details><summary>Release limits</summary><ul>{item.limits.map(limit => <li key={limit}>{limit}</li>)}</ul></details></td><td>{item.objects}</td><td>{item.active ? "Active v2" : item.approved ? "Approved" : "Staged"}</td><td><div className="release-actions"><button className="link-button" disabled={busy} onClick={() => void action("validate", item.package_id)}>Validate</button>{!item.approved && <button className="link-button" disabled={busy || reason.trim().length < 12} onClick={() => void action("approve", item.package_id)}>Approve</button>}{item.approved && !item.active && <button className="link-button" disabled={busy || reason.trim().length < 12} onClick={() => void action("activate", item.package_id)}>Activate v2 pointer</button>}</div></td></tr>)}</tbody></table></div>
      <button className="button" disabled={busy || !canRollback || reason.trim().length < 12} onClick={() => void action("rollback")}>Rollback v2 pointer</button>
      <p className="footnote">A first activation has no earlier v2 package to restore. To hide v2 while investigating, leave its production feature flags off. This screen cannot publish v2 to viewers by itself.</p>
      <h3>Recent v2 actions</h3><div className="table-wrap"><table className="results-table"><thead><tr><th>When</th><th>Action</th><th>From → to</th><th>Reason</th></tr></thead><tbody>{state.audit.map(item => <tr key={item.id}><td>{new Date(item.at).toLocaleString("en-GB")}</td><td>{item.action}</td><td>{item.from?.package_id ?? "—"} → {item.to?.package_id ?? "—"}</td><td>{item.reason}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
