// Cost of equity calculations.
// All rates are decimals (0.0375 = 3,75 %).

import type { BetaEstimate, BetaFile, CapitalStructureRow, Peer } from "./types";

export type UnleverMethod = "harris-pringle" | "hamada";
export type BetaWindow = "w2y" | "m5y";
export type BetaIndex = "local" | "msci";

export interface CoeSettings {
  riskFree: number;
  mrp: number;
  targetDE: number; // decimal, 0..1
  premium: number; // decimal
  method: UnleverMethod;
  window: BetaWindow;
  index: BetaIndex;
  blume: boolean;
  targetTax: number;
  blumeWeight: number;
  blumeConstant: number;
}

export interface PeerBetaRow {
  peerId: string;
  estimate: BetaEstimate | null;
  rawBeta: number | null;
  adjustedBeta: number | null; // after Blume if active
  de: number | null;
  tax: number;
  unlevered: number | null;
  status: "ok" | "kein Beta" | "zu wenige Wochen" | "nicht live verfügbar" | "keine Kapitalstruktur";
}

export function estimateKey(window: BetaWindow, index: BetaIndex) {
  return `${index}_${window}` as "local_w2y" | "local_m5y" | "msci_w2y" | "msci_m5y";
}

export function blumeAdjust(beta: number, weight = 0.67, constant = 0.33) {
  return weight * beta + constant;
}

export function deRatio(netDebt: number, marketCap: number) {
  if (!(marketCap > 0)) return null;
  return Math.max(0, netDebt / marketCap);
}

export function unlever(betaL: number, de: number, method: UnleverMethod, tax: number) {
  if (method === "hamada") return betaL / (1 + (1 - tax) * de);
  return betaL / (1 + de);
}

export function relever(betaU: number, de: number, method: UnleverMethod, tax: number) {
  if (method === "hamada") return betaU * (1 + (1 - tax) * de);
  return betaU * (1 + de);
}

export function capm(rf: number, beta: number, mrp: number, premium = 0) {
  return rf + beta * mrp + premium;
}

export function median(values: number[]) {
  return quantileInc(values, 0.5);
}

// Same as Excel QUARTILE.INC / PERCENTILE.INC (linear interpolation, inclusive).
export function quantileInc(values: number[], p: number) {
  const v = [...values].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  if (v.length === 1) return v[0];
  const h = (v.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return v[lo] + (h - lo) * (v[hi] - v[lo]);
}

export function buildBetaRows(
  peers: Peer[],
  betas: BetaFile,
  capital: CapitalStructureRow[],
  s: Pick<CoeSettings, "window" | "index" | "blume" | "method" | "blumeWeight" | "blumeConstant">,
  minWeeks: number,
  minMonths: number,
): PeerBetaRow[] {
  const key = estimateKey(s.window, s.index);
  return peers.map((p) => {
    const base: PeerBetaRow = {
      peerId: p.id,
      estimate: null,
      rawBeta: null,
      adjustedBeta: null,
      de: null,
      tax: p.taxRate,
      unlevered: null,
      status: "kein Beta",
    };
    if (p.live) return { ...base, status: "nicht live verfügbar" };
    const est = betas.peers[p.id]?.[key] ?? null;
    const cs = capital.find((c) => c.peer === p.id);
    const de = cs ? deRatio(cs.net_debt, cs.market_cap) : null;
    if (!est) return { ...base, de };
    const minN = s.window === "w2y" ? minWeeks : minMonths;
    if (est.n < minN) return { ...base, estimate: est, rawBeta: est.beta, de, status: "zu wenige Wochen" };
    const adj = s.blume ? blumeAdjust(est.beta, s.blumeWeight, s.blumeConstant) : est.beta;
    if (de === null) return { ...base, estimate: est, rawBeta: est.beta, adjustedBeta: adj, status: "keine Kapitalstruktur" };
    return {
      ...base,
      estimate: est,
      rawBeta: est.beta,
      adjustedBeta: adj,
      de,
      unlevered: unlever(adj, de, s.method, p.taxRate),
      status: "ok",
    };
  });
}

export interface CoeResult {
  n: number;
  warning: string | null;
  unleveredLow: number;
  unleveredMid: number;
  unleveredHigh: number;
  releveredLow: number;
  releveredMid: number;
  releveredHigh: number;
  coeLow: number;
  coeMid: number;
  coeHigh: number;
  rangeMethod: "Quartile" | "Minimum und Maximum";
}

export function computeCoe(rows: PeerBetaRow[], s: CoeSettings): CoeResult | null {
  const bu = rows.filter((r) => r.status === "ok" && r.unlevered !== null).map((r) => r.unlevered as number);
  if (bu.length === 0) return null;
  const few = bu.length < 3;
  const lo = few ? Math.min(...bu) : quantileInc(bu, 0.25);
  const mid = median(bu);
  const hi = few ? Math.max(...bu) : quantileInc(bu, 0.75);
  const rl = (b: number) => relever(b, s.targetDE, s.method, s.targetTax);
  return {
    n: bu.length,
    warning: few ? `Nur ${bu.length} Peer${bu.length === 1 ? "" : "s"} mit Beta aktiv. Die Spanne nutzt Minimum und Maximum und ist wenig belastbar.` : null,
    unleveredLow: lo,
    unleveredMid: mid,
    unleveredHigh: hi,
    releveredLow: rl(lo),
    releveredMid: rl(mid),
    releveredHigh: rl(hi),
    coeLow: capm(s.riskFree, rl(lo), s.mrp, s.premium),
    coeMid: capm(s.riskFree, rl(mid), s.mrp, s.premium),
    coeHigh: capm(s.riskFree, rl(hi), s.mrp, s.premium),
    rangeMethod: few ? "Minimum und Maximum" : "Quartile",
  };
}

export function medianDE(rows: PeerBetaRow[]) {
  const d = rows.filter((r) => r.status === "ok" && r.de !== null).map((r) => r.de as number);
  if (d.length === 0) return 0;
  return median(d);
}

export function sensitivityMatrix(rf: number, premium: number, betaMin: number, betaMax: number, betaStep: number, mrpLow: number, mrpHigh: number, mrpStep: number) {
  const betas: number[] = [];
  for (let b = betaMin; b <= betaMax + 1e-9; b += betaStep) betas.push(Math.round(b * 100) / 100);
  const mrps: number[] = [];
  for (let m = mrpLow; m <= mrpHigh + 1e-9; m += mrpStep) mrps.push(Math.round(m * 10000) / 10000);
  const cells = betas.map((b) => mrps.map((m) => capm(rf, b, m, premium)));
  return { betas, mrps, cells };
}
