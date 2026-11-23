import { loadData } from "@/lib/data";
import { Eigenkapitalkosten } from "@/components/Eigenkapitalkosten";

export const metadata = { title: "Eigenkapitalkosten" };

export default function CoePage() {
  const data = loadData();
  return <Eigenkapitalkosten peers={data.peers} betas={data.betas} capital={data.capital} params={data.params} />;
}
