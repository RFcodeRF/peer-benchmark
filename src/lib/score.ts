// Eignungs-Score: Score = 1 + K1 + K2 + K3 + K4, each 0, 0.5 or 1.
import type { ScoreEntry } from "./types";

export const CRITERIA = [
  {
    key: "k1",
    name: "K1 Geschäftsmodell",
    question: "Ist B2C-Vergleich oder Vermittlung das Kerngeschäft?",
    levels: { 1: "Kerngeschäft", 0.5: "Teil des Konzerns oder anderes Vermittlungsmodell", 0: "Kein Vermittlungsgeschäft" },
  },
  {
    key: "k2",
    name: "K2 Erlösmodell",
    question: "Kommen die Erlöse aus Provisionen, Leads oder Klicks?",
    levels: { 1: "Überwiegend", 0.5: "Gemischt", 0: "Nein, Produktmarge oder Abo" },
  },
  {
    key: "k3",
    name: "K3 Sparten",
    question: "Wie viele der Sparten Versicherung, Finanzen, Energie, Telekommunikation, Reise?",
    levels: { 1: "3 oder mehr", 0.5: "1 bis 2", 0: "Keine" },
  },
  {
    key: "k4",
    name: "K4 Markt",
    question: "Wo sitzen die Endkunden?",
    levels: { 1: "Deutschland oder mehrere EU-Länder", 0.5: "Ein anderes europäisches Land oder global gemischt", 0: "Außerhalb Europas" },
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export function totalScore(s: Pick<ScoreEntry, "k1" | "k2" | "k3" | "k4">) {
  return 1 + s.k1 + s.k2 + s.k3 + s.k4;
}

export function formatScore(v: number) {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const STRENGTH: Record<CriterionKey, string> = {
  k1: "Vergleich oder Vermittlung ist das Kerngeschäft",
  k2: "die Erlöse kommen überwiegend aus Provisionen, Leads oder Klicks",
  k3: "das Angebot deckt drei oder mehr der fünf Sparten ab",
  k4: "die Endkunden sitzen in Deutschland oder mehreren EU-Ländern",
};

const LIMIT: Record<CriterionKey, Record<string, string>> = {
  k1: { "0.5": "Vermittlung ist nur ein Teil des Geschäfts", "0": "es gibt kein Vermittlungsgeschäft" },
  k2: { "0.5": "die Erlöse sind nur teilweise provisionsbasiert", "0": "die Erlöse stammen aus Produktmarge oder Abo" },
  k3: { "0.5": "nur eine oder zwei der fünf Sparten sind abgedeckt", "0": "keine der fünf Sparten ist abgedeckt" },
  k4: { "0.5": "die Endkunden sitzen in einem anderen europäischen Land oder global verteilt", "0": "die Endkunden sitzen außerhalb Europas" },
};

// Rule-based two sentences: sentence 1 names the strongest criteria, sentence 2 the main limitation.
export function ruleSentences(name: string, s: Pick<ScoreEntry, "k1" | "k2" | "k3" | "k4">): [string, string] {
  const keys: CriterionKey[] = ["k1", "k2", "k3", "k4"];
  const strong = keys.filter((k) => s[k] === 1);
  const weak = keys.filter((k) => s[k] < 1).sort((a, b) => s[a] - s[b]);
  let first: string;
  if (strong.length === 0) first = `${name} erfüllt keines der vier Kriterien voll.`;
  else {
    const parts = strong.map((k) => STRENGTH[k]);
    const joined = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " und " + parts.at(-1);
    first = `Bei ${name} gilt: ${joined}.`;
  }
  const second = weak.length === 0 ? "Einschränkung: keine nach der Rubrik." : `Einschränkung: ${LIMIT[weak[0]][String(s[weak[0]])]}.`;
  return [first, second];
}

export const SCORE_OPTIONS = [0, 0.5, 1] as const;
