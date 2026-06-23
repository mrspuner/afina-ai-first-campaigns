import { describe, it, expect, vi } from "vitest";
import { executeAssistResults, buildAiLogEntry, outcomeOf } from "./use-assist-runner";
import type { AssistResult } from "@/lib/ai/assist-contract";

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    pendingId: "P",
    dispatch: vi.fn(),
    chat: { updatePending: vi.fn(), append: vi.fn(() => "X") },
    triggerEdit: { applyToTrigger: vi.fn() },
    campaigns: [{ id: "c1", name: "C1", status: "active" }],
    signals: [{ id: "s1" }],
    activeTriggerId: "t1",
    fallbackText: "fallback",
    cachedSignalLabel: "Сигнал",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("executeAssistResults — владение пузырём", () => {
  it("answer → закрывает pending-пузырь текстом", () => {
    const d = makeDeps();
    executeAssistResults([{ kind: "answer", text: "Привет" }], d);
    expect(d.chat.updatePending).toHaveBeenCalledWith("P", "Привет");
  });

  it("stats → dispatch + подтверждение в пузырь", () => {
    const d = makeDeps();
    executeAssistResults(
      [{ kind: "stats", patch: { rows: "channels" }, confirmation: "Разбил по каналам" } as AssistResult],
      d
    );
    expect(d.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "stats_apply_patch" }));
    expect(d.chat.updatePending).toHaveBeenCalledWith("P", "Разбил по каналам");
  });

  it("workflow-ops → dispatch с replyId=pending, без updatePending", () => {
    const d = makeDeps();
    executeAssistResults(
      [{ kind: "workflow-ops", ops: [{ kind: "remove", ref: "СМС" }] } as AssistResult],
      d
    );
    expect(d.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow_structural_commands_submit", replyId: "P" })
    );
    expect(d.chat.updatePending).not.toHaveBeenCalled();
  });

  it("undo → dispatch с replyId, без updatePending", () => {
    const d = makeDeps();
    executeAssistResults([{ kind: "undo" }], d);
    expect(d.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow_ai_undo_request", replyId: "P" })
    );
    expect(d.chat.updatePending).not.toHaveBeenCalled();
  });

  it("none → фоллбек в пузырь", () => {
    const d = makeDeps();
    executeAssistResults([{ kind: "none" }], d);
    expect(d.chat.updatePending).toHaveBeenCalledWith("P", "fallback");
  });

  it("node-params → отвечает текстом, НЕ мутирует ноду (aim #11)", () => {
    const d = makeDeps();
    executeAssistResults(
      [
        {
          kind: "node-params",
          nodeId: "n1",
          patch: { text: "x" },
          confirmation: "Текст задаётся через шаблон.",
        } as AssistResult,
      ],
      d
    );
    // не диспатчим workflow_node_field_set
    expect(d.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow_node_field_set" })
    );
    // закрываем пузырь подтверждением как ответом
    expect(d.chat.updatePending).toHaveBeenCalledWith("P", "Текст задаётся через шаблон.");
  });

  it("navigate к несуществующей кампании → фоллбек (ничего не подтверждено)", () => {
    const d = makeDeps();
    executeAssistResults(
      [{ kind: "navigate", target: { kind: "campaign-workflow", campaignId: "nope" }, confirmation: "Открыл" } as AssistResult],
      d
    );
    expect(d.chat.updatePending).toHaveBeenCalledWith("P", "fallback");
  });
});

describe("outcomeOf / buildAiLogEntry", () => {
  it("outcomeOf классифицирует", () => {
    expect(outcomeOf([{ kind: "answer", text: "x" }])).toBe("answer");
    expect(outcomeOf([{ kind: "clarify", questions: ["q"] }])).toBe("clarify");
    expect(outcomeOf([{ kind: "workflow-ops", ops: [] } as AssistResult])).toBe("applied");
    expect(outcomeOf([{ kind: "none" }])).toBe("fallback");
  });

  it("buildAiLogEntry для null результатов → fallback + пустые kinds", () => {
    const e = buildAiLogEntry({ at: "t", text: "x", screen: "workflow", route: "ai", results: null, errorReason: "timeout", latencyMs: 999 });
    expect(e.outcome).toBe("fallback");
    expect(e.resultKinds).toEqual([]);
    expect(e.errorReason).toBe("timeout");
    expect(e.latencyMs).toBe(999);
    expect(e.route).toBe("ai");
  });

  it("buildAiLogEntry для answer → outcome answer", () => {
    const e = buildAiLogEntry({ at: "t", text: "x", screen: "s", route: "ai", results: [{ kind: "answer", text: "ok" }], errorReason: null, latencyMs: 10 });
    expect(e.outcome).toBe("answer");
    expect(e.resultKinds).toEqual(["answer"]);
  });
});
