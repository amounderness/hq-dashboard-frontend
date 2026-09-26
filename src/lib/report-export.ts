export function csvCell(value: unknown): string {
  // Numbers are safe CSV values, including signed seat changes. Keep them
  // numeric so spreadsheet users can sort and calculate with the column.
  if (typeof value === "number" && Number.isFinite(value)) return `"${value}"`;
  const text = value == null ? "" : String(value);
  // Stop spreadsheet apps interpreting downloaded data as formulas.
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csvDocument(rows: unknown[][]): string {
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob([csvDocument(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
