import type { Artifact } from "@/state/app-state";

/** Human label for an artifact kind (spec §3: degenerate vs full campaign). */
export const ARTIFACT_KIND_LABEL: Record<Artifact["kind"], string> = {
  signals: "Сигналы",
  signals_conversions: "Сигналы и конверсии",
};
