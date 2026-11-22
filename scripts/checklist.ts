// Prints the key numbers for the manual review checklist.
import { loadData } from "../src/lib/data";
import { buildSeries } from "../src/lib/finance";
import { buildBetaRows, computeCoe, medianDE } from "../src/lib/coe";
const d = loadData();
const pct = (v: number | null | undefined) => (v == null ? "–" : (v * 100).toFixed(1) + " %");
for (const id of ["everquote", "mony", "lendingtree", "nerdwallet", "trivago", "moltiply", "ctm", "gocompare", "skyscanner", "booking", "expedia"]) {
  const s = buildSeries(id, d.financials);
  const row = (k: keyof typeof s) => ["FY2023", "FY2024", "FY2025", "LTM"].map((p) => pct((s[k] as any)[p]?.value)).join(" | ");
  console.log(id.padEnd(12), "MM", row("marketingMargin"), " || EBITDA adj", row("ebitdaAdjMargin"), " || unadj", row("ebitdaUnadjMargin"));
}
const peers = d.peers.filter((p) => p.defaultOn.tab2);
const opts = { window: "w2y" as const, index: "local" as const, blume: false, method: "harris-pringle" as const, blumeWeight: 0.67, blumeConstant: 0.33 };
const rows = buildBetaRows(peers, d.betas, d.capital, opts, 70, 36);
for (const r of rows) console.log(r.peerId.padEnd(12), "bL", r.rawBeta, "DE", r.de?.toFixed(4), "bu", r.unlevered?.toFixed(4));
const de = medianDE(rows);
const res = computeCoe(rows, { riskFree: 0.0375, mrp: 0.0525, targetDE: de, premium: 0, method: "harris-pringle", window: "w2y", index: "local", blume: false, targetTax: 0.3, blumeWeight: 0.67, blumeConstant: 0.33 })!;
console.log("medianDE", de.toFixed(4), JSON.stringify(res, null, 1));
const travel = buildBetaRows(d.peers.filter((p) => p.tab2.travel), d.betas, d.capital, opts, 70, 36);
console.log("travel", JSON.stringify(computeCoe(travel, { riskFree: 0.0375, mrp: 0.0525, targetDE: de, premium: 0, method: "harris-pringle", window: "w2y", index: "local", blume: false, targetTax: 0.3, blumeWeight: 0.67, blumeConstant: 0.33 })));
for (const [w, i, b] of [["m5y", "local", false], ["w2y", "msci", false], ["w2y", "local", true]] as const) {
  const r2 = buildBetaRows(peers, d.betas, d.capital, { ...opts, window: w, index: i, blume: b }, 70, 36);
  const c = computeCoe(r2, { riskFree: 0.0375, mrp: 0.0525, targetDE: medianDE(r2), premium: 0, method: "harris-pringle", window: w, index: i, blume: b, targetTax: 0.3, blumeWeight: 0.67, blumeConstant: 0.33 })!;
  console.log(w, i, b, "CoE mid", pct(c.coeMid), "range", pct(c.coeLow), pct(c.coeHigh), "bu mid", c.unleveredMid.toFixed(3));
}
