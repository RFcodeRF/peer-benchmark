"use client";

import { useState } from "react";
import type { CheckResult, SearchHit } from "@/lib/live";
import type { Label, LivePeer, MetricPoint, Peer, PeerSeries, ScoreEntry } from "@/lib/types";
import { CRITERIA, SCORE_OPTIONS, formatScore, ruleSentences, totalScore } from "@/lib/score";
import { periodLabel } from "@/lib/finance";
import { mio, pct } from "@/lib/format";
import { useSelection } from "./SelectionProvider";
import { LabelBadge, Notice } from "./ui";

export interface Candidate {
  id: string;
  name: string;
  aliases: string[];
  country: string;
  k1?: number;
  k2?: number;
  k3?: number;
  k4?: number;
  sentences: [string, string];
  rationale?: ScoreEntry["rationale"];
  excluded?: boolean;
}

type K = Pick<ScoreEntry, "k1" | "k2" | "k3" | "k4">;
type FyKey = "FY2023" | "FY2024" | "FY2025";
const FY_KEYS: FyKey[] = ["FY2023", "FY2024", "FY2025"];
type ManualRow = { revenue: string; ebit: string; da: string; marketing: string };
const emptyRows = (): Record<FyKey, ManualRow> => ({
  FY2023: { revenue: "", ebit: "", da: "", marketing: "" },
  FY2024: { revenue: "", ebit: "", da: "", marketing: "" },
  FY2025: { revenue: "", ebit: "", da: "", marketing: "" },
});
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// German number input: "1.234,5" or "1234.5" or "12,5".
function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// Fiscal year dates for a manual entry: the year counts where most of its months fall.
function manualDates(key: FyKey, endMonth: number) {
  const fy = Number(key.slice(2));
  const endYear = endMonth >= 6 ? fy : fy + 1;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(new Date(Date.UTC(endYear - 1, endMonth, 1))), end: iso(new Date(Date.UTC(endYear, endMonth, 0))) };
}

interface EffPeriod {
  key: FyKey;
  start: string;
  end: string;
  revenue: number;
  ebit: number | null;
  da: number | null;
  marketing: number | null;
  origin: "auto" | "manual";
}
type ScoreOrigin = "KI-Vorschlag" | "Vorbereitete Einschätzung" | "Manuell";

function findCandidate(cands: Candidate[], text: string) {
  const t = text.toLowerCase();
  return cands.find((c) => c.aliases.some((a) => t.includes(a) || a.includes(t.trim())) && t.trim().length >= 3) ?? null;
}

export function LiveCheck({ candidates }: { candidates: Candidate[] }) {
  const sel = useSelection();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [manual, setManual] = useState(false);
  const [k, setK] = useState<K>({ k1: 0.5, k2: 0.5, k3: 0.5, k4: 0.5 });
  const [origin, setOrigin] = useState<ScoreOrigin>("Manuell");
  const [sentences, setSentences] = useState<[string, string] | null>(null);
  const [rationale, setRationale] = useState<ScoreEntry["rationale"] | null>(null);
  const [edited, setEdited] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Candidate | null>(null);
  const [rows, setRows] = useState<Record<FyKey, ManualRow>>(emptyRows());
  const [endMonth, setEndMonth] = useState(12);
  const [manualSource, setManualSource] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);

  const resetResult = () => {
    setResult(null);
    setManual(false);
    setError(null);
    setSentences(null);
    setRationale(null);
    setEdited(false);
    setAdded(null);
    setExcluded(null);
    setRows(emptyRows());
    setEndMonth(12);
    setManualSource("");
    setEntryOpen(false);
  };

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    resetResult();
    setHits(null);
    const cand = findCandidate(candidates, q);
    if (cand?.excluded) {
      setExcluded(cand);
      return;
    }
    setBusy("Suche läuft …");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results: SearchHit[]; notes: string[] };
      setHits(data.results);
      setNotes(data.notes);
    } catch {
      setError("Die Suche ist gerade nicht erreichbar.");
    } finally {
      setBusy(null);
    }
  }

  function applyPrepared(name: string): boolean {
    const cand = findCandidate(candidates, name) ?? findCandidate(candidates, q);
    if (!cand || cand.excluded || cand.k1 === undefined) return false;
    setK({ k1: cand.k1!, k2: cand.k2!, k3: cand.k3!, k4: cand.k4! });
    setSentences(cand.sentences);
    setRationale(cand.rationale ?? null);
    setOrigin("Vorbereitete Einschätzung");
    return true;
  }

  async function check(hit: SearchHit) {
    resetResult();
    setBusy(`Prüfe ${hit.name} bei ${hit.source} …`);
    try {
      const res = await fetch(`/api/check?source=${encodeURIComponent(hit.source)}&id=${encodeURIComponent(hit.id)}`);
      const data = (await res.json()) as { result?: CheckResult; error?: string };
      if (!data.result) {
        setError(data.error ?? "Prüfung fehlgeschlagen.");
        return;
      }
      setResult(data.result);
      setEntryOpen(data.result.periods.length === 0 || data.result.periods.every((p) => p.ebit === null || p.da === null));
      setManualSource(data.result.annualReports[0]?.url ?? data.result.sourceUrl);
      setBusy("Score wird vorgeschlagen …");
      const sc = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: data.result.name, country: data.result.country, description: data.result.description, sic: data.result.sic }),
      })
        .then((r) => r.json())
        .catch(() => ({ available: false }));
      if (sc.available && sc.suggestion) {
        setK({ k1: sc.suggestion.k1, k2: sc.suggestion.k2, k3: sc.suggestion.k3, k4: sc.suggestion.k4 });
        setSentences(sc.suggestion.sentences);
        setRationale(sc.suggestion.rationale ?? null);
        setOrigin("KI-Vorschlag");
      } else if (!applyPrepared(data.result.name)) {
        setOrigin("Manuell");
        setK({ k1: 0.5, k2: 0.5, k3: 0.5, k4: 0.5 });
      }
    } catch {
      setError("Quelle antwortet nicht.");
    } finally {
      setBusy(null);
    }
  }

  function startManual() {
    resetResult();
    setManual(true);
    setEntryOpen(true);
    if (!applyPrepared(q)) setOrigin("Manuell");
  }

  function setCell(key: FyKey, field: keyof ManualRow, v: string) {
    setRows((r) => ({ ...r, [key]: { ...r[key], [field]: v } }));
  }

  function setCriterion(key: keyof K, v: number) {
    setK((s) => ({ ...s, [key]: v }));
    setEdited(true);
  }

  const name = result?.name ?? (manual ? q.trim() : "");
  const shownSentences: [string, string] = edited || !sentences ? ruleSentences(name || "Das Unternehmen", k) : sentences;
  const badge = edited ? "Manuell" : origin;

  // Manual values replace automatic ones for the same fiscal year.
  const eff: EffPeriod[] = FY_KEYS.flatMap((key): EffPeriod[] => {
    const m = rows[key];
    const rev = parseNum(m.revenue);
    const auto = result?.periods.find((p) => p.key === key);
    if (rev !== null && rev > 0) {
      const dates = auto ? { start: auto.start, end: auto.end } : manualDates(key, endMonth);
      return [{ key, ...dates, revenue: rev, ebit: parseNum(m.ebit), da: parseNum(m.da), marketing: parseNum(m.marketing), origin: "manual" }];
    }
    return auto && auto.revenue ? [{ key, start: auto.start, end: auto.end, revenue: auto.revenue, ebit: auto.ebit, da: auto.da, marketing: null, origin: "auto" }] : [];
  });
  const usable = eff.filter((e) => (e.ebit !== null && e.da !== null) || e.marketing !== null);
  const manualCount = eff.filter((e) => e.origin === "manual").length;
  const currency = result?.currency ?? "";
  const tab1Ok = Boolean(result?.tab1.eligible) || usable.length > 0;
  const tab2Ok = Boolean(result?.tab2.eligible);

  function addToGroup() {
    if (!result && !manual) return;
    const srcName = result ? result.source : "Manuell";
    const name0 = result ? result.name : q.trim();
    const id = `live-${srcName.replace(/\s/g, "").toLowerCase()}-${name0.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const series: PeerSeries = { peerId: id, marketingMargin: {}, ebitdaAdjMargin: {}, ebitdaUnadjMargin: {}, revenueGrowth: {}, marketingGrowth: {} };
    const today = new Date().toISOString().slice(0, 10);
    for (const e of eff) {
      const isManual = e.origin === "manual";
      const label: Label = isManual ? "Manuell" : "Automatisch erfasst";
      const base = {
        label,
        title: isManual ? `Manuell eingetragen: ${name0}` : `${srcName}: ${name0}`,
        url: isManual ? manualSource || result?.sourceUrl : result?.sourceUrl,
        asOf: today,
      };
      const periodLbl = periodLabel(e.key, e.start, e.end);
      if (e.ebit !== null && e.da !== null) {
        const src = {
          ...base,
          formula: `(EBIT ${e.ebit.toLocaleString("de-DE")} + Abschreibungen ${e.da.toLocaleString("de-DE")}) ÷ Umsatz ${e.revenue.toLocaleString("de-DE")}`,
          note: isManual ? "Vom Nutzer aus dem Abschluss eingetragen, nicht geprüft. Keine Bereinigungen erfasst." : "Live abgerufen, nicht manuell geprüft. Keine Bereinigungen erfasst.",
        };
        const pt: MetricPoint = { value: (e.ebit + e.da) / e.revenue, source: src, periodLabel: periodLbl, periodEnd: e.end };
        series.ebitdaUnadjMargin[e.key] = pt;
        series.ebitdaAdjMargin[e.key] = { ...pt, source: { ...src, note: src.note + " Die bereinigte Sicht zeigt den unbereinigten Wert." } };
      }
      if (e.marketing !== null) {
        series.marketingMargin[e.key] = {
          value: (e.revenue - e.marketing) / e.revenue,
          source: {
            ...base,
            formula: `(Umsatz ${e.revenue.toLocaleString("de-DE")} − Marketing ${e.marketing.toLocaleString("de-DE")}) ÷ Umsatz`,
            note: "Marketingaufwand vom Nutzer eingetragen, mit der Abgrenzung des Abschlusses; nicht geprüft.",
          },
          periodLabel: periodLbl,
          periodEnd: e.end,
        };
      }
    }
    const hasMm = Object.keys(series.marketingMargin).length > 0;
    const peer: Peer = {
      id,
      name: name0,
      shortName: name0.replace(/,?\s+(inc\.?|ltd\.?|limited|plc|se|s\.?a\.?|s\.?a\.?s\.?|n\.?v\.?|ag|gmbh|corp\.?|corporation|holdings?)$/i, ""),
      country: result?.country || "–",
      countryCode: "",
      business: result?.sic || (result ? "Live geprüft" : "Manuell erfasst"),
      listed: result?.listed ?? false,
      exchange: result?.exchange ?? null,
      ticker: result?.ticker ?? null,
      identifiers: result ? { [result.source]: result.sourceUrl } : {},
      currency: currency || "–",
      fyEnd: manualCount > 0 ? MONTHS[endMonth - 1] : "–",
      cadence: "Jahr",
      tab1: {
        eligible: tab1Ok,
        scope: hasMm ? "voll" : "nur EBITDA",
        reason: result ? result.tab1.reason + (manualCount ? `; ${manualCount} Jahre manuell ergänzt` : "") : `${manualCount} Jahre manuell eingetragen`,
      },
      tab2: { eligible: tab2Ok, travel: false, reason: result ? result.tab2.reason : "Nicht automatisch prüfbar; Beta nicht live verfügbar" },
      defaultOn: { tab1: false, tab2: false },
      betaQuality: result?.listed ? "Eine Einschränkung" : "Nicht börsennotiert",
      betaNote: result?.listed ? "Beta nicht live verfügbar: Die App ruft keine Kursdaten ab." : "Kein Beta: nicht börsennotiert oder nicht automatisch prüfbar.",
      taxRate: 0.25,
      index: null,
      live: true,
    };
    const score: ScoreEntry = {
      ...k,
      sentences: shownSentences,
      rationale: rationale && !edited ? rationale : { k1: "Vom Nutzer gesetzt.", k2: "Vom Nutzer gesetzt.", k3: "Vom Nutzer gesetzt.", k4: "Vom Nutzer gesetzt." },
      origin: badge,
      confirmed: true,
    };
    const summary = result ? `${result.tab1.reason}. ${result.tab2.reason}.` : `${manualCount} Jahre manuell eingetragen.`;
    const lp: LivePeer = { peer, score, series, checkSummary: summary, source: srcName };
    sel.addLive(lp);
    setAdded(peer.shortName);
  }

  const verdict = tab1Ok && tab2Ok ? "Margen und Eigenkapitalkosten" : tab1Ok ? "Nur Margen" : result ? "Nicht hinzufügbar" : "Zahlen eintragen";

  return (
    <div className="card p-4">
      <h2 className="text-base font-bold">Neuen Peer live prüfen</h2>
      <p className="text-sm text-[var(--text-2)] mt-1">
        Name oder Ticker eingeben. Das Tool sucht bei der SEC, bei filings.xbrl.org (ESEF) und bei Companies House, prüft die Abschlüsse und schlägt einen Score vor. Live geprüfte Peers bleiben nur in dieser Sitzung.
      </p>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="z. B. QuinStreet, Scout24, Selectra"
          className="field flex-1 min-w-0 px-3 py-2 text-sm"
          aria-label="Unternehmen suchen"
        />
        <button type="submit" disabled={Boolean(busy)} className="btn-primary px-5 py-2 text-sm disabled:opacity-50">
          Suchen
        </button>
      </form>

      {busy && <div className="mt-3 text-sm text-[var(--text-2)]" role="status">{busy}</div>}
      {error && (
        <div className="mt-3">
          <Notice tone="warn">{error}</Notice>
        </div>
      )}
      {excluded && (
        <div className="mt-3">
          <Notice>{excluded.sentences.join(" ")}</Notice>
        </div>
      )}

      {hits && !result && !manual && (
        <div className="mt-3 space-y-2">
          {hits.length === 0 && <div className="text-sm text-[var(--text-2)]">Keine Treffer in den automatischen Quellen.</div>}
          {hits.map((h) => (
            <button
              key={h.source + h.id}
              type="button"
              onClick={() => check(h)}
              className="w-full text-left rounded-[3px] border border-[var(--line)] px-3 py-2 hover:border-[var(--blue)]"
            >
              <div className="text-sm font-medium">{h.name}</div>
              <div className="text-xs text-[var(--text-2)]">
                {h.source} · {h.detail}
              </div>
            </button>
          ))}
          <button type="button" onClick={startManual} className="w-full text-left rounded-[3px] border border-dashed border-[var(--line)] px-3 py-2 hover:border-[var(--blue)]">
            <div className="text-sm font-medium">Nicht gefunden oder französisches Unternehmen</div>
            <div className="text-xs text-[var(--text-2)]">Score per Auswahl setzen; Zahlen aus dem Abschluss manuell eintragen</div>
          </button>
          {notes.length > 0 && (
            <ul className="text-xs text-[var(--text-3)] list-disc pl-4">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(result || manual) && (
        <div className="mt-4 rounded-[3px] border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold">{name}</div>
            <div className="text-sm">
              Ergebnis: <span className="font-bold">{verdict}</span>
            </div>
          </div>

          {result && (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs font-bold text-[var(--text-2)]">Margen</div>
                <div>{result.tab1.eligible ? "Geeignet" : "Nicht geeignet"}: {result.tab1.reason}.</div>
                <div className="text-xs text-[var(--text-3)]">Automatisch wird nur die EBITDA-Marge übernommen; eine Marketingmarge entsteht nur aus manuell eingetragenem Marketingaufwand.</div>
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--text-2)]">Eigenkapitalkosten</div>
                <div>{result.tab2.eligible ? "Geeignet" : "Nicht geeignet"}: {result.tab2.reason}.</div>
              </div>
            </div>
          )}
          {manual && (
            <div className="mt-2">
              <Notice tone="warn">
                Für dieses Unternehmen gibt es keine automatische Abfrage (z. B. Frankreich, Pappers nicht eingerichtet). Zahlen aus dem Abschluss unten eintragen; mit mindestens einem Geschäftsjahr ist der Peer für die Margen hinzufügbar.
              </Notice>
            </div>
          )}

          {result && result.periods.length > 0 && (
            <div className="mt-3 scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>Periode</th>
                    <th className="num">Umsatz</th>
                    <th className="num">EBITDA-Marge (unbereinigt)</th>
                    <th>Marketingzeile gefunden</th>
                  </tr>
                </thead>
                <tbody>
                  {result.periods.map((p) => (
                    <tr key={p.key}>
                      <td>{periodLabel(p.key, p.start, p.end)}</td>
                      <td className="num">{mio(p.revenue, result.currency)}</td>
                      <td className="num">{p.revenue && p.ebit !== null && p.da !== null ? pct((p.ebit + p.da) / p.revenue) : "–"}</td>
                      <td className="text-xs">{p.marketing ? `${p.marketing.tag}: ${mio(p.marketing.value, result.currency)} (Abgrenzung ungeprüft)` : "keine"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-2)]">
                <LabelBadge label="Automatisch erfasst" /> Live abgerufen, nicht manuell geprüft.
              </div>
            </div>
          )}
          {result && result.messages.length > 0 && (
            <ul className="mt-2 text-xs text-[var(--text-2)] list-disc pl-4">
              {result.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {result && result.annualReports.length > 0 && (
            <div className="mt-2 text-xs text-[var(--text-2)]">
              Gefundene Jahresabschlüsse:{" "}
              {result.annualReports.map((a, i) => (
                <span key={a.url + i}>
                  {i > 0 && ", "}
                  <a className="link" href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.form} {a.year}
                  </a>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-[3px] border border-[var(--line)]">
            <button
              type="button"
              onClick={() => setEntryOpen((o) => !o)}
              aria-expanded={entryOpen}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm font-bold"
            >
              <span>
                Zahlen manuell eintragen
                {manualCount > 0 && <span className="ml-2 font-normal text-[var(--text-2)]">({manualCount} {manualCount === 1 ? "Jahr" : "Jahre"} eingetragen)</span>}
              </span>
              <span aria-hidden className="text-[var(--blue)]">{entryOpen ? "▲" : "▼"}</span>
            </button>
            {entryOpen && (
              <div className="px-3 pb-3">
                <p className="text-xs text-[var(--text-2)]">
                  Aus dem verlinkten Abschluss, in Millionen{currency ? ` ${currency}` : " (Originalwährung)"}, Komma oder Punkt als Dezimalzeichen. Ein eingetragenes Jahr ersetzt die automatischen Werte dieses Jahres. Marketing ist optional; daraus entsteht die Marketingmarge. Label „Manuell“.
                </p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-2)]">Geschäftsjahr endet im</span>
                  <select value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value))} className="field px-2 py-1 text-sm">
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="scroll-x mt-2">
                  <table className="data min-w-[560px]">
                    <thead>
                      <tr>
                        <th>Geschäftsjahr</th>
                        <th className="num">Umsatz</th>
                        <th className="num">EBIT</th>
                        <th className="num">Abschreibungen</th>
                        <th className="num">Marketing</th>
                        <th className="num">EBITDA-Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FY_KEYS.map((key) => {
                        const e = eff.find((x) => x.key === key);
                        const dates = e ?? manualDates(key, endMonth);
                        return (
                          <tr key={key}>
                            <td className="whitespace-nowrap text-xs">
                              {periodLabel(key, dates.start, dates.end)}
                              {e && <div className="mt-0.5"><LabelBadge label={e.origin === "manual" ? "Manuell" : "Automatisch erfasst"} /></div>}
                            </td>
                            {(["revenue", "ebit", "da", "marketing"] as const).map((f) => (
                              <td key={f} className="num">
                                <input
                                  inputMode="decimal"
                                  value={rows[key][f]}
                                  onChange={(ev) => setCell(key, f, ev.target.value)}
                                  placeholder={e && e.origin === "auto" && f !== "marketing" ? String((f === "revenue" ? e.revenue : f === "ebit" ? e.ebit : e.da) ?? "").replace(".", ",").slice(0, 8) : ""}
                                  aria-label={`${periodLabel(key, dates.start, dates.end)} ${f === "revenue" ? "Umsatz" : f === "ebit" ? "EBIT" : f === "da" ? "Abschreibungen" : "Marketing"}`}
                                  className="field w-24 px-2 py-1 text-right text-sm tabular"
                                />
                              </td>
                            ))}
                            <td className="num">{e && e.ebit !== null && e.da !== null ? pct((e.ebit + e.da) / e.revenue) : "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <label className="mt-2 block text-sm">
                  <span className="text-xs text-[var(--text-2)]">Quelle (Link zum Abschluss)</span>
                  <input value={manualSource} onChange={(e) => setManualSource(e.target.value)} placeholder="https://…" className="field mt-0.5 w-full px-2 py-1.5 text-sm" />
                </label>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-bold">Eignungs-Score {formatScore(totalScore(k))}</div>
              <LabelBadge label={badge} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <label key={c.key} className="text-sm">
                  <span className="block text-xs text-[var(--text-2)]">{c.name}</span>
                  <select
                    value={k[c.key]}
                    onChange={(e) => setCriterion(c.key, Number(e.target.value))}
                    className="field mt-0.5 w-full px-2 py-1.5 text-sm"
                  >
                    {SCORE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {formatScore(o).replace(",0", "")}: {c.levels[o]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm">{shownSentences[0]}</p>
            <p className="text-sm mt-1">{shownSentences[1]}</p>
            {origin === "Manuell" && !edited && (
              <p className="mt-1 text-xs text-[var(--text-3)]">Kein KI-Vorschlag verfügbar: Bitte K1 bis K4 setzen. Die Sätze entstehen aus der Regel.</p>
            )}
          </div>

          {(result || manual) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addToGroup}
                disabled={!tab1Ok && !tab2Ok}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
              >
                {badge === "KI-Vorschlag" ? "Vorschlag bestätigen und hinzufügen" : "Zur Peer-Gruppe hinzufügen"}
              </button>
              {added && <span className="text-sm text-[var(--good)]">✓ {added} ist für diese Sitzung in der Peer-Gruppe.</span>}
              {!tab1Ok && !tab2Ok && <span className="text-xs text-[var(--text-2)]">Erst Zahlen für mindestens ein Geschäftsjahr eintragen.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
