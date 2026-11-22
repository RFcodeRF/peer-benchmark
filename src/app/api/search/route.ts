import { NextResponse } from "next/server";
import { companiesHouseConfigured, searchCompaniesHouse, searchEsef, searchSec, type SearchHit } from "@/lib/live";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [], notes: ["Bitte mindestens zwei Zeichen eingeben."] });

  const notes: string[] = [];
  const settle = async (label: string, fn: () => Promise<SearchHit[]>) => {
    try {
      return await fn();
    } catch (e) {
      notes.push(`${label}: ${(e as Error).name === "TimeoutError" ? "Quelle antwortet nicht" : (e as Error).message}`);
      return [];
    }
  };
  const [sec, esef, ch] = await Promise.all([
    settle("SEC", () => searchSec(q)),
    settle("filings.xbrl.org", () => searchEsef(q)),
    companiesHouseConfigured() ? settle("Companies House", () => searchCompaniesHouse(q)) : Promise.resolve([] as SearchHit[]),
  ]);
  if (!companiesHouseConfigured()) notes.push("Companies House ist nicht eingerichtet; britische Privatunternehmen bitte manuell prüfen.");
  notes.push("Französische Unternehmen: keine automatische Abfrage eingerichtet (Pappers). Bitte manuell prüfen.");
  return NextResponse.json({ results: [...sec, ...esef, ...ch], notes });
}
