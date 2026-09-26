import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await readFile(path.join(root, "src/lib/report-export.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { csvCell, csvDocument } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

test("CSV exports preserve quotes and commas with a BOM and CRLF rows", () => {
  assert.equal(csvDocument([["Ward", "Votes"], ['Farnley, "West"', 26]]), '\uFEFF"Ward","Votes"\r\n"Farnley, ""West""","26"\r\n');
});

test("spreadsheet formula-looking cells are neutralised", () => {
  for (const value of ["=2+2", "+SUM(A1:A2)", "-1+2", "@cmd", "  =HYPERLINK(1)"]) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell("Labour"), '"Labour"');
  assert.equal(csvCell(null), '""');
});
