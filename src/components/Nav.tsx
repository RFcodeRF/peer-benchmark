"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Peer-Gruppe" },
  { href: "/marketing", label: "Margen" },
  { href: "/eigenkapitalkosten", label: "Eigenkapitalkosten" },
  { href: "/methodik", label: "Methodik" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto -mb-px" aria-label="Hauptnavigation">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
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
          </Link>
        );
      })}
    </nav>
  );
}
