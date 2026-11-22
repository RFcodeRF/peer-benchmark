// Prüfskript: runs before every build. Fails the build if a rule is broken.
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const DATA = path.join(process.cwd(), "data");
const errors = [];
const warnings = [];

const LABELS = ["Berichtet", "Eigene Rechnung", "Annahme", "Automatisch erfasst"];
const PERIODS = ["FY2023", "FY2024", "FY2025", "YTD", "YTD_PRIOR", "LTM"];
const METRICS = ["revenue", "marketing", "marketing_margin", "ebitda_adj", "ebitda", "ebit", "da"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FILINGS_CUTOFF = "2026-11-22";
const PRICES_CUTOFF = "2026-11-20";

const json = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const csv = (f) => Papa.parse(fs.readFileSync(path.join(DATA, f), "utf8"), { header: true, skipEmptyLines: true, comments: "#" }).data;

const peers = json("peers.json");
const ids = new Set(peers.map((p) => p.id));
const scores = json("scores.json");
const defs = json("definitions.json");

// Peers, scores, definitions
for (const p of peers) {
  if (!scores[p.id]) errors.push(`scores.json: kein Score für ${p.id}`);
  if (!defs[p.id]) errors.push(`definitions.json: keine Definition für ${p.id}`);
  const s = scores[p.id];
  if (s) {
    for (const k of ["k1", "k2", "k3", "k4"]) {
      if (![0, 0.5, 1].includes(s[k])) errors.push(`scores.json: ${p.id}.${k} muss 0, 0,5 oder 1 sein`);
      if (!s.rationale?.[k]) errors.push(`scores.json: ${p.id} ohne Begründung für ${k}`);
    }
    if (!Array.isArray(s.sentences) || s.sentences.length !== 2) errors.push(`scores.json: ${p.id} braucht genau zwei Sätze`);
  }
  if (p.tab2.eligible && !p.listed) errors.push(`peers.json: ${p.id} ist nicht börsennotiert, aber für Reiter 2 geeignet`);
  if (p.defaultOn.tab2 && !p.tab2.eligible) errors.push(`peers.json: ${p.id} startet in Reiter 2, ist aber nicht geeignet`);
}

// Financials
const fin = csv("financials.csv");
fin.forEach((r, i) => {
  const at = `financials.csv Zeile ${i + 2} (${r.peer} ${r.period} ${r.metric})`;
  if (!ids.has(r.peer)) errors.push(`${at}: unbekannter Peer`);
  if (!PERIODS.includes(r.period)) errors.push(`${at}: unbekannte Periode`);
  if (!METRICS.includes(r.metric)) errors.push(`${at}: unbekannte Kennzahl`);
  if (!LABELS.includes(r.label)) errors.push(`${at}: Label fehlt oder ist ungültig`);
  if (!r.source_url || !/^https?:\/\//.test(r.source_url)) errors.push(`${at}: Quelle (URL) fehlt`);
  if (!r.source_title) errors.push(`${at}: Quellentitel fehlt`);
  if (!ISO.test(r.as_of || "")) errors.push(`${at}: Stichtag (as_of) fehlt`);
  else if (r.as_of > FILINGS_CUTOFF) errors.push(`${at}: Quelle nach dem Stichtag ${FILINGS_CUTOFF}`);
  if (!ISO.test(r.period_start || "") || !ISO.test(r.period_end || "")) errors.push(`${at}: Periodenbeginn oder -ende fehlt`);
  if (r.value === "" || !Number.isFinite(Number(r.value))) errors.push(`${at}: Wert fehlt`);
  if (r.label === "Annahme" && !r.note) errors.push(`${at}: Annahme ohne Begründung`);
  if (r.metric === "marketing_margin" && (Number(r.value) < -1 || Number(r.value) > 1)) warnings.push(`${at}: Marge außerhalb von −100 % bis 100 %`);
});

// Duplicate keys
const seen = new Set();
for (const r of fin) {
  const k = `${r.peer}|${r.period}|${r.metric}`;
  if (seen.has(k)) errors.push(`financials.csv: doppelte Zeile ${k}`);
  seen.add(k);
}

// Margin plausibility
const byKey = new Map(fin.map((r) => [`${r.peer}|${r.period}|${r.metric}`, Number(r.value)]));
for (const r of fin.filter((x) => x.metric === "revenue")) {
  const rev = Number(r.value);
  for (const m of ["marketing", "ebitda_adj"]) {
    const v = byKey.get(`${r.peer}|${r.period}|${m}`);
    if (v === undefined) continue;
    const margin = m === "marketing" ? (rev - v) / rev : v / rev;
    if (margin < -1 || margin > 1) warnings.push(`Marge ${m} für ${r.peer} ${r.period} außerhalb von −100 % bis 100 %: ${(margin * 100).toFixed(1)} %`);
  }
}

// Capital structure
const cap = csv("capital_structure.csv");
cap.forEach((r, i) => {
  const at = `capital_structure.csv Zeile ${i + 2} (${r.peer})`;
  if (!ids.has(r.peer)) errors.push(`${at}: unbekannter Peer`);
  if (!LABELS.includes(r.label)) errors.push(`${at}: Label fehlt`);
  if (!r.source_url) errors.push(`${at}: Quelle fehlt`);
  if (!Number.isFinite(Number(r.net_debt)) || !Number.isFinite(Number(r.market_cap))) errors.push(`${at}: Zahl fehlt`);
  if (r.price_date && r.price_date > PRICES_CUTOFF) errors.push(`${at}: Kursdatum nach ${PRICES_CUTOFF}`);
});

// Betas: only derived values, never raw prices
const betas = json("betas.json");
for (const [id, est] of Object.entries(betas.peers || {})) {
  if (!ids.has(id)) errors.push(`betas.json: unbekannter Peer ${id}`);
  for (const [k, e] of Object.entries(est)) {
    if (!e) continue;
    if (!Number.isFinite(e.beta) || !Number.isFinite(e.n)) errors.push(`betas.json: ${id}.${k} unvollständig`);
    if (e.end > PRICES_CUTOFF) errors.push(`betas.json: ${id}.${k} endet nach ${PRICES_CUTOFF}`);
  }
}

// No raw prices or secrets in the repo
const forbidden = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/_prices\.(xlsx|csv)$/i.test(f.name) || /^\.env(\..*)?$/.test(f.name) && f.name !== ".env.example") forbidden.push(path.relative(process.cwd(), p));
  }
};
walk(process.cwd());
for (const f of forbidden) errors.push(`Verbotene Datei im Projekt: ${f} (Rohkurse oder Schlüssel)`);

for (const w of warnings) console.warn("Hinweis:", w);
if (errors.length) {
  console.error(`Prüfskript: ${errors.length} Fehler`);
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log(`Prüfskript: alles in Ordnung (${fin.length} Finanzzeilen, ${cap.length} Kapitalstrukturzeilen, ${Object.keys(betas.peers || {}).length} Betas, ${warnings.length} Hinweise).`);
