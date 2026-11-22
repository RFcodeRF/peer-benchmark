import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { loadData } from "@/lib/data";
import { SelectionProvider } from "@/components/SelectionProvider";
import { Nav } from "@/components/Nav";
import { deDate } from "@/lib/format";


export const metadata: Metadata = {
  title: "Peer-Benchmark Vergleichsportale",
  description: "Marketingmarge, EBITDA-Marge und Eigenkapitalkosten von Vergleichsportalen. Privates Bewerbungsprojekt.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b2a5b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const data = loadData();
  const defaults = {
    tab1: data.peers.filter((p) => p.defaultOn.tab1).map((p) => p.id),
    tab2: data.peers.filter((p) => p.defaultOn.tab2).map((p) => p.id),
  };
  return (
    <html lang="de">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased min-h-screen flex flex-col`}>
        <SelectionProvider defaults={defaults}>
          <header className="bg-[var(--navy)] text-white">
            <div className="mx-auto max-w-6xl px-4">
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <div>
                  <div className="text-lg font-semibold tracking-tight">Peer-Benchmark Vergleichsportale</div>
                  <div className="text-xs text-white/70">Marketingmarge, EBITDA-Marge und Eigenkapitalkosten</div>
                </div>
                <div className="hidden sm:block text-xs text-white/70 text-right tabular">
                  Datenstand: Kurse {deDate(data.params.dataDates.prices)}, Abschlüsse {deDate(data.params.dataDates.filings)}
                </div>
              </div>
              <Nav />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
          <footer className="border-t border-[var(--line)] bg-white">
            <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-[var(--text-2)] flex flex-col gap-1 sm:flex-row sm:justify-between">
              <span>Privates Bewerbungsprojekt ohne Verbindung zu CHECK24. Nur öffentliche Daten, Kursdaten aus S&amp;P Capital IQ.</span>
              <span className="tabular">
                Datenstand: Kurse {deDate(data.params.dataDates.prices)}, Abschlüsse {deDate(data.params.dataDates.filings)}
              </span>
            </div>
          </footer>
        </SelectionProvider>
      </body>
    </html>
  );
}
