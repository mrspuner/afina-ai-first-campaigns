"use client";

import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { NodeParams } from "@/types/workflow";

/**
 * Body of the «Сигнал» node card (spec C). Mounted as a special case in
 * NodeCardBody, bypassing the generic PARAM_RENDERERS (mirrors SplitFields /
 * WaitFields / ScoringRow). Reads app-state for the current campaign and its
 * signals-collection artifact.
 *
 * - Draft (empty params.files) → placeholder.
 * - Launched (populated)       → file list + «Посмотреть все», which opens the
 *   campaign's kind:"signals" artifact with origin:"campaign".
 */
export function SignalFiles({
  params,
}: {
  params: Extract<NodeParams, { kind: "signal" }>;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const files = params.files ?? [];
  // Mounted either inside the workflow canvas (graph node card) OR inline in
  // the campaign card's «Сценарий кампании» node-block (A2.1) — both view
  // kinds carry the same `{ id, name }` campaign shape.
  const campaignId =
    state.view.kind === "workflow" || state.view.kind === "campaign"
      ? state.view.campaign.id
      : undefined;
  const signalsArtifact = campaignId
    ? state.artifacts.find(
        (a) => a.campaignId === campaignId && a.kind === "signals",
      )
    : undefined;

  if (files.length === 0) {
    return (
      <div className="px-1 py-0.5 text-[11px] text-muted-foreground">
        После запуска здесь появятся файлы сигналов
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-1 py-0.5 text-[11px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        {files.map((name, i) => (
          <span
            key={`${name}__${i}`}
            className="truncate text-foreground"
            title={name}
          >
            {name}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (signalsArtifact) {
            dispatch({
              type: "artifact_opened",
              id: signalsArtifact.id,
              origin: "campaign",
            });
          }
        }}
        className="nodrag -mx-1 mt-0.5 flex w-fit items-center gap-1 rounded px-1 py-0.5 text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:text-foreground focus-visible:outline-none"
      >
        Посмотреть все
      </button>
    </div>
  );
}
