// Margin calculations for Reiter 1.
import type { FinancialRow, Label, MetricPoint, PeerSeries, PeriodKey, RawPeriod, SourceInfo } from "./types";
import { PERIODS } from "./types";

const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

export function monthYear(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function periodLabel(period: PeriodKey, start: string, end: string) {
  const span = `${monthYear(start)} bis ${monthYear(end)}`;
  if (period === "LTM") return `LTM (${span})`;
  return `GJ ${period.slice(2)} (${span})`;
}

// Combine labels: the weakest label wins (Annahme > Automatisch erfasst > Eigene Rechnung > Berichtet).
function combineLabels(labels: Label[], computed: boolean): Label {
  if (labels.includes("Annahme")) return "Annahme";
  if (labels.includes("Automatisch erfasst")) return "Automatisch erfasst";
  if (computed) return "Eigene Rechnung";
  return labels.includes("Eigene Rechnung") ? "Eigene Rechnung" : "Berichtet";
}

type Lookup = (period: RawPeriod, metric: FinancialRow["metric"]) => FinancialRow | undefined;

function lookupFor(rows: FinancialRow[]): Lookup {
  return (period, metric) => rows.find((r) => r.period === period && r.metric === metric);
}

interface Amount {
  value: number;
  rows: FinancialRow[];
  start: string;
  end: string;
  computedLtm: boolean;
}

// Amount for a period. LTM = reported LTM row, else FY2025 + YTD - YTD_PRIOR.
function amount(get: Lookup, period: PeriodKey, metric: FinancialRow["metric"]): Amount | null {
  if (period !== "LTM") {
    const r = get(period, metric);
    return r ? { value: r.value, rows: [r], start: r.period_start, end: r.period_end, computedLtm: false } : null;
  }
  const direct = get("LTM", metric);
  if (direct) return { value: direct.value, rows: [direct], start: direct.period_start, end: direct.period_end, computedLtm: false };
  const fy = get("FY2025", metric);
  const ytd = get("YTD", metric);
  const ytdp = get("YTD_PRIOR", metric);
  if (!fy || !ytd || !ytdp) return null;
  // LTM window: from day after YTD_PRIOR end to YTD end
  const startDate = new Date(ytdp.period_end + "T00:00:00Z");
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  return {
    value: fy.value + ytd.value - ytdp.value,
    rows: [fy, ytd, ytdp],
    start: startDate.toISOString().slice(0, 10),
    end: ytd.period_end,
    computedLtm: true,
  };
}

function srcFrom(rows: FinancialRow[], label: Label, formula: string): SourceInfo {
  const primary = rows[rows.length > 1 ? 1 : 0] ?? rows[0];
  const titles = Array.from(new Set(rows.map((r) => r.source_title)));
  const notes = Array.from(new Set(rows.map((r) => r.note).filter(Boolean)));
  return {
    label,
    title: titles.join("; "),
    url: primary?.source_url,
    page: Array.from(new Set(rows.map((r) => r.source_page).filter(Boolean))).join("; "),
    asOf: rows.map((r) => r.as_of).sort().at(-1),
    note: notes.join(" "),
    formula,
  };
}

function point(value: number | null, src: SourceInfo, period: PeriodKey, start: string, end: string): MetricPoint {
  return { value, source: src, periodLabel: periodLabel(period, start, end), periodEnd: end };
}

export function buildSeries(peerId: string, allRows: FinancialRow[]): PeerSeries {
  const rows = allRows.filter((r) => r.peer === peerId);
  const get = lookupFor(rows);
  const s: PeerSeries = {
    peerId,
    marketingMargin: {},
    ebitdaAdjMargin: {},
    ebitdaUnadjMargin: {},
    revenueGrowth: {},
    marketingGrowth: {},
  };

  for (const p of PERIODS) {
    const rev = amount(get, p, "revenue");
    if (!rev) continue;
    const R = rev.value;

    // Marketing margin: reported margin row wins, else (R - M) / R.
    const mmReported = p !== "LTM" || get("LTM", "marketing_margin") ? get(p as RawPeriod, "marketing_margin") : undefined;
    if (mmReported) {
      s.marketingMargin[p] = point(
        mmReported.value,
        srcFrom([mmReported], mmReported.label, "Vom Unternehmen berichtete Marge"),
        p,
        mmReported.period_start,
        mmReported.period_end,
      );
    } else {
      const mk = amount(get, p, "marketing");
      if (mk) {
        const label = combineLabels([...rev.rows, ...mk.rows].map((r) => r.label), true);
        const f = rev.computedLtm
          ? "(Umsatz − Marketing) ÷ Umsatz; LTM = GJ 2025 + laufendes Jahr − Vorjahreszeitraum"
          : "(Umsatz − Marketing) ÷ Umsatz";
        s.marketingMargin[p] = point((R - mk.value) / R, srcFrom([...rev.rows, ...mk.rows], label, f), p, rev.start, rev.end);
      }
    }

    const ea = amount(get, p, "ebitda_adj");
    if (ea) {
      const label = combineLabels([...rev.rows, ...ea.rows].map((r) => r.label), true);
      s.ebitdaAdjMargin[p] = point(
        ea.value / R,
        srcFrom([...rev.rows, ...ea.rows], label, "Bereinigtes EBITDA ÷ Umsatz" + (rev.computedLtm ? "; LTM aus GJ 2025 + laufendes Jahr − Vorjahreszeitraum" : "")),
        p,
        rev.start,
        rev.end,
      );
    }

    const ebitdaRep = amount(get, p, "ebitda");
    const ebit = amount(get, p, "ebit");
    const da = amount(get, p, "da");
    if (ebitdaRep) {
      const label = combineLabels([...rev.rows, ...ebitdaRep.rows].map((r) => r.label), true);
      s.ebitdaUnadjMargin[p] = point(
        ebitdaRep.value / R,
        srcFrom([...rev.rows, ...ebitdaRep.rows], label, "Berichtetes EBITDA ohne Bereinigungen ÷ Umsatz" + (rev.computedLtm ? "; LTM aus GJ 2025 + laufendes Jahr − Vorjahreszeitraum" : "")),
        p,
        rev.start,
        rev.end,
      );
    } else if (ebit && da) {
      const label = combineLabels([...rev.rows, ...ebit.rows, ...da.rows].map((r) => r.label), true);
      s.ebitdaUnadjMargin[p] = point(
        (ebit.value + da.value) / R,
        srcFrom([...rev.rows, ...ebit.rows, ...da.rows], label, "(EBIT + Abschreibungen) ÷ Umsatz" + (rev.computedLtm ? "; LTM aus GJ 2025 + laufendes Jahr − Vorjahreszeitraum" : "")),
        p,
        rev.start,
        rev.end,
      );
    }
  }

  // Growth vs. prior fiscal year (FY2024, FY2025 only).
  const growth = (metric: "revenue" | "marketing", target: "revenueGrowth" | "marketingGrowth") => {
    for (const [cur, prev] of [["FY2024", "FY2023"], ["FY2025", "FY2024"]] as [PeriodKey, PeriodKey][]) {
      const a = amount(get, cur, metric);
      const b = amount(get, prev, metric);
      if (a && b && b.value !== 0) {
        s[target][cur] = point(a.value / b.value - 1, srcFrom([...a.rows, ...b.rows], "Eigene Rechnung", "Wert ÷ Vorjahreswert − 1"), cur, a.start, a.end);
      }
    }
  };
  growth("revenue", "revenueGrowth");
  growth("marketing", "marketingGrowth");
  return s;
}

// Latest available period for the scatter (LTM before FY2025 before FY2024).
export function latestPoint(series: Partial<Record<PeriodKey, MetricPoint>>, prefer: PeriodKey[] = ["LTM", "FY2025", "FY2024", "FY2023"]) {
  for (const p of prefer) {
    const v = series[p];
    if (v && v.value !== null) return { period: p, point: v };
  }
  return null;
}
