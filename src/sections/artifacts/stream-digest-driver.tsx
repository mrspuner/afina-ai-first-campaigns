"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact, Campaign } from "@/state/app-state";
import { isStreamingCampaign, MAX_DIGESTS } from "@/state/artifact-metrics";

/** Accelerated stand-in for a nightly digest job. */
export const DIGEST_INTERVAL_MS = 7000;

/** Active streaming campaigns that still have digests left to emit. */
export function campaignsNeedingDigest(campaigns: Campaign[], artifacts: Artifact[]): string[] {
  return campaigns
    .filter((c) => c.status === "active" && isStreamingCampaign(c))
    .filter(
      (c) =>
        artifacts.filter((a) => a.campaignId === c.id && a.variant === "daily").length < MAX_DIGESTS,
    )
    .map((c) => c.id);
}

/** Mounted once at app root: ticks a digest for each active streaming campaign. Renders nothing. */
export function StreamDigestDriver() {
  const { campaigns, artifacts } = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const pending = campaignsNeedingDigest(campaigns, artifacts);
    if (pending.length === 0) return;
    const t = setTimeout(() => {
      const timestamp = new Date().toISOString();
      for (const id of pending) dispatch({ type: "stream_digest_emitted", id, timestamp });
    }, DIGEST_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [campaigns, artifacts, dispatch]);

  return null;
}
