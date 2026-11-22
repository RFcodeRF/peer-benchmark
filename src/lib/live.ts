// Server-only helpers for the live check of new candidates.
// Sources: SEC EDGAR (US filers), filings.xbrl.org (ESEF, EU), Companies House (UK).

export interface SearchHit {
  source: "SEC" | "ESEF" | "Companies House";
  id: string;
  name: string;
  country: string;
  detail: string;
}

export interface LivePeriod {
  key: "FY2023" | "FY2024" | "FY2025";
  start: string;
  end: string;
  revenue: number | null;
  ebit: number | null;
  da: number | null;
  marketing: { tag: string; value: number } | null;
}

export interface CheckResult {
  name: string;
  source: SearchHit["source"];
  sourceUrl: string;
  country: string;
  listed: boolean;
  exchange: string | null;
  ticker: string | null;
  currency: string;
  annualReports: { year: string; url: string; form: string }[];
  tab1: { eligible: boolean; reason: string; scope: "voll" | "nur EBITDA" };
  tab2: { eligible: boolean; reason: string };
  periods: LivePeriod[];
  description: string;
  sic: string;
  messages: string[];
}

const TIMEOUT_MS = 15000;

function ua() {
  const email = process.env.SEC_CONTACT_EMAIL || "kontakt@example.com";
  return `Peer-Benchmark Bewerbungsprojekt ${email}`;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}, revalidate = 3600): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": ua(), Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} antwortet mit ${res.status}`);
  return (await res.json()) as T;
}

// Fiscal year key by the calendar year that holds most of its months (ties go to the end year).
export function fyKey(start: string, end: string): LivePeriod["key"] | null {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const monthsInEndYear = e.getUTCMonth() + 1;
  const year = monthsInEndYear >= 6 ? e.getUTCFullYear() : e.getUTCFullYear() - 1;
  void s;
  const key = `FY${year}`;
  return key === "FY2023" || key === "FY2024" || key === "FY2025" ? key : null;
}

function days(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
}

// ---------- SEC ----------

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export async function searchSec(q: string): Promise<SearchHit[]> {
  const data = await getJson<Record<string, TickerEntry>>("https://www.sec.gov/files/company_tickers.json", {}, 86400);
  const needle = q.trim().toLowerCase();
  const all = Object.values(data);
  const exact = all.filter((e) => e.ticker.toLowerCase() === needle);
  const byName = all.filter((e) => e.title.toLowerCase().includes(needle) && !exact.includes(e));
  const seen = new Set<number>();
  return [...exact, ...byName]
    .filter((e) => (seen.has(e.cik_str) ? false : (seen.add(e.cik_str), true)))
    .slice(0, 5)
    .map((e) => ({
      source: "SEC" as const,
      id: String(e.cik_str).padStart(10, "0"),
      name: e.title,
      country: "",
      detail: `Ticker ${e.ticker} · CIK ${e.cik_str}`,
    }));
}

interface Submissions {
  name: string;
  tickers: string[];
  exchanges: string[];
  sicDescription: string;
  addresses?: { business?: { stateOrCountryDescription?: string } };
  filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[]; reportDate: string[] } };
}

interface FactUnit {
  start?: string;
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

type Facts = { facts: Record<string, Record<string, { units: Record<string, FactUnit[]> }>> };

function annualValues(facts: Facts, taxonomy: string, concepts: string[]): { concept: string; unit: string; rows: FactUnit[] } | null {
  const tax = facts.facts[taxonomy];
  if (!tax) return null;
  for (const c of concepts) {
    const entry = tax[c];
    if (!entry) continue;
    for (const [unit, rows] of Object.entries(entry.units)) {
      const annual = rows.filter((r) => r.start && days(r.start, r.end) > 350 && days(r.start, r.end) < 380 && /^(10-K|20-F|40-F)/.test(r.form));
      if (annual.length) {
        // Latest filing wins for each period end
        const byEnd = new Map<string, FactUnit>();
        for (const r of annual.sort((a, b) => a.filed.localeCompare(b.filed))) byEnd.set(r.end, r);
        return { concept: c, unit, rows: Array.from(byEnd.values()) };
      }
    }
  }
  return null;
}

const SEC_CONCEPTS = {
  "us-gaap": {
    revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
    ebit: ["OperatingIncomeLoss"],
    da: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAmortizationAndOther"],
    marketing: ["MarketingAndAdvertisingExpense", "AdvertisingExpense", "MarketingExpense", "SellingAndMarketingExpense"],
  },
  "ifrs-full": {
    revenue: ["Revenue", "RevenueFromContractsWithCustomers"],
    ebit: ["ProfitLossFromOperatingActivities"],
    da: ["DepreciationAndAmortisationExpense", "DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"],
    marketing: ["SellingExpense", "DistributionCosts"],
  },
} as const;

async function secDescription(cik: string, sub: Submissions): Promise<string> {
  const r = sub.filings.recent;
  const i = r.form.findIndex((f) => f === "10-K" || f === "20-F");
  if (i < 0) return "";
  const acc = r.accessionNumber[i].replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${r.primaryDocument[i]}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    const m = text.search(/Item\s*1\.?\s*Business(?!\s*Combination)/gi);
    const all = Array.from(text.matchAll(/Item\s*1\.?\s*Business/gi)).map((x) => x.index ?? 0);
    const start = all.length > 1 ? all[1] : m;
    return start >= 0 ? text.slice(start, start + 6000) : text.slice(0, 4000);
  } catch {
    return "";
  }
}

export async function checkSec(cik: string, withDescription: boolean): Promise<CheckResult> {
  const id = cik.padStart(10, "0");
  const [sub, facts] = await Promise.all([
    getJson<Submissions>(`https://data.sec.gov/submissions/CIK${id}.json`),
    getJson<Facts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${id}.json`).catch(() => null),
  ]);
  const r = sub.filings.recent;
  const annualReports: CheckResult["annualReports"] = [];
  r.form.forEach((f, i) => {
    if (/^(10-K|20-F|40-F)$/.test(f) && r.filingDate[i] <= "2026-11-22" && annualReports.length < 4) {
      annualReports.push({
        year: (r.reportDate[i] || r.filingDate[i]).slice(0, 4),
        form: f,
        url: `https://www.sec.gov/Archives/edgar/data/${Number(id)}/${r.accessionNumber[i].replace(/-/g, "")}/${r.primaryDocument[i]}`,
      });
    }
  });

  const messages: string[] = [];
  const periods: LivePeriod[] = [];
  let currency = "USD";
  if (facts) {
    const tax = facts.facts["us-gaap"] ? "us-gaap" : "ifrs-full";
    const c = SEC_CONCEPTS[tax];
    const rev = annualValues(facts, tax, [...c.revenue]);
    const ebit = annualValues(facts, tax, [...c.ebit]);
    const da = annualValues(facts, tax, [...c.da]);
    const mk = annualValues(facts, tax, [...c.marketing]);
    if (rev) currency = rev.unit;
    for (const row of rev?.rows ?? []) {
      const key = fyKey(row.start as string, row.end);
      if (!key || periods.some((p) => p.key === key)) continue;
      const find = (x: typeof ebit) => x?.rows.find((v) => v.end === row.end)?.val ?? null;
      const m = mk?.rows.find((v) => v.end === row.end);
      periods.push({
        key,
        start: row.start as string,
        end: row.end,
        revenue: row.val / 1e6,
        ebit: find(ebit) !== null ? (find(ebit) as number) / 1e6 : null,
        da: find(da) !== null ? (find(da) as number) / 1e6 : null,
        marketing: m ? { tag: mk!.concept, value: m.val / 1e6 } : null,
      });
    }
    periods.sort((a, b) => a.key.localeCompare(b.key));
    if (!periods.length) messages.push("Keine Jahreswerte in den XBRL-Daten gefunden.");
    if (periods.length && periods.every((p) => p.da === null)) messages.push("Abschreibungen nicht als eigene XBRL-Kennzahl gefunden; EBITDA-Marge daher nicht automatisch berechenbar.");
  } else {
    messages.push("XBRL-Finanzdaten der SEC nicht abrufbar.");
  }

  const listed = sub.exchanges.some(Boolean) && sub.tickers.length > 0;
  const enough = annualReports.length >= 2;
  const description = withDescription ? await secDescription(id, sub) : "";
  return {
    name: sub.name,
    source: "SEC",
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${id}&type=10-K`,
    country: sub.addresses?.business?.stateOrCountryDescription ?? "USA",
    listed,
    exchange: sub.exchanges[0] ?? null,
    ticker: sub.tickers[0] ?? null,
    currency,
    annualReports,
    tab1: enough
      ? { eligible: true, reason: `${annualReports.length} Jahresabschlüsse bei der SEC gefunden`, scope: "nur EBITDA" }
      : { eligible: false, reason: "Weniger als zwei Jahresabschlüsse bei der SEC", scope: "nur EBITDA" },
    tab2: listed
      ? { eligible: true, reason: `Börsennotiert (${sub.exchanges[0]} ${sub.tickers[0]}); Beta nicht live verfügbar` }
      : { eligible: false, reason: "Kein Börsenticker gefunden" },
    periods,
    description,
    sic: sub.sicDescription ?? "",
    messages,
  };
}

// ---------- ESEF via filings.xbrl.org ----------

interface XbrlFilingsResponse {
  data: { id: string; attributes: { period_end: string; country: string; json_url?: string; report_url?: string; viewer_url?: string }; relationships?: { entity?: { data?: { id: string } } } }[];
  included?: { id: string; type: string; attributes: { name: string; identifier: string } }[];
}

const XBRL = "https://filings.xbrl.org";

export async function searchEsef(q: string): Promise<SearchHit[]> {
  const filter = JSON.stringify([{ name: "entity.name", op: "ilike", val: `%${q.trim()}%` }]);
  const url = `${XBRL}/api/filings?filter=${encodeURIComponent(filter)}&include=entity&sort=-period_end&page[size]=50`;
  const res = await getJson<XbrlFilingsResponse>(url);
  const entities = new Map<string, { name: string; lei: string; country: string; years: Set<string> }>();
  for (const f of res.data) {
    const eid = f.relationships?.entity?.data?.id;
    const ent = res.included?.find((x) => x.type === "entity" && x.id === eid);
    if (!ent) continue;
    const e = entities.get(ent.attributes.identifier) ?? { name: ent.attributes.name, lei: ent.attributes.identifier, country: f.attributes.country, years: new Set<string>() };
    e.years.add(f.attributes.period_end.slice(0, 4));
    entities.set(ent.attributes.identifier, e);
  }
  return Array.from(entities.values())
    .slice(0, 5)
    .map((e) => ({
      source: "ESEF" as const,
      id: e.lei,
      name: e.name,
      country: e.country,
      detail: `LEI ${e.lei} · Berichte ${Array.from(e.years).sort().join(", ")}`,
    }));
}

interface XbrlJson {
  facts: Record<string, { value: string; dimensions: Record<string, string> }>;
}

function xbrlAnnual(doc: XbrlJson, concepts: string[]) {
  for (const c of concepts) {
    const out: { start: string; end: string; value: number; unit: string }[] = [];
    for (const f of Object.values(doc.facts)) {
      const d = f.dimensions;
      if (d.concept !== c || !d.period?.includes("/")) continue;
      const extraDims = Object.keys(d).filter((k) => !["concept", "entity", "period", "unit", "language"].includes(k));
      if (extraDims.length) continue;
      const [s, e] = d.period.split("/");
      const start = s.slice(0, 10);
      const endD = new Date(e.slice(0, 10) + "T00:00:00Z");
      if (e.includes("T00:00:00")) endD.setUTCDate(endD.getUTCDate() - 1);
      const end = endD.toISOString().slice(0, 10);
      if (days(start, end) < 350 || days(start, end) > 380) continue;
      out.push({ start, end, value: Number(f.value), unit: (d.unit || "").replace("iso4217:", "") });
    }
    if (out.length) return out;
  }
  return [];
}

export async function checkEsef(lei: string): Promise<CheckResult> {
  const filter = JSON.stringify([{ name: "entity.identifier", op: "eq", val: lei }]);
  const res = await getJson<XbrlFilingsResponse>(`${XBRL}/api/filings?filter=${encodeURIComponent(filter)}&include=entity&sort=-period_end&page[size]=20`);
  const name = res.included?.find((x) => x.type === "entity")?.attributes.name ?? lei;
  const byYear = new Map<string, XbrlFilingsResponse["data"][number]>();
  for (const f of res.data) {
    const y = f.attributes.period_end.slice(0, 4);
    if (!byYear.has(y) && f.attributes.period_end <= "2026-11-22") byYear.set(y, f);
  }
  const annualReports = Array.from(byYear.entries())
    .slice(0, 4)
    .map(([year, f]) => ({ year, form: "ESEF", url: XBRL + (f.attributes.viewer_url || f.attributes.report_url || "") }));
  const messages: string[] = [];
  const periods: LivePeriod[] = [];
  let currency = "EUR";
  const latest = res.data.find((f) => f.attributes.json_url);
  if (latest?.attributes.json_url) {
    try {
      const doc = await getJson<XbrlJson>(XBRL + latest.attributes.json_url);
      const rev = xbrlAnnual(doc, ["ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"]);
      const ebit = xbrlAnnual(doc, ["ifrs-full:ProfitLossFromOperatingActivities"]);
      const da = xbrlAnnual(doc, ["ifrs-full:DepreciationAndAmortisationExpense", "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"]);
      const mk = xbrlAnnual(doc, ["ifrs-full:SellingExpense", "ifrs-full:DistributionCosts"]);
      if (rev[0]) currency = rev[0].unit || currency;
      for (const r of rev) {
        const key = fyKey(r.start, r.end);
        if (!key || periods.some((p) => p.key === key)) continue;
        const f = (arr: typeof rev) => arr.find((x) => x.end === r.end)?.value ?? null;
        const m = mk.find((x) => x.end === r.end);
        periods.push({
          key,
          start: r.start,
          end: r.end,
          revenue: r.value / 1e6,
          ebit: f(ebit) !== null ? (f(ebit) as number) / 1e6 : null,
          da: f(da) !== null ? Math.abs(f(da) as number) / 1e6 : null,
          marketing: m ? { tag: "ifrs-full:SellingExpense", value: Math.abs(m.value) / 1e6 } : null,
        });
      }
      periods.sort((a, b) => a.key.localeCompare(b.key));
      if (!periods.length) messages.push("Im ESEF-Bericht keine Umsatzzeile ohne Segmentaufteilung gefunden.");
    } catch (e) {
      messages.push(`ESEF-Bericht nicht lesbar: ${(e as Error).message}`);
    }
  } else {
    messages.push("Kein maschinenlesbarer ESEF-Bericht gefunden.");
  }
  const enough = annualReports.length >= 2;
  return {
    name,
    source: "ESEF",
    sourceUrl: `${XBRL}/api/filings?filter=${encodeURIComponent(filter)}`,
    country: res.data[0]?.attributes.country ?? "",
    listed: true,
    exchange: "EU-Börse (ESEF-Pflicht)",
    ticker: null,
    currency,
    annualReports,
    tab1: enough
      ? { eligible: true, reason: `${annualReports.length} ESEF-Jahresberichte gefunden`, scope: "nur EBITDA" }
      : { eligible: false, reason: "Weniger als zwei ESEF-Jahresberichte auf filings.xbrl.org", scope: "nur EBITDA" },
    tab2: { eligible: true, reason: "ESEF-Berichte gibt es nur für börsennotierte Emittenten; Beta nicht live verfügbar" },
    periods,
    description: "",
    sic: "",
    messages,
  };
}

// ---------- Companies House ----------

const CH = "https://api.company-information.service.gov.uk";

function chAuth() {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;
  return { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };
}

export function companiesHouseConfigured() {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

export async function searchCompaniesHouse(q: string): Promise<SearchHit[]> {
  const auth = chAuth();
  if (!auth) return [];
  const res = await getJson<{ items?: { title: string; company_number: string; company_status: string; address_snippet?: string; company_type?: string }[] }>(
    `${CH}/search/companies?q=${encodeURIComponent(q)}&items_per_page=5`,
    auth,
  );
  return (res.items ?? []).map((i) => ({
    source: "Companies House" as const,
    id: i.company_number,
    name: i.title,
    country: "Vereinigtes Königreich",
    detail: `Nr. ${i.company_number} · ${i.company_status}${i.address_snippet ? ` · ${i.address_snippet}` : ""}`,
  }));
}

export async function checkCompaniesHouse(number: string): Promise<CheckResult> {
  const auth = chAuth();
  if (!auth) throw new Error("Companies House ist nicht eingerichtet");
  const [profile, filings] = await Promise.all([
    getJson<{ company_name: string; company_status: string; type: string; sic_codes?: string[] }>(`${CH}/company/${number}`, auth),
    getJson<{ items?: { date: string; type: string; description: string; links?: { document_metadata?: string }; description_values?: { made_up_date?: string } }[] }>(
      `${CH}/company/${number}/filing-history?category=accounts&items_per_page=10`,
      auth,
    ),
  ]);
  const accounts = (filings.items ?? []).filter((f) => f.type === "AA" && f.date <= "2026-11-22").slice(0, 4);
  const page = `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`;
  const enough = accounts.length >= 2;
  const isPlc = profile.type === "plc";
  return {
    name: profile.company_name,
    source: "Companies House",
    sourceUrl: page,
    country: "Vereinigtes Königreich",
    listed: false,
    exchange: null,
    ticker: null,
    currency: "GBP",
    annualReports: accounts.map((a) => ({ year: (a.description_values?.made_up_date ?? a.date).slice(0, 4), form: "Abschluss (AA)", url: page })),
    tab1: enough
      ? { eligible: true, reason: `${accounts.length} Abschlüsse bei Companies House gefunden; Zahlen manuell prüfen`, scope: "nur EBITDA" }
      : { eligible: false, reason: "Weniger als zwei Abschlüsse bei Companies House", scope: "nur EBITDA" },
    tab2: { eligible: false, reason: isPlc ? "plc: Börsennotierung nicht automatisch prüfbar; Beta nicht live verfügbar" : "Nicht börsennotiert (Limited)" },
    periods: [],
    description: "",
    sic: (profile.sic_codes ?? []).join(", "),
    messages: ["Abschlüsse liegen meist als PDF oder iXBRL vor; die Zahlen werden nicht automatisch übernommen."],
  };
}
