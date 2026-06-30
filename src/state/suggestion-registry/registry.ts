/**
 * Единая точка доступа к чипам-подсказкам: `resolveSuggestions(scope)` →
 * массив `SuggestionItem` под текущее место пользователя.
 *
 * Контент по scope разнесён по leaf-файлам (node-context, sections, wizard,
 * views, commands, welcome-waves); этот модуль только маршрутизирует.
 */

import type { Scope, SuggestionItem } from "./types";
import { resolveNodeContext } from "./node-context";
import { resolveSection } from "./sections";
import { resolveTriggerContext } from "./wizard";
import {
  resolveCampaignFeed,
  resolveAwaitingCampaign,
  resolveCampaignSelect,
  resolveWorkflowScenario,
} from "./views";
import type { CampaignStatus } from "@/state/app-state";
import { resolveDraftQueue } from "./commands";
import { resolveWelcomeWave } from "./welcome-waves";

export function resolveSuggestions(scope: Scope): SuggestionItem[] {
  switch (scope.kind) {
    case "node-context":
      return resolveNodeContext(scope.nodeType, scope.paramLabel);
    case "trigger-context":
      return resolveTriggerContext();
    case "draft-queue":
      return resolveDraftQueue();
    case "welcome-wave":
      return resolveWelcomeWave(scope.chips);
    case "section":
      return resolveSection(scope.sub);
    case "awaiting-campaign":
      return resolveAwaitingCampaign();
    case "campaign-select":
      return resolveCampaignSelect();
    case "workflow-scenario":
      return resolveWorkflowScenario(scope.aiUndoAvailable);
    case "campaign-feed":
      return resolveCampaignFeed(scope.status as CampaignStatus);
  }
}
