// Server-side loader for the checked data files in /data.
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type {
  BetaFile,
  CapitalStructureRow,
  DefinitionEntry,
  FinancialRow,
  Insight,
  Params,
  Peer,
  ScoreEntry,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

function readCsv<T>(file: string, numeric: string[]): T[] {
  const text = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, comments: "#" });
  return parsed.data.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of numeric) o[k] = r[k] === "" || r[k] === undefined ? NaN : Number(r[k]);
    return o as T;
  });
}

export interface AppData {
  peers: Peer[];
  scores: Record<string, ScoreEntry>;
  definitions: Record<string, DefinitionEntry>;
  financials: FinancialRow[];
  capital: CapitalStructureRow[];
  betas: BetaFile;
  params: Params;
  insights: Insight[];
  candidates: unknown;
}

export function loadData(): AppData {
  return {
    peers: readJson<Peer[]>("peers.json"),
    scores: readJson<Record<string, ScoreEntry>>("scores.json"),
    definitions: readJson<Record<string, DefinitionEntry>>("definitions.json"),
    financials: readCsv<FinancialRow>("financials.csv", ["value"]),
    capital: readCsv<CapitalStructureRow>("capital_structure.csv", ["net_debt", "market_cap"]),
    betas: readJson<BetaFile>("betas.json"),
    params: readJson<Params>("params.json"),
    insights: readJson<Insight[]>("insights.json"),
    candidates: readJson<unknown>("candidates.json"),
  };
}
