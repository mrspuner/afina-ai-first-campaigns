import type { Artifact } from "@/state/app-state";

export type ArtifactGroup =
  | { kind: "collection"; campaignId: string; cumulative: Artifact; dailies: Artifact[]; dailyCount: number; latest: string }
  | { kind: "single"; campaignId: string; artifact: Artifact; latest: string };

/** Group a flat artifact list: streaming campaigns (which own a cumulative) collapse into
 *  one collection group; every other artifact is its own single group. Newest-first. */
export function groupArtifacts(artifacts: Artifact[]): ArtifactGroup[] {
  const byCampaign = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const list = byCampaign.get(a.campaignId) ?? [];
    list.push(a);
    byCampaign.set(a.campaignId, list);
  }
  const groups: ArtifactGroup[] = [];
  for (const [campaignId, list] of byCampaign) {
    const cumulative = list.find((a) => a.variant === "cumulative");
    if (cumulative) {
      const dailies = list
        .filter((a) => a.variant === "daily")
        .sort((a, b) => ((a.periodDate ?? "") < (b.periodDate ?? "") ? 1 : -1));
      const latest = list.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), "");
      groups.push({ kind: "collection", campaignId, cumulative, dailies, dailyCount: dailies.length, latest });
    } else {
      for (const artifact of list) {
        groups.push({ kind: "single", campaignId, artifact, latest: artifact.createdAt });
      }
    }
  }
  return groups.sort((a, b) => (a.latest < b.latest ? 1 : -1));
}
