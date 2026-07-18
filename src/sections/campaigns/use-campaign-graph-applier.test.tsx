import { beforeAll, describe, expect, it } from "vitest";
import { useEffect, type ReactNode } from "react";
import { renderHook, render, screen, act } from "@testing-library/react";
import {
  AppStateProvider,
  useAppState,
  useAppDispatch,
} from "@/state/app-state-context";
import { ChatProvider, useChat } from "@/state/chat-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { getScenario } from "@/data/scenarios";
import { createTemplate } from "@/state/workflow-templates";
import type { Preset, Campaign } from "@/state/app-state";
import type { StructuralOp } from "@/state/structural-commands";
import type { WorkflowNode } from "@/types/workflow";
import { useCampaignGraphApplier } from "./use-campaign-graph-applier";
import { CampaignScreen } from "./campaign-screen";
import { getCachedGraph, setCachedGraph } from "./workflow-graph-cache";

// The headless applier consumes the workflow mailbox slot from the CARD view
// (view.kind === "campaign"), where WorkflowView is unmounted. It mirrors the
// view's structuralOps/rebuild effects but writes to the durable graph cache
// instead of view-local state — so a «Логика кампании» edit submitted from the
// card actually mutates the graph and resolves the pending chat bubble, rather
// than hanging forever waiting for the graph view to mount.

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppStateProvider>
      <ChatProvider>{children}</ChatProvider>
    </AppStateProvider>
  );
}

/** Combines the applier under test with state/dispatch/chat access. */
function useHarness(campaignId: string) {
  useCampaignGraphApplier(campaignId);
  return {
    state: useAppState(),
    dispatch: useAppDispatch(),
    chat: useChat(),
  };
}

function baseCampaign(id: string): Campaign {
  return {
    id,
    name: "Тестовая кампания",
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    scenario: { id: "base-upsell", name: "Апсейл" },
    sourceType: "new",
    channels: ["sms"],
    budget: 50000,
  };
}

function templateGraph() {
  const signalType = getScenario("base-upsell")!.signalType;
  const t = createTemplate(signalType, "new", ["sms"]);
  return { nodes: t.nodes, edges: t.edges };
}

// A structural op that applies deterministically to the base-upsell template:
// inserts a delay right after the unique «Сигнал» node (20 → 21 nodes).
const addDelayOp: StructuralOp[] = [
  { kind: "add", nodeType: "wait", placement: { mode: "after", ref: "Сигнал" } },
];

function seedCampaign(
  result: { current: ReturnType<typeof useHarness> },
  campaign: Campaign,
) {
  act(() => {
    const preset: Preset = {
      key: "full",
      label: "test",
      campaigns: [campaign],
      artifacts: [],
    };
    result.current.dispatch({ type: "preset_applied", preset });
  });
}

describe("useCampaignGraphApplier — headless mailbox-slot consumer", () => {
  it("applies structural ops from the CARD view, writes the cache, clears slot + replyId, resolves the bubble", () => {
    const id = "cmp_apply";
    const { result } = renderHook(() => useHarness(id), { wrapper });

    seedCampaign(result, baseCampaign(id));
    act(() => result.current.dispatch({ type: "campaign_opened", id }));
    expect(result.current.state.view.kind).toBe("campaign");

    setCachedGraph(id, templateGraph());
    const before = getCachedGraph(id)!.nodes.length;

    // Pending bubble the shell created before the (simulated) AI call.
    let replyId = "";
    act(() => {
      replyId = result.current.chat.append({
        role: "assistant",
        text: "",
        pending: true,
      });
    });

    // The submit action writes the mailbox slot + replyId (as use-assist-runner does).
    act(() =>
      result.current.dispatch({
        type: "workflow_structural_commands_submit",
        ops: addDelayOp,
        replyId,
      }),
    );

    // Graph mutated in the cache…
    expect(getCachedGraph(id)!.nodes.length).toBe(before + 1);
    // …slot + replyId cleared (spinner no longer stuck)…
    expect(result.current.state.workflowStructuralCommands).toBeNull();
    expect(result.current.state.workflowReplyId).toBeNull();
    // …and the pending bubble resolved to the applier's reply.
    const bubble = result.current.chat.messages.find((m) => m.id === replyId);
    expect(bubble?.pending).toBeUndefined();
    expect(bubble?.text).toContain("Добавил");
    // Undo is NOT armed from the card (no live snapshot on the card path).
    expect(result.current.state.aiUndoAvailable).toBe(false);
  });

  it("applies a full rebuild from the CARD view (deterministic graph swap)", () => {
    const id = "cmp_rebuild";
    const { result } = renderHook(() => useHarness(id), { wrapper });

    seedCampaign(result, baseCampaign(id));
    act(() => result.current.dispatch({ type: "campaign_opened", id }));

    setCachedGraph(id, templateGraph());

    const newNodes: WorkflowNode[] = [
      { id: "s1", type: "workflowNode", position: { x: 0, y: 0 }, data: { label: "Сигнал", nodeType: "signal" } },
      { id: "ok", type: "workflowNode", position: { x: 0, y: 100 }, data: { label: "Успех", nodeType: "success" } },
    ];

    let replyId = "";
    act(() => {
      replyId = result.current.chat.append({ role: "assistant", text: "", pending: true });
    });

    act(() =>
      result.current.dispatch({
        type: "workflow_rebuild_submit",
        nodes: newNodes,
        edges: [],
        assumptions: "Оставил только сигнал и успех.",
        replyId,
      }),
    );

    expect(getCachedGraph(id)!.nodes.map((n) => n.id)).toEqual(["s1", "ok"]);
    expect(result.current.state.workflowRebuild).toBeNull();
    expect(result.current.state.workflowReplyId).toBeNull();
    const bubble = result.current.chat.messages.find((m) => m.id === replyId);
    expect(bubble?.pending).toBeUndefined();
    expect(bubble?.text).toContain("Собрал заново");
  });

  it("does NOT apply when the WORKFLOW view is mounted — the view stays the sole consumer", () => {
    const id = "cmp_guard";
    const { result } = renderHook(() => useHarness(id), { wrapper });

    seedCampaign(result, baseCampaign(id));
    // Graph view mounted → view.kind === "workflow"; WorkflowView owns the slot.
    act(() =>
      result.current.dispatch({
        type: "open_workflow",
        campaign: { id, name: "Тестовая кампания" },
        launched: false,
      }),
    );
    expect(result.current.state.view.kind).toBe("workflow");

    setCachedGraph(id, templateGraph());
    const before = getCachedGraph(id)!.nodes.length;

    let replyId = "";
    act(() => {
      replyId = result.current.chat.append({ role: "assistant", text: "", pending: true });
    });

    act(() =>
      result.current.dispatch({
        type: "workflow_structural_commands_submit",
        ops: addDelayOp,
        replyId,
      }),
    );

    // Applier must be inert: slot + replyId untouched, cache unchanged, bubble
    // still pending (the real WorkflowView — not mounted here — would resolve it).
    expect(result.current.state.workflowStructuralCommands).not.toBeNull();
    expect(result.current.state.workflowReplyId).toBe(replyId);
    expect(getCachedGraph(id)!.nodes.length).toBe(before);
    const bubble = result.current.chat.messages.find((m) => m.id === replyId);
    expect(bubble?.pending).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Component-level: prove the version → re-render → describeWorkflow chain. The
// applier is mounted INSIDE CampaignScreen; a card edit must rebuild the visible
// description (and mini-preview) off the freshly cached graph.
// ---------------------------------------------------------------------------

// WorkflowMiniPreview pulls in @xyflow/react, which touches ResizeObserver on
// mount — absent in jsdom. Provide a no-op shim so CampaignScreen renders.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

interface ScreenApi {
  dispatch: ReturnType<typeof useAppDispatch>;
  chat: ReturnType<typeof useChat>;
}

/** Sibling of CampaignScreen that leaks dispatch/chat to the test. */
function Controller({ onReady }: { onReady: (api: ScreenApi) => void }) {
  const dispatch = useAppDispatch();
  const chat = useChat();
  useEffect(() => {
    onReady({ dispatch, chat });
  }, [dispatch, chat, onReady]);
  return null;
}

describe("useCampaignGraphApplier — CampaignScreen re-renders off the edited cache", () => {
  it("a card rebuild edit rebuilds the description and resolves the bubble", () => {
    const id = "cmp_screen";
    // Seed the durable cache with the full template so the card's initial
    // description shows «Первое касание.» + the SMS template text.
    setCachedGraph(id, templateGraph());

    let api: ScreenApi | undefined;
    render(
      <AppStateProvider>
        <PromptChipsProvider>
          <ChatProvider>
            <Controller onReady={(a) => (api = a)} />
            <CampaignScreen />
          </ChatProvider>
        </PromptChipsProvider>
      </AppStateProvider>,
    );

    act(() => {
      api!.dispatch({
        type: "preset_applied",
        preset: { key: "full", label: "t", campaigns: [baseCampaign(id)], artifacts: [] },
      });
    });
    act(() => api!.dispatch({ type: "campaign_opened", id }));

    // Baseline: full template → first-touch stage + SMS text are present.
    expect(screen.getByText("Первое касание.")).toBeInTheDocument();
    expect(
      screen.getByText(/Ваше предложение ждёт\. Подробности на сайте\./),
    ).toBeInTheDocument();

    // Submit a rebuild to a minimal signal→success graph (no communications).
    let replyId = "";
    act(() => {
      replyId = api!.chat.append({ role: "assistant", text: "", pending: true });
    });
    const minimal: WorkflowNode[] = [
      { id: "s1", type: "workflowNode", position: { x: 0, y: 0 }, data: { label: "Сигнал", nodeType: "signal" } },
      { id: "ok", type: "workflowNode", position: { x: 0, y: 100 }, data: { label: "Успех", nodeType: "success", isSuccess: true } },
    ];
    act(() =>
      api!.dispatch({
        type: "workflow_rebuild_submit",
        nodes: minimal,
        edges: [{ id: "e1", source: "s1", target: "ok" }],
        assumptions: "Оставил только сигнал и успех.",
        replyId,
      }),
    );

    // Description rebuilt off the new graph: first-touch + SMS text gone, the
    // no-communications outcome copy present instead.
    expect(screen.queryByText("Первое касание.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Ваше предложение ждёт\. Подробности на сайте\./),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/готовый сегмент/)).toBeInTheDocument();

    // Pending bubble resolved (no forever-spinner), slot cleared.
    const bubble = api!.chat.messages.find((m) => m.id === replyId);
    expect(bubble?.pending).toBeUndefined();
    expect(bubble?.text).toContain("Собрал заново");
  });
});
