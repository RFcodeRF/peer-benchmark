"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelection } from "./SelectionProvider";

const ITEMS = [
  { href: "/", label: "Peer-Gruppe" },
  { href: "/marketing", label: "Margen" },
  { href: "/eigenkapitalkosten", label: "Eigenkapitalkosten" },
  { href: "/methodik", label: "Methodik" },
];

export function Nav() {
  const path = usePathname();
  const sel = useSelection();
  return (
    <nav className="flex gap-1 overflow-x-auto -mb-px" aria-label="Hauptnavigation">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        const count = it.href === "/marketing" ? sel.tab1.length : it.href === "/eigenkapitalkosten" ? sel.tab2.length : null;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2.5 text-[14px] font-bold border-b-[3px] transition-colors ${
              active ? "border-[var(--yellow)] text-white" : "border-transparent text-white/80 hover:text-white hover:border-white/40"
            }`}
          >
            {it.label}
            {count !== null && <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-normal tabular" title="aktive Peers">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
