import { describe, expect, it } from "vitest";
import { canLaunchCampaign, canLaunchWithGraph, isCollecting } from "./campaign-launch-gate";
import { createBaseNodes, createBaseEdges } from "@/types/workflow";
import type { WorkflowNode } from "@/types/workflow";

describe("isCollecting", () => {
  it("new draft still scoring → collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new", phase: "scoring" })).toBe(true);
  });
  it("new draft with phase omitted defaults to scoring → collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new" })).toBe(true);
  });
  it("new draft finished collecting (communicating) → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "new", phase: "communicating" })).toBe(false);
  });
  it("stream draft → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "stream" })).toBe(false);
  });
  it("own draft → not collecting", () => {
    expect(isCollecting({ status: "draft", sourceType: "own" })).toBe(false);
  });
  it("active campaign → not collecting", () => {
    expect(isCollecting({ status: "active", sourceType: "new", phase: "scoring" })).toBe(false);
  });
});

describe("canLaunchCampaign", () => {
  it("new draft + scoring → cannot launch", () => {
    expect(canLaunchCampaign({ status: "draft", sourceType: "new", phase: "scoring" })).toBe(false);
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
    const graph = { nodes: createBaseNodes("сигнал_test.json"), edges: createBaseEdges() };
    expect(canLaunchWithGraph(draftStream, graph)).toBe(true);
  });

  it("нода с пустым шаблоном (needs-attention) → запуск НЕ блокируется (#2 — мягкое предупреждение)", () => {
    const graph = { nodes: createBaseNodes("сигнал_test.json"), edges: createBaseEdges() };
    graph.nodes.push(emptySms);
    // #2: пустой текст комм-ноды — неблокирующее предупреждение (validateWorkflow
    // выносит needs-attention в warnings), запуск разрешён. Реальные структурные
    // гейты (no-signal / no-success-path) по-прежнему блокируют.
    expect(canLaunchWithGraph(draftStream, graph)).toBe(true);
  });

  it("статус-гейт закрыт (active) → блокируем даже при валидном графе", () => {
    const graph = { nodes: createBaseNodes("сигнал_test.json"), edges: createBaseEdges() };
    expect(canLaunchWithGraph({ status: "active", sourceType: "stream" }, graph)).toBe(false);
  });
});
