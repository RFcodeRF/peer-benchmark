"use client";

import { useState } from "react";
import type { CheckResult, SearchHit } from "@/lib/live";
import type { LivePeer, MetricPoint, Peer, PeerSeries, ScoreEntry } from "@/lib/types";
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

  const resetResult = () => {
    setResult(null);
    setManual(false);
    setError(null);
    setSentences(null);
    setRationale(null);
    setEdited(false);
    setAdded(null);
    setExcluded(null);
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
    if (!applyPrepared(q)) setOrigin("Manuell");
  }

  function setCriterion(key: keyof K, v: number) {
    setK((s) => ({ ...s, [key]: v }));
    setEdited(true);
  }

  const name = result?.name ?? (manual ? q.trim() : "");
  const shownSentences: [string, string] = edited || !sentences ? ruleSentences(name || "Das Unternehmen", k) : sentences;
  const badge = edited ? "Manuell" : origin;

  function addToGroup() {
    if (!result) return;
    const id = `live-${result.source.replace(/\s/g, "").toLowerCase()}-${result.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const series: PeerSeries = { peerId: id, marketingMargin: {}, ebitdaAdjMargin: {}, ebitdaUnadjMargin: {}, revenueGrowth: {}, marketingGrowth: {} };
    for (const p of result.periods) {
      if (p.revenue && p.ebit !== null && p.da !== null) {
        const value = (p.ebit + p.da) / p.revenue;
        const src = {
          label: "Automatisch erfasst" as const,
          title: `${result.source}: ${result.name}`,
          url: result.sourceUrl,
          asOf: new Date().toISOString().slice(0, 10),
          formula: "(EBIT + Abschreibungen) ÷ Umsatz aus XBRL-Daten",
          note: "Live abgerufen, nicht manuell geprüft. Keine Bereinigungen erfasst.",
        };
        const pt: MetricPoint = { value, source: src, periodLabel: periodLabel(p.key, p.start, p.end), periodEnd: p.end };
        series.ebitdaUnadjMargin[p.key] = pt;
        series.ebitdaAdjMargin[p.key] = { ...pt, source: { ...src, note: src.note + " Die bereinigte Sicht zeigt den unbereinigten Wert." } };
      }
    }
    const peer: Peer = {
      id,
      name: result.name,
      shortName: result.name.replace(/,?\s+(inc\.?|ltd\.?|limited|plc|se|s\.?a\.?|n\.?v\.?|ag|gmbh|corp\.?|corporation|holdings?)$/i, ""),
      country: result.country || "–",
      countryCode: "",
      business: result.sic || "Live geprüft",
      listed: result.listed,
      exchange: result.exchange,
      ticker: result.ticker,
      identifiers: { [result.source]: result.sourceUrl },
      currency: result.currency,
      fyEnd: "–",
      cadence: "Jahr",
      tab1: { eligible: result.tab1.eligible, scope: "nur EBITDA", reason: result.tab1.reason + "; Marketingmarge nur aus geprüften Definitionen" },
      tab2: { eligible: result.tab2.eligible, travel: false, reason: result.tab2.reason },
      defaultOn: { tab1: false, tab2: false },
      betaQuality: result.listed ? "Eine Einschränkung" : "Nicht börsennotiert",
      betaNote: result.listed ? "Beta nicht live verfügbar: Die App ruft keine Kursdaten ab." : "Kein Beta: nicht börsennotiert.",
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
    const lp: LivePeer = { peer, score, series, checkSummary: `${result.tab1.reason}. ${result.tab2.reason}.`, source: result.source };
    sel.addLive(lp);
    setAdded(peer.shortName);
  }

  const verdict = result
    ? result.tab1.eligible && result.tab2.eligible
      ? "Reiter 1 und 2"
      : result.tab1.eligible
        ? "Nur Reiter 1"
        : "Nicht hinzufügbar"
    : null;

  return (
    <div className="card p-4">
      <h2 className="text-base font-semibold">Neuen Peer live prüfen</h2>
      <p className="text-sm text-[var(--text-2)] mt-1">
        Name oder Ticker eingeben. Das Tool sucht bei der SEC, bei filings.xbrl.org (ESEF) und bei Companies House, prüft die Abschlüsse und schlägt einen Score vor. Live geprüfte Peers bleiben nur in dieser Sitzung.
      </p>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="z. B. QuinStreet, Scout24, Selectra"
          className="flex-1 min-w-0 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
          aria-label="Unternehmen suchen"
        />
        <button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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
              className="w-full text-left rounded-lg border border-[var(--line)] px-3 py-2 hover:border-[var(--blue)]"
            >
              <div className="text-sm font-medium">{h.name}</div>
              <div className="text-xs text-[var(--text-2)]">
                {h.source} · {h.detail}
              </div>
            </button>
          ))}
          <button type="button" onClick={startManual} className="w-full text-left rounded-lg border border-dashed border-[var(--line)] px-3 py-2 hover:border-[var(--blue)]">
            <div className="text-sm font-medium">Nicht gefunden oder französisches Unternehmen</div>
            <div className="text-xs text-[var(--text-2)]">Score per Auswahl setzen; Abschlüsse manuell prüfen</div>
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
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold">{name}</div>
            <div className="text-sm">
              Ergebnis: <span className="font-semibold">{result ? verdict : "Abschlüsse manuell prüfen"}</span>
            </div>
          </div>

          {result && (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-[var(--text-2)]">Reiter 1</div>
                <div>{result.tab1.eligible ? "Geeignet" : "Nicht geeignet"}: {result.tab1.reason}.</div>
                <div className="text-xs text-[var(--text-3)]">Die Marketingmarge erscheint nur für Peers mit geprüfter Definition; live wird nur die EBITDA-Marge übernommen.</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-2)]">Reiter 2</div>
                <div>{result.tab2.eligible ? "Geeignet" : "Nicht geeignet"}: {result.tab2.reason}.</div>
              </div>
            </div>
          )}
          {manual && (
            <div className="mt-2">
              <Notice tone="warn">
                Für dieses Unternehmen gibt es keine automatische Abfrage (z. B. Frankreich, Pappers nicht eingerichtet). Abschlüsse manuell prüfen; ohne geprüfte Abschlüsse ist der Peer nicht hinzufügbar.
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

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">Eignungs-Score {formatScore(totalScore(k))}</div>
              <LabelBadge label={badge} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <label key={c.key} className="text-sm">
                  <span className="block text-xs text-[var(--text-2)]">{c.name}</span>
                  <select
                    value={k[c.key]}
                    onChange={(e) => setCriterion(c.key, Number(e.target.value))}
                    className="mt-0.5 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
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

          {result && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addToGroup}
                disabled={!result.tab1.eligible && !result.tab2.eligible}
                className="rounded-lg bg-[var(--blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {badge === "KI-Vorschlag" ? "Vorschlag bestätigen und hinzufügen" : "Zur Peer-Gruppe hinzufügen"}
              </button>
              {added && <span className="text-sm text-[var(--good)]">✓ {added} ist für diese Sitzung in der Peer-Gruppe.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
