import { loadData } from "@/lib/data";
import { deDate, pct } from "@/lib/format";
import { CRITERIA } from "@/lib/score";
import checklist from "../../../data/checklist.json";

export const metadata = { title: "Methodik" };

const LABELS = [
  ["Berichtet", "Die Zahl steht so in der Quelle."],
  ["Eigene Rechnung", "Aus berichteten Zahlen nach einer offengelegten Formel berechnet, zum Beispiel eine Marge oder ein LTM-Wert."],
  ["Annahme", "Enthält eine Zuordnung oder Schätzung, die nicht in der Quelle steht. Die Begründung steht im Hinweis zur Zahl."],
  ["Automatisch erfasst", "Live abgerufen und nicht manuell geprüft. Gilt nur für Peers, die in der Sitzung hinzugefügt wurden."],
];

export default function Methodik() {
  const { params, betas, peers } = loadData();
  const taxes = params.taxSources;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Methodik</h1>
      <p className="mt-2 text-[15px] text-[var(--text-2)]">
        Alle Formeln, Annahmen und Quellen in klarer Sprache. Jede Zahl im Dashboard zeigt beim Antippen Quelle, Stand und Label. Datenstand: Kurse {deDate(params.dataDates.prices)}, Abschlüsse {deDate(params.dataDates.filings)}. Was danach veröffentlicht wird, fließt nicht ein.
      </p>

      <Section title="Vier Labels">
        <table className="data">
          <tbody>
            {LABELS.map(([l, d]) => (
              <tr key={l}>
                <td className="font-medium whitespace-nowrap">{l}</td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Peer-Gruppe und Score">
        <p>
          Das Universum umfasst 14 Unternehmen. Neun Vergleichsportale sind beim Start für Reiter 1 eingeschaltet, fünf davon auch für Reiter 2. Jeder Peer ist je Reiter abwählbar; die Auswahl gilt nur für die laufende Sitzung. Der Knopf „Standard-Gruppe wiederherstellen“ setzt sie zurück.
        </p>
        <p className="mt-2">Score = 1 + K1 + K2 + K3 + K4, je 0, 0,5 oder 1 Punkt. Maßstab ist das öffentlich bekannte Profil eines deutschen Mehrsparten-Vergleichsportals; interne Informationen fließen nicht ein.</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {CRITERIA.map((c) => (
            <li key={c.key}>
              <span className="font-medium">{c.name}:</span> {c.question} 1 = {c.levels[1]}; 0,5 = {c.levels[0.5]}; 0 = {c.levels[0]}.
            </li>
          ))}
        </ul>
        <p className="mt-2">Die Beta-Qualität (Liquidität, beherrschender Aktionär, Übernahmesituation) steht separat und fließt nicht in den Score ein.</p>
      </Section>

      <Section title="Live-Prüfung neuer Peers">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Suche nach Name oder Ticker bei der SEC (US-Emittenten), bei filings.xbrl.org (ESEF-Berichte börsennotierter EU-Unternehmen) und bei Companies House (britische Gesellschaften). Für Frankreich ist keine Abfrage eingerichtet; das Tool meldet „Abschlüsse manuell prüfen“.</li>
          <li>Hürde: Abschlüsse für mindestens zwei Jahre, sonst „nicht hinzufügbar“ mit Grund.</li>
          <li>Reiter 1: Live wird nur die EBITDA-Marge übernommen, (EBIT + Abschreibungen) ÷ Umsatz aus XBRL-Daten. Eine Marketingmarge erscheint nur mit geprüfter Definition.</li>
          <li>Reiter 2: Börsennotierte Peers gelten als geeignet. Ein Beta ist live nicht verfügbar, weil die App keine Kursdaten abruft.</li>
          <li>Score: Mit hinterlegtem Claude-Schlüssel schlägt Claude K1 bis K4 und zwei Sätze vor (Label „KI-Vorschlag“). Für häufig genannte Kandidaten gibt es eine vorbereitete Einschätzung vom 22.11.2026. Sonst setzt der Nutzer K1 bis K4 per Auswahl; die Sätze entstehen aus der Regel.</li>
          <li>Grenzen: höchstens 20 Live-Prüfungen je Besucher und Tag; Antwort innerhalb von rund 20 Sekunden, sonst „Quelle antwortet nicht“.</li>
        </ol>
      </Section>

      <Section title="Reiter 1: Margen">
        <ul className="list-disc pl-5 space-y-1">
          <li>Marketingmarge = (Umsatz − Marketingaufwand) ÷ Umsatz, mit der Abgrenzung des Unternehmens. Eine harmonisierte Umrechnung gibt es bewusst nicht; die Definitionstabelle zeigt die Unterschiede.</li>
          <li>EBITDA-Marge bereinigt = bereinigtes EBITDA des Unternehmens ÷ Umsatz. Unbereinigt = (EBIT + Abschreibungen) ÷ Umsatz, gleiche Regel für alle.</li>
          <li>Perioden: Geschäftsjahre 2023 bis 2025. Ein Geschäftsjahr zählt zu dem Kalenderjahr, in das die meisten seiner Monate fallen (Ende März 2026 zählt als GJ 2025).</li>
          <li>LTM (letzte zwölf Monate) = GJ 2025 + laufendes Geschäftsjahr bis zum letzten Bericht − gleicher Zeitraum des Vorjahres. Jeder Punkt trägt sein Periodenlabel. Private britische Peers berichten nur jährlich; dort ist das letzte Geschäftsjahr der jüngste Wert.</li>
          <li>Beträge bleiben in Originalwährung; Margen brauchen keine Umrechnung.</li>
        </ul>
      </Section>

      <Section title="Reiter 2: Eigenkapitalkosten">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Kurse: tägliche Schlusskurse aus S&amp;P Capital IQ bis {deDate(params.dataDates.prices)}, split-bereinigt, Landeswährung. Rohdaten werden nicht veröffentlicht, nur die gerechneten Betas.</li>
          <li>Renditen: wöchentlich aus Freitags-Schlusskursen (bei Feiertag letzter Handelstag der Woche), 104 Wochen. Sensitivität: monatlich, 60 Monate.</li>
          <li>Verschuldetes Beta: Regression (kleinste Quadrate) der Aktienrendite auf die Rendite eines breiten lokalen Index; mindestens {params.minWeeks} Wochen bzw. {params.minMonths} Monate. Sensitivität: MSCI World in der Währung der Aktie.</li>
          <li>FK/EK = Nettofinanzverschuldung ohne Leasing laut letztem Abschluss ÷ Marktkapitalisierung am {deDate(params.dataDates.prices)}; Untergrenze 0.</li>
          <li>Unlevern nach Harris-Pringle: βu = βL ÷ (1 + FK/EK). Sensitivität Hamada: βu = βL ÷ (1 + (1 − t) × FK/EK) mit gesetzlichem Steuersatz des Peers.</li>
          <li>Median und 25-%- bzw. 75-%-Quantil der unverschuldeten Betas der aktiven Peers (lineare Interpolation wie Excel QUARTILE.INC). Unter drei Peers: Minimum und Maximum mit Warnung.</li>
          <li>Relevern: βL* = βu × (1 + Ziel-FK/EK); bei Hamada mit (1 − {pct(params.targetTaxRate.value, 0)}).</li>
          <li>CAPM: rE = Basiszins + βL* × Marktrisikoprämie + Zuschlag. Punktwert mit dem Median, Spanne mit den Quartilen, jeweils bei der eingestellten Prämie. Die Wirkung der Prämie zeigt die Sensitivitätsmatrix.</li>
          <li>Blume-Anpassung als Sensitivität: 0,67 × βL + 0,33, angewendet vor dem Unlevern.</li>
        </ol>
        <table className="data mt-3">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Wert</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basiszins</td>
              <td className="tabular">{pct(params.riskFree.value, 2)}</td>
              <td>
                <a className="link" href={params.riskFree.url} target="_blank" rel="noopener noreferrer">
                  {params.riskFree.source}
                </a>
                , Stand {deDate(params.riskFree.asOf)}
              </td>
            </tr>
            <tr>
              <td>Marktrisikoprämie</td>
              <td className="tabular">
                {pct(params.mrp.low, 2)} bis {pct(params.mrp.high, 2)}, Start {pct(params.mrp.start, 2)}
              </td>
              <td>
                <a className="link" href={params.mrp.url} target="_blank" rel="noopener noreferrer">
                  {params.mrp.source}
                </a>
                , Stand {deDate(params.mrp.asOf)}
              </td>
            </tr>
            <tr>
              <td>Steuersatz beim Relevern (nur Hamada)</td>
              <td className="tabular">{pct(params.targetTaxRate.value, 0)}</td>
              <td>{params.targetTaxRate.source}</td>
            </tr>
            {Object.entries(taxes).map(([cc, t]) => (
              <tr key={cc}>
                <td>Steuersatz {cc} (nur Hamada)</td>
                <td className="tabular">{pct(t.rate, 1)}</td>
                <td>
                  {t.source} ({t.label})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[var(--text-2)]">
          Beta-Status: {betas.meta.status === "berechnet" ? `berechnet am ${deDate(betas.meta.computedAt)}` : "ausstehend"}. {betas.meta.method}
        </p>
      </Section>

      <Section title="Indizes je Peer">
        <table className="data">
          <thead>
            <tr>
              <th>Peer</th>
              <th>Börse, Ticker</th>
              <th>Vergleichsindex</th>
            </tr>
          </thead>
          <tbody>
            {peers
              .filter((p) => p.tab2.eligible)
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.shortName}</td>
                  <td>
                    {p.exchange}, {p.ticker}
                  </td>
                  <td>{p.index}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Section>

      <Section title="Prüfpaket und Nachrechnung">
        <p>
          Reiter 1 und Reiter 2 bieten je einen Download „Prüfpaket (CSV)“ mit jeder angezeigten Zahl, Label, Rechnung, Quelle und Stand. Die Datei öffnet direkt in Excel. Zwei Fälle sind in Excel nachgerechnet: EverQuote (Margen) und MONY (Beta bis Eigenkapitalkosten).
        </p>
      </Section>

      <Section title="Prüfliste: 15 Zahlen zum Nachrechnen">
        <p className="mb-2">Stand der Standard-Gruppe mit Basiszins 3,75 %, Prämie 5,25 % und Ziel-FK/EK beim Median. Jede Zahl lässt sich mit dem Prüfpaket in Excel nachrechnen.</p>
        <div className="scroll-x">
          <table className="data min-w-[640px]">
            <thead>
              <tr>
                <th className="num">Nr.</th>
                <th>Zahl</th>
                <th className="num">Erwartet</th>
                <th>So prüfen</th>
              </tr>
            </thead>
            <tbody>
              {checklist.map((c) => (
                <tr key={c.nr}>
                  <td className="num">{c.nr}</td>
                  <td>{c.what}</td>
                  <td className="num">{c.expected}</td>
                  <td className="text-xs">{c.check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Build-Log">
        <ul className="list-disc pl-5 space-y-1">
          <li>22.11.2026: Briefing und PRD mit 27 Entscheidungen, Review von außen, Zeitplan bis 24.11.2026.</li>
          <li>22.11.2026: App-Grundgerüst mit Rechenkern, Prüfskript und Tests; Live-Prüfung über SEC, filings.xbrl.org und Companies House.</li>
          <li>22.11.2026: Kurse aus S&amp;P Capital IQ (Chart Builder) bis 20.11.2026, Betas lokal gerechnet; Excel-Nachrechnung für MONY stimmt mit SLOPE überein.</li>
          <li>22.11.2026: Finanzzahlen aus Geschäftsberichten, 10-K, 10-Q, Ergebnismitteilungen und Companies House erfasst, jede Zeile mit Quelle, Stand und Label.</li>
        </ul>
      </Section>

      <Section title="Technik">
        <p>
          Next.js auf Vercel, Code und Daten im öffentlichen GitHub-Repo. Die Oberfläche rechnet nur auf geprüften Dateien. Ein Prüfskript bricht jeden Build ab, wenn eine Zahl ohne Quelle, Stand oder Label ist oder Rohkurse im Repo liegen. Schlüssel für Companies House und Claude liegen nur in den Vercel-Einstellungen. Gebaut mit Claude Code; der Code ist öffentlich nachvollziehbar.
        </p>
        <p className="mt-2">
          <a className="link" href="https://github.com/RFcodeRF/peer-benchmark" target="_blank" rel="noopener noreferrer">
            Repo auf GitHub
          </a>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 mt-4 text-sm leading-6">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
