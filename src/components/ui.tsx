"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SourceInfo } from "@/lib/types";
import { deDate } from "@/lib/format";

const LABEL_STYLE: Record<string, string> = {
  Berichtet: "bg-[#e8f1fc] text-[#104281] border-[#b7d3f6]",
  "Eigene Rechnung": "bg-[#eef0f4] text-[#2d3a4f] border-[#d3d8e2]",
  Annahme: "bg-[#fff6df] text-[#7a5200] border-[#f3d98e]",
  "Automatisch erfasst": "bg-[#f1ecfb] text-[#4a3aa7] border-[#d6cdf3]",
  "Nicht berichtet": "bg-white text-[#75736e] border-[#d3d8e2] border-dashed",
  "KI-Vorschlag": "bg-[#f1ecfb] text-[#4a3aa7] border-[#d6cdf3]",
  "Vorbereitete Einschätzung": "bg-[#eef0f4] text-[#2d3a4f] border-[#d3d8e2]",
  Manuell: "bg-[#fff1e0] text-[#8a4600] border-[#f6c992]",
  Entwurf: "bg-white text-[#75736e] border-[#d3d8e2]",
};

export function LabelBadge({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center rounded-[3px] border px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap ${LABEL_STYLE[label] ?? LABEL_STYLE["Eigene Rechnung"]}`}>
      {label}
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={onChange} disabled={disabled} />;
}

export function SectionTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold">{title}</h2>
      {sub && <p className="text-sm text-[var(--text-2)] mt-0.5">{sub}</p>}
    </div>
  );
}

export function PageIntro({ title, question, children }: { title: string; question?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {question && (
        <p className="mt-2 text-[15px] text-[var(--text-2)] max-w-3xl">
          <span className="font-medium text-[var(--text)]">Leitfrage: </span>
          {question}
        </p>
      )}
      {children}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const cls = tone === "warn" ? "bg-[var(--warn-soft)] border-[#f3d98e]" : "bg-[var(--blue-soft)] border-[var(--blue-line)]";
  const icon = tone === "warn" ? "⚠" : "ℹ";
  return (
    <div className={`flex gap-2 rounded-[3px] border px-3 py-2 text-sm ${cls}`} role={tone === "warn" ? "alert" : "note"}>
      <span aria-hidden className="font-semibold">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function SourceCard({ source, title }: { source: SourceInfo; title?: string }) {
  return (
    <div className="text-xs leading-5 space-y-1">
      {title && <div className="font-semibold text-[13px]">{title}</div>}
      <div className="flex items-center gap-2">
        <LabelBadge label={source.label} />
        {source.asOf && <span className="text-[var(--text-2)]">Stand {deDate(source.asOf)}</span>}
      </div>
      {source.formula && <div className="text-[var(--text-2)]">Rechnung: {source.formula}</div>}
      {source.title && (
        <div>
          Quelle:{" "}
          {source.url ? (
            <a className="link" href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
          ) : (
            source.title
          )}
          {source.page && <span className="text-[var(--text-2)]">, {source.page}</span>}
        </div>
      )}
      {source.note && <div className="text-[var(--text-2)]">Hinweis: {source.note}</div>}
    </div>
  );
}

// A value that reveals source, date and label on tap or click.
export function SourceValue({ display, source, title, className = "" }: { display: string; source: SourceInfo; title?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const marker = source.label === "Annahme" ? "*" : "";
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`tabular underline decoration-dotted decoration-[#9aa3b2] underline-offset-[3px] hover:decoration-[var(--blue)] ${className}`}
        title="Quelle anzeigen"
      >
        {display}
        {marker}
      </button>
      {open && (
        <span className="absolute z-30 right-0 top-full mt-1 w-72 max-w-[80vw] card p-3 shadow-lg text-left text-[var(--text)] font-normal whitespace-normal">
          <SourceCard source={source} title={title} />
        </span>
      )}
    </span>
  );
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[3px] border border-[var(--line)] bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm rounded-[2px] ${value === o.value ? "bg-[var(--blue)] text-white font-bold" : "text-[var(--text-2)] hover:text-[var(--text)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semicolon and decimal comma so German Excel opens it directly.
  const text = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Column header or label with a short explanation on hover, focus or tap.
export function Tip({ label, tip, align = "left", className = "" }: { label: React.ReactNode; tip: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <span className={`tip ${align === "right" ? "tip-right" : ""} ${className}`} tabIndex={0}>
      <span className="tip-label">{label}</span>
      <span role="tooltip" className="tip-box">
        {tip}
      </span>
    </span>
  );
}

export function scoreBand(total: number): "good" | "mid" | "low" {
  return total >= 4 ? "good" : total >= 3 ? "mid" : "low";
}

// Score chip: green from 4, yellow from 3 to 3.5, light red below 3.
export function ScoreBadge({ total, display }: { total: number; display: string }) {
  const band = scoreBand(total);
  const label = band === "good" ? "hohe Eignung" : band === "mid" ? "mittlere Eignung" : "geringe Eignung";
  return (
    <span
      className="inline-flex min-w-[46px] justify-center rounded-[3px] px-2 py-1 text-[15px] font-bold tabular"
      style={{ background: `var(--score-${band}-bg)`, color: `var(--score-${band}-fg)`, boxShadow: `inset 0 -3px 0 var(--score-${band}-bar)` }}
      title={`Score ${display}: ${label}`}
    >
      {display}
    </span>
  );
}

// Multi-select chips (at least one stays selected).
export function ChipSelect<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; color?: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (on && value.length === 1) return;
              onChange(on ? value.filter((v) => v !== o.value) : options.map((x) => x.value).filter((v) => v === o.value || value.includes(v)));
            }}
            className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-sm ${on ? "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--text)] font-bold" : "border-[var(--line)] bg-white text-[var(--text-3)]"}`}
          >
            {o.color && (
              <svg width="10" height="10" aria-hidden>
                <circle cx="5" cy="5" r="4.5" fill={on ? o.color : "#d0d0d6"} />
              </svg>
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
