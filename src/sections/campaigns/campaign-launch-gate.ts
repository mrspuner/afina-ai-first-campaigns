import type { CampaignStatus } from "@/state/app-state";
import type { SourceType } from "@/types/campaign";

type GateCampaign = { status: CampaignStatus; sourceType?: SourceType; phase?: "scoring" | "communicating" };

/** new draft collects signals pre-launch; collecting = draft + new + phase still scoring. */
export function isCollecting(c: GateCampaign): boolean {
  return c.status === "draft" && c.sourceType === "new" && (c.phase ?? "scoring") === "scoring";
}

/** Launch allowed: draft → new needs collection done; stream/own immediate. paused → true. active/completed → false. */
export function canLaunchCampaign(c: GateCampaign): boolean {
  if (c.status === "draft") return c.sourceType === "new" ? !isCollecting(c) : true;
  if (c.status === "paused") return true;
  return false;
}
