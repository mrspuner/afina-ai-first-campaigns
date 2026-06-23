"use client";

import { useCallback } from "react";
import type { Dispatch } from "react";
import { useChat } from "@/state/chat-context";
import { useTriggerEdit } from "@/state/trigger-edit-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import type { Action } from "@/state/app-state";
import type { TriggerEditApi } from "@/state/trigger-edit-context";
import { fetchAssistMulti, readLastAssistMeta, type AssistErrorReason } from "@/lib/ai/assist-client";
import { appendAiLogEntry, type AiLogEntry } from "@/state/dev-config";
import { toFiltersPatch } from "@/lib/ai/stats-patch-schema";
import { buildGraphFromSpec } from "@/lib/ai/rebuild-schema";
import { validateAiGraph } from "@/state/ai-graph-validation";
import { lookupInformationalReply, warmFallbackReply } from "@/lib/informational-replies";
import type { AssistResult, AssistRequest } from "@/lib/ai/assist-contract";

/**
 * Зависимости исполнителя результатов. Выделены отдельно от React, чтобы
 * executeAssistResults можно было тестировать как чистую функцию.
 */
export interface ExecuteDeps {
  /** id pending-пузыря чата, созданного оболочкой до вызова ИИ. */
  pendingId: string;
  dispatch: Dispatch<Action>;
  chat: {
    updatePending: (id: string, text: string) => void;
    append: (m: { role: "assistant"; text: string }) => string;
  };
  triggerEdit: Pick<TriggerEditApi, "applyToTrigger">;
  campaigns: Array<{ id: string; name: string; status: string }>;
  activeTriggerId?: string;
  /** Текст, которым закрываем пузырь, если ничего не исполнилось. */
  fallbackText: string;
  /** Метка сигнала текущего графа — для rebuild. */
  cachedSignalLabel: string;
}

/**
 * Исполняет массив AssistResult оркестратора — единственный разбор результатов
 * для всех поверхностей (план: унификация доставки ответов).
 *
 * Владение pending-пузырём:
 *  - текстовые kind (answer/clarify/stats/navigate/triggers/node-params) копят
 *    confirmations и закрывают пузырь текстом;
 *  - графовые с анимацией (workflow-ops/rebuild/undo) диспатчатся с
 *    replyId=pendingId — пузырь закроет runCycle в workflow-view.
 */
export function executeAssistResults(results: AssistResult[], d: ExecuteDeps): void {
  const confirmations: string[] = [];
  let graphReplyOwned = false; // правка с собственной анимацией закроет пузырь
  let graphApplied = false; // защита от двойной графовой правки в одном ответе

  for (const r of results) {
    switch (r.kind) {
      case "answer":
        confirmations.push(r.text);
        break;
      case "clarify":
        confirmations.push(r.questions.join(" "));
        break;
      case "stats":
        d.dispatch({ type: "stats_apply_patch", patch: toFiltersPatch(r.patch) });
        confirmations.push(r.confirmation);
        break;
      case "navigate": {
        const t = r.target;
        if (t.kind === "section") {
          d.dispatch({ type: "sidebar_nav", section: t.name });
          confirmations.push(r.confirmation);
        } else if (t.kind === "campaign-workflow") {
          const c = d.campaigns.find((x) => x.id === t.campaignId);
          if (c) {
            d.dispatch({ type: "open_workflow", campaign: { id: c.id, name: c.name }, launched: c.status !== "draft" });
            confirmations.push(r.confirmation);
          }
        }
        break;
      }
      case "triggers": {
        if (!d.activeTriggerId) break;
        if (r.clearAdded) d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "clear-added" });
        if (r.clearExcluded) d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "clear-excluded" });
        if (r.add.length > 0 || r.exclude.length > 0) {
          d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "edit", add: r.add, exclude: r.exclude });
        }
        confirmations.push(r.confirmation);
        break;
      }
      case "node-params":
        // aim #11: свободные текстовые поля ноды убраны (текст живёт в шаблоне).
        // Вопрос про параметры ноды отвечается, а не мутирует граф.
        confirmations.push(r.confirmation);
        break;
      case "workflow-ops":
        if (!graphApplied && r.ops.length > 0) {
          d.dispatch({ type: "workflow_structural_commands_submit", ops: r.ops, replyId: d.pendingId });
          graphApplied = true;
          graphReplyOwned = true;
        }
        break;
      case "rebuild":
        if (!graphApplied) {
          const built = buildGraphFromSpec(r.spec, { label: d.cachedSignalLabel });
          const check = validateAiGraph(built);
          if (check.ok) {
            d.dispatch({ type: "workflow_rebuild_submit", ...built, assumptions: r.spec.assumptions, replyId: d.pendingId });
            graphReplyOwned = true;
          } else {
            confirmations.push("Не получилось собрать корректную цепочку — попробуйте описать иначе.");
          }
          graphApplied = true;
        }
        break;
      case "undo":
        if (!graphApplied) {
          d.dispatch({ type: "workflow_ai_undo_request", replyId: d.pendingId });
          graphApplied = true;
          graphReplyOwned = true;
        }
        break;
      default:
        break; // none
    }
  }

  if (confirmations.length > 0) {
    d.chat.updatePending(d.pendingId, confirmations.join(" "));
  } else if (!graphReplyOwned) {
    // Ничего не исполнилось и анимация не закроет пузырь → офлайн-фоллбек.
    d.chat.updatePending(d.pendingId, d.fallbackText);
  }
  // graphReplyOwned && нет confirmations → пузырь закроет runCycle (анимация).
}

/** Классификация ответа для журнала. */
export function outcomeOf(results: AssistResult[]): AiLogEntry["outcome"] {
  if (results.some((r) => !["answer", "clarify", "none"].includes(r.kind))) return "applied";
  if (results.some((r) => r.kind === "clarify")) return "clarify";
  if (results.some((r) => r.kind === "answer")) return "answer";
  return "fallback";
}

/** Чистый конструктор записи журнала (тестируется без React). */
export function buildAiLogEntry(opts: {
  at: string;
  text: string;
  screen: string;
  route: "ai" | "offline";
  results: AssistResult[] | null;
  errorReason: AssistErrorReason | null;
  latencyMs: number;
}): AiLogEntry {
  return {
    at: opts.at,
    text: opts.text,
    resultKinds: opts.results ? opts.results.map((r) => r.kind) : [],
    outcome: opts.results ? outcomeOf(opts.results) : "fallback",
    screen: opts.screen,
    route: opts.route,
    errorReason: opts.errorReason,
    latencyMs: opts.latencyMs,
  };
}

/**
 * Единая оболочка AI-сабмита: зовёт оркестратор, исполняет результаты,
 * закрывает pending-пузырь, пишет журнал. pending-пузырь и реплику пользователя
 * создаёт вызывающий ДО run (чтобы крутилка появилась мгновенно).
 */
export function useAssistRunner() {
  const chat = useChat();
  const triggerEdit = useTriggerEdit();
  const appState = useAppState();
  const dispatch = useAppDispatch();

  const run = useCallback(
    async (args: {
      request: AssistRequest;
      pendingId: string;
      activeTriggerId?: string;
      cachedSignalLabel?: string;
    }) => {
      const { request, pendingId } = args;
      const results = await fetchAssistMulti(request);
      const meta = readLastAssistMeta();
      const fallbackText = lookupInformationalReply(request.text) ?? warmFallbackReply();

      if (!results) {
        chat.updatePending(pendingId, fallbackText);
      } else {
        executeAssistResults(results, {
          pendingId,
          dispatch,
          chat,
          triggerEdit,
          campaigns: appState.campaigns,
          activeTriggerId: args.activeTriggerId,
          fallbackText,
          cachedSignalLabel: args.cachedSignalLabel ?? "Сигнал",
        });
      }

      appendAiLogEntry(
        buildAiLogEntry({
          at: new Date().toISOString(),
          text: request.text,
          screen: request.context.screen,
          route: "ai",
          results,
          errorReason: results ? null : meta.errorReason,
          latencyMs: meta.latencyMs,
        })
      );
    },
    [chat, triggerEdit, appState, dispatch]
  );

  return { run };
}
