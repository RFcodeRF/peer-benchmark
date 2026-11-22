export function pct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return (v * 100).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " %";
}

export function num(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function mio(v: number | null | undefined, currency: string) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio. ${currency}`;
}

export function deDate(iso: string | undefined) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
