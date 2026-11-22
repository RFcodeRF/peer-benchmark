"use client";

import { useMemo, useState } from "react";
import type { BetaFile, CapitalStructureRow, Params, Peer } from "@/lib/types";
import {
  buildBetaRows,
  computeCoe,
  medianDE,
  sensitivityMatrix,
  type BetaIndex,
  type BetaWindow,
  type CoeResult,
  type CoeSettings,
  type PeerBetaRow,
  type UnleverMethod,
} from "@/lib/coe";
import { deDate, num, pct } from "@/lib/format";
import { useSelection } from "./SelectionProvider";
import { BetaStrip } from "./charts";
import { LabelBadge, Notice, PageIntro, SectionTitle, SourceValue, Switch, downloadCsv } from "./ui";

export function Reiter2({ peers, betas, capital, params }: { peers: Peer[]; betas: BetaFile; capital: CapitalStructureRow[]; params: Params }) {
  const sel = useSelection();
  const [rf, setRf] = useState(params.riskFree.value);
  const [mrp, setMrp] = useState(params.mrp.start);
  const [targetDE, setTargetDE] = useState<number | null>(null);
  const [premium, setPremium] = useState(0);
  const [method, setMethod] = useState<UnleverMethod>("harris-pringle");
  const [window, setWindow] = useState<BetaWindow>("w2y");
  const [index, setIndex] = useState<BetaIndex>("local");
  const [blume, setBlume] = useState(false);

  const portalPeers = useMemo(() => {
    const base = peers.filter((p) => p.tab2.eligible && sel.tab2.includes(p.id));
    const live = sel.live.filter((l) => l.peer.tab2.eligible && sel.tab2.includes(l.peer.id)).map((l) => l.peer);
    return [...base, ...live];
  }, [peers, sel.tab2, sel.live]);
  const travelPeers = useMemo(() => peers.filter((p) => p.tab2.travel), [peers]);
  const eligibleInactive = peers.filter((p) => p.tab2.eligible && !sel.tab2.includes(p.id));

  const opts = { window, index, blume, method, blumeWeight: params.blume.weight, blumeConstant: params.blume.constant };
  const portalRows = buildBetaRows(portalPeers, betas, capital, opts, params.minWeeks, params.minMonths);
  const travelRows = buildBetaRows(travelPeers, betas, capital, opts, params.minWeeks, params.minMonths);
  const inactiveRows = buildBetaRows(eligibleInactive, betas, capital, opts, params.minWeeks, params.minMonths);

  const autoDE = medianDE(portalRows);
  const de = targetDE ?? autoDE;
  const settings: CoeSettings = { riskFree: rf, mrp, targetDE: de, premium, method, window, index, blume, targetTax: params.targetTaxRate.value, blumeWeight: params.blume.weight, blumeConstant: params.blume.constant };
  const portal = computeCoe(portalRows, settings);
  const travel = computeCoe(travelRows, settings);
  const matrix = sensitivityMatrix(rf, premium, params.matrix.betaMin, params.matrix.betaMax, params.matrix.betaStep, params.mrp.low, params.mrp.high, params.mrp.step);

  const pending = betas.meta.status !== "berechnet";
  const peerName = (id: string) => peers.find((p) => p.id === id)?.shortName ?? sel.live.find((l) => l.peer.id === id)?.peer.shortName ?? id;
  const capRow = (id: string) => capital.find((c) => c.peer === id);
  const sensActive = [method === "hamada" && "Hamada", window === "m5y" && "5 Jahre monatlich", index === "msci" && "MSCI World", blume && "Blume"].filter(Boolean) as string[];

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      ["Parameter", "Wert"],
      ["Basiszins", rf],
      ["Marktrisikoprämie", mrp],
      ["Ziel-FK/EK", de],
      ["Zuschlag", premium],
      ["Unlevern", method === "hamada" ? "Hamada" : "Harris-Pringle"],
      ["Fenster", window === "w2y" ? "2 Jahre wöchentlich" : "5 Jahre monatlich"],
      ["Index", index === "local" ? "lokal" : "MSCI World"],
      ["Blume", blume ? "ja" : "nein"],
      [],
      ["Sicht", "Peer", "Index", "Beta verschuldet", "Beta nach Blume", "Beobachtungen", "Bestimmtheitsmaß", "FK/EK", "Steuersatz", "Beta unverschuldet", "Status"],
    ];
    const add = (view: string, list: PeerBetaRow[]) =>
      list.forEach((r) => rows.push([view, peerName(r.peerId), r.estimate?.index ?? "", r.rawBeta, r.adjustedBeta, r.estimate?.n ?? null, r.estimate?.r2 ?? null, r.de, r.tax, r.unlevered, r.status]));
    add("Portal", portalRows);
    add("Reise", travelRows);
    rows.push([]);
    rows.push(["Ergebnis", "n", "Beta u. 25 %", "Beta u. Median", "Beta u. 75 %", "Beta relevered Median", "EK-Kosten unten", "EK-Kosten Punkt", "EK-Kosten oben"]);
    for (const [name, r] of [["Portal", portal], ["Reise", travel]] as [string, CoeResult | null][]) {
      if (r) rows.push([name, r.n, r.unleveredLow, r.unleveredMid, r.unleveredHigh, r.releveredMid, r.coeLow, r.coeMid, r.coeHigh]);
    }
    downloadCsv("pruefpaket-reiter2.csv", rows);
  }

  const bmid = portal?.releveredMid ?? null;
  const hiRow = bmid === null ? -1 : matrix.betas.reduce((best, b, i) => (Math.abs(b - bmid) < Math.abs(matrix.betas[best] - bmid) ? i : best), 0);
  const hiCol = matrix.mrps.findIndex((m) => Math.abs(m - mrp) < 1e-6);
  const allCells = matrix.cells.flat();
  const cMin = Math.min(...allCells);
  const cMax = Math.max(...allCells);
  const ramp = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"];
  const cellColor = (v: number) => ramp[Math.min(ramp.length - 1, Math.floor(((v - cMin) / (cMax - cMin + 1e-9)) * ramp.length))];

  return (
    <div>
      <PageIntro
        title="Reiter 2: Eigenkapitalkosten"
        question="Welche Eigenkapitalkosten sind für ein Vergleichsportal-Geschäft in Deutschland plausibel, und wie stark hängen sie an den Annahmen?"
      >
        <p className="mt-2 text-sm text-[var(--text-2)] max-w-3xl">
          CAPM mit Peer-Betas: Beta je Peer messen, Verschuldung herausrechnen, Median bilden, mit einer Zielkapitalstruktur wieder verschulden. Das Ergebnis ist eine Spanne für ein Geschäftsmodell, ausdrücklich nicht „die Eigenkapitalkosten von CHECK24“.
        </p>
      </PageIntro>

      {pending && (
        <div className="mb-4">
          <Notice tone="warn">
            Betas noch nicht berechnet: Die Kursdaten aus S&amp;P Capital IQ bis {deDate(params.dataDates.prices)} werden eingelesen. Bis dahin zeigt dieser Reiter Rechenweg, Parameter und Sensitivitätsmatrix ohne Peer-Ergebnis.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ResultCard title="Portal-Sicht" result={portal} rf={rf} mrp={mrp} premium={premium} de={de} sens={sensActive} />
        <ResultCard title="Reise-Sicht" result={travel} rf={rf} mrp={mrp} premium={premium} de={de} sens={sensActive} sub="Booking, Expedia, eDreams, trivago; feste Gruppe zum Vergleich" />
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Annahmen</h2>
            <button
              type="button"
              className="text-xs text-[var(--blue-dark)] underline"
              onClick={() => {
                setRf(params.riskFree.value);
                setMrp(params.mrp.start);
                setTargetDE(null);
                setPremium(0);
                setMethod("harris-pringle");
                setWindow("w2y");
                setIndex("local");
                setBlume(false);
              }}
            >
              Zurücksetzen
            </button>
          </div>
          <Slider
            label="Basiszins (IDW S 1)"
            value={rf}
            min={0.02}
            max={0.05}
            step={0.0005}
            onChange={setRf}
            display={pct(rf, 2)}
            hint={<SourceValue display={`Quelle: ${pct(params.riskFree.value, 2)}, Stand ${deDate(params.riskFree.asOf)}`} source={{ label: params.riskFree.label, title: params.riskFree.source, url: params.riskFree.url, asOf: params.riskFree.asOf }} />}
          />
          <Slider
            label="Marktrisikoprämie (FAUB)"
            value={mrp}
            min={params.mrp.low}
            max={params.mrp.high}
            step={params.mrp.step}
            onChange={setMrp}
            display={pct(mrp, 2)}
            hint={<SourceValue display={`Bandbreite ${pct(params.mrp.low, 2)} bis ${pct(params.mrp.high, 2)}`} source={{ label: params.mrp.label, title: params.mrp.source, url: params.mrp.url, asOf: params.mrp.asOf }} />}
          />
          <Slider
            label="Ziel-FK/EK"
            value={de}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setTargetDE(v)}
            display={pct(de, 0)}
            hint={
              <span>
                Median der aktiven Peers: {pct(autoDE, 0)}
                {targetDE !== null && (
                  <button type="button" className="ml-2 underline text-[var(--blue-dark)]" onClick={() => setTargetDE(null)}>
                    Median übernehmen
                  </button>
                )}
              </span>
            }
            markers={portalRows.filter((r) => r.de !== null).map((r) => ({ value: Math.min(1, r.de as number), label: peerName(r.peerId) }))}
          />
          <Slider label="Zuschlag (Größe, Illiquidität)" value={premium} min={0} max={0.03} step={0.0025} onChange={setPremium} display={pct(premium, 2)} hint="Standard aus; nur mit Begründung zuschalten." />
          <div>
            <div className="text-sm font-medium mb-2">Sensitivitäten</div>
            <div className="space-y-2">
              <Toggle label="Hamada statt Harris-Pringle" checked={method === "hamada"} onChange={() => setMethod(method === "hamada" ? "harris-pringle" : "hamada")} />
              <Toggle label="5 Jahre monatlich statt 2 Jahre wöchentlich" checked={window === "m5y"} onChange={() => setWindow(window === "m5y" ? "w2y" : "m5y")} />
              <Toggle label="MSCI World statt lokalem Index" checked={index === "msci"} onChange={() => setIndex(index === "msci" ? "local" : "msci")} />
              <Toggle label="Blume-Anpassung (0,67 × β + 0,33)" checked={blume} onChange={() => setBlume(!blume)} />
            </div>
          </div>
          <button type="button" onClick={exportCsv} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm hover:border-[var(--blue)]">
            Prüfpaket (CSV)
          </button>
        </div>
      </div>

      <section className="card p-4 mt-4">
        <SectionTitle title="Unverschuldete Betas der Portal-Sicht" sub="Ein Punkt je aktivem Peer mit Beta. Die Fläche zeigt das 25-%- bis 75-%-Quantil, die Linie den Median." />
        {portal ? (
          <BetaStrip
            points={portalRows.filter((r) => r.status === "ok").map((r) => ({ id: r.peerId, name: peerName(r.peerId), value: r.unlevered as number }))}
            q1={portal.unleveredLow}
            med={portal.unleveredMid}
            q3={portal.unleveredHigh}
            ariaLabel="Unverschuldete Betas der aktiven Peers mit Median und Quartilen"
          />
        ) : (
          <div className="text-sm text-[var(--text-2)]">Kein aktiver Peer mit Beta.</div>
        )}
      </section>

      <section className="card p-4 mt-4">
        <SectionTitle title="Peer-Tabelle" sub={`Index lokal oder MSCI World; Fenster ${window === "w2y" ? "104 Wochen bis 20.11.2026" : "60 Monate bis 20.11.2026"}. Mindestens ${params.minWeeks} Wochen bzw. ${params.minMonths} Monate.`} />
        <div className="scroll-x">
          <BetaTable title="Portal-Sicht, aktiv" rows={portalRows} peers={peers} peerName={peerName} capRow={capRow} blume={blume} />
          <div className="h-4" />
          <BetaTable title="Reise-Sicht" rows={travelRows} peers={peers} peerName={peerName} capRow={capRow} blume={blume} />
          {inactiveRows.length > 0 && (
            <>
              <div className="h-4" />
              <BetaTable title="Geeignet, aber ausgeschaltet" rows={inactiveRows} peers={peers} peerName={peerName} capRow={capRow} blume={blume} muted />
            </>
          )}
        </div>
      </section>

      <section className="card p-4 mt-4">
        <SectionTitle
          title="Sensitivitätsmatrix: Beta × Marktrisikoprämie"
          sub={`Eigenkapitalkosten = ${pct(rf, 2)} + Beta × Prämie${premium ? ` + ${pct(premium, 2)}` : ""}. Umrandet: aktuelle Einstellung (relevered Beta der Portal-Sicht, gerundet auf 0,1).`}
        />
        <div className="scroll-x">
          <table className="data min-w-[560px]">
            <thead>
              <tr>
                <th className="num">Beta</th>
                {matrix.mrps.map((m) => (
                  <th key={m} className="num">
                    {pct(m, 2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.betas.map((b, i) => (
                <tr key={b}>
                  <td className="num font-medium">{num(b, 1)}</td>
                  {matrix.cells[i].map((v, j) => {
                    const bg = cellColor(v);
                    const dark = ramp.indexOf(bg) >= 6;
                    const hi = i === hiRow && j === hiCol;
                    return (
                      <td
                        key={j}
                        className="num"
                        style={{ background: bg, color: dark ? "white" : "var(--text)", outline: hi ? "3px solid var(--navy)" : undefined, outlineOffset: -3, fontWeight: hi ? 700 : 400 }}
                        aria-current={hi ? "true" : undefined}
                      >
                        {pct(v, 1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4 mt-4">
        <SectionTitle title="Rechenweg" />
        <ol className="text-sm space-y-1.5 list-decimal pl-5">
          <li>Renditen aus Schlusskursen von Aktie und breitem lokalem Index (S&amp;P Capital IQ), 2 Jahre wöchentlich bis {deDate(params.dataDates.prices)}.</li>
          <li>Verschuldetes Beta βL per Regression der Aktienrendite auf die Indexrendite.</li>
          <li>
            Unlevern: {method === "hamada" ? "βu = βL ÷ (1 + (1 − t) × FK/EK) nach Hamada" : "βu = βL ÷ (1 + FK/EK) nach Harris-Pringle"}. FK/EK = Nettofinanzverschuldung ohne Leasing ÷ Marktkapitalisierung, mindestens 0.
          </li>
          <li>Median und Quartile der unverschuldeten Betas der aktiven Peers.</li>
          <li>Relevern: βL* = βu × (1 + {method === "hamada" ? "(1 − 30 %) × " : ""}Ziel-FK/EK).</li>
          <li>
            CAPM: rE = Basiszins + βL* × Marktrisikoprämie + Zuschlag
            {portal && (
              <span className="tabular">
                {" "}
                = {pct(rf, 2)} + {num(portal.releveredMid)} × {pct(mrp, 2)}
                {premium ? ` + ${pct(premium, 2)}` : ""} = <strong>{pct(portal.coeMid, 2)}</strong>
              </span>
            )}
            .
          </li>
        </ol>
        <p className="mt-3 text-xs text-[var(--text-2)]">
          Kursdaten: {betas.meta.priceSource}. Gegencheck mit Capital-IQ-Betas und Damodaran-Branchenbetas nur privat, nicht im Dashboard.
        </p>
      </section>
    </div>
  );
}

function ResultCard({ title, sub, result, rf, mrp, premium, de, sens }: { title: string; sub?: string; result: CoeResult | null; rf: number; mrp: number; premium: number; de: number; sens: string[] }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold">{title}</div>
      {sub && <div className="text-xs text-[var(--text-2)]">{sub}</div>}
      {result ? (
        <>
          <div className="mt-3 text-[40px] leading-none font-semibold tabular text-[var(--navy)]">{pct(result.coeMid, 1)}</div>
          <div className="mt-1 text-sm text-[var(--text-2)] tabular">
            Spanne {pct(result.coeLow, 1)} bis {pct(result.coeHigh, 1)}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular">
            <dt className="text-[var(--text-2)]">Median aus</dt>
            <dd className="text-right font-medium">{result.n} Peers</dd>
            <dt className="text-[var(--text-2)]">βu Median</dt>
            <dd className="text-right">{num(result.unleveredMid)}</dd>
            <dt className="text-[var(--text-2)]">βu 25 % bis 75 %</dt>
            <dd className="text-right">
              {num(result.unleveredLow)} bis {num(result.unleveredHigh)}
            </dd>
            <dt className="text-[var(--text-2)]">βL* bei FK/EK {pct(de, 0)}</dt>
            <dd className="text-right">{num(result.releveredMid)}</dd>
            <dt className="text-[var(--text-2)]">Basiszins, Prämie</dt>
            <dd className="text-right">
              {pct(rf, 2)}, {pct(mrp, 2)}
            </dd>
            {premium > 0 && (
              <>
                <dt className="text-[var(--text-2)]">Zuschlag</dt>
                <dd className="text-right">{pct(premium, 2)}</dd>
              </>
            )}
          </dl>
          {result.warning && (
            <div className="mt-3">
              <Notice tone="warn">{result.warning}</Notice>
            </div>
          )}
          {sens.length > 0 && <div className="mt-2 text-xs text-[#7a5200]">Sensitivität aktiv: {sens.join(", ")}</div>}
        </>
      ) : (
        <div className="mt-3 text-sm text-[var(--text-2)]">Kein Ergebnis: kein aktiver Peer mit Beta.</div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
  markers,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  hint?: React.ReactNode;
  markers?: { value: number; label: string }[];
}) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <label className="font-medium">{label}</label>
        <span className="tabular font-semibold">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {markers && markers.length > 0 && (
        <div className="relative h-4 -mt-1" aria-hidden>
          {markers.map((m) => (
            <span key={m.label} title={`${m.label}: ${Math.round(m.value * 100)} %`} className="absolute top-0 h-3 w-0.5 bg-[var(--text-3)]" style={{ left: `calc(${((m.value - min) / (max - min)) * 100}% )` }} />
          ))}
        </div>
      )}
      {hint && <div className="text-xs text-[var(--text-2)]">{hint}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function BetaTable({
  title,
  rows,
  peers,
  peerName,
  capRow,
  blume,
  muted,
}: {
  title: string;
  rows: PeerBetaRow[];
  peers: Peer[];
  peerName: (id: string) => string;
  capRow: (id: string) => CapitalStructureRow | undefined;
  blume: boolean;
  muted?: boolean;
}) {
  return (
    <table className="data min-w-[900px]">
      <thead>
        <tr>
          <th>{title}</th>
          <th>Index</th>
          <th className="num">βL</th>
          {blume && <th className="num">βL Blume</th>}
          <th className="num">Beob.</th>
          <th className="num">R²</th>
          <th className="num">FK/EK</th>
          <th className="num">Steuer</th>
          <th className="num">βu</th>
          <th>Beta-Hinweis</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={10} className="text-[var(--text-3)]">
              Keine Peers.
            </td>
          </tr>
        )}
        {rows.map((r) => {
          const p = peers.find((x) => x.id === r.peerId);
          const cs = capRow(r.peerId);
          return (
            <tr key={r.peerId} className={muted ? "muted" : undefined}>
              <td className="font-medium whitespace-nowrap">{peerName(r.peerId)}</td>
              <td className="whitespace-nowrap text-xs">{r.estimate?.index ?? p?.index ?? "–"}</td>
              <td className="num">{num(r.rawBeta)}</td>
              {blume && <td className="num">{num(r.adjustedBeta)}</td>}
              <td className="num">{r.estimate ? r.estimate.n : "–"}</td>
              <td className="num">{r.estimate ? num(r.estimate.r2) : "–"}</td>
              <td className="num">
                {r.de !== null && cs ? (
                  <SourceValue
                    display={pct(r.de, 0)}
                    title={`${peerName(r.peerId)}: FK/EK`}
                    source={{
                      label: cs.label,
                      title: cs.source_title,
                      url: cs.source_url,
                      page: cs.source_page,
                      asOf: cs.balance_date,
                      formula: `Nettofinanzverschuldung ${num(cs.net_debt, 1)} ÷ Marktkapitalisierung ${num(cs.market_cap, 1)} Mio. ${cs.currency} (Kurs ${deDate(cs.price_date)}), mindestens 0`,
                      note: cs.note,
                    }}
                  />
                ) : (
                  "–"
                )}
              </td>
              <td className="num">{pct(r.tax, 1)}</td>
              <td className="num font-semibold">{num(r.unlevered)}</td>
              <td className="text-xs max-w-[260px]">
                {r.status !== "ok" && (
                  <div className="mb-0.5">
                    <LabelBadge label={r.status === "nicht live verfügbar" ? "Beta nicht live verfügbar" : r.status === "kein Beta" ? "Beta ausstehend" : r.status} />
                  </div>
                )}
                {p?.betaNote ?? "Live hinzugefügt: Die App ruft keine Kursdaten ab."}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
