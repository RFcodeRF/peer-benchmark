// Rechnet die Betas aus privaten Capital-IQ-Kursdateien und schreibt data/betas.json.
// Aufruf: node scripts/compute-betas.mjs <Ordner mit *_prices.xlsx> [Ausgabeordner für private Prüfdateien]
// Die Rohkurse bleiben im privaten Ordner; ins Repo kommt nur das Ergebnis.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const XLSX = createRequire(import.meta.url)("xlsx");

const dir = process.argv[2];
const outPrivate = process.argv[3] || dir;
if (!dir || !fs.existsSync(dir)) {
  console.error("Bitte den Ordner mit den Kursdateien angeben: node scripts/compute-betas.mjs <Ordner>");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/beta-config.json"), "utf8"));
const CUTOFF = cfg.cutoff;

// ---------- Datei lesen ----------
function excelDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); // dd.mm.yyyy or mm/dd/yyyy
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const us = s.includes("/");
      const [mm, dd] = us ? [a, b] : [b, a];
      return `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

function readPrices(key) {
  const candidates = fs.readdirSync(dir).filter((f) => f.toLowerCase().startsWith(key.toLowerCase() + "_prices") && /\.(xlsx|xls|csv)$/i.test(f));
  if (!candidates.length) return null;
  const file = path.join(dir, candidates[0]);
  if (file.toLowerCase().endsWith(".csv")) {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1);
    const rowsCsv = lines.map((l) => l.split(",")).map(([d, p]) => ({ date: d.trim(), price: Number(p), marketCap: null })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.price > 0);
    rowsCsv.sort((a, b) => a.date.localeCompare(b.date));
    return { file: path.basename(file), header: ["Date", "Close"], rows: rowsCsv };
  }
  const wb = XLSX.readFile(file, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  // Kopfzeile suchen: eine Spalte mit Datum, eine mit Kurs
  let hi = -1, di = -1, pi = -1, mi = -1;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i].map((c) => (c === null ? "" : String(c)));
    const d = r.findIndex((c) => /date|datum/i.test(c));
    const p = r.findIndex((c, j) => j !== d && /(close|closing|price|pricing|value|kurs|level)/i.test(c) && !/volume|market cap|currency/i.test(c));
    if (d >= 0 && p >= 0) {
      hi = i; di = d; pi = p;
      mi = r.findIndex((c) => /market cap/i.test(c));
      break;
    }
  }
  if (hi < 0) {
    // Fallback: erste Spalte Datum, erste Zahlenspalte Kurs
    di = 0; pi = 1; hi = -1;
  }
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const d = excelDate(rows[i][di]);
    const p = typeof rows[i][pi] === "number" ? rows[i][pi] : Number(String(rows[i][pi] ?? "").replace(/,/g, ""));
    if (!d || !Number.isFinite(p) || p <= 0) continue;
    const mc = mi >= 0 ? Number(rows[i][mi]) : NaN;
    out.push({ date: d, price: p, marketCap: Number.isFinite(mc) ? mc : null });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { file: path.basename(file), header: hi >= 0 ? rows[hi] : null, rows: out };
}

// ---------- Stichtage ----------
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function weeklyAnchors() {
  const a = [];
  for (let i = cfg.weeks; i >= 0; i--) a.push(addDays(CUTOFF, -7 * i)); // Freitage
  return a;
}
function monthlyAnchors() {
  const [y, m, d] = CUTOFF.split("-").map(Number);
  const a = [];
  for (let i = cfg.months; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1 - i, d));
    a.push(dt.toISOString().slice(0, 10));
  }
  return a;
}
// Letzter Schlusskurs im Fenster (Stichtag − Fensterlänge, Stichtag]
function sample(rows, anchors, windowDays) {
  return anchors.map((t) => {
    let best = null;
    for (const r of rows) {
      if (r.date > t) break;
      if (r.date > addDays(t, -windowDays)) best = r;
    }
    return best ? { anchor: t, date: best.date, price: best.price } : { anchor: t, date: null, price: null };
  });
}

function regress(stock, index) {
  const pairs = [];
  for (let i = 1; i < stock.length; i++) {
    const s0 = stock[i - 1].price, s1 = stock[i].price, m0 = index[i - 1].price, m1 = index[i].price;
    if ([s0, s1, m0, m1].some((v) => v === null)) continue;
    pairs.push({ anchor: stock[i].anchor, rs: s1 / s0 - 1, rm: m1 / m0 - 1 });
  }
  const n = pairs.length;
  if (n < 3) return { n, beta: NaN, r2: NaN, pairs };
  const mx = pairs.reduce((a, p) => a + p.rm, 0) / n;
  const my = pairs.reduce((a, p) => a + p.rs, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    sxy += (p.rm - mx) * (p.rs - my);
    sxx += (p.rm - mx) ** 2;
    syy += (p.rs - my) ** 2;
  }
  const beta = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { n, beta, r2, pairs };
}

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const result = {};
const report = [];
const marketCaps = {};
const indexCache = {};
const getIdx = (k) => (indexCache[k] ??= readPrices(k));

for (const [peer, c] of Object.entries(cfg.peers)) {
  const st = readPrices(c.stock);
  if (!st) {
    report.push(`${peer}: Datei ${c.stock}_prices.xlsx fehlt`);
    continue;
  }
  const last = st.rows.filter((r) => r.date <= CUTOFF).at(-1);
  if (last?.marketCap) marketCaps[peer] = { date: last.date, marketCap: last.marketCap, price: last.price };
  else if (last) marketCaps[peer] = { date: last.date, marketCap: null, price: last.price };
  result[peer] = {};
  for (const [idxKey, idxName, prefix] of [[c.index, c.indexName, "local"], [c.msci, "MSCI World (" + c.msci.split("_")[1] + ")", "msci"]]) {
    const ix = getIdx(idxKey);
    if (!ix) {
      report.push(`${peer}: Indexdatei ${idxKey}_prices.xlsx fehlt`);
      result[peer][`${prefix}_w2y`] = null;
      result[peer][`${prefix}_m5y`] = null;
      continue;
    }
    for (const [suffix, anchors, win, freq] of [["w2y", weeklyAnchors(), 7, "wöchentlich"], ["m5y", monthlyAnchors(), 10, "monatlich"]]) {
      const s = sample(st.rows, anchors, win);
      const m = sample(ix.rows, anchors, win);
      const reg = regress(s, m);
      result[peer][`${prefix}_${suffix}`] = Number.isFinite(reg.beta)
        ? { beta: round(reg.beta), r2: round(reg.r2), n: reg.n, index: idxName, start: anchors[0], end: anchors.at(-1), frequency: freq }
        : null;
      report.push(`${peer.padEnd(12)} ${prefix}_${suffix}: Beta ${Number.isFinite(reg.beta) ? reg.beta.toFixed(3) : "–"}, R² ${Number.isFinite(reg.r2) ? reg.r2.toFixed(3) : "–"}, n ${reg.n}`);

      // Private Excel-Prüfdatei für MONY (2 Jahre wöchentlich, lokal): Nachrechnung mit SLOPE und RSQ
      if (peer === "mony" && prefix === "local" && suffix === "w2y") {
        const aoa = [["Stichtag", "Kursdatum Aktie", "Kursindex MONY (Basis 100)", "Kursdatum Index", "FTSE All-Share (Basis 100)", "Rendite MONY", "Rendite Index"]];
        s.forEach((x, i) => {
          const r = i + 2;
          aoa.push([x.anchor, x.date, x.price, m[i].date, m[i].price, i === 0 ? null : { f: `IF(AND(ISNUMBER(C${r}),ISNUMBER(C${r - 1}),ISNUMBER(E${r}),ISNUMBER(E${r - 1})),C${r}/C${r - 1}-1,"")` }, i === 0 ? null : { f: `IF(AND(ISNUMBER(C${r}),ISNUMBER(C${r - 1}),ISNUMBER(E${r}),ISNUMBER(E${r - 1})),E${r}/E${r - 1}-1,"")` }]);
        });
        const n = s.length + 1;
        aoa.push([]);
        aoa.push(["Beta (SLOPE)", { f: `SLOPE(F3:F${n},G3:G${n})` }]);
        aoa.push(["R² (RSQ)", { f: `RSQ(F3:F${n},G3:G${n})` }]);
        aoa.push(["Beobachtungen", { f: `COUNT(F3:F${n})` }]);
        aoa.push(["Ergebnis Skript", round(reg.beta, 6)]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "MONY Beta");
        XLSX.writeFile(wb, path.join(outPrivate, "PRIVAT_MONY_Beta_Nachrechnung.xlsx"));
      }
    }
  }
}

const out = {
  meta: {
    status: Object.keys(result).length ? "berechnet" : "ausstehend",
    priceSource: "S&P Capital IQ (Chart Builder), tägliche Schlusskurse als Kursveränderung, Preisindizes, Landeswährung; MSCI World in GBP und EUR über Wechselkurse umgerechnet; Rohdaten nicht veröffentlicht",
    priceDate: CUTOFF,
    computedAt: new Date().toISOString().slice(0, 10),
    method: `Regression der Aktienrendite auf die Indexrendite (kleinste Quadrate). Wöchentlich: Schlusskurs am Freitag oder letzter Handelstag davor, ${cfg.weeks} Wochen bis ${CUTOFF}. Monatlich: Schlusskurs am 20. jedes Monats oder letzter Handelstag davor, ${cfg.months} Monate bis ${CUTOFF}.`,
  },
  peers: result,
};
fs.writeFileSync(path.join(process.cwd(), "data/betas.json"), JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(outPrivate, "PRIVAT_marktkapitalisierung.json"), JSON.stringify(marketCaps, null, 2));
console.log(report.join("\n"));
console.log(`\ndata/betas.json geschrieben (${Object.keys(result).length} Peers). Private Prüfdateien in ${outPrivate}.`);
