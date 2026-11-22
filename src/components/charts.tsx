"use client";

import { useMemo, useState } from "react";
import type { MetricPoint, PeriodKey } from "@/lib/types";
import { pct, num } from "@/lib/format";
import { median } from "@/lib/coe";
import { LabelBadge, SourceCard, useWidth } from "./ui";

export const PERIOD_COLORS: Record<PeriodKey, string> = {
  FY2023: "var(--seq-1)",
  FY2024: "var(--seq-2)",
  FY2025: "var(--seq-3)",
  LTM: "var(--seq-4)",
};
export const PERIOD_NAMES: Record<PeriodKey, string> = { FY2023: "GJ 2023", FY2024: "GJ 2024", FY2025: "GJ 2025", LTM: "Letzte 12 Monate" };

function niceTicks(min: number, max: number, step: number) {
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export interface StripRow {
  id: string;
  name: string;
  points: Partial<Record<PeriodKey, MetricPoint>>;
  emptyText?: string;
}

interface Hover {
  rowId: string;
  period: PeriodKey;
  x: number;
  y: number;
  pinned: boolean;
}

export function PeriodLegend({ periods }: { periods: PeriodKey[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--text-2)]" aria-label="Legende Perioden">
      {periods.map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="5" fill={PERIOD_COLORS[p]} />
          </svg>
          {PERIOD_NAMES[p]}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ title, point, x, y, width, pinned, onClose }: { title: string; point: MetricPoint; x: number; y: number; width: number; pinned: boolean; onClose: () => void }) {
  const w = 260;
  const left = Math.max(4, Math.min(x - w / 2, width - w - 4));
  return (
    <div
      className={`absolute z-20 card shadow-lg p-3 text-left ${pinned ? "" : "pointer-events-none"}`}
      style={{ left, top: y + 14, width: w }}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-xs text-[var(--text-2)]">{point.periodLabel}</div>
        </div>
        {pinned && (
          <button type="button" onClick={onClose} className="text-xs text-[var(--text-2)]" aria-label="Schließen">
            ✕
          </button>
        )}
      </div>
      <div className="text-lg font-semibold tabular mt-1">{pct(point.value)}</div>
      <div className="mt-1">
        <SourceCard source={point.source} />
      </div>
      {!pinned && <div className="mt-1 text-[11px] text-[var(--text-3)]">Klicken, um die Quelle zu öffnen</div>}
    </div>
  );
}

export function DotStrip({ rows, periods, ariaLabel, medianLabel }: { rows: StripRow[]; periods: PeriodKey[]; ariaLabel: string; medianLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const latest = (r: StripRow) => {
    for (const p of [...periods].reverse()) if (r.points[p]?.value != null) return r.points[p]!.value as number;
    return null;
  };
  const sorted = useMemo(() => {
    const withV = rows.filter((r) => latest(r) !== null).sort((a, b) => (latest(b) as number) - (latest(a) as number));
    const without = rows.filter((r) => latest(r) === null);
    return [...withV, ...without];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, periods]);

  const values = sorted.flatMap((r) => periods.map((p) => r.points[p]?.value).filter((v): v is number => v != null));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0.1, ...values);
  const step = hi - lo > 0.8 ? 0.2 : 0.1;
  const ticks = niceTicks(lo, hi + step * 0.5, step);
  const dMin = ticks[0];
  const dMax = ticks[ticks.length - 1];

  const narrow = width < 560;
  const L = narrow ? 104 : 150;
  const R = narrow ? 52 : 64;
  const rowH = 30;
  const top = 30;
  const H = top + sorted.length * rowH + 10;
  const plotW = Math.max(60, width - L - R);
  const sx = (v: number) => L + ((v - dMin) / (dMax - dMin)) * plotW;

  const latestVals = sorted.map(latest).filter((v): v is number => v !== null);
  const med = latestVals.length ? median(latestVals) : null;

  const hovered = hover ? sorted.find((r) => r.id === hover.rowId)?.points[hover.period] : null;
  const hoveredName = hover ? sorted.find((r) => r.id === hover.rowId)?.name ?? "" : "";

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => hover && !hover.pinned && setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={top - 6} y2={H - 6} stroke={t === 0 ? "#b9c0cc" : "var(--grid)"} strokeWidth={1} />
              <text x={sx(t)} y={top - 12} textAnchor="middle" fontSize={11} fill="var(--text-3)" className="tabular">
                {Math.round(t * 100)} %
              </text>
            </g>
          ))}
          {med !== null && (
            <g>
              <line x1={sx(med)} x2={sx(med)} y1={top - 2} y2={H - 6} stroke="var(--text-2)" strokeDasharray="4 3" strokeWidth={1} />
              <text x={sx(med) + 4} y={H - 8} fontSize={11} fill="var(--text-2)">
                {medianLabel}: {pct(med)}
              </text>
            </g>
          )}
          {sorted.map((r, i) => {
            const cy = top + i * rowH + rowH / 2;
            const vs = periods.map((p) => r.points[p]?.value).filter((v): v is number => v != null);
            const lv = latest(r);
            return (
              <g key={r.id}>
                <text x={L - 10} y={cy + 4} textAnchor="end" fontSize={12.5} fill="var(--text)">
                  {r.name.length > (narrow ? 13 : 22) ? r.name.slice(0, narrow ? 12 : 21) + "…" : r.name}
                </text>
                {vs.length > 1 && <line x1={sx(Math.min(...vs))} x2={sx(Math.max(...vs))} y1={cy} y2={cy} stroke="#c9ced8" strokeWidth={2} strokeLinecap="round" />}
                {vs.length === 0 && (
                  <text x={L + 4} y={cy + 4} fontSize={12} fill="var(--text-3)">
                    {r.emptyText ?? "nicht berichtet"}
                  </text>
                )}
                {periods.map((p) => {
                  const pt = r.points[p];
                  if (!pt || pt.value == null) return null;
                  const cx = sx(pt.value);
                  const active = hover?.rowId === r.id && hover.period === p;
                  return (
                    <g key={p}>
                      <circle cx={cx} cy={cy} r={active ? 7 : 5.5} fill={PERIOD_COLORS[p]} stroke="white" strokeWidth={2} />
                      {pt.source.label === "Annahme" && <circle cx={cx} cy={cy} r={2} fill="white" />}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={11}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => (!hover || !hover.pinned) && setHover({ rowId: r.id, period: p, x: cx, y: cy, pinned: false })}
                        onClick={() => setHover({ rowId: r.id, period: p, x: cx, y: cy, pinned: true })}
                      >
                        <title>{`${r.name}, ${PERIOD_NAMES[p]}: ${pct(pt.value)}`}</title>
                      </circle>
                    </g>
                  );
                })}
                {lv !== null && (
                  <text x={width - R + 8} y={cy + 4} fontSize={12} fill="var(--text)" className="tabular" fontWeight={600}>
                    {pct(lv, 0)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover && hovered && (
        <Tooltip title={hoveredName} point={hovered} x={hover.x} y={hover.y} width={width} pinned={hover.pinned} onClose={() => setHover(null)} />
      )}
    </div>
  );
}

export interface ScatterPoint {
  id: string;
  name: string;
  period: PeriodKey;
  x: MetricPoint;
  y: MetricPoint;
}

export function Scatter({ points, xLabel, yLabel, ariaLabel }: { points: ScatterPoint[]; xLabel: string; yLabel: string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ id: string; pinned: boolean } | null>(null);
  const xs = points.map((p) => p.x.value as number);
  const ys = points.map((p) => p.y.value as number);
  const xt = niceTicks(Math.min(0, ...xs), Math.max(0.2, ...xs) + 0.05, 0.2);
  const yt = niceTicks(Math.min(0, ...ys), Math.max(0.1, ...ys) + 0.05, 0.1);
  const narrow = width < 560;
  const L = 48;
  const B = 40;
  const T = 12;
  const Rr = narrow ? 70 : 110;
  const H = narrow ? 320 : 380;
  const sx = (v: number) => L + ((v - xt[0]) / (xt.at(-1)! - xt[0])) * (width - L - Rr);
  const sy = (v: number) => T + (1 - (v - yt[0]) / (yt.at(-1)! - yt[0])) * (H - T - B);

  // Greedy label placement to avoid overlaps
  const labels = useMemo(() => {
    const placed: { id: string; x: number; y: number }[] = [];
    const sortedPts = [...points].sort((a, b) => (b.y.value as number) - (a.y.value as number));
    for (const p of sortedPts) {
      const x = sx(p.x.value as number) + 9;
      let y = sy(p.y.value as number) + 4;
      for (let k = 0; k < 8; k++) {
        const clash = placed.find((q) => Math.abs(q.y - y) < 13 && Math.abs(q.x - x) < 90);
        if (!clash) break;
        y = clash.y + 13;
      }
      placed.push({ id: p.id, x, y });
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width]);

  const hp = hover ? points.find((p) => p.id === hover.id) : null;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => hover && !hover.pinned && setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          {xt.map((t) => (
            <g key={"x" + t}>
              <line x1={sx(t)} x2={sx(t)} y1={T} y2={H - B} stroke={t === 0 ? "#b9c0cc" : "var(--grid)"} />
              <text x={sx(t)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="var(--text-3)">
                {Math.round(t * 100)} %
              </text>
            </g>
          ))}
          {yt.map((t) => (
            <g key={"y" + t}>
              <line x1={L} x2={width - Rr} y1={sy(t)} y2={sy(t)} stroke={Math.abs(t) < 1e-9 ? "#b9c0cc" : "var(--grid)"} />
              <text x={L - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-3)">
                {Math.round(t * 100)} %
              </text>
            </g>
          ))}
          <text x={(L + width - Rr) / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="var(--text-2)">
            {xLabel}
          </text>
          <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize={12} fill="var(--text-2)" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>
            {yLabel}
          </text>
          {points.map((p) => {
            const cx = sx(p.x.value as number);
            const cy = sy(p.y.value as number);
            const ltm = p.period === "LTM";
            return (
              <g key={p.id}>
                <circle cx={cx} cy={cy} r={hover?.id === p.id ? 7.5 : 6} fill={ltm ? "var(--blue)" : "white"} stroke={ltm ? "white" : "var(--blue)"} strokeWidth={2} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={12}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => (!hover || !hover.pinned) && setHover({ id: p.id, pinned: false })}
                  onClick={() => setHover({ id: p.id, pinned: true })}
                >
                  <title>{`${p.name}: Marketingmarge ${pct(p.x.value)}, EBITDA-Marge ${pct(p.y.value)}`}</title>
                </circle>
              </g>
            );
          })}
          {labels.map((l) => {
            const p = points.find((q) => q.id === l.id)!;
            return (
              <text key={"l" + l.id} x={l.x} y={l.y} fontSize={12} fill="var(--text)">
                {p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name}
              </text>
            );
          })}
        </svg>
      )}
      {hp && (
        <div
          className={`absolute z-20 card shadow-lg p-3 ${hover?.pinned ? "" : "pointer-events-none"}`}
          style={{ left: Math.max(4, Math.min(sx(hp.x.value as number) - 140, width - 284)), top: sy(hp.y.value as number) + 14, width: 280 }}
        >
          <div className="flex justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold">{hp.name}</div>
              <div className="text-xs text-[var(--text-2)]">{hp.x.periodLabel}</div>
            </div>
            {hover?.pinned && (
              <button type="button" className="text-xs text-[var(--text-2)]" onClick={() => setHover(null)} aria-label="Schließen">
                ✕
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-[var(--text-2)]">Marketingmarge</div>
              <div className="font-semibold tabular">{pct(hp.x.value)}</div>
              <LabelBadge label={hp.x.source.label} />
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-2)]">EBITDA-Marge</div>
              <div className="font-semibold tabular">{pct(hp.y.value)}</div>
              <LabelBadge label={hp.y.source.label} />
            </div>
          </div>
          {hover?.pinned && (
            <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2">
              <SourceCard source={hp.x.source} title="Marketingmarge" />
              <SourceCard source={hp.y.source} title="EBITDA-Marge" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BetaStrip({ points, q1, med, q3, ariaLabel }: { points: { id: string; name: string; value: number }[]; q1: number | null; med: number | null; q3: number | null; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(2, ...points.map((p) => p.value)) + 0.1;
  const ticks = niceTicks(0, max, 0.5);
  const L = 16;
  const Rr = 16;
  const H = 120;
  const axisY = 84;
  const sx = (v: number) => L + (v / ticks.at(-1)!) * (width - L - Rr);
  const sorted = [...points].sort((a, b) => a.value - b.value);
  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={ariaLabel}>
          {q1 !== null && q3 !== null && <rect x={sx(q1)} y={22} width={Math.max(2, sx(q3) - sx(q1))} height={axisY - 22} fill="var(--blue-soft)" />}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={22} y2={axisY} stroke="var(--grid)" />
              <text x={sx(t)} y={axisY + 16} textAnchor="middle" fontSize={11} fill="var(--text-3)">
                {num(t, 1)}
              </text>
            </g>
          ))}
          <line x1={L} x2={width - Rr} y1={axisY} y2={axisY} stroke="#b9c0cc" />
          {med !== null && (
            <g>
              <line x1={sx(med)} x2={sx(med)} y1={16} y2={axisY} stroke="var(--navy)" strokeWidth={2} />
              <text x={sx(med)} y={12} textAnchor="middle" fontSize={11} fill="var(--navy)" fontWeight={600}>
                Median {num(med)}
              </text>
            </g>
          )}
          {sorted.map((p, i) => {
            const cy = 36 + (i % 3) * 16;
            return (
              <g key={p.id}>
                <circle cx={sx(p.value)} cy={cy} r={5.5} fill="var(--blue)" stroke="white" strokeWidth={2}>
                  <title>{`${p.name}: unverschuldetes Beta ${num(p.value)}`}</title>
                </circle>
                <text x={sx(p.value) + 8} y={cy + 4} fontSize={11} fill="var(--text)">
                  {p.name}
                </text>
              </g>
            );
          })}
          <text x={width - Rr} y={H - 4} textAnchor="end" fontSize={11} fill="var(--text-2)">
            Fläche: 25-%- bis 75-%-Quantil
          </text>
        </svg>
      )}
    </div>
  );
}
