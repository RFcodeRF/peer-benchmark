import { loadData } from "@/lib/data";
import { Reiter2 } from "@/components/Reiter2";

export const metadata = { title: "Reiter 2: Eigenkapitalkosten" };

export default function CoePage() {
  const data = loadData();
  return <Reiter2 peers={data.peers} betas={data.betas} capital={data.capital} params={data.params} />;
}
