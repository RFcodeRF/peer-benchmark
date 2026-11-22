import { loadData } from "@/lib/data";
import { PeerGroup } from "@/components/PeerGroup";
import type { Candidate } from "@/components/LiveCheck";

export default function Home() {
  const data = loadData();
  const candidates = (data.candidates as { candidates: Candidate[] }).candidates;
  return <PeerGroup peers={data.peers} scores={data.scores} candidates={candidates} />;
}
