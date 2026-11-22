import { buildSeries as bs, periodLabel } from "../src/lib/finance";
import type { FinancialRow } from "../src/lib/types";

const row = (period: FinancialRow["period"], start: string, end: string, metric: FinancialRow["metric"], value: number): FinancialRow => ({
  peer: "x", period, period_start: start, period_end: end, metric, value, currency: "EUR", label: "Berichtet",
  source_title: "Test", source_url: "https://example.com", source_page: "1", as_of: "2026-11-01", note: "",
});

export function buildSeries() {
  const rows = [
    row("FY2025", "2025-01-01", "2025-12-31", "revenue", 100),
    row("FY2025", "2025-01-01", "2025-12-31", "marketing", 70),
    row("FY2025", "2025-01-01", "2025-12-31", "ebitda_adj", 20),
    row("FY2025", "2025-01-01", "2025-12-31", "ebit", 15),
    row("FY2025", "2025-01-01", "2025-12-31", "da", 2),
    row("YTD", "2026-01-01", "2026-09-30", "revenue", 120),
    row("YTD", "2026-01-01", "2026-09-30", "marketing", 80),
    row("YTD_PRIOR", "2025-01-01", "2025-09-30", "revenue", 80),
    row("YTD_PRIOR", "2025-01-01", "2025-09-30", "marketing", 50),
  ];
  return bs("x", rows);
}

export function fyLabelCheck() {
  return buildSeries().marketingMargin.LTM?.periodLabel ?? periodLabel("LTM", "", "");
}
