import { loadData } from "@/lib/data";
import { buildSeries } from "@/lib/finance";
import { Margen } from "@/components/Margen";
import type { PeerSeries } from "@/lib/types";

export const metadata = { title: "Margen: Marketingmarge und EBITDA-Marge" };

export default function MarketingPage() {
  const data = loadData();
  const series: Record<string, PeerSeries> = {};
  for (const p of data.peers) series[p.id] = buildSeries(p.id, data.financials);
  return <Margen peers={data.peers} series={series} definitions={data.definitions} />;
}
