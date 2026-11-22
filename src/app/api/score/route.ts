import { NextResponse } from "next/server";
import { clientKey, takeToken } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 25;

const RUBRIC = `Bewerte die Eignung eines Unternehmens als Peer für ein deutsches Mehrsparten-Vergleichsportal (öffentlich bekanntes Profil: Vergleich und Vermittlung für Endkunden in Versicherung, Finanzen, Energie, Telekommunikation und Reise). Nutze nur öffentliches Wissen und die gelieferte Beschreibung.

Vier Kriterien, je 0, 0.5 oder 1:
K1 Geschäftsmodell: Ist B2C-Vergleich oder Vermittlung das Kerngeschäft? 1 = Kerngeschäft; 0.5 = Teil des Konzerns oder anderes Vermittlungsmodell; 0 = kein Vermittlungsgeschäft.
K2 Erlösmodell: Kommen die Erlöse aus Provisionen, Leads oder Klicks? 1 = überwiegend; 0.5 = gemischt; 0 = nein, Produktmarge oder Abo.
K3 Sparten: Wie viele der Sparten Versicherung, Finanzen, Energie, Telekommunikation, Reise? 1 = drei oder mehr; 0.5 = eine bis zwei; 0 = keine.
K4 Markt: Wo sitzen die Endkunden? 1 = Deutschland oder mehrere EU-Länder; 0.5 = ein anderes europäisches Land oder global gemischt; 0 = außerhalb Europas.

Schreibe zwei kurze deutsche Sätze ohne Gedankenstriche: Satz 1 nennt die stärksten Kriterien, Satz 2 beginnt mit "Einschränkung:" und nennt die wichtigste Einschränkung. Gib je Kriterium eine Begründung in einem kurzen Satz.
Antworte nur mit JSON: {"k1":0|0.5|1,"k2":...,"k3":...,"k4":...,"sentences":["...","..."],"rationale":{"k1":"...","k2":"...","k3":"...","k4":"..."}}`;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ available: false });
  const limit = takeToken("score:" + clientKey(req), 20);
  if (!limit.ok) return NextResponse.json({ available: false, error: "Tageslimit erreicht" });

  const body = (await req.json().catch(() => ({}))) as { name?: string; country?: string; description?: string; sic?: string };
  const name = String(body.name ?? "").slice(0, 200);
  const user = `Unternehmen: ${name}\nLand: ${String(body.country ?? "").slice(0, 100)}\nBranche (SIC): ${String(body.sic ?? "").slice(0, 200)}\nAuszug aus dem Geschäftsbericht:\n${String(body.description ?? "").slice(0, 6000) || "nicht verfügbar"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 700,
        system: RUBRIC,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return NextResponse.json({ available: false, error: `Claude antwortet mit ${res.status}` });
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const ok = (v: unknown) => v === 0 || v === 0.5 || v === 1;
    if (!["k1", "k2", "k3", "k4"].every((k) => ok(json[k])) || !Array.isArray(json.sentences) || json.sentences.length !== 2) {
      return NextResponse.json({ available: false, error: "Antwort unvollständig" });
    }
    return NextResponse.json({ available: true, suggestion: json });
  } catch (e) {
    return NextResponse.json({ available: false, error: (e as Error).message });
  }
}
