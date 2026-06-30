/**
 * Чистый селектор подсказок PromptBar. Принимает {@link AppState} +
 * {@link PromptBarContext} (тег/текст/очередь/welcome-чипы/опциональный
 * wizard-snapshot) и возвращает либо `hidden`, либо `{ scope, items }`, где
 * items уже разрешены реестром.
 *
 * Приоритет правил:
 *  1. начал печатать после тега → hidden;
 *  2. активный тег → node-context;
 *  3. непустая очередь черновиков → draft-queue;
 *  4. дальше — по View: welcome → welcome-wave, guided-campaign → hints,
 *     которые активный экран wizard'а опубликовал через `useScreenHints`
 *     (`state.screenHints`); campaign / workflow → views; section → section.sub.
 *  5. иначе → hidden.
 *
 * Под-состояния (фильтры, период, статусы сигналов, шаг wizard'а, статус
 * кампании) вычисляются здесь и передаются в Scope, чтобы реестр оставался
 * чистой функцией от Scope → items.
 */

import type { AppState, CampaignStatus } from "@/state/app-state";
import {
  type PromptChip,
  isNodeTagPayload,
} from "@/state/prompt-chips-context";
import type { Chip as WelcomeChip } from "@/sections/welcome/onboarding-chat";
import type { WorkflowNodeType } from "@/types/workflow";
import type { Scope, SuggestionItem } from "@/state/suggestion-registry";
import { resolveSuggestions } from "@/state/suggestion-registry";

export interface PromptBarContext {
  /** Активный тег в инпуте (последний по позиции, на котором стоит курсор). */
  activeTag: PromptChip | null;
  /** После активного тега уже что-то напечатано. */
  hasTypedText: boolean;
  /** Длина очереди черновиков (draftsRef.length). */
  queueLength: number;
  /** Чипы текущей welcome-волны (из useOnboardingChat). */
  welcomeChips: readonly WelcomeChip[];
}

/**
 * Animation/key discriminant for hints the active wizard screen declared via
 * `useScreenHints` (the items live in `state.screenHints`, not the registry).
 * Kept out of the registry's `Scope` so `resolveSuggestions` stays a pure
 * Scope→items map; the selector serves these items straight from state.
 */
type ScreenScope = { kind: "wizard-screen" };

export type SuggestionResolution =
  | { kind: "hidden" }
  | { kind: "items"; scope: Scope | ScreenScope; items: SuggestionItem[] };

function resolved(scope: Scope): SuggestionResolution {
  const items = resolveSuggestions(scope);
  if (items.length === 0) return { kind: "hidden" };
  return { kind: "items", scope, items };
}

function feedStatusForCampaign(
  state: AppState,
  campaignId: string,
  fallback: CampaignStatus
): CampaignStatus {
  const found = state.campaigns.find((c) => c.id === campaignId);
  return found?.status ?? fallback;
}

function settingsHasIntegrations(state: AppState): boolean {
  const s = state.accountSettings;
  return (
    s.regions.trim().length > 0 ||
    s.domainBlocklist.length > 0 ||
    s.interests.length > 0
  );
}

// Прототип: тариф в AccountSettings ещё не хранится — пока считаем «базовый».
// При добавлении поля заменить на чтение из state.
function settingsIsBasicTariff(_state: AppState): boolean {
  return true;
}

export function selectPromptSuggestions(
  state: AppState,
  ctx: PromptBarContext
): SuggestionResolution {
  // 1. Печатает после тега.
  if (ctx.activeTag && ctx.hasTypedText) return { kind: "hidden" };

  // 2. Активный тег.
  if (ctx.activeTag) {
    const payload = ctx.activeTag.payload;
    if (isNodeTagPayload(payload)) {
      // Read-only (launched) workflow: узел раскрывается только для просмотра —
      // подсказки-правки под баром не показываем.
      if (state.view.kind === "workflow" && state.view.launched) {
        return { kind: "hidden" };
      }
      return resolved({
        kind: "node-context",
        nodeType: payload.nodeType as WorkflowNodeType,
        paramLabel: payload.paramLabel,
      });
    }
    // Активный trigger-тег (выбран конкретный триггер на шаге 2) → показываем
    // ТОЛЬКО чип «Проверить доступность доменов»; все прочие подсказки уходят.
    if (ctx.activeTag.kind === "trigger") {
      return resolved({ kind: "trigger-context" });
    }
    // Прочие теги (section) — прячем подсказки.
    return { kind: "hidden" };
  }

  // 3. Очередь.
  if (ctx.queueLength > 0) return resolved({ kind: "draft-queue" });

  // 4. View.
  const v = state.view;
  switch (v.kind) {
    case "welcome":
      if (ctx.welcomeChips.length === 0) return { kind: "hidden" };
      return resolved({ kind: "welcome-wave", chips: ctx.welcomeChips });
    case "survey":
    case "campaign-payment":
    case "artifact":
      // Fullscreen views: chrome (and therefore the promptbar) is hidden by
      // page.tsx, but the bottom-bar can briefly re-render during the exit
      // transition. Return hidden so the suggestion bar has nothing to draw.
      // The artifact card is also a fullscreen entity view with no prompt suggestions.
      return { kind: "hidden" };
    case "guided-campaign": {
      // Co-located hints: the active wizard step publishes its own set into
      // `state.screenHints` via `useScreenHints`. We render exactly that — no
      // central step→hints map, so the questions can't drift from the screen.
      if (state.screenHints.length === 0) return { kind: "hidden" };
      return { kind: "items", scope: { kind: "wizard-screen" }, items: state.screenHints };
    }
    case "workflow": {
      // Запущенный (read-only) workflow → лента кампании по её статусу.
      // Редактируемый draft без выбранной ноды → подсказки уровня сценария
      // (выбранная нода обрабатывается раньше, в правиле 2 по активному тегу).
      if (!v.launched) {
        return resolved({ kind: "workflow-scenario", aiUndoAvailable: state.aiUndoAvailable });
      }
      const status: CampaignStatus = feedStatusForCampaign(
        state,
        v.campaign.id,
        "active"
      );
      return resolved({ kind: "campaign-feed", status });
    }
    case "campaign": {
      const status = feedStatusForCampaign(state, v.campaign.id, "active");
      return resolved({ kind: "campaign-feed", status });
    }
    case "section":
      switch (v.name) {
        case "Кампании":
          return resolved({
            kind: "section",
            sub: {
              kind: "campaigns",
              hasCampaigns: state.campaigns.length > 0,
              activeFilter: state.campaignFilter,
              sort: state.campaignSort,
            },
          });
        case "Статистика":
          return resolved({
            kind: "section",
            sub: {
              kind: "statistics",
              period: state.stats.period.preset,
              rowKind: state.stats.rows,
            },
          });
        // TODO(wave1): раздел «Артефакты» получит собственный suggestion-sub
        // (kind: "artifacts"). Пока переиспользуем «signals», чтобы exhaustive
        // switch по SectionName компилировался.
        case "Артефакты":
          return resolved({
            kind: "section",
            sub: { kind: "signals" },
          });
        case "Настройки":
          return resolved({
            kind: "section",
            sub: {
              kind: "settings",
              hasIntegrations: settingsHasIntegrations(state),
              isBasicTariff: settingsIsBasicTariff(state),
            },
          });
      }
  }
}
