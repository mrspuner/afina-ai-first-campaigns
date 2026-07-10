import { describe, expect, it } from "vitest";
import { canLaunchCampaign, canLaunchWithGraph } from "./campaign-launch-gate";
import { createTemplate } from "@/state/workflow-templates";
import type { WorkflowNode } from "@/types/workflow";

// Реальный граф вместо удалённого legacy base-графа (createBaseNodes/Edges):
// own-источник, сигнал привязан, success достижим.
function baseGraph() {
  return createTemplate("Регистрация", "own");
}

describe("canLaunchCampaign", () => {
  it("new draft + scoring → can launch (pre-launch collecting removed; graph gate handles readiness)", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "new", phase: "scoring" })).toBe(true);
  });
  it("new draft + communicating → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "new", phase: "communicating" })).toBe(true);
  });
  it("stream draft → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "stream" })).toBe(true);
  });
  it("own draft → can launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "own" })).toBe(true);
  });
  it("paused → can launch (resume)", () => {
    expect(canLaunchCampaign({ status: "paused", sourceType: "new" })).toBe(true);
  });
  it("active → cannot launch", () => {
    expect(canLaunchCampaign({ status: "active", sourceType: "stream" })).toBe(false);
  });
  it("completed → cannot launch", () => {
    expect(canLaunchCampaign({ status: "completed", sourceType: "own" })).toBe(false);
  });
});

describe("canLaunchWithGraph", () => {
  const draftStream = { status: "draft", sourceType: "stream" } as const;
  const emptySms: WorkflowNode = {
    id: "sms-empty",
    type: "workflowNode",
    position: { x: 0, y: 200 },
    data: { label: "SMS", nodeType: "sms", params: { kind: "sms", text: "", alphaName: "A", scheduledAt: "immediate" } },
  };

  it("нет графа → падаем на базовый статус-гейт (разрешено)", () => {
    expect(canLaunchWithGraph(draftStream, null)).toBe(true);
  });

  it("валидный базовый граф → запуск разрешён", () => {
    const graph = baseGraph();
    expect(canLaunchWithGraph(draftStream, graph)).toBe(true);
  });

  it("нода с пустым шаблоном (needs-attention) → запуск НЕ блокируется (#2 — мягкое предупреждение)", () => {
    const graph = baseGraph();
    graph.nodes.push(emptySms);
    // #2: пустой текст комм-ноды — неблокирующее предупреждение (validateWorkflow
    // выносит needs-attention в warnings), запуск разрешён. Реальные структурные
    // гейты (no-signal / no-success-path) по-прежнему блокируют.
    expect(canLaunchWithGraph(draftStream, graph)).toBe(true);
  });

  it("статус-гейт закрыт (active) → блокируем даже при валидном графе", () => {
    const graph = baseGraph();
    expect(canLaunchWithGraph({ status: "active", sourceType: "stream" }, graph)).toBe(false);
  });
});
