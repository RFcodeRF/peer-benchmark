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
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordStart = new RegExp(`(^|[^a-z0-9])${esc}`, "i");
  const byName = all.filter((e) => wordStart.test(e.title) && !exact.includes(e));
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

// Companies switch XBRL concepts over time (e.g. "Revenues" until 2018, then
// "RevenueFromContractWithCustomer…"). So we merge across concepts: for each
// period end, the first concept in priority order that reports it wins, and
// within one concept the latest filing wins.
function annualValues(
  facts: Facts,
  taxonomy: string,
  concepts: string[],
): { concept: string; unit: string; rows: (FactUnit & { concept: string })[] } | null {
  const tax = facts.facts[taxonomy];
  if (!tax) return null;
  const byEnd = new Map<string, FactUnit & { concept: string }>();
  let unit = "";
  for (const c of concepts) {
    const entry = tax[c];
    if (!entry) continue;
    for (const [u, rows] of Object.entries(entry.units)) {
      if (unit && u !== unit) continue;
      const annual = rows.filter((r) => r.start && days(r.start, r.end) > 350 && days(r.start, r.end) < 380 && /^(10-K|20-F|40-F)/.test(r.form));
      if (!annual.length) continue;
      unit = unit || u;
      const latest = new Map<string, FactUnit>();
      for (const r of annual.sort((a, b) => a.filed.localeCompare(b.filed))) latest.set(r.end, r);
      for (const [end, r] of latest) if (!byEnd.has(end)) byEnd.set(end, { ...r, concept: c });
      break;
    }
  }
  if (!byEnd.size) return null;
  const rows = Array.from(byEnd.values()).sort((a, b) => a.end.localeCompare(b.end));
  return { concept: rows[rows.length - 1].concept, unit, rows };
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
        marketing: m ? { tag: m.concept, value: m.val / 1e6 } : null,
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
  // Latest report plus the one a year earlier, so three fiscal years are covered.
  const withJson = res.data.filter((f) => f.attributes.json_url && f.attributes.period_end <= "2026-11-22");
  const latest = withJson[0];
  const prevYear = latest ? String(Number(latest.attributes.period_end.slice(0, 4)) - 1) : "";
  const previous = withJson.find((f) => f.attributes.period_end.slice(0, 4) === prevYear);
  if (latest?.attributes.json_url) {
    try {
      const docs = (await Promise.all(
        [latest, previous].filter(Boolean).map((f) => getJson<XbrlJson>(XBRL + f!.attributes.json_url).catch(() => null)),
      )).filter((d): d is XbrlJson => d !== null);
      if (!docs.length) throw new Error("Bericht nicht abrufbar");
      const pick = (concepts: string[]) => docs.flatMap((d) => xbrlAnnual(d, concepts));
      const sumOf = (a: string[], b: string[]) => {
        const x = pick(a);
        const y = pick(b);
        return x.flatMap((v) => {
          const w = y.find((z) => z.end === v.end);
          return w ? [{ ...v, value: Math.abs(v.value) + Math.abs(w.value) }] : [];
        });
      };
      const rev = pick(["ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"]);
      const ebit = pick(["ifrs-full:ProfitLossFromOperatingActivities"]);
      let da = pick([
        "ifrs-full:DepreciationAndAmortisationExpense",
        "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss",
        "ifrs-full:AdjustmentsForDepreciationAndAmortisationExpense",
        "ifrs-full:AdjustmentsForDepreciationAndAmortisationExpenseAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss",
      ]);
      if (!da.length) da = sumOf(["ifrs-full:DepreciationExpense", "ifrs-full:AdjustmentsForDepreciationExpense"], ["ifrs-full:AmortisationExpense", "ifrs-full:AdjustmentsForAmortisationExpense"]);
      const mk = pick(["ifrs-full:SellingExpense", "ifrs-full:DistributionCosts"]);
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
      if (periods.length && periods.every((p) => p.ebit === null)) messages.push("Betriebsergebnis nicht als Standard-Kennzahl getaggt; EBITDA-Marge daher nicht automatisch berechenbar.");
      else if (periods.length && periods.every((p) => p.da === null)) messages.push("Abschreibungen nicht als eigene ESEF-Kennzahl gefunden; EBITDA-Marge daher nicht automatisch berechenbar.");
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

// ---------- Companies House: digital accounts (iXBRL) ----------

const CH_DOC = "https://document-api.company-information.service.gov.uk";

interface IxFact {
  name: string; // local name without prefix
  start: string;
  end: string;
  value: number;
}

// Reads numeric facts from an inline XBRL document. Only facts with a plain
// one-year period and no dimensions (segments) are kept.
export function parseIxbrl(html: string): IxFact[] {
  const ctx = new Map<string, { start: string; end: string } | null>();
  const reCtx = /<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/gi;
  for (const m of html.matchAll(reCtx)) {
    const body = m[2];
    if (/<(?:[\w-]+:)?(segment|scenario)\b/i.test(body)) {
      ctx.set(m[1], null);
      continue;
    }
    const st = body.match(/<(?:[\w-]+:)?startDate>\s*(\d{4}-\d{2}-\d{2})/i);
    const en = body.match(/<(?:[\w-]+:)?endDate>\s*(\d{4}-\d{2}-\d{2})/i);
    ctx.set(m[1], st && en ? { start: st[1], end: en[1] } : null);
  }
  const out: IxFact[] = [];
  const reFact = /<ix:nonFraction\b([^>]*?)(?<!\/)>([\s\S]*?)<\/ix:nonFraction>/gi;
  for (const m of html.matchAll(reFact)) {
    const attrs = m[1];
    const get = (n: string) => attrs.match(new RegExp(`\\b${n}="([^"]*)"`, "i"))?.[1];
    const name = get("name");
    const c = ctx.get(get("contextRef") ?? "");
    if (!name || !c) continue;
    const len = days(c.start, c.end);
    if (len < 350 || len > 380) continue;
    const fmt = (get("format") ?? "").toLowerCase();
    const txt = m[2].replace(/<[^>]+>/g, "").replace(/[\s\u00a0]/g, "");
    let v: number;
    if (/zero|nocontent/.test(fmt) || txt === "-" || txt === "–" || txt === "") v = 0;
    else {
      let t = txt.replace(/[()£$€]/g, "");
      t = /comma-?decimal|numcommadecimal/.test(fmt) ? t.replace(/[.\s]/g, "").replace(",", ".") : t.replace(/,/g, "");
      v = Number(t);
      if (!Number.isFinite(v)) continue;
    }
    v *= Math.pow(10, Number(get("scale") ?? 0));
    if (get("sign") === "-") v = -v;
    out.push({ name: name.split(":").pop() as string, start: c.start, end: c.end, value: v });
  }
  return out;
}

const IX = {
  revenue: [/^TurnoverRevenue$/, /^Revenue$/, /^RevenueFromContractsWithCustomers$/, /^TurnoverGrossOperatingRevenue$/, /^Turnover$/],
  ebit: [/^OperatingProfitLoss$/, /^ProfitLossFromOperatingActivities$/],
  da: [
    /^DepreciationAmortisationImpairmentExpense$/,
    /^DepreciationAmortisationExpense$/,
    /^DepreciationAndAmortisationExpense$/,
    /^DepreciationAmortisationAndImpairmentLoss/,
    /^AdjustmentsForDepreciationAndAmortisationExpense/,
  ],
  dep: [/^DepreciationExpensePropertyPlantEquipment$/, /^DepreciationPropertyPlantEquipment$/, /^DepreciationTangibleFixedAssets$/, /^AdjustmentsForDepreciationExpense$/, /^DepreciationExpense$/],
  rou: [/^DepreciationRightofuseAssets$/i, /^DepreciationRightOfUseAssets$/i],
  amort: [/^AmortisationExpenseIntangibleAssets$/, /^AmortisationIntangibleAssets$/, /^AdjustmentsForAmortisationExpense$/, /^AmortisationExpense$/, /^AmortisationGoodwill$/],
  marketing: [/^AdvertisingExpense$/, /^MarketingExpense$/, /^SellingDistributionCosts$/, /^DistributionCosts$/],
};

// For each period end: the first pattern (in priority order) that has a value.
function ixPick(facts: IxFact[], patterns: RegExp[]) {
  const byEnd = new Map<string, IxFact & { tag: string }>();
  for (const re of patterns) {
    for (const f of facts) if (re.test(f.name) && !byEnd.has(f.end)) byEnd.set(f.end, { ...f, tag: f.name });
  }
  return byEnd;
}

export function ixbrlPeriods(docs: string[]): { periods: LivePeriod[]; anyRevenue: boolean } {
  const facts = docs.flatMap((d) => parseIxbrl(d)); // latest document first
  const rev = ixPick(facts, IX.revenue);
  const ebit = ixPick(facts, IX.ebit);
  const da = ixPick(facts, IX.da);
  const dep = ixPick(facts, IX.dep);
  const rou = ixPick(facts, IX.rou);
  const amort = ixPick(facts, IX.amort);
  const mk = ixPick(facts, IX.marketing);
  const periods: LivePeriod[] = [];
  for (const r of Array.from(rev.values()).sort((a, b) => b.end.localeCompare(a.end))) {
    const key = fyKey(r.start, r.end);
    if (!key || periods.some((p) => p.key === key)) continue;
    let daV: number | null = da.get(r.end) ? Math.abs(da.get(r.end)!.value) : null;
    if (daV === null && (dep.get(r.end) || amort.get(r.end))) {
      daV = Math.abs(dep.get(r.end)?.value ?? 0) + Math.abs(rou.get(r.end)?.value ?? 0) + Math.abs(amort.get(r.end)?.value ?? 0);
    }
    const m = mk.get(r.end);
    periods.push({
      key,
      start: r.start,
      end: r.end,
      revenue: r.value / 1e6,
      ebit: ebit.get(r.end) ? ebit.get(r.end)!.value / 1e6 : null,
      da: daV !== null ? daV / 1e6 : null,
      marketing: m ? { tag: m.tag, value: Math.abs(m.value) / 1e6 } : null,
    });
  }
  periods.sort((a, b) => a.key.localeCompare(b.key));
  return { periods, anyRevenue: rev.size > 0 };
}

async function chIxbrlDocument(metaUrl: string, auth: Record<string, string>): Promise<string | null> {
  const id = metaUrl.split("/document/")[1]?.split(/[/?#]/)[0];
  if (!id) return null;
  const meta = await getJson<{ resources?: Record<string, unknown> }>(`${CH_DOC}/document/${id}`, auth);
  if (!meta.resources || !("application/xhtml+xml" in meta.resources)) return null;
  const res = await fetch(`${CH_DOC}/document/${id}/content`, {
    headers: { ...auth, Accept: "application/xhtml+xml", "User-Agent": ua() },
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  let body = res;
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) return null;
    // The content lives behind a pre-signed link; it must be fetched without the API key.
    body = await fetch(loc, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  }
  if (!body.ok) return null;
  return await body.text();
}

export async function checkCompaniesHouse(number: string): Promise<CheckResult> {
  const auth = chAuth();
  if (!auth) throw new Error("Companies House ist nicht eingerichtet");
  type Filing = {
    date: string;
    type: string;
    description: string;
    transaction_id?: string;
    links?: { document_metadata?: string };
    description_values?: { made_up_date?: string };
  };
  const [profile, filings] = await Promise.all([
    getJson<{ company_name: string; company_status: string; type: string; sic_codes?: string[] }>(`${CH}/company/${number}`, auth),
    getJson<{ items?: Filing[] }>(`${CH}/company/${number}/filing-history?category=accounts&items_per_page=15`, auth),
  ]);
  const accounts = (filings.items ?? []).filter((f) => f.type === "AA" && f.date <= "2026-11-22").slice(0, 4);
  const page = `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`;
  const docUrl = (f: Filing) => (f.transaction_id ? `${page}/${f.transaction_id}/document?format=pdf&download=0` : page);
  const enough = accounts.length >= 2;
  const isPlc = profile.type === "plc";

  // Digital accounts: the latest two cover three fiscal years (each has the prior year as comparative).
  const messages: string[] = [];
  let periods: LivePeriod[] = [];
  const withMeta = accounts.filter((f) => f.links?.document_metadata).slice(0, 2);
  const docs = (await Promise.allSettled(withMeta.map((f) => chIxbrlDocument(f.links!.document_metadata!, auth)))).map((r) => (r.status === "fulfilled" ? r.value : null));
  const ix = docs.filter((d): d is string => Boolean(d));
  if (ix.length) {
    const res = ixbrlPeriods(ix);
    periods = res.periods;
    if (!res.anyRevenue) messages.push("Digitaler Abschluss ohne Umsatzzeile (z. B. Kleinstunternehmen ohne Gewinn- und Verlustrechnung). Zahlen bitte unten manuell eintragen.");
    else if (periods.every((p) => p.ebit === null || p.da === null)) messages.push("Betriebsergebnis oder Abschreibungen im digitalen Abschluss nicht gefunden; EBITDA-Marge daher nicht automatisch berechenbar. Fehlende Zahlen unten manuell eintragen.");
  } else if (accounts.length) {
    messages.push("Die Abschlüsse liegen nur als PDF vor (meist ein Scan). Die App kann sie verlinken, aber nicht zuverlässig auswerten. Zahlen bitte aus dem verlinkten PDF unten manuell eintragen.");
  }

  return {
    name: profile.company_name,
    source: "Companies House",
    sourceUrl: page,
    country: "Vereinigtes Königreich",
    listed: false,
    exchange: null,
    ticker: null,
    currency: "GBP",
    annualReports: accounts.map((a) => ({ year: (a.description_values?.made_up_date ?? a.date).slice(0, 4), form: "Abschluss", url: docUrl(a) })),
    tab1: enough
      ? {
          eligible: true,
          reason: `${accounts.length} Abschlüsse bei Companies House gefunden; ${periods.length ? "Zahlen aus dem digitalen Abschluss (iXBRL) gelesen" : "Zahlen manuell eintragen"}`,
          scope: "nur EBITDA",
        }
      : { eligible: false, reason: "Weniger als zwei Abschlüsse bei Companies House", scope: "nur EBITDA" },
    tab2: { eligible: false, reason: isPlc ? "plc: Börsennotierung nicht automatisch prüfbar; Beta nicht live verfügbar" : "Nicht börsennotiert (Limited)" },
    periods,
    description: "",
    sic: (profile.sic_codes ?? []).join(", "),
    messages,
  };
}
