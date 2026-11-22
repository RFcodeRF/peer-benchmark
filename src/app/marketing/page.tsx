import { loadData } from "@/lib/data";
import { buildSeries } from "@/lib/finance";
import { Reiter1 } from "@/components/Reiter1";
import type { PeerSeries } from "@/lib/types";

export const metadata = { title: "Reiter 1: Marketingmarge und EBITDA-Marge" };

export default function MarketingPage() {
  const data = loadData();
  const series: Record<string, PeerSeries> = {};
  for (const p of data.peers) series[p.id] = buildSeries(p.id, data.financials);
  return <Reiter1 peers={data.peers} series={series} definitions={data.definitions} insights={data.insights} />;
}
