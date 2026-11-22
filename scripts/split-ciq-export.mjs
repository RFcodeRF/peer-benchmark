// Zerlegt einen Capital-IQ-Chart-Builder-Export (mehrere Reihen in % Veränderung) in einzelne Kursreihen.
// Aufruf: node scripts/split-ciq-export.mjs <Export.xls> <privater Zielordner>
// Wert = 100 × (1 + Veränderung in % ÷ 100). Renditen hängen nur von Verhältnissen ab, die Basis kürzt sich heraus.
// MSCI World in GBP und EUR wird aus MSCI World (USD) und den Wechselkursen umgerechnet.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const XLSX = createRequire(import.meta.url)("xlsx");

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error("Aufruf: node scripts/split-ciq-export.mjs <Export.xls> <Zielordner>");
  process.exit(1);
}
const MAP = {
  MONY: "(LSE:MONY) - Share Pricing",
  FTSEALLSHARE: "(^ASX) - Index Value",
  CDAX: "(^CXKX) - Index Value",
  EDR: "(BME:EDR) - Share Pricing",
  HYQ: "(XTRA:HYQ) - Share Pricing",
  FTSEITALIAALLSHARE: "(^ITLMS) - Index Value",
  EVER: "(NasdaqGM:EVER) - Share Pricing",
  IGBM: "(^20000) - Index Value",
  BKNG: "(NasdaqGS:BKNG) - Share Pricing",
  TREE: "(NasdaqGS:TREE) - Share Pricing",
  NRDS: "(NasdaqGM:NRDS) - Share Pricing",
  TRVG: "(NasdaqGS:TRVG) - Share Pricing",
  SP500: "(^SPX) - Index Value",
  USDEUR: "($USDEUR) - Rate Value",
  MOL: "(BIT:MOL) - Share Pricing",
  EXPE: "(NasdaqGS:EXPE) - Share Pricing",
  USDGBP: "($USDGBP) - Rate Value",
  MSCIWORLD_USD: "(^MXWO) - Index Value",
};
const wb = XLSX.readFile(file, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
const head = rows[0].map(String);
const toDate = (v) => {
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  d.setUTCHours(d.getUTCHours() + 6); // Export liefert Mitternacht MEZ als Vortag 23:00 UTC
  return d.toISOString().slice(0, 10);
};
const series = {};
for (const [key, needle] of Object.entries(MAP)) {
  const i = head.findIndex((h) => h.includes(needle));
  if (i < 0) {
    console.warn(`Spalte fehlt: ${key} (${needle})`);
    continue;
  }
  series[key] = new Map();
  for (const r of rows.slice(1)) {
    if (r[i] === null || r[i] === "" || r[0] === null) continue;
    series[key].set(toDate(r[0]), 100 * (1 + Number(r[i]) / 100));
  }
}
const convert = (fxKey, outKey) => {
  if (!series.MSCIWORLD_USD || !series[fxKey]) return;
  series[outKey] = new Map();
  for (const [d, v] of series.MSCIWORLD_USD) {
    const fx = series[fxKey].get(d); // USD je Einheit Fremdwährung (auf Basis 100)
    if (fx) series[outKey].set(d, v / fx);
  }
};
convert("USDGBP", "MSCIWORLD_GBP");
convert("USDEUR", "MSCIWORLD_EUR");
fs.mkdirSync(outDir, { recursive: true });
for (const [key, m] of Object.entries(series)) {
  const lines = ["Date,Close", ...Array.from(m.entries()).sort().map(([d, v]) => `${d},${v.toFixed(6)}`)];
  fs.writeFileSync(path.join(outDir, `${key}_prices.csv`), lines.join("\n"));
  console.log(`${key.padEnd(20)} ${m.size} Werte, ${Array.from(m.keys()).sort()[0]} bis ${Array.from(m.keys()).sort().at(-1)}`);
}
