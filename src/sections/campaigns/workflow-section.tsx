"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { CanvasHeader, type CanvasHeaderToast } from "./canvas-header";
import { WorkflowView } from "./workflow-view";
import { useSaveTimeout } from "./use-save-timeout";
import { computeCampaignCost } from "./campaign-cost";
import { validateWorkflow } from "@/state/workflow-validation";
import { normalizeNodeRef } from "@/state/structural-commands";
import { getScenario } from "@/data/scenarios";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from "@/types/workflow";

type GraphSnapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/**
 * Стабильная подпись графа для отслеживания несохранённых правок: тип и
 * параметры каждой ноды + структура связей. Транзиентные флаги
 * (`justUpdated`, `dirtyParams`, `sublabel`) намеренно не учитываем.
 */
function graphSignature(g: GraphSnapshot): string {
  const nodes = g.nodes
    .map((n) => {
      const d = n.data as WorkflowNodeData;
      return `${n.id}:${d.nodeType}:${JSON.stringify(d.params ?? {})}`;
    })
    .join("|");
  const edges = g.edges
    .map((e) => `${e.source}>${e.target}`)
    .sort()
    .join(",");
  return `${nodes}||${edges}`;
}

const ERROR_TEXT: Record<string, string> = {
  "no-signal": "Сигнал не привязан.",
  "needs-attention": "У вас есть ноды не готовые к запуску.",
  "no-success-path": "Нет пути к ноде Успех.",
};

const TOAST_TIMEOUT_MS = 3000;

export function WorkflowSection() {
  const {
    view,
    workflowCommand,
    workflowNodeCommand,
    workflowStructuralCommands,
    workflowNodeFieldPatch,
    selectedWorkflowNode,
    campaigns,
  } = useAppState();
  const dispatch = useAppDispatch();
  const chat = useChat();

  const graphRef = useRef<GraphSnapshot | null>(null);
  const [graphTick, setGraphTick] = useState(0);
  const [toast, setToast] = useState<CanvasHeaderToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // B7: «несохранённость» черновика = граф изменился с момента последнего
  // сохранения. Базовую подпись фиксируем при первом снимке графа каждой
  // кампании; «Сохранить» обновляет её до текущей.
  const savedSigRef = useRef<Map<string, string>>(new Map());
  const [, setSaveTick] = useState(0);
  // Какой кампании принадлежит текущий снимок графа в graphRef — защищает от
  // ложной «несохранённости» в кадр между сменой кампании и перемонтированием
  // редактора (graphRef ещё держит граф прежней кампании).
  const currentCampaignIdRef = useRef<string | null>(null);
  const graphOwnerRef = useRef<string | null>(null);

  // aim #12: рефы-зеркала для таймаута лейбла «Сохранение…». Сами
  // saveState/currentSig/handleSave вычисляются ниже ранних return'ов, а хук
  // обязан вызываться безусловно — поэтому питаем его из рефов (см. ниже).
  const saveTimeoutStateRef = useRef<{ active: boolean; sig: string | null }>({
    active: false,
    sig: null,
  });
  const handleSaveRef = useRef<() => void>(() => {});

  const handleCommandHandled = useCallback(
    () => dispatch({ type: "workflow_command_handled" }),
    [dispatch]
  );

  const handleNodeCommandHandled = useCallback(
    () => dispatch({ type: "workflow_node_command_handled" }),
    [dispatch]
  );

  const handleStructuralOpsHandled = useCallback(
    () => dispatch({ type: "workflow_structural_commands_handled" }),
    [dispatch]
  );

  const handleNodeFieldPatchHandled = useCallback(
    () => dispatch({ type: "workflow_node_field_set_handled" }),
    [dispatch]
  );

  const handleGraphChange = useCallback((g: GraphSnapshot) => {
    graphRef.current = g;
    graphOwnerRef.current = currentCampaignIdRef.current;
    setGraphTick((v) => v + 1);
  }, []);

  // aim #12: таймаут лейбла «Сохранение…». Вызывается безусловно (до ранних
  // return'ов), питается из рефов, которые синхронизируются в теле рендера
  // ниже. Каждое изменение графа → ре-рендер → хук видит новый `sig`.
  useSaveTimeout(
    saveTimeoutStateRef.current.active,
    saveTimeoutStateRef.current.sig,
    () => handleSaveRef.current(),
  );

  const handleNodeClick = useCallback(
    (id: string, label: string, nodeType?: string) => {
      dispatch({ type: "workflow_node_selected", id, label, nodeType });
    },
    [dispatch]
  );

  const handlePaneClick = useCallback(() => {
    dispatch({ type: "workflow_node_deselected" });
  }, [dispatch]);

  const showToast = useCallback((next: CanvasHeaderToast) => {
    setToast(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_TIMEOUT_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Resolve node-commands to node ids via the current graph snapshot. A command
  // may carry an explicit `nodeId` (node-field/whole-node tag chips from the
  // prompt bar — the field-name label is NOT a node label and would never
  // match) or only a `nodeLabel` (ShellBottomBar segment path). Prefer an exact
  // `nodeId` match; fall back to label resolution otherwise. Commands that
  // resolve to no node are silently skipped.
  const resolvedNodeCommands = useMemo(() => {
    if (!workflowNodeCommand) return null;
    const g = graphRef.current;
    if (!g) return null;
    const resolved: Array<{ nodeId: string; text: string }> = [];
    for (const cmd of workflowNodeCommand.commands) {
      let node: WorkflowNode | undefined;
      if (cmd.nodeId) {
        node = g.nodes.find((n) => n.id === cmd.nodeId);
      }
      if (!node && cmd.nodeLabel) {
        const target = normalizeNodeRef(cmd.nodeLabel);
        node = g.nodes.find(
          (n) =>
            normalizeNodeRef((n.data as WorkflowNodeData).label) === target
        );
      }
      if (node) resolved.push({ nodeId: node.id, text: cmd.text });
    }
    return resolved.length > 0 ? resolved : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowNodeCommand, graphTick]);

  // Расчётная стоимость кампании из текущего графа. N берём из ноды signal
  // самого графа (она патчится реальным signal.count). Пересчёт — на каждое
  // изменение сценария (graphTick растёт в handleGraphChange).
  const cost = useMemo(() => {
    const g = graphRef.current;
    if (!g) return null;
    const signalNode = g.nodes.find(
      (n) => n.data.nodeType === "source" || n.data.nodeType === "signal"
    );
    const N =
      signalNode?.data.params?.kind === "signal" ? signalNode.data.params.count : 0;
    if (!N) return null;
    return computeCampaignCost(g.nodes, g.edges, N);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphTick]);

  // A1: реактивная валидация графа — гейт кнопки «Запустить». Post-inversion
  // каждая кампания — корень (no-signal недостижим), поэтому signalBound=true;
  // реальные гейты — needs-attention + no-success-path. Пересчёт на каждое
  // изменение графа (graphTick).
  const launchCheck = useMemo(() => {
    const g = graphRef.current;
    if (!g) return { ok: false as const, errors: ["no-graph"] };
    return validateWorkflow(g, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphTick]);

  if (view.kind !== "workflow") return null;

  const currentCampaign = campaigns.find((c) => c.id === view.campaign.id) ?? null;
  const scenarioSignalType = currentCampaign?.scenario
    ? getScenario(currentCampaign.scenario.id)?.signalType
    : undefined;

  function handleRename(name: string) {
    if (!currentCampaign) return;
    dispatch({ type: "campaign_renamed", id: currentCampaign.id, name });
  }

  function handleLaunch() {
    if (!currentCampaign) return;
    const graph = graphRef.current;
    if (!graph) {
      showToast({ kind: "error", text: "Граф ещё не готов, попробуйте снова." });
      return;
    }
    const result = validateWorkflow(graph, true);
    if (!result.ok) {
      showToast({
        kind: "error",
        text: ERROR_TEXT[result.errors[0]] ?? "Не готово к запуску.",
      });
      return;
    }
    // Validation passed — payment (budget + balance) now happens on the
    // dedicated CampaignPaymentScreen. canvas-header "Запустить" becomes a
    // routing hop, not a launch.
    dispatch({
      type: "open_campaign_payment",
      campaignId: currentCampaign.id,
    });
  }

  function handlePause() {
    if (!currentCampaign) return;
    dispatch({
      type: "campaign_status_changed",
      id: currentCampaign.id,
      status: "paused",
      timestamp: new Date().toISOString(),
    });
  }

  function handleResume() {
    if (!currentCampaign) return;
    dispatch({
      type: "campaign_status_changed",
      id: currentCampaign.id,
      status: "active",
      timestamp: new Date().toISOString(),
    });
  }

  function handleExplainCost() {
    if (!cost) return;
    const fmt = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
    chat.openSidebar();
    chat.append({
      role: "user",
      text: "Как посчитана стоимость?",
      triggerLabel: "Расчётная стоимость",
    });
    const id = chat.append({ role: "assistant", text: "", pending: true });
    const reply =
      `Стоимость складывается из первичных коммуникаций (${fmt(cost.primary)}) ` +
      `и буфера на повторные, динамические коммуникации (+30%, ${fmt(cost.repeat)}). ` +
      `Итог зависит от числа сигналов, каналов и того, сколько коммуникаций ` +
      `в сценарии повторные.`;
    window.setTimeout(() => chat.updatePending(id, reply), 400);
  }

  if (!currentCampaign) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Кампания не найдена.
      </div>
    );
  }

  // B7: индикатор сохранения показываем только для draft в редактируемом
  // workflow. Базовую подпись фиксируем при первом снимке графа.
  currentCampaignIdRef.current = currentCampaign.id;
  const isDraftEditable = !view.launched && currentCampaign.status === "draft";
  // Используем graphRef только если он относится к текущей кампании.
  const currentSig =
    graphRef.current && graphOwnerRef.current === currentCampaign.id
      ? graphSignature(graphRef.current)
      : null;
  if (currentSig !== null && !savedSigRef.current.has(currentCampaign.id)) {
    savedSigRef.current.set(currentCampaign.id, currentSig);
  }
  const savedSig = savedSigRef.current.get(currentCampaign.id) ?? null;
  const saveState: "saved" | "unsaved" | undefined = isDraftEditable
    ? currentSig !== null && savedSig !== null && currentSig !== savedSig
      ? "unsaved"
      : "saved"
    : undefined;

  function handleSave() {
    if (!currentCampaign) return;
    if (currentSig !== null) {
      savedSigRef.current.set(currentCampaign.id, currentSig);
    }
    dispatch({ type: "campaign_saved_draft", id: currentCampaign.id });
    setSaveTick((t) => t + 1);
  }

  // aim #12: синхронизируем рефы-зеркала для useSaveTimeout. На следующем
  // ре-рендере (любая правка графа → setGraphTick) хук перечитает их и
  // перезапустит/снимет 10-секундный таймер.
  saveTimeoutStateRef.current = {
    active: saveState === "unsaved",
    sig: currentSig,
  };
  handleSaveRef.current = handleSave;

  return (
    <div className="relative flex flex-1 flex-col">
      <CanvasHeader
        campaign={currentCampaign}
        onRename={handleRename}
        onLaunch={handleLaunch}
        onPause={handlePause}
        onResume={handleResume}
        toast={toast}
        onDismissToast={dismissToast}
        mode={view.launched ? "read-only" : "edit"}
        // Inverse of `openWorkflow`/`open_workflow` — always available so the
        // user can get back to the campaign card from either the read-only
        // (launched) or the editable (draft) workflow view.
        onBack={() =>
          dispatch({ type: "campaign_opened", id: currentCampaign.id })
        }
        saveState={saveState}
        onSave={isDraftEditable ? handleSave : undefined}
        cost={cost?.total ?? null}
        onExplainCost={handleExplainCost}
        canLaunch={launchCheck.ok}
        launchBlockReason={
          launchCheck.ok
            ? undefined
            : ERROR_TEXT[launchCheck.errors[0]] ?? "Не готово к запуску."
        }
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <WorkflowView
          key={currentCampaign.id}
          launched={view.launched}
          pendingCommand={workflowCommand}
          onCommandHandled={handleCommandHandled}
          nodeCommand={resolvedNodeCommands}
          onNodeCommandHandled={handleNodeCommandHandled}
          structuralOps={workflowStructuralCommands?.ops ?? null}
          onStructuralOpsHandled={handleStructuralOpsHandled}
          nodeFieldPatch={workflowNodeFieldPatch}
          onNodeFieldPatchHandled={handleNodeFieldPatchHandled}
          selectedNodeId={selectedWorkflowNode?.id ?? null}
          campaignId={currentCampaign.id}
          signalType={scenarioSignalType}
          sourceType={currentCampaign.sourceType}
          channels={currentCampaign.channels ?? []}
          onGraphChange={handleGraphChange}
          // Launched campaigns are read-only: nodes still open/expand so the
          // user can inspect the сценарий, but their fields can't be edited
          // (enforced down in NodeCardBody via the read-only context).
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
        />
      </div>

    </div>
  );
}
