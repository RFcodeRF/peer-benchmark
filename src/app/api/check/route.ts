import { NextResponse } from "next/server";
import { checkCompaniesHouse, checkEsef, checkSec } from "@/lib/live";
import { clientKey, takeToken } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const source = p.get("source");
  const id = p.get("id") ?? "";
  const limit = takeToken("check:" + clientKey(req), 20);
  if (!limit.ok) return NextResponse.json({ error: "Tageslimit von 20 Live-Prüfungen erreicht. Bitte morgen erneut versuchen." }, { status: 429 });
  try {
    const withDescription = Boolean(process.env.ANTHROPIC_API_KEY);
    const result =
      source === "SEC" ? await checkSec(id, withDescription) : source === "ESEF" ? await checkEsef(id) : source === "Companies House" ? await checkCompaniesHouse(id) : null;
    if (!result) return NextResponse.json({ error: "Unbekannte Quelle" }, { status: 400 });
    return NextResponse.json({ result, remaining: limit.remaining });
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "TimeoutError" ? "Quelle antwortet nicht (Zeitlimit)." : err.message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
