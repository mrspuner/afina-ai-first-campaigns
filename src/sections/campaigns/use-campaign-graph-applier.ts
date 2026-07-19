"use client";

import { useEffect, useRef } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { getScenario } from "@/data/scenarios";
import { createTemplate } from "@/state/workflow-templates";
import type { StructuralOp } from "@/state/structural-commands";
import type { AppState } from "@/state/app-state";
import {
  applyStructuralOps,
  applyRebuild,
  type GraphState,
} from "./graph-applier";
import { getCachedGraph, setCachedGraph } from "./workflow-graph-cache";

/**
 * Headless applier for AI logic-edits submitted FROM THE CAMPAIGN CARD.
 *
 * Background (see docs/superpowers/specs/2026-07-17-campaign-card-logic-editing-design.md
 * AS IS): `use-assist-runner` only writes the graph edit into AppState mailbox
 * slots (`workflowStructuralCommands` / `workflowRebuild` + `workflowReplyId`).
 * The ONLY consumer of those slots is an effect in `workflow-view.tsx`, mounted
 * solely when `view.kind === "workflow"`. From the card (`view.kind ===
 * "campaign"`) the graph view is unmounted, so a submitted edit would sit in the
 * slot unapplied, `workflowReplyId` would never clear, and the chat pending
 * bubble would spin forever.
 *
 * This hook is that missing card-side consumer. It mirrors what the view's
 * effects do — but writes to the durable graph cache (`setCachedGraph`) instead
 * of view-local React state, and resolves the pending chat bubble here. The
 * cache write bumps the cache version (see workflow-graph-cache.ts), which
 * re-renders `CampaignScreen` so its `describeWorkflow` text and the
 * mini-preview rebuild from the freshly edited graph.
 *
 * Single active consumer: this runs ONLY when `view.kind === "campaign"`. When
 * the graph view is mounted, `WorkflowView` remains the sole consumer, so ops
 * are never applied twice.
 *
 * Undo: the card path deliberately does NOT arm `aiUndoAvailable` — there is no
 * live in-graph snapshot to restore off the card (WorkflowView owns
 * `aiSnapshotRef`, and resets `aiUndoAvailable` to false on unmount). For the
 * prototype, undo-in-graph is acceptable; we just never leave `aiUndoAvailable`
 * stuck true without a snapshot behind it.
 */
export function useCampaignGraphApplier(campaignId: string | undefined): void {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const chat = useChat();

  // Each mailbox payload must be consumed EXACTLY once. The slot-clear dispatch
  // is async, so React StrictMode's dev double-invoke (setup → cleanup → setup)
  // re-runs an effect while the slot is still non-empty — applying the same ops
  // twice (e.g. inserting a node twice). Deduping by the payload's object
  // reference (stable per submit, fresh on each new submit) makes it idempotent.
  const handledOpsRef = useRef<StructuralOp[] | null>(null);
  const handledRebuildRef = useRef<AppState["workflowRebuild"]>(null);

  // Guard: applier is the sole slot consumer only from the card view.
  const isCardView = state.view.kind === "campaign";
  const structuralOps = state.workflowStructuralCommands?.ops ?? null;
  const rebuild = state.workflowRebuild;
  const replyId = state.workflowReplyId;

  const campaign = campaignId
    ? state.campaigns.find((c) => c.id === campaignId)
    : undefined;

  // The campaign's current graph, resolved EXACTLY as campaign-screen.tsx does
  // for `launchGraph`: durable cache first (honours manual edits), else a fresh
  // scenario template. Read lazily at apply time so the newest cache wins.
  function resolveBaseGraph(): GraphState | null {
    const cached = getCachedGraph(campaignId);
    if (cached) return { nodes: cached.nodes, edges: cached.edges };
    if (!campaign) return null;
    const signalType = campaign.scenario
      ? getScenario(campaign.scenario.id)?.signalType
      : undefined;
    if (!signalType) return null;
    const t = createTemplate(
      signalType,
      campaign.sourceType,
      campaign.channels ?? [],
    );
    return { nodes: t.nodes, edges: t.edges };
  }

  // Resolve the pending bubble the shell opened (workflowReplyId), or append a
  // fresh assistant message when there is none — same branch as
  // workflow-view.tsx. Clearing replyId here is what stops the stuck spinner.
  function resolveBubble(text: string) {
    if (replyId) {
      chat.updatePending(replyId, text);
      dispatch({ type: "workflow_reply_id_clear" });
    } else {
      chat.append({ role: "assistant", text });
    }
  }

  // --- structural ops ---
  useEffect(() => {
    if (!isCardView || !campaignId) return;
    if (!structuralOps || structuralOps.length === 0) return;
    if (handledOpsRef.current === structuralOps) return; // dedupe re-runs
    handledOpsRef.current = structuralOps;

    const base = resolveBaseGraph();
    if (base) {
      const result = applyStructuralOps(base, structuralOps);
      setCachedGraph(campaignId, result.graph);
      resolveBubble(result.reply ?? "Не получилось применить правку.");
    } else {
      // No graph to apply to (a card without scenario/cache — not reachable in
      // practice). Still consume the slot + bubble so the spinner can't hang.
      resolveBubble("Не получилось применить правку — граф недоступен.");
    }
    dispatch({ type: "workflow_structural_commands_handled" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralOps, isCardView, campaignId]);

  // --- full rebuild ---
  useEffect(() => {
    if (!isCardView || !campaignId) return;
    if (!rebuild) return;
    if (handledRebuildRef.current === rebuild) return; // dedupe re-runs
    handledRebuildRef.current = rebuild;

    const result = applyRebuild(rebuild);
    setCachedGraph(campaignId, result.graph);
    resolveBubble(result.reply);
    dispatch({ type: "workflow_rebuild_handled" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuild, isCardView, campaignId]);
}
