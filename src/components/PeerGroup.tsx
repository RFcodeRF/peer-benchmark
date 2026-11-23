"use client";

import { Fragment, useMemo, useState } from "react";
import type { Peer, ScoreEntry } from "@/lib/types";
import { CRITERIA, formatScore, totalScore } from "@/lib/score";
import { useSelection } from "./SelectionProvider";
import { LabelBadge, Notice, PageIntro, ScoreBadge, Switch, Tip } from "./ui";
import { LiveCheck, type Candidate } from "./LiveCheck";

interface Row {
  peer: Peer;
  score: ScoreEntry;
  live: boolean;
}

export function PeerGroup({ peers, scores, candidates }: { peers: Peer[]; scores: Record<string, ScoreEntry>; candidates: Candidate[] }) {
  const sel = useSelection();
  const [open, setOpen] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const base = peers.map((p) => ({ peer: p, score: scores[p.id], live: false }));
    const live = sel.live.map((l) => ({ peer: l.peer, score: l.score, live: true }));
    return [...base, ...live].sort((a, b) => totalScore(b.score) - totalScore(a.score) || a.peer.shortName.localeCompare(b.peer.shortName, "de"));
  }, [peers, scores, sel.live]);

  return (
    <div>
      <PageIntro title="Peer-Gruppe">
        <p className="mt-2 text-[15px] text-[var(--text-2)] max-w-3xl">
          14 vorab geprüfte Vergleichsportale und Vermittler, sortiert nach Eignungs-Score. Die Schalter bestimmen, wer in die Margen und in die Eigenkapitalkosten eingeht; alle Ansichten rechnen sofort neu. Neue Kandidaten prüft das Tool unten live.
        </p>
      </PageIntro>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-sm text-[var(--text-2)]">
          Aktiv: <span className="font-bold text-[var(--text)] tabular">{sel.tab1.length}</span> in den Margen,{" "}
          <span className="font-bold text-[var(--text)] tabular">{sel.tab2.length}</span> in den Eigenkapitalkosten
          {!sel.isDefault && <span className="ml-2 text-[#7a5200]">· Auswahl weicht von der Standard-Gruppe ab</span>}
        </div>
        <button
          type="button"
          onClick={sel.reset}
          disabled={sel.isDefault}
          className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Standard-Gruppe wiederherstellen
        </button>
      </div>

      <div className="card scroll-x">
        <table className="data min-w-[780px]">
          <thead>
            <tr>
              <th className="num w-10">Rang</th>
              <th>Unternehmen</th>
              <th className="num">
                <Tip label="Score" tip="Eignungs-Score von 1 bis 5: wie nah das Geschäftsmodell an einem deutschen Mehrsparten-Vergleichsportal liegt. Grün ab 4, gelb 3 bis 3,5, rot darunter." />
              </th>
              <th>
                <Tip label="Margen" tip="Peer zählt für die Berechnung der Marketing- und EBITDA-Marge." />
              </th>
              <th>
                <Tip label="Eigenkapitalkosten" tip="Peer zählt für die Berechnung der Eigenkapitalkosten (Beta)." />
              </th>
              <th>
                <Tip label="Beta-Qualität" tip="Wie gut das Aktienkurs-Beta das Geschäftsrisiko misst: Liquidität, beherrschender Aktionär, Übernahmen. Fließt nicht in den Score ein." />
              </th>
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = r.peer;
              const total = totalScore(r.score);
              const isOpen = open === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className={isOpen ? "bg-[#fafbfd]" : undefined}>
                    <td className="num text-[var(--text-2)]">{i + 1}</td>
                    <td>
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        {p.shortName}
                        {r.live && <LabelBadge label="Automatisch erfasst" />}
                      </div>
                      <div className="text-xs text-[var(--text-2)]">
                        {p.country} · {p.listed ? "börsennotiert" : "privat"}
                      </div>
                    </td>
                    <td className="num">
                      <ScoreBadge total={total} display={formatScore(total)} />
                      {r.score.origin !== "Eigene Einschätzung" && (
                        <div className="mt-1">
                          <LabelBadge label={r.score.origin === "KI-Vorschlag" && !r.score.confirmed ? "KI-Vorschlag" : r.score.origin} />
                        </div>
                      )}
                    </td>
                    <td>
                      <TabCell tab="tab1" peer={p} />
                    </td>
                    <td>
                      <TabCell tab="tab2" peer={p} />
                    </td>
                    <td className="text-xs">
                      <div className="font-medium">{p.betaQuality}</div>
                      <div className="text-[var(--text-2)] max-w-[220px]">{p.betaNote}</div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-sm text-[var(--blue)] underline underline-offset-2 whitespace-nowrap"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : p.id)}
                      >
                        {isOpen ? "Schließen" : "Begründung"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#fafbfd]">
                      <td />
                      <td colSpan={6}>
                        <div className="grid gap-4 md:grid-cols-2 py-1">
                          <div>
                            <div className="text-xs font-semibold text-[var(--text-2)] mb-1">Einschätzung in zwei Sätzen</div>
                            <p className="text-sm">{r.score.sentences[0]}</p>
                            <p className="text-sm mt-1">{r.score.sentences[1]}</p>
                            <div className="text-xs text-[var(--text-2)] mt-2">
                              Herkunft: {r.score.origin}
                              {r.score.confirmed ? ", bestätigt" : ""}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-[var(--text-2)] mb-1">Begründung je Kriterium</div>
                            <ul className="text-sm space-y-1">
                              {CRITERIA.map((c) => (
                                <li key={c.key}>
                                  <span className="font-medium tabular">
                                    {c.name}: {formatScore(r.score[c.key]).replace(",0", "")}
                                  </span>{" "}
                                  <span className="text-[var(--text-2)]">{r.score.rationale[c.key]}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="text-xs text-[var(--text-2)] mt-2">
                              {p.business}. Margen: {p.tab1.reason}. Eigenkapitalkosten: {p.tab2.reason}.
                            </div>
                            {r.live && (
                              <button type="button" className="mt-2 text-sm text-[var(--crit)] underline" onClick={() => sel.removeLive(p.id)}>
                                Peer aus der Sitzung entfernen
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 mt-6">
        <div className="lg:col-span-3">
          <LiveCheck candidates={candidates} />
        </div>
        <div className="lg:col-span-2 card p-4">
          <h2 className="text-base font-bold">So entsteht der Score</h2>
          <p className="text-sm text-[var(--text-2)] mt-1">
            Score = 1 + K1 + K2 + K3 + K4, je 0, 0,5 oder 1 Punkt. Maßstab ist das öffentlich bekannte Profil eines deutschen Mehrsparten-Vergleichsportals.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {CRITERIA.map((c) => (
              <li key={c.key}>
                <div className="font-medium">{c.name}</div>
                <div className="text-[var(--text-2)] text-xs">
                  {c.question} 1: {c.levels[1]}. 0,5: {c.levels[0.5]}. 0: {c.levels[0]}.
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <span className="font-bold">Wirkung:</span> Der Score sortiert die Liste und begründet die Vorauswahl. In die Rechnungen geht er nicht ein: Dort zählt nur, ob der Schalter an ist, und jeder aktive Peer hat das gleiche Gewicht im Median.
          </p>
          <div className="mt-3">
            <Notice>Ein börsennotierter Peer mit Score 5 existiert nicht: Verivox gehört seit 2025 zu Moltiply. Die Beta-Qualität fließt nicht in den Score ein und steht separat.</Notice>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabCell({ tab, peer }: { tab: "tab1" | "tab2"; peer: Peer }) {
  const sel = useSelection();
  const info = peer[tab];
  if (!info.eligible) {
    return <div className="text-xs text-[var(--text-3)] max-w-[170px]">Nicht geeignet: {info.reason}</div>;
  }
  const on = sel.isOn(tab, peer.id);
  const extra =
    tab === "tab1" && peer.tab1.scope === "nur EBITDA"
      ? "nur EBITDA-Marge"
      : tab === "tab2" && peer.live
        ? "Beta nicht live verfügbar"
        : tab === "tab2" && peer.tab2.travel
          ? "auch Reise-Sicht"
          : null;
  return (
    <div className="flex items-center gap-2">
      <Switch checked={on} onChange={() => sel.toggle(tab, peer.id)} label={`${peer.shortName} in ${tab === "tab1" ? "Margen" : "Eigenkapitalkosten"}`} />
      {extra && <span className="text-xs text-[var(--text-3)] max-w-[110px]">{extra}</span>}
    </div>
  );
}
