import { describe, expect, it } from "vitest";
import { capm, quantileInc, relever, unlever, deRatio, blumeAdjust, computeCoe, type PeerBetaRow, type CoeSettings } from "../src/lib/coe";
import { buildSeries, fyLabelCheck } from "./helpers";

describe("CAPM-Bausteine", () => {
  it("Quantile wie Excel QUARTILE.INC", () => {
    const v = [0.6, 0.8, 1.0, 1.3, 1.5];
    expect(quantileInc(v, 0.25)).toBeCloseTo(0.8, 10);
    expect(quantileInc(v, 0.5)).toBeCloseTo(1.0, 10);
    expect(quantileInc(v, 0.75)).toBeCloseTo(1.3, 10);
    expect(quantileInc([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    expect(quantileInc([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
  });
  it("Harris-Pringle und Hamada", () => {
    expect(unlever(1.2, 0.5, "harris-pringle", 0.25)).toBeCloseTo(0.8, 10);
    expect(unlever(1.2, 0.5, "hamada", 0.25)).toBeCloseTo(1.2 / 1.375, 10);
    expect(relever(0.8, 0.5, "harris-pringle", 0.3)).toBeCloseTo(1.2, 10);
    expect(relever(0.8, 0.5, "hamada", 0.3)).toBeCloseTo(0.8 * 1.35, 10);
  });
  it("FK/EK mit Untergrenze 0", () => {
    expect(deRatio(-50, 1000)).toBe(0);
    expect(deRatio(200, 1000)).toBeCloseTo(0.2, 10);
    expect(deRatio(10, 0)).toBeNull();
  });
  it("CAPM und Blume", () => {
    expect(capm(0.0375, 1.1, 0.0525)).toBeCloseTo(0.095250, 10);
    expect(blumeAdjust(1.5)).toBeCloseTo(1.335, 10);
  });
  it("Spanne aus Quartilen, Warnung unter drei Peers", () => {
    const mk = (id: string, bu: number): PeerBetaRow => ({ peerId: id, estimate: null, rawBeta: bu, adjustedBeta: bu, de: 0, tax: 0.25, unlevered: bu, status: "ok" });
    const s: CoeSettings = { riskFree: 0.0375, mrp: 0.0525, targetDE: 0.1, premium: 0, method: "harris-pringle", window: "w2y", index: "local", blume: false, targetTax: 0.3, blumeWeight: 0.67, blumeConstant: 0.33 };
    const r = computeCoe([mk("a", 0.6), mk("b", 0.8), mk("c", 1.0), mk("d", 1.3), mk("e", 1.5)], s)!;
    expect(r.n).toBe(5);
    expect(r.releveredMid).toBeCloseTo(1.1, 10);
    expect(r.coeMid).toBeCloseTo(0.0375 + 1.1 * 0.0525, 10);
    expect(r.coeLow).toBeCloseTo(0.0375 + 0.88 * 0.0525, 10);
    expect(r.warning).toBeNull();
    const r2 = computeCoe([mk("a", 0.6), mk("b", 1.0)], s)!;
    expect(r2.warning).not.toBeNull();
    expect(r2.unleveredLow).toBe(0.6);
    expect(r2.unleveredHigh).toBe(1.0);
  });
});

describe("Margen und LTM", () => {
  it("LTM = GJ 2025 + YTD − Vorjahres-YTD", () => {
    const s = buildSeries();
    expect(s.marketingMargin.LTM?.value).toBeCloseTo((140 - 100) / 140, 10);
    expect(s.marketingMargin.LTM?.source.label).toBe("Eigene Rechnung");
    expect(s.ebitdaAdjMargin.FY2025?.value).toBeCloseTo(20 / 100, 10);
    expect(s.ebitdaUnadjMargin.FY2025?.value).toBeCloseTo((15 + 2) / 100, 10);
    expect(fyLabelCheck()).toBe("LTM (Okt. 2025 bis Sep. 2026)");
  });
});
