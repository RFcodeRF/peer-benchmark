"use client";

import { useMemo, useState } from "react";
import type { DefinitionEntry, Insight, Peer, PeerSeries, PeriodKey } from "@/lib/types";
import { PERIODS } from "@/lib/types";
import { pct } from "@/lib/format";
import { useSelection } from "./SelectionProvider";
import { DotStrip, PeriodLegend, Scatter, PERIOD_NAMES, type ScatterPoint, type StripRow } from "./charts";
import { LabelBadge, Notice, PageIntro, SectionTitle, Segmented, SourceValue, downloadCsv } from "./ui";

type Mode = "bereinigt" | "unbereinigt";

export function Reiter1({
  peers,
  series,
  definitions,
  insights,
}: {
  peers: Peer[];
  series: Record<string, PeerSeries>;
  definitions: Record<string, DefinitionEntry>;
  insights: Insight[];
}) {
  const sel = useSelection();
  const [mode, setMode] = useState<Mode>("bereinigt");

  const active = useMemo(() => {
    const base = peers.filter((p) => sel.tab1.includes(p.id)).map((p) => ({ peer: p, series: series[p.id] }));
    const live = sel.live.filter((l) => l.peer.tab1.eligible && sel.tab1.includes(l.peer.id)).map((l) => ({ peer: l.peer, series: l.series }));
    return [...base, ...live];
  }, [peers, series, sel.tab1, sel.live]);

  const ebitdaKey = mode === "bereinigt" ? "ebitdaAdjMargin" : "ebitdaUnadjMargin";

  const mmRows: StripRow[] = active.map(({ peer, series: s }) => ({
    id: peer.id,
    name: peer.shortName,
    points: peer.live || peer.tab1.scope === "nur EBITDA" ? {} : s?.marketingMargin ?? {},
    emptyText: peer.live ? "live: Definition ungeprüft" : "nicht berichtet",
  }));
  const ebRows: StripRow[] = active.map(({ peer, series: s }) => ({
    id: peer.id,
    name: peer.shortName,
    points: s?.[ebitdaKey] ?? {},
    emptyText: "nicht verfügbar",
  }));

  const scatter: ScatterPoint[] = active.flatMap(({ peer, series: s }) => {
    if (!s || peer.live || peer.tab1.scope === "nur EBITDA") return [];
    for (const p of ["LTM", "FY2025", "FY2024", "FY2023"] as PeriodKey[]) {
      const x = s.marketingMargin[p];
      const y = s[ebitdaKey][p];
      if (x?.value != null && y?.value != null) return [{ id: peer.id, name: peer.shortName, period: p, x, y }];
    }
    return [];
  });

  const withMm = mmRows.filter((r) => Object.keys(r.points).length > 0).length;
  const withEb = ebRows.filter((r) => Object.keys(r.points).length > 0).length;
  const noData = active.length > 0 && withMm === 0 && withEb === 0;

  function exportCsv() {
    const rows: (string | number | null)[][] = [["Peer", "Kennzahl", "Periode", "Wert", "Label", "Rechnung", "Quelle", "Fundstelle", "Stand", "Hinweis"]];
    for (const { peer, series: s } of active) {
      if (!s) continue;
      const metrics: [string, keyof PeerSeries][] = [
        ["Marketingmarge", "marketingMargin"],
        ["EBITDA-Marge bereinigt", "ebitdaAdjMargin"],
        ["EBITDA-Marge unbereinigt", "ebitdaUnadjMargin"],
        ["Umsatzwachstum", "revenueGrowth"],
        ["Wachstum Marketingaufwand", "marketingGrowth"],
      ];
      for (const [name, key] of metrics) {
        const m = s[key] as PeerSeries["marketingMargin"];
        for (const p of PERIODS) {
          const pt = m?.[p];
          if (!pt || pt.value == null) continue;
          rows.push([peer.shortName, name, pt.periodLabel, Math.round(pt.value * 100000) / 1000, pt.source.label, pt.source.formula ?? "", pt.source.title ?? "", pt.source.page ?? "", pt.source.asOf ?? "", pt.source.note ?? ""]);
        }
      }
    }
    downloadCsv("pruefpaket-reiter1.csv", rows);
  }

  return (
    <div>
      <PageIntro
        title="Reiter 1: Marketingmarge und EBITDA-Marge"
        question="Wie viel vom Umsatz bleibt einem Vergleichsportal nach dem Marketing, und warum unterscheiden sich die Anbieter so stark?"
      >
        <p className="mt-2 text-sm text-[var(--text-2)] max-w-3xl">
          Marketingmarge = (Umsatz − Marketingaufwand) ÷ Umsatz, so wie jedes Unternehmen Marketing abgrenzt. Die Abgrenzungen unterscheiden sich; die Definitionstabelle unten gehört zu jeder Aussage. Zeitraum: Geschäftsjahre 2023 bis 2025 und die letzten verfügbaren zwölf Monate.
        </p>
      </PageIntro>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-[var(--text-2)]">
          <span className="font-semibold text-[var(--text)] tabular">{active.length}</span> Peers aktiv
          {!sel.isDefault && <span className="ml-2 text-[#7a5200]">· abweichend von der Standard-Gruppe</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-2)]">EBITDA:</span>
          <Segmented
            label="EBITDA-Sicht"
            value={mode}
            onChange={setMode}
            options={[
              { value: "bereinigt", label: "Bereinigt" },
              { value: "unbereinigt", label: "Unbereinigt" },
            ]}
          />
          <button type="button" onClick={exportCsv} className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm hover:border-[var(--blue)]">
            Prüfpaket (CSV)
          </button>
        </div>
      </div>

      {active.length === 0 && <Notice tone="warn">Kein Peer für Reiter 1 aktiv. Bitte auf der Seite Peer-Gruppe mindestens einen Peer einschalten.</Notice>}
      {noData && <Notice tone="warn">Für die aktiven Peers sind noch keine Finanzzahlen hinterlegt.</Notice>}

      <div className="grid gap-4">
        <section className="card p-4">
          <SectionTitle title="Marketingmarge je Peer" sub="Ein Punkt je Periode; sortiert nach dem jüngsten Wert. Weißer Kern = Annahme. Punkt anklicken für Quelle und Definition." />
          <PeriodLegend periods={PERIODS} />
          <div className="mt-2">
            <DotStrip rows={mmRows} periods={PERIODS} ariaLabel="Marketingmarge je Peer und Periode" medianLabel={`Median jüngster Wert, ${withMm} Peers`} />
          </div>
        </section>

        <section className="card p-4">
          <SectionTitle
            title={`EBITDA-Marge je Peer, ${mode}`}
            sub={mode === "bereinigt" ? "Bereinigtes EBITDA des Unternehmens ÷ Umsatz; die Bereinigungen stehen in der Definitionstabelle." : "(EBIT + Abschreibungen) ÷ Umsatz, gleiche Regel für alle."}
          />
          <PeriodLegend periods={PERIODS} />
          <div className="mt-2">
            <DotStrip rows={ebRows} periods={PERIODS} ariaLabel={`EBITDA-Marge ${mode} je Peer und Periode`} medianLabel={`Median jüngster Wert, ${withEb} Peers`} />
          </div>
        </section>

        <section className="card p-4">
          <SectionTitle
            title="Marketingmarge gegen EBITDA-Marge"
            sub="Jüngste Periode mit beiden Werten je Peer. Gefüllt = letzte zwölf Monate, Ring = Geschäftsjahr. Der Abstand zwischen beiden Margen sind Personal, Technik und Verwaltung."
          />
          {scatter.length > 0 ? (
            <Scatter points={scatter} xLabel="Marketingmarge" yLabel={`EBITDA-Marge, ${mode}`} ariaLabel="Punktwolke Marketingmarge gegen EBITDA-Marge" />
          ) : (
            <div className="text-sm text-[var(--text-2)]">Keine Peers mit beiden Werten aktiv.</div>
          )}
        </section>

        <section className="card p-4">
          <SectionTitle title="Drei Erkenntnisse" />
          {!sel.isDefault && (
            <div className="mb-3">
              <Notice>Die Erkenntnisse gelten für die Standard-Gruppe. Die aktuelle Auswahl weicht davon ab.</Notice>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {insights.map((ins, i) => (
              <div key={i} className="rounded-lg border border-[var(--line)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{ins.title}</div>
                  {ins.status === "Entwurf" && <LabelBadge label="Entwurf" />}
                </div>
                <p className="text-sm text-[var(--text-2)] mt-1">{ins.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <SectionTitle title="Alle Werte mit Quelle" sub="Tabellenansicht der Charts. Jede Zahl antippen: Quelle, Stand, Label und Rechnung." />
          <div className="scroll-x">
            <table className="data min-w-[720px]">
              <thead>
                <tr>
                  <th>Peer</th>
                  <th>Kennzahl</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="num">
                      {PERIOD_NAMES[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map(({ peer, series: s }) =>
                  (["marketingMargin", ebitdaKey] as const).map((key, j) => (
                    <tr key={peer.id + key}>
                      {j === 0 && (
                        <td rowSpan={2} className="font-medium">
                          {peer.shortName}
                        </td>
                      )}
                      <td className="text-[var(--text-2)] whitespace-nowrap">{key === "marketingMargin" ? "Marketingmarge" : `EBITDA-Marge, ${mode}`}</td>
                      {PERIODS.map((p) => {
                        const pt = key === "marketingMargin" && (peer.live || peer.tab1.scope === "nur EBITDA") ? undefined : s?.[key]?.[p];
                        return (
                          <td key={p} className="num">
                            {pt && pt.value != null ? (
                              <SourceValue display={pct(pt.value)} source={pt.source} title={`${peer.shortName}, ${pt.periodLabel}`} />
                            ) : (
                              <span className="text-[var(--text-3)]">{key === "marketingMargin" && peer.tab1.scope === "nur EBITDA" ? "n. b." : "–"}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">n. b. = nicht berichtet. * = Annahme. LTM = letzte zwölf Monate, je Peer mit eigenem Zeitraum (siehe Quelle).</p>
        </section>

        <section className="card p-4">
          <SectionTitle title="Definitionen je Unternehmen" sub="Wie jedes Unternehmen Marketing und EBITDA abgrenzt. Ohne diese Tabelle ist kein Margenvergleich belastbar." />
          <div className="scroll-x">
            <table className="data min-w-[860px]">
              <thead>
                <tr>
                  <th>Unternehmen</th>
                  <th>Marketingmarge: Abgrenzung</th>
                  <th>Label</th>
                  <th>Bereinigtes EBITDA</th>
                  <th>GJ-Ende</th>
                  <th>Rhythmus</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => {
                  const d = definitions[p.id];
                  const on = sel.tab1.includes(p.id);
                  return (
                    <tr key={p.id} className={on ? undefined : "muted"}>
                      <td className="font-medium whitespace-nowrap">
                        {p.shortName}
                        {!on && <div className="text-xs font-normal">nicht aktiv</div>}
                      </td>
                      <td className="max-w-[380px]">
                        {d?.marketing}
                        {d?.specialCases?.length > 0 && (
                          <ul className="mt-1 text-xs text-[var(--text-2)] list-disc pl-4">
                            {d.specialCases.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{d && <LabelBadge label={d.marketingLabel} />}</td>
                      <td className="text-xs max-w-[240px]">{d?.ebitdaAdj}</td>
                      <td className="whitespace-nowrap">{p.fyEnd}</td>
                      <td>{p.cadence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-3)]">Umsätze und Beträge bleiben in Originalwährung; Margen brauchen keine Währungsumrechnung.</p>
        </section>
      </div>
    </div>
  );
}
