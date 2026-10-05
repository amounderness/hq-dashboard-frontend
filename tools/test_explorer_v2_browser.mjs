// Dependency-free visual smoke test for a local, unauthenticated Switchboard preview.
// Usage: node tools/test_explorer_v2_browser.mjs [http://localhost:3045]
// Chrome runs headlessly with an isolated profile; screenshots stay in ignored data/.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const base = (process.argv[2] ?? "http://localhost:3045").replace(/\/$/, "");
const output = resolve(`data/explorer-v2/browser-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const profile = join(output, "chrome-profile");
const chromePath = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
assert.ok(existsSync(chromePath) || process.platform !== "win32", `Chrome not found: ${chromePath}`);
await mkdir(profile, { recursive: true });

const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--window-size=1440,900", "about:blank"], { stdio: "ignore", windowsHide: true });
let ws;
let nextId = 0;
const pending = new Map();
const exceptions = [];

async function until(task, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const value = await task(); if (value) return value; } catch (error) { last = error; }
    await pause(150);
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ""}`);
}

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolveResult, reject) => {
    pending.set(id, { resolve: resolveResult, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

const data = expression => evaluate(`(() => { ${expression} })()`);
async function choose(label, value) {
  const found = await data(`const field = [...document.querySelectorAll('.v2-toolbar label')].find(node => node.textContent.trim().startsWith(${JSON.stringify(label)}));
    const select = field?.querySelector('select'); if (!select) return false;
    select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  assert.ok(found, `Missing ${label} selector`);
}
async function click(text, scope = "document") {
  const found = await data(`const root = ${scope}; const button = [...root.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return false; button.click(); return true;`);
  assert.ok(found, `Missing button ${text}`);
}
async function waitText(text) {
  await until(() => evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`), text);
}
async function snapshot(name) {
  const response = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  const file = join(output, `${name}.png`);
  await writeFile(file, Buffer.from(response.data, "base64"));
  console.log(`Screenshot ${file}`);
}
async function navigate(hash) {
  await command("Page.navigate", { url: `${base}/#${hash}` });
  await until(() => evaluate(`document.readyState === 'complete'`), "page load");
}

try {
  const port = await until(async () => {
    const file = join(profile, "DevToolsActivePort");
    if (!existsSync(file)) return null;
    return Number((await readFile(file, "utf8")).split("\n")[0]);
  }, "Chrome debugging port");
  const tabs = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    return (await response.json()).filter(item => item.type === "page");
  }, "Chrome page target");
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { ws.addEventListener("open", resolveOpen, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
    }
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await navigate("explorer");
  await waitText("Explore Leeds");
  await until(() => evaluate(`!!document.querySelector('.work svg')`), "Leeds baseline map");
  await snapshot("explorer-v1-desktop");
  const v1 = await data(`return { map: !!document.querySelector('svg'), table: document.body.innerText.includes('Table'), composition: document.body.innerText.includes('Composition') };`);
  console.log(`V1 baseline ${JSON.stringify(v1)}`);
  assert.ok(v1.map && v1.table && v1.composition, "V1 baseline is incomplete");

  await navigate("explorerV2");
  await waitText("Explore elections");
  await until(() => evaluate(`document.querySelector('.v2-map')?.querySelectorAll('path[role="button"]').length === 1`), "England map");
  await snapshot("v2-england-desktop");
  assert.ok(await data(`const region = document.querySelector('.v2-map path[role="button"]'); if (!region) return false; region.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true;`), "Yorkshire map region is not selectable");
  await until(() => evaluate(`document.querySelector('.v2-map')?.querySelectorAll('path[role="button"]').length === 15`), "Yorkshire councils map");
  await snapshot("v2-yorkshire-desktop");
  assert.ok(await data(`const checkbox = document.querySelector('.v2-toolbar .contested-filter input'); if (!checkbox) return false; checkbox.click(); return checkbox.checked;`), "SDP filter cannot be enabled");
  assert.ok(await evaluate(`document.querySelectorAll('.v2-map path[opacity="0.18"]').length > 0`), "SDP filter did not dim any council");
  await data(`document.querySelector('.v2-toolbar .contested-filter input').click(); return true;`);
  await choose("Council", "E08000035");
  await until(() => evaluate(`document.querySelector('.v2-map')?.querySelectorAll('path[role="button"]').length === 33`), "Leeds ward map");
  await until(() => evaluate(`document.querySelector('.detail')?.innerText.includes('33 imported contests')`), "Leeds result details");
  await snapshot("v2-leeds-desktop");
  await choose("Ward", "E05012648"); // Farnley & Wortley in the 2025 ONS ward edition.
  await until(() => evaluate(`document.querySelector('.detail .winner-line') !== null`), "ward result");
  await snapshot("v2-leeds-ward-desktop");
  assert.ok(await data(`const checkbox = document.querySelector('.v2-toolbar .contested-filter input'); checkbox.click(); return checkbox.checked;`), "Ward SDP filter cannot be enabled");
  assert.ok(await evaluate(`document.querySelectorAll('.v2-map path[opacity="0.18"]').length > 0`), "Ward SDP filter did not dim any ward");
  await data(`document.querySelector('.v2-toolbar .contested-filter input').click(); return true;`);
  await choose("Show winners", "SDP");
  assert.ok(await evaluate(`document.querySelectorAll('.v2-map path[opacity="0.18"]').length > 0`), "Party winner filter did not dim any ward");
  await choose("Show winners", "");
  await choose("Map colour", "turnout");
  assert.ok(await evaluate(`!!document.querySelector('.v2-turnout-gradient')`), "Turnout map legend is absent");
  await snapshot("v2-leeds-turnout-desktop");
  await choose("Map colour", "tribes");
  await until(() => evaluate(`document.querySelector('.map-heading')?.innerText.includes('2021 Census groups')`), "Leeds Tribes map layer");
  assert.ok(await evaluate(`document.querySelectorAll('.v2-work .legend .legend-item').length === 7`), "Leeds Tribes legend is incomplete");
  await snapshot("v2-leeds-tribes-desktop");
  await choose("Map colour", "winners");
  await choose("Year", "latest");
  await until(() => evaluate(`document.querySelector('.map-heading')?.innerText.includes('Latest imported poll per ward')`), "Leeds latest-recorded view");
  await until(() => evaluate(`!!document.querySelector('.detail .winner-line') && !document.querySelector('.detail').innerText.includes('Loading results')`), "Leeds latest result detail");
  assert.ok(await evaluate(`document.querySelector('.v2-map')?.querySelectorAll('path[role="button"]').length === 33`), "Latest-recorded view lost the Leeds map");
  const winnersChoice = await data(`const select = [...document.querySelectorAll('.v2-toolbar label')].find(node => node.textContent.trim().startsWith('Show winners'))?.querySelector('select');
    return { value: select?.value, selectedIndex: select?.selectedIndex, options: [...(select?.options ?? [])].map(option => option.textContent) };`);
  assert.ok(winnersChoice.selectedIndex >= 0, `Winner filter lost its selection: ${JSON.stringify(winnersChoice)}`);
  await snapshot("v2-leeds-latest-desktop");
  await choose("Year", "2025");
  await until(() => evaluate(`document.querySelector('.detail')?.innerText.includes('No imported contest for this ward in 2025')`), "Leeds missing-year explanation");
  assert.ok(await evaluate(`document.querySelector('.v2-map')?.querySelectorAll('path[role="button"]').length === 33`), "Year change lost the Leeds map");
  await choose("Year", "2026");
  await until(() => evaluate(`!!document.querySelector('.detail .winner-line')`), "Leeds 2026 result restored");
  await click("Census", "document.querySelector('.detail-tabs')");
  assert.ok(await evaluate(`!!document.querySelector('.detail .census-total')`), "Leeds Census detail is missing");
  await click("Tribes", "document.querySelector('.detail-tabs')");
  assert.equal(await evaluate(`document.querySelectorAll('.detail .result').length`), 7, "Leeds ward should show seven Electoral Tribes");
  await click("History", "document.querySelector('.detail-tabs')");
  assert.ok(await evaluate(`document.querySelectorAll('.detail .history-list li').length > 0`), "Leeds ward history is missing");
  await click("Table", "document.querySelector('.switch')");
  await until(() => evaluate(`document.querySelectorAll('.v2-table-wrap tbody tr').length > 0`), "candidate table");
  assert.ok(await evaluate(`document.querySelector('.v2-table-wrap')?.innerText.includes('✓')`), "Missing elected ticks");
  await snapshot("v2-leeds-table-desktop");
  await click("Composition", "document.querySelector('.switch')");
  await waitText("Seats");
  assert.ok(await evaluate(`document.querySelector('.composition-view')?.innerText.includes('99')`), "Leeds composition should show 99 seats");
  await snapshot("v2-leeds-composition-desktop");

  await click("Map", "document.querySelector('.switch')");
  await choose("Council", "E08000032");
  await until(() => evaluate(`document.querySelector('.map-heading')?.innerText.includes('2026-05 wards')`), "Bradford 2026 map edition");
  await until(() => evaluate(`!!document.querySelector('.v2-toolbar label select option[value="E05001369"]')`), "Bradford February poll option");
  await choose("Ward", "E05001369"); // February Worth Valley uses the earlier edition.
  await until(() => evaluate(`document.querySelector('.map-heading')?.innerText.includes('2025-05 wards')`), "Worth Valley old map edition");
  await waitText("By-election");
  assert.ok(await evaluate(`document.querySelector('.small-notice')?.innerText.includes('original')`), "Bradford source caveat is missing");
  await snapshot("v2-bradford-february-desktop");
  await choose("Ward", "E05016466"); // June Idle and Thackley uses the new edition.
  await until(() => evaluate(`document.querySelector('.map-heading')?.innerText.includes('2026-05 wards')`), "Idle and Thackley new map edition");
  await waitText("Postponed council election");
  await snapshot("v2-bradford-june-desktop");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(500);
  await snapshot("v2-bradford-mobile");
  await data(`window.scrollTo(0, document.querySelector('.v2-work').getBoundingClientRect().top + window.scrollY - 12); return true;`);
  await pause(150);
  await snapshot("v2-bradford-mobile-map");
  const mobile = await data(`return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    mapWidth: Math.round(document.querySelector('.v2-map').getBoundingClientRect().width) };`);
  assert.ok(mobile.scrollWidth <= mobile.width + 2, `Mobile page overflows horizontally: ${JSON.stringify(mobile)}`);
  assert.ok(mobile.mapWidth >= 300, `Mobile map is too narrow: ${JSON.stringify(mobile)}`);
  assert.deepEqual(exceptions, [], `Browser exceptions: ${exceptions.join('; ')}`);
  console.log(JSON.stringify({ result: "PASS", v1, mobile, screenshots: output }));
} finally {
  ws?.close();
  chrome.kill();
}
