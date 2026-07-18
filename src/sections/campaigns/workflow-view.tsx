// src/components/workflow-view.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { WorkflowGraph } from "@/sections/campaigns/workflow-graph";
import {
  parseWorkflowCommand,
  patchNodeParams,
} from "@/types/workflow";
import type {
  NodeParams,
  WorkflowNode,
  WorkflowEdge,
} from "@/types/workflow";
import type { SignalType } from "@/state/app-state";
import type { SourceType, Channel } from "@/types/campaign";
import { createTemplate, applyCampaignContext } from "@/state/workflow-templates";
import { computeNeedsAttention } from "@/state/workflow-validation";
import { computeSublabels } from "@/state/node-sublabel";
import { getFieldOptions } from "@/state/field-directory";
import { matchActions } from "@/state/node-actions";
import { type StructuralOp } from "@/state/structural-commands";
import { applyStructuralOps, applyRebuild } from "./graph-applier";
import { useChat } from "@/state/chat-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { getCachedGraph, setCachedGraph } from "./workflow-graph-cache";

interface GraphState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowViewProps {
  launched: boolean;
  pendingCommand: string | null;
  onCommandHandled: () => void;
  nodeCommand?: Array<{ nodeId: string; text: string }> | null;
  onNodeCommandHandled?: () => void;
  structuralOps?: StructuralOp[] | null;
  onStructuralOpsHandled?: () => void;
  nodeFieldPatch?: { nodeId: string; patch: Partial<NodeParams> } | null;
  onNodeFieldPatchHandled?: () => void;
  selectedNodeId?: string | null;
  /** Кампания, к которой относится граф — ключ для durable-кэша графа. */
  campaignId?: string;
  signalType?: SignalType;
  /** A3: источник аудитории кампании — определяет вставку ноды «Скоринг». */
  sourceType?: SourceType;
  /** Selected communication channels — determines which channel nodes appear in the graph. */
  channels?: Channel[];
  onGraphChange?: (graph: GraphState) => void;
  onNodeClick?: (id: string, label: string, nodeType?: string) => void;
  onPaneClick?: () => void;
}

/** Campaign data overlaid onto a freshly-built graph (Block C #8). */
interface CampaignContext {
  files?: { name: string; rowCount: number }[];
  interests?: string[];
  triggers?: string[];
}

function initialGraph(
  signalType?: SignalType,
  sourceType?: SourceType,
  channels?: Channel[],
  ctx?: CampaignContext
): GraphState {
  const template = signalType
    ? createTemplate(signalType, sourceType, channels)
    : { nodes: [], edges: [] };
  // Overlay the real uploaded bases + interests on the graph root («Скоринг»
  // for new/stream, «Сигнал» for own) — no-op when there is no campaign context.
  const base = ctx ? applyCampaignContext(template, ctx) : template;
  // A1: template graphs must start with correct needs-attention flags so the
  // launch gate reflects empty required fields immediately. 12c: content-derived
  // sublabels are supplied by computeSublabels (after needs-attention so they
  // reflect the campaign-overlaid params).
  return {
    ...base,
    nodes: computeSublabels(computeNeedsAttention(base.nodes)),
  };
}

function deriveParamsPatch(
  text: string,
  currentParams: NodeParams | undefined
): { paramsPatch?: Partial<NodeParams> } {
  // Unified: iterate every NODE_ACTIONS entry for this node kind and merge all
  // matching patches. Sublabels are no longer produced here — they are owned by
  // the computeSublabels pass (12c), which derives them from the node content.
  if (!currentParams) {
    return {};
  }

  const matched = matchActions(text, currentParams);
  if (matched) {
    return { paramsPatch: matched.paramsPatch };
  }

  // Nothing matched the structured parsers — but a prompt-bar edit should
  // never be a silent no-op. Apply a plausible change anyway: text fields take
  // the user's words, enum/numeric fields get a near-random sensible value.
  const fb = fallbackParamsPatch(currentParams, text);
  if (fb) {
    return { paramsPatch: fb };
  }

  return {};
}

const FALLBACK_SMS = "Спецпредложение действует только сегодня — загляните в приложение";
const FALLBACK_EMAIL = "Подготовили для вас персональную подборку — откройте, чтобы узнать детали.";
const FALLBACK_PUSH = "Загляните — для вас есть кое-что интересное";
const FALLBACK_GOALS = ["Конверсия в заявку", "Повторная покупка", "Активация клиента"];

function randPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * A best-effort parameter change for prompts that didn't match any structured
 * action. Keeps the prototype's "магия под капотом" feel — the AI always
 * "did something". Returns null only for node kinds that have no editable
 * params (signal, scoring).
 */
function fallbackParamsPatch(
  params: NodeParams,
  rawText: string
): Partial<NodeParams> | null {
  const text = rawText.trim().replace(/^[:\s]+/, "");
  switch (params.kind) {
    case "sms":
      return { text: text || FALLBACK_SMS };
    case "email":
      return { body: text || FALLBACK_EMAIL };
    case "push":
      return { body: text || FALLBACK_PUSH };
    case "ivr":
      return { scenario: text || "Приветствие + предложение" };
    case "success":
      return { goal: text || randPick(FALLBACK_GOALS) };
    case "end":
      return { reason: text || "Цель не достигнута" };
    case "wait":
      return { mode: "duration", durationHours: randPick([1, 3, 6, 12, 24, 48]) };
    case "condition":
      // Block 7 §3 — событие из общего справочника.
      return { trigger: randPick(getFieldOptions("eventCatalog")) };
    case "split":
      // Число веток меняется только осознанно — через параметр «Ветки» или
      // тип разделения (структурный парсер), не случайно. Свободный промпт,
      // не разобранный структурно, ветки не трогает.
      return null;
    case "signal":
    case "scoring":
      return null;
  }
}

function patchNode(
  nodes: WorkflowNode[],
  id: string,
  patch: Partial<WorkflowNode["data"]>
): WorkflowNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
  );
}

// xyflow stores position as the node's top-left corner. The collapsed card
// is ~130x45, the expanded card is ~320x230. If we only push neighbors, the
// expanded node grows only to the right/down from its anchor — so the right
// neighbor still gets overlapped while the left gap grows too wide. Fix:
// also pull the SELECTED node up-and-left by half the extra size, so its
// visual centre stays put and neighbor shifts land symmetrically around it.
const EXPAND_DX = 100;
const EXPAND_DY = 100;
const SELECTED_RECENTER_X = -95; // ≈ (320 − 130) / 2
const SELECTED_RECENTER_Y = -90; // ≈ (230 − 45) / 2
const AXIS_THRESHOLD = 5;

function shiftNeighborsAround(
  nodes: WorkflowNode[],
  selectedId: string | null | undefined
): WorkflowNode[] {
  if (!selectedId) return nodes.map((n) => ({ ...n, selected: false }));
  const sel = nodes.find((n) => n.id === selectedId);
  if (!sel) return nodes.map((n) => ({ ...n, selected: false }));
  const sx = sel.position.x;
  const sy = sel.position.y;
  return nodes.map((n) => {
    if (n.id === selectedId) {
      return {
        ...n,
        position: {
          x: n.position.x + SELECTED_RECENTER_X,
          y: n.position.y + SELECTED_RECENTER_Y,
        },
        selected: true,
      };
    }
    const dx =
      n.position.x > sx + AXIS_THRESHOLD
        ? EXPAND_DX
        : n.position.x < sx - AXIS_THRESHOLD
          ? -EXPAND_DX
          : 0;
    const dy =
      n.position.y > sy + AXIS_THRESHOLD
        ? EXPAND_DY
        : n.position.y < sy - AXIS_THRESHOLD
          ? -EXPAND_DY
          : 0;
    if (dx === 0 && dy === 0) return { ...n, selected: false };
    return {
      ...n,
      position: { x: n.position.x + dx, y: n.position.y + dy },
      selected: false,
    };
  });
}

export function WorkflowView({
  launched,
  pendingCommand,
  onCommandHandled,
  nodeCommand,
  onNodeCommandHandled,
  structuralOps,
  onStructuralOpsHandled,
  nodeFieldPatch,
  onNodeFieldPatchHandled,
  selectedNodeId,
  campaignId,
  signalType,
  sourceType,
  channels,
  onGraphChange,
  onNodeClick,
  onPaneClick,
}: WorkflowViewProps) {
  const chat = useChat();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const campaign = campaignId
    ? state.campaigns.find((c) => c.id === campaignId)
    : undefined;
  // Rehydrate from the durable cache so manual edits survive the unmount on
  // launch (workflow → campaign) and navigation; fall back to the template
  // overlaid with the campaign's real bases/interests (Block C #8).
  const [graph, setGraph] = useState<GraphState>(
    () =>
      getCachedGraph(campaignId) ??
      initialGraph(signalType, sourceType, channels, {
        files: campaign?.files,
        interests: campaign?.interests,
        triggers: campaign?.triggers,
      })
  );
  useEffect(() => {
    onGraphChange?.(graph);
    setCachedGraph(campaignId, graph);
  }, [graph, onGraphChange, campaignId]);
  const [unknownCmd, setUnknownCmd] = useState<string | null>(null);
  const unknownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  // Снапшот графа до последней AI-операции — для отката одним шагом (спека §8).
  const aiSnapshotRef = useRef<GraphState | null>(null);

  useEffect(() => {
    if (!pendingCommand) return;
    const updater = parseWorkflowCommand(pendingCommand);
    if (updater) {
      const el = graphRef.current;
      if (el) {
        el.classList.remove("wf-graph-flash");
        void el.offsetHeight;
        el.classList.add("wf-graph-flash");
      }
      setGraph((prev) => updater(prev.nodes, prev.edges));
    } else {
      if (unknownTimerRef.current) clearTimeout(unknownTimerRef.current);
      setUnknownCmd("Команда не распознана");
      unknownTimerRef.current = setTimeout(() => setUnknownCmd(null), 2500);
    }
    onCommandHandled();
  }, [pendingCommand, onCommandHandled]);

  type CyclePhase = "idle" | "thinking" | "reveal";
  const [cyclePhase, setCyclePhase] = useState<CyclePhase>("idle");
  const thinkDurationMsRef = useRef(3000);
  const cycleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Хранит id последнего pending-сообщения чата, чтобы закрыть его при
  // прерывании цикла новой командой (иначе «печатающие точки» остаются
  // в чате навсегда).
  const pendingReplyIdRef = useRef<string | null>(null);
  const REVEAL_MS = 600;
  const FLASH_MS = 1500;

  // Helper: kicks off a unified cycle that (1) shows "Думаю..." while opacity
  // oscillates, (2) applies a graph mutation at the start of the reveal phase
  // and flashes changed nodes green, (3) returns to idle.
  function runCycle(opts: {
    durationMs: number;
    // apply может вернуть finalReply — тогда он перекрывает верхнеуровневый
    // параметр; полезно, когда текст ответа зависит от актуального prev.
    apply: (prev: GraphState) => { graph: GraphState; changedIds: Set<string>; finalReply?: string | null };
    finalReply: string | null;
    /** Если задан — переиспользуем существующий pending-пузырь (создал раннер),
     *  иначе создаём свой. Так на AI-правке графа пузырь ровно один. */
    replyId?: string;
  }) {
    const { durationMs, apply, finalReply } = opts;
    thinkDurationMsRef.current = durationMs;
    cycleTimersRef.current.forEach(clearTimeout);
    cycleTimersRef.current = [];

    // Если предыдущий цикл был прерван — закрываем его pending-сообщение,
    // иначе оно зависнет в состоянии «печатает...» навсегда.
    if (pendingReplyIdRef.current !== null) {
      chat.updatePending(pendingReplyIdRef.current, "Прервано — выполняю новую команду.");
    }

    setCyclePhase("thinking");
    // Ответ идёт обычным сообщением ассистента в общий чат (pending-точки →
    // текст), как любой другой ответ ИИ — не отдельной плашкой. История правок
    // остаётся в drawer, inline-подсказку показывает TransientReply.
    const replyId = opts.replyId ?? chat.append({ role: "assistant", text: "", pending: true });
    pendingReplyIdRef.current = replyId;

    let changedIdsAfter: Set<string> = new Set();
    const t1 = setTimeout(() => {
      setGraph((prev) => {
        const result = apply(prev);
        changedIdsAfter = result.changedIds;
        // Mark changed nodes with justUpdated for the green flash.
        const flashed = result.graph.nodes.map((n) =>
          changedIdsAfter.has(n.id)
            ? { ...n, data: { ...n.data, justUpdated: true } }
            : n
        );
        return { ...result.graph, nodes: flashed };
      });
      setCyclePhase("reveal");
      // finalReply из apply(prev) приоритетнее — он мог быть вычислен от
      // актуального состояния графа в момент применения.
      chat.updatePending(replyId, finalReply ?? "Готово.");
      pendingReplyIdRef.current = null;
    }, durationMs);

    const t2 = setTimeout(() => {
      setCyclePhase("idle");
    }, durationMs + REVEAL_MS);

    const t3 = setTimeout(() => {
      setGraph((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          changedIdsAfter.has(n.id)
            ? { ...n, data: { ...n.data, justUpdated: false } }
            : n
        ),
      }));
    }, durationMs + REVEAL_MS + FLASH_MS);

    cycleTimersRef.current.push(t1, t2, t3);
  }

  useEffect(() => {
    if (!nodeCommand || nodeCommand.length === 0) return;

    const opCount = nodeCommand.length;
    // 1 node = 3s, 2-3 = 4s, 4+ = 5s. Зависит только от количества команд,
    // не от содержимого графа — безопасно считать снаружи apply.
    const duration = opCount === 1 ? 3000 : opCount <= 3 ? 4000 : 5000;

    const ids = nodeCommand.map((c) => c.nodeId).join(", ");
    const finalReply =
      opCount === 1
        ? `Готово, обновил ноду`
        : `Готово, обновил ${opCount} нод`;

    runCycle({
      durationMs: duration,
      apply: (prev) => {
        // Патчи считаем от prev — чтобы не перезаписать более свежие params,
        // которые пользователь мог изменить вручную пока цикл «думал».
        const plans = nodeCommand.map(({ nodeId, text }) => {
          const currentNode = prev.nodes.find((x) => x.id === nodeId);
          const { paramsPatch } = deriveParamsPatch(
            text,
            currentNode?.data.params
          );
          return { nodeId, paramsPatch };
        });

        let nodes = prev.nodes;
        const changedIds = new Set<string>();
        for (const p of plans) {
          // Accumulate the changed param keys so a yellow dot can mark each
          // edited field in the expanded card (not the node as a whole).
          const existingDirty =
            nodes.find((n) => n.id === p.nodeId)?.data.dirtyParams ?? [];
          const dirtyParams = p.paramsPatch
            ? Array.from(new Set([...existingDirty, ...Object.keys(p.paramsPatch)]))
            : existingDirty;
          nodes = patchNode(nodes, p.nodeId, {
            attentionReason: undefined,
            ...(p.paramsPatch ? { dirtyParams } : {}),
          });
          if (p.paramsPatch) {
            nodes = patchNodeParams(nodes, p.nodeId, p.paramsPatch);
          }
          changedIds.add(p.nodeId);
        }
        // A1: пересчёт needs-attention от итоговых params после AI-правок.
        // 12c: подзаголовки пересчитываем из контента после needs-attention.
        nodes = computeNeedsAttention(nodes);
        nodes = computeSublabels(nodes);
        return { graph: { ...prev, nodes }, changedIds };
      },
      finalReply: `${finalReply}: ${ids}.`,
    });

    onNodeCommandHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCommand, onNodeCommandHandled]);

  useEffect(() => {
    if (!nodeFieldPatch) return;
    setGraph((prev) => {
      // Помечаем изменённые ключи параметров жёлтой точкой (dirtyParams) и
      // снимаем «требует внимания» — правка поля делает ноду изменённой
      // (A7/A5), как и правка через ИИ-цикл.
      const existingDirty =
        prev.nodes.find((n) => n.id === nodeFieldPatch.nodeId)?.data.dirtyParams ??
        [];
      const dirtyParams = Array.from(
        new Set([...existingDirty, ...Object.keys(nodeFieldPatch.patch)])
      );
      let nodes = patchNode(prev.nodes, nodeFieldPatch.nodeId, {
        attentionReason: undefined,
        dirtyParams,
      });
      nodes = patchNodeParams(nodes, nodeFieldPatch.nodeId, nodeFieldPatch.patch);
      // A1: пересчитываем needs-attention от итоговых params — правка поля в
      // пустоту снова поднимает флаг, заполнение — снимает.
      // 12c: и подзаголовок из нового контента.
      nodes = computeNeedsAttention(nodes);
      nodes = computeSublabels(nodes);
      return { ...prev, nodes };
    });
    onNodeFieldPatchHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeFieldPatch]);

  useEffect(() => {
    if (!structuralOps || structuralOps.length === 0) return;

    // Предварительный вызов applyStructuralOps нужен только для ранней ветки
    // «все ops пропущены» и расчёта duration. Реальное применение — внутри
    // apply(prev), чтобы не затереть ручные правки, сделанные за время
    // «Думаю...».
    const early = applyStructuralOps(graph, structuralOps);
    const opCount = early.appliedCount;

    if (opCount === 0) {
      // All skipped — no cycle, just the explanation (обычное сообщение в чат).
      const reply = early.reply || "Не получилось применить правку.";
      if (state.workflowReplyId) {
        // Переиспользуем pending-пузырь раннера, иначе он зависнет крутящимся.
        chat.updatePending(state.workflowReplyId, reply);
        dispatch({ type: "workflow_reply_id_clear" });
      } else {
        chat.append({ role: "assistant", text: reply });
      }
      onStructuralOpsHandled?.();
      return;
    }

    const duration = opCount === 1 ? 3000 : opCount <= 3 ? 4000 : 5000;

    runCycle({
      durationMs: duration,
      replyId: state.workflowReplyId ?? undefined,
      // apply получает актуальный prev — граф, который мог измениться за
      // время «Думаю...» (например, пользователь отредактировал поле ноды).
      // Пересчитываем ops от prev, чтобы не затереть эти правки.
      apply: (prev) => {
        aiSnapshotRef.current = prev;
        dispatch({ type: "workflow_ai_undo_availability", available: true });
        const live = applyStructuralOps(prev, structuralOps);
        return {
          graph: live.graph,
          changedIds: live.changedIds,
          finalReply: live.reply,
        };
      },
      finalReply: early.reply,
    });

    if (state.workflowReplyId) dispatch({ type: "workflow_reply_id_clear" });
    onStructuralOpsHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralOps]);

  useEffect(() => {
    const rebuild = state.workflowRebuild;
    if (!rebuild) return;

    const replyId = state.workflowReplyId ?? undefined;
    dispatch({ type: "workflow_rebuild_handled" });

    const early = applyRebuild(rebuild);

    runCycle({
      durationMs: 5000,
      replyId,
      apply: (prev) => {
        aiSnapshotRef.current = prev;
        dispatch({ type: "workflow_ai_undo_availability", available: true });
        return {
          graph: early.graph,
          changedIds: early.changedIds,
          finalReply: early.reply,
        };
      },
      finalReply: early.reply,
    });
    if (replyId) dispatch({ type: "workflow_reply_id_clear" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workflowRebuild]);

  useEffect(() => {
    if (!state.workflowAiUndoRequested) return;
    const replyId = state.workflowReplyId ?? undefined;
    dispatch({ type: "workflow_ai_undo_handled" });
    if (replyId) dispatch({ type: "workflow_reply_id_clear" });
    const say = (text: string) =>
      replyId
        ? chat.updatePending(replyId, text)
        : chat.append({ role: "assistant", text });
    const snapshot = aiSnapshotRef.current;
    if (!snapshot) {
      dispatch({ type: "workflow_ai_undo_availability", available: false });
      say("Отменять нечего — последнюю правку уже не вернуть.");
      return;
    }
    aiSnapshotRef.current = null;
    setGraph(snapshot);
    dispatch({ type: "workflow_ai_undo_availability", available: false });
    say("Вернул граф к состоянию до последней правки.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workflowAiUndoRequested]);

  useEffect(() => {
    const timers = cycleTimersRef;
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    return () => {
      if (unknownTimerRef.current) clearTimeout(unknownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      dispatch({ type: "workflow_ai_undo_availability", available: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Graph — occupies the full workflow area. Wrapped in motion.div so
          the whole canvas can softly oscillate opacity during a structural
          cycle (mid-cycle the new positions land hidden under the dip). */}
      <motion.div
        ref={graphRef}
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
        animate={
          cyclePhase === "thinking"
            ? { opacity: [1, 0.6, 0.3, 0.5, 0.2, 0.4, 0.2], scale: [1, 1, 1, 1, 1, 1, 0.95] }
            : cyclePhase === "reveal"
              ? { opacity: 1, scale: 1 }
              : { opacity: 1, scale: 1 }
        }
        transition={
          cyclePhase === "thinking"
            ? { duration: thinkDurationMsRef.current / 1000, ease: "easeInOut" }
            : cyclePhase === "reveal"
              ? { duration: REVEAL_MS / 1000, ease: [0.16, 1, 0.3, 1] }
              : { duration: 0.3, ease: "easeOut" }
        }
      >
        <WorkflowGraph
          nodes={shiftNeighborsAround(graph.nodes, selectedNodeId)}
          edges={graph.edges}
          compact={launched}
          readOnly={launched}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
        />
      </motion.div>

      {/* Unknown command feedback */}
      {unknownCmd && (
        <div className="pointer-events-none absolute bottom-[140px] left-1/2 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {unknownCmd}
        </div>
      )}

      <style>{`
        @keyframes wf-graph-flash {
          0%   { opacity: 1; }
          25%  { opacity: 0.45; }
          100% { opacity: 1; }
        }
        .wf-graph-flash {
          animation: wf-graph-flash 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
