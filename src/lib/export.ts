// Simple CSV export utility (works in web + Median WebView wrapper)
import { isMedianApp } from "@/lib/median";

export function downloadCSV(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const bom = "\uFEFF";
  // In Median app blob URL downloads often fail — open a data URL instead which
  // Median's webview will hand to the OS to save / share.
  if (isMedianApp()) {
    const dataUrl = "data:text/csv;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(bom + csv)));
    window.open(dataUrl, "_blank");
    return;
  }
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
