// Shared types for data files and calculations.

export type Label = "Berichtet" | "Eigene Rechnung" | "Annahme" | "Automatisch erfasst";

export type PeriodKey = "FY2023" | "FY2024" | "FY2025" | "LTM";
export const PERIODS: PeriodKey[] = ["FY2023", "FY2024", "FY2025", "LTM"];

export type RawPeriod = "FY2023" | "FY2024" | "FY2025" | "YTD" | "YTD_PRIOR" | "LTM";

export type Metric =
  | "revenue"
  | "marketing"
  | "marketing_margin"
  | "ebitda_adj"
  | "ebit"
  | "da";

export interface FinancialRow {
  peer: string;
  period: RawPeriod;
  period_start: string; // ISO date
  period_end: string; // ISO date
  metric: Metric;
  value: number; // millions in currency, or decimal for margins
  currency: string;
  label: Label;
  source_title: string;
  source_url: string;
  source_page: string;
  as_of: string; // publication date of the source
  note: string;
}

export interface Peer {
  id: string;
  name: string;
  shortName: string;
  country: string;
  countryCode: string;
  business: string;
  listed: boolean;
  exchange: string | null;
  ticker: string | null;
  identifiers: Record<string, string>;
  currency: string;
  fyEnd: string; // e.g. "Dezember"
  cadence: "Quartal" | "Halbjahr" | "Jahr";
  tab1: { eligible: boolean; scope: "voll" | "nur EBITDA"; reason: string };
  tab2: { eligible: boolean; travel: boolean; reason: string };
  defaultOn: { tab1: boolean; tab2: boolean };
  betaQuality: "Ohne Einschränkung" | "Eine Einschränkung" | "Mehrere Einschränkungen" | "Nicht börsennotiert";
  betaNote: string;
  taxRate: number; // statutory, decimal
  index: string | null;
  live?: boolean;
}

export interface ScoreEntry {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  sentences: [string, string];
  rationale: { k1: string; k2: string; k3: string; k4: string };
  origin: "Eigene Einschätzung" | "KI-Vorschlag" | "Manuell" | "Vorbereitete Einschätzung";
  confirmed: boolean;
}

export interface DefinitionEntry {
  marketing: string;
  marketingLabel: Label | "Nicht berichtet";
  ebitdaAdj: string;
  ebitdaUnadj: string;
  revenueScope: string;
  specialCases: string[];
}

export interface BetaEstimate {
  beta: number;
  r2: number;
  n: number;
  index: string;
  start: string;
  end: string;
  frequency: "wöchentlich" | "monatlich";
}

export interface BetaFile {
  meta: {
    status: "berechnet" | "ausstehend";
    priceSource: string;
    priceDate: string;
    computedAt: string;
    method: string;
  };
  peers: Record<
    string,
    {
      local_w2y?: BetaEstimate | null;
      local_m5y?: BetaEstimate | null;
      msci_w2y?: BetaEstimate | null;
      msci_m5y?: BetaEstimate | null;
    }
  >;
}

export interface CapitalStructureRow {
  peer: string;
  net_debt: number; // millions, excl. leases
  currency: string;
  balance_date: string;
  market_cap: number; // millions
  price_date: string;
  label: Label;
  source_title: string;
  source_url: string;
  source_page: string;
  note: string;
}

export interface Params {
  riskFree: { value: number; source: string; url: string; asOf: string; label: Label };
  mrp: { low: number; high: number; start: number; step: number; source: string; url: string; asOf: string; label: Label };
  targetTaxRate: { value: number; source: string; label: Label };
  matrix: { betaMin: number; betaMax: number; betaStep: number };
  blume: { weight: number; constant: number; source: string };
  minWeeks: number;
  minMonths: number;
  dataDates: { prices: string; filings: string };
  taxSources: Record<string, { rate: number; source: string; label: Label }>;
}

export interface Insight {
  title: string;
  text: string;
  status: "Entwurf" | "Freigegeben";
}

export interface SourceInfo {
  label: Label | "Nicht berichtet";
  title?: string;
  url?: string;
  page?: string;
  asOf?: string;
  note?: string;
  formula?: string;
}

export interface MetricPoint {
  value: number | null;
  source: SourceInfo;
  periodLabel: string;
  periodEnd: string;
}

export interface PeerSeries {
  peerId: string;
  marketingMargin: Partial<Record<PeriodKey, MetricPoint>>;
  ebitdaAdjMargin: Partial<Record<PeriodKey, MetricPoint>>;
  ebitdaUnadjMargin: Partial<Record<PeriodKey, MetricPoint>>;
  revenueGrowth: Partial<Record<PeriodKey, MetricPoint>>;
  marketingGrowth: Partial<Record<PeriodKey, MetricPoint>>;
}

// Live-added peer (session only)
export interface LivePeer {
  peer: Peer;
  score: ScoreEntry;
  series: PeerSeries;
  checkSummary: string;
  source: string;
}
