import { describe, expect, it } from "vitest";
import { ixbrlPeriods, parseIxbrl } from "../src/lib/live";

const ctx = (id: string, start: string, end: string, seg = "") =>
  `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>${seg}</xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
const fact = (name: string, ref: string, v: string, extra = "") => `<ix:nonFraction name="${name}" contextRef="${ref}" unitRef="GBP" scale="3" ${extra}>${v}</ix:nonFraction>`;

const doc = [
  ctx("cy", "2025-01-01", "2025-12-31"),
  ctx("py", "2024-01-01", "2024-12-31"),
  ctx("seg", "2025-01-01", "2025-12-31", '<xbrli:segment><xbrldi:explicitMember dimension="a">b</xbrldi:explicitMember></xbrli:segment>'),
  fact("core:TurnoverRevenue", "cy", "12,345"),
  fact("core:TurnoverRevenue", "py", "10,000"),
  fact("core:TurnoverRevenue", "seg", "999"),
  fact("core:OperatingProfitLoss", "cy", "2,000"),
  fact("core:OperatingProfitLoss", "py", "500", 'sign="-"'),
  fact("core:DepreciationExpensePropertyPlantEquipment", "cy", "300"),
  fact("core:AmortisationExpenseIntangibleAssets", "cy", "<span>200</span>"),
  fact("core:DepreciationExpensePropertyPlantEquipment", "py", "-", 'format="ixt:fixed-zero"'),
].join("\n");

describe("iXBRL (Companies House)", () => {
  it("reads one-year facts without dimensions, with scale and sign", () => {
    const f = parseIxbrl(doc);
    expect(f.filter((x) => x.name === "TurnoverRevenue").map((x) => x.value)).toEqual([12345000, 10000000]);
    expect(f.find((x) => x.name === "OperatingProfitLoss" && x.end === "2024-12-31")?.value).toBe(-500000);
  });
  it("builds fiscal years with EBIT and summed depreciation and amortisation", () => {
    const { periods } = ixbrlPeriods([doc]);
    expect(periods.map((p) => p.key)).toEqual(["FY2024", "FY2025"]);
    const fy25 = periods.find((p) => p.key === "FY2025")!;
    expect(fy25.revenue).toBeCloseTo(12.345);
    expect(fy25.ebit).toBeCloseTo(2);
    expect(fy25.da).toBeCloseTo(0.5);
  });
});
