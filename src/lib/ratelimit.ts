// Simple per-visitor daily limit. Memory lives per server instance, so this is a
// brake against abuse, not an exact counter; the Anthropic spending limit is the hard cap.
const hits = new Map<string, { day: string; count: number }>();

export function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unbekannt";
}

export function takeToken(key: string, limit = 20) {
  const day = new Date().toISOString().slice(0, 10);
  const cur = hits.get(key);
  if (!cur || cur.day !== day) {
    hits.set(key, { day, count: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0 };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count };
}
