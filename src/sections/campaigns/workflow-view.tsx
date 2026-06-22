// src/components/workflow-view.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { WorkflowGraph } from "@/sections/campaigns/workflow-graph";
import {
  createBaseNodes,
  createBaseEdges,
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
import { createTemplate } from "@/state/workflow-templates";
import { computeNeedsAttention } from "@/state/workflow-validation";
import { matchActions } from "@/state/node-actions";
import {
  applyOps,
  diffChangedNodeIds,
  type StructuralOp,
} from "@/state/structural-commands";
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

function initialGraph(
  signalType?: SignalType,
  sourceType?: SourceType,
  channels?: Channel[]
): GraphState {
  const base = signalType
    ? createTemplate(signalType, sourceType, channels)
    : { nodes: createBaseNodes(), edges: createBaseEdges() };
  // A1: template graphs must start with correct needs-attention flags so the
  // launch gate reflects empty required fields immediately.
  return { ...base, nodes: computeNeedsAttention(base.nodes) };
}

function computeDynamicSublabel(
  kind: NodeParams["kind"],
  patch: Partial<NodeParams>
): string | null {
  // Wait → show "N ч / N дней / N мин" based on durationHours.
  if (kind === "wait" && "durationHours" in patch && patch.durationHours !== undefined) {
    const h = patch.durationHours as number;
    if (h < 1) return `${Math.round(h * 60)} мин`;
    if (h < 24) return `${h} ч`;
    const days = Math.round(h / 24);
    return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
  }
  // Condition → triggerLabel.
  if (kind === "condition" && "trigger" in patch && patch.trigger !== undefined) {
    const t = patch.trigger as string;
    const map: Record<string, string> = {
      opened: "Открыл?",
      not_opened: "Не открыл?",
      clicked: "Кликнул?",
      not_clicked: "Не кликнул?",
      delivered: "Доставлено?",
      not_delivered: "Не доставлено?",
    };
    return map[t] ?? null;
  }
  // Split → reflect mode.
  if (kind === "split" && "by" in patch && patch.by !== undefined) {
    return patch.by === "segment"
      ? "По сегменту"
      : patch.by === "random"
        ? "Рандомно"
        : "Поровну";
  }
  return null;
}

function deriveParamsPatch(
  text: string,
  currentParams: NodeParams | undefined
): { sublabel?: string; paramsPatch?: Partial<NodeParams> } {
  // Unified: iterate every NODE_ACTIONS entry for this node kind and merge
  // all matching patches. The sublabel we mutate is intentionally narrow:
  // it stays in sync with a *visible* parameter (wait duration, condition
  // trigger, split mode). For every other field (sms text, email subject,
  // push title, ...) we do NOT overwrite sublabel — the user already sees
  // the real value in the node's params section, and the generic "Текст
  // обновлён" стрингует ноду без пользы.
  if (!currentParams) {
    return {};
  }

  const matched = matchActions(text, currentParams);
  if (matched) {
    const dynamic = computeDynamicSublabel(currentParams.kind, matched.paramsPatch);
    return {
      paramsPatch: matched.paramsPatch,
      ...(dynamic ? { sublabel: dynamic } : {}),
    };
  }

  // Nothing matched the structured parsers — but a prompt-bar edit should
  // never be a silent no-op. Apply a plausible change anyway: text fields take
  // the user's words, enum/numeric fields get a near-random sensible value.
  const fb = fallbackParamsPatch(currentParams, text);
  if (fb) {
    const dynamic = computeDynamicSublabel(currentParams.kind, fb);
    return { paramsPatch: fb, ...(dynamic ? { sublabel: dynamic } : {}) };
  }

  return {};
}

const FALLBACK_SMS = "Спецпредложение действует только сегодня — загляните в приложение";
const FALLBACK_EMAIL = "Подготовили для вас персональную подборку — откройте, чтобы узнать детали.";
const FALLBACK_PUSH = "Загляните — для вас есть кое-что интересное";
const FALLBACK_GOALS = ["Конверсия в заявку", "Повторная покупка", "Активация клиента"];
const FALLBACK_OFFERS = ["Кэшбэк 5%", "Премиум на месяц", "Бесплатная доставка"];

function randPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * A best-effort parameter change for prompts that didn't match any structured
 * action. Keeps the prototype's "магия под капотом" feel — the AI always
 * "did something". Returns null only for node kinds that have no editable
 * params (merge, signal).
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
    case "landing":
      return { offerTitle: text || randPick(FALLBACK_OFFERS) };
    case "storefront": {
      const offers = text
        ? text.split(/[,;]/).map((o) => o.trim()).filter(Boolean)
        : [randPick(FALLBACK_OFFERS)];
      return { offers };
    }
    case "wait":
      return { mode: "duration", durationHours: randPick([1, 3, 6, 12, 24, 48]) };
    case "condition":
      return { trigger: randPick(["opened", "not_opened", "clicked", "not_clicked"] as const) };
    case "split":
      // Число веток меняется только осознанно — через параметр «Ветки» или
      // тип разделения (структурный парсер), не случайно. Свободный промпт,
      // не разобранный структурно, ветки не трогает.
      return null;
    case "merge":
    case "signal":
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
  onGraphChange,
  onNodeClick,
  onPaneClick,
}: WorkflowViewProps) {
  const chat = useChat();
  const state = useAppState();
  const dispatch = useAppDispatch();
  // Rehydrate from the durable cache so manual edits survive the unmount on
  // launch (workflow → campaign) and navigation; fall back to the template.
  const [graph, setGraph] = useState<GraphState>(
    () => getCachedGraph(campaignId) ?? initialGraph(signalType, sourceType, channels)
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
          const { sublabel, paramsPatch } = deriveParamsPatch(
            text,
            currentNode?.data.params
          );
          return { nodeId, sublabel, paramsPatch };
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
            ...(p.sublabel ? { sublabel: p.sublabel } : {}),
            ...(p.paramsPatch ? { dirtyParams } : {}),
          });
          if (p.paramsPatch) {
            nodes = patchNodeParams(nodes, p.nodeId, p.paramsPatch);
          }
          changedIds.add(p.nodeId);
        }
        // A1: пересчёт needs-attention от итоговых params после AI-правок.
        nodes = computeNeedsAttention(nodes);
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
      nodes = computeNeedsAttention(nodes);
      return { ...prev, nodes };
    });
    onNodeFieldPatchHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeFieldPatch]);

  useEffect(() => {
    if (!structuralOps || structuralOps.length === 0) return;

    // Предварительный вызов applyOps нужен только для ранней ветки «все ops
    // пропущены» и расчёта duration. Реальное применение — внутри apply(prev),
    // чтобы не затереть ручные правки, сделанные за время «Думаю...».
    const earlyResult = applyOps(graph, structuralOps);
    const opCount = earlyResult.applied.length;

    function buildReplyFrom(r: typeof earlyResult): string {
      const lines: string[] = [];
      if (r.applied.length > 0) {
        if (r.applied.length === 1) {
          lines.push(r.applied[0].description);
        } else {
          lines.push("Готово:");
          for (const a of r.applied) lines.push(`• ${a.description}`);
        }
      }
      if (r.skipped.length > 0) {
        lines.push("Не выполнено:");
        for (const s of r.skipped) lines.push(`• ${s.reason}`);
      }
      return lines.join("\n");
    }

    if (opCount === 0) {
      // All skipped — no cycle, just the explanation (обычное сообщение в чат).
      const reply = buildReplyFrom(earlyResult) || "Не получилось применить правку.";
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
        const live = applyOps(prev, structuralOps);
        return {
          graph: live.graph,
          changedIds: diffChangedNodeIds(prev, live.graph),
          finalReply: buildReplyFrom(live) || null,
        };
      },
      finalReply: buildReplyFrom(earlyResult) || null,
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

    runCycle({
      durationMs: 5000,
      replyId,
      apply: (prev) => {
        aiSnapshotRef.current = prev;
        dispatch({ type: "workflow_ai_undo_availability", available: true });
        return {
          graph: { nodes: rebuild.nodes, edges: rebuild.edges },
          changedIds: new Set(rebuild.nodes.map((n) => n.id)),
          finalReply: `Собрал заново. ${rebuild.assumptions}`,
        };
      },
      finalReply: `Собрал заново. ${rebuild.assumptions}`,
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
