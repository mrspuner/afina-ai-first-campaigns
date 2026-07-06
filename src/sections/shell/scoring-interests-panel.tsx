"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import {
  InterestsTriggersEditor,
  resolveSelectionIds,
  type InterestsTriggersEditorSelection,
} from "@/sections/campaigns/wizard/steps/interests-triggers-editor";
import { useScreenHints } from "@/hooks/use-screen-hints";
import { interestsScreenHints } from "@/sections/campaigns/wizard/steps/screen-hints";
import type { NodeParams } from "@/types/workflow";

/**
 * «Интересы и триггеры» body of the AI sidebar (chat-drawer). Renders the SAME
 * shared editor the wizard uses — interests, trigger cards, per-trigger
 * domains/deltas — inside the drawer that already hosts «Афина ИИ» + the prompt
 * composer (so the «Настроить триггер» AI bar works identically). Editable in a
 * draft, read-only once launched. Edits persist to BOTH the campaign (durable
 * source of truth) and the scoring node's params (card updates immediately).
 */
export function ScoringInterestsPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const chat = useChat();
  const { nodeId, campaignId, editable, open } = chat.scoringDrawer;

  const campaign = useMemo(
    () => state.campaigns.find((c) => c.id === campaignId),
    [state.campaigns, campaignId]
  );

  // Текущий выбор (LABELS) для со-локейтед подсказок «Интересы и триггеры» —
  // как в шаге визарда. Сеется из сохранённого выбора кампании (панель
  // ремаунтится при переоткрытии дровера), обновляется через onChange редактора.
  const [selection, setSelection] = useState<InterestsTriggersEditorSelection>(
    () => ({
      interests: campaign?.interests ?? [],
      triggers: campaign?.triggers ?? [],
      triggerConfig: {},
    }),
  );

  // Пока дровер открыт — публикуем СВОИ подсказки интересов (перекрывают общие
  // подсказки экрана через owner-механизм screenHints), чтобы бар подсказывал
  // именно про интересы/триггеры.
  useScreenHints(
    open
      ? interestsScreenHints({
          hasInterests: selection.interests.length > 0,
          hasDomains: selection.triggers.length > 0,
        })
      : null,
  );

  // Seed from the campaign's saved interests/triggers LABELS, resolved to the
  // editor's internal ids for the current direction.
  const initial = useMemo(
    () =>
      resolveSelectionIds(state.clientDirection, {
        interests: campaign?.interests ?? [],
        triggers: campaign?.triggers ?? [],
      }),
    [state.clientDirection, campaign?.interests, campaign?.triggers]
  );

  const persist = useCallback(
    (next: InterestsTriggersEditorSelection) => {
      setSelection(next);
      // Durable source of truth — survives a graph rebuild (applyCampaignContext
      // re-overlays these onto the scoring node).
      if (campaignId) {
        dispatch({
          type: "campaign_scoring_set",
          id: campaignId,
          interests: next.interests,
          triggers: next.triggers,
        });
      }
      // … and the node's own params, so the open card reflects it immediately.
      if (nodeId) {
        dispatch({
          type: "workflow_node_field_set",
          nodeId,
          patch: {
            interests: next.interests,
            triggers: next.triggers,
          } as Partial<NodeParams>,
        });
      }
    },
    [campaignId, nodeId, dispatch]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <div className="mb-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-muted">
              <Image src="/mascot-icon.svg" width={16} height={16} alt="" aria-hidden />
            </span>
            <h2 className="text-base font-semibold text-foreground">
              Интересы и триггеры
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {editable
              ? "Уточните, по чему скоринг отбирает горячую аудиторию из базы."
              : "По чему скоринг отбирает горячую аудиторию из базы."}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Re-mount the editor per opened node so it re-seeds from that
              campaign's saved selection (its initial-selection is read once on
              mount). */}
          <InterestsTriggersEditor
            key={`${campaignId}:${nodeId}`}
            initialInterestIds={initial.interestIds}
            initialTriggerIds={initial.triggerIds}
            readOnly={!editable}
            onChange={editable ? persist : undefined}
          />
        </div>
      </div>
    </div>
  );
}
