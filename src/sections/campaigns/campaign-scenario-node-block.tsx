"use client";

import type { Campaign } from "@/state/app-state";
import type { ScoringParams, SignalParams } from "@/types/workflow";
import { NODE_STYLES, NODE_ICON } from "./node-visuals";
import { ScoringRow } from "./node-card-content";
import { SignalFiles } from "./signal-files";
import { WorkflowReadOnlyProvider } from "./workflow-readonly-context";

const EMPTY_SEGMENTS = { max: 0, high: 0, mid: 0, low: 0 };

/**
 * Canonical node ids the launch-graph builder gives the campaign's root node
 * (`withSignalPath` in workflow-templates.ts): «scoring» for new/stream,
 * «signal_result» for own. Editing here dispatches `workflow_node_field_set`
 * against the SAME id, so if the user later opens the full graph the (already
 * redundant — Campaign.files/interests/triggers are the durable source of
 * truth) patch lands on the right node, exactly like the scoring drawer's own
 * write-back today.
 */
const SCORING_NODE_ID = "scoring";

/**
 * «Сценарий кампании» node-block for the «Старт» stage (spec A2.1). Visually
 * matches the workflow node it stands in for — same border/background/icon
 * from `node-visuals.ts` — but is a plain block (no react-flow handles/drag),
 * since it lives in the campaign card, not the canvas.
 *
 * - `new`/`stream` → scoring block: «База» (files + «Добавить файл», reusing
 *   `ScoringRow` from node-card-content.tsx) + «Интересы и триггеры» (opens
 *   the same side panel the scoring drawer uses).
 * - `own` → signal block: just the file(s), no interests/triggers.
 *
 * Reads `Campaign.files`/`interests`/`triggers` directly (durable state) —
 * NOT the launch-graph's node params, which only reflect campaign context
 * once the graph has been opened at least once (`applyCampaignContext` runs
 * in WorkflowView, not here).
 */
export function CampaignScenarioNodeBlock({
  campaign,
  readOnly,
}: {
  campaign: Campaign;
  readOnly: boolean;
}) {
  const isOwn = campaign.sourceType === "own";
  const nodeType = isOwn ? "signal" : "scoring";
  const style = NODE_STYLES[nodeType];
  const Icon = NODE_ICON[nodeType];
  const files = campaign.files ?? [];

  const scoringParams: ScoringParams = {
    kind: "scoring",
    interests: campaign.interests ?? [],
    triggers: campaign.triggers ?? [],
    files,
  };
  const signalParams: SignalParams = {
    kind: "signal",
    fileName: files.map((f) => f.name).join(", "),
    files: files.map((f) => f.name),
    count: files.reduce((sum, f) => sum + f.rowCount, 0),
    segments: EMPTY_SEGMENTS,
  };

  return (
    <WorkflowReadOnlyProvider value={readOnly}>
      <div
        data-testid="scenario-node-block"
        className="flex flex-col gap-2 rounded-lg px-3.5 py-3"
        style={{ border: `1px solid ${style.border}`, background: style.bg }}
      >
        <div
          className="flex items-center gap-1.5 text-[11px] font-medium"
          style={{ color: style.color }}
        >
          {Icon && <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />}
          <span>{isOwn ? "Сигнал" : "Скоринг"}</span>
        </div>
        <div className="flex flex-col gap-0.5 border-t border-white/5 pt-2">
          {isOwn ? (
            <SignalFiles params={signalParams} />
          ) : (
            <ScoringRow nodeId={SCORING_NODE_ID} params={scoringParams} />
          )}
        </div>
      </div>
    </WorkflowReadOnlyProvider>
  );
}
