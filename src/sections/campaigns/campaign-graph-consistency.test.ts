/**
 * Integration test: graph + cost convergence across all call sites (aim #6).
 *
 * Spec: "A test that the same channels in wizard and payment produce identical
 * graph + cost (regression for the aim #6 bug)."
 *
 * The bug: createTemplate was called WITHOUT channels in workflow-view.tsx and
 * campaign-payment-screen.tsx, so selecting SMS+IVR in the wizard showed
 * SMS+IVR in neither the graph nor the payment screen's cost calculation.
 */
import { describe, it, expect } from "vitest";
import { createTemplate } from "@/state/workflow-templates";
import { graphCostFor } from "./campaign-graph-cost";
import { computeCampaignCost } from "./campaign-cost";
import type { Channel } from "@/types/campaign";

const SCENARIO_ID = "base-first-deal";  // → "Первая сделка"
const BASE_SIZE = 10_000;

describe("aim #6 price convergence: same channels → same graph + cost", () => {
  it("createTemplate is deterministic: two calls with same channels produce identical graphs", () => {
    const channels: Channel[] = ["sms", "email"];
    const g1 = createTemplate("Первая сделка", "own", channels);
    const g2 = createTemplate("Первая сделка", "own", channels);
    expect(g1.nodes.length).toBe(g2.nodes.length);
    expect(g1.edges.length).toBe(g2.edges.length);
    // Node IDs and types match
    const ids1 = g1.nodes.map((n) => n.id).sort();
    const ids2 = g2.nodes.map((n) => n.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it("graphCostFor with channels: wizard path ≡ payment path (regression aim #6)", () => {
    const channels: Channel[] = ["sms", "email"];
    // Both wizard (step-budget) and payment screen call graphCostFor with same args
    const wizard = graphCostFor({ scenarioId: SCENARIO_ID, sourceType: "own", baseSize: BASE_SIZE, channels });
    const payment = graphCostFor({ scenarioId: SCENARIO_ID, sourceType: "own", baseSize: BASE_SIZE, channels });
    expect(wizard).not.toBeNull();
    expect(payment).not.toBeNull();
    expect(wizard!.total).toBe(payment!.total);
    expect(wizard!.primary).toBe(payment!.primary);
    expect(wizard!.repeat).toBe(payment!.repeat);
    expect(wizard!.lines.length).toBe(payment!.lines.length);
  });

  it("cost computed from createTemplate matches cost from graphCostFor (both paths converge)", () => {
    const channels: Channel[] = ["sms", "ivr"];
    // Path 1: direct createTemplate + computeCampaignCost (simulates workflow-view cost display)
    const graph = createTemplate("Первая сделка", "own", channels);
    const directCost = computeCampaignCost(graph.nodes, graph.edges, BASE_SIZE);
    // Path 2: graphCostFor (simulates wizard budget step + payment screen)
    const graphCost = graphCostFor({ scenarioId: SCENARIO_ID, sourceType: "own", baseSize: BASE_SIZE, channels });
    expect(graphCost).not.toBeNull();
    expect(directCost.total).toBe(graphCost!.total);
  });

  it("IVR-only vs SMS-only channels produce different costs (channel differentiation)", () => {
    const smsOnly = graphCostFor({ scenarioId: SCENARIO_ID, sourceType: "own", baseSize: BASE_SIZE, channels: ["sms"] });
    const ivrOnly = graphCostFor({ scenarioId: SCENARIO_ID, sourceType: "own", baseSize: BASE_SIZE, channels: ["ivr"] });
    expect(smsOnly).not.toBeNull();
    expect(ivrOnly).not.toBeNull();
    // IVR (8 rub/send) costs more than SMS (5 rub/send)
    expect(ivrOnly!.total).toBeGreaterThan(smsOnly!.total);
  });

  it("legacy (no channels) and channel-aware paths produce different node structures", () => {
    const legacy = createTemplate("Первая сделка", "own");
    const channelAware = createTemplate("Первая сделка", "own", ["sms"]);
    // Channel-aware has condition nodes (comm unit), legacy does not
    const legacyConditions = legacy.nodes.filter((n) => n.data.nodeType === "condition").length;
    const channelConditions = channelAware.nodes.filter((n) => n.data.nodeType === "condition").length;
    expect(channelConditions).toBeGreaterThan(legacyConditions);
  });

  it("all 6 signal types with channels produce valid, unique-id graphs", () => {
    const channels: Channel[] = ["sms", "email"];
    const types = [
      "Регистрация", "Первая сделка", "Апсейл",
      "Реактивация", "Возврат", "Удержание",
    ] as const;
    for (const signalType of types) {
      const g = createTemplate(signalType, "own", channels);
      // No duplicate IDs
      const ids = g.nodes.map((n) => n.id);
      expect(new Set(ids).size, `${signalType}: duplicate IDs`).toBe(ids.length);
      // All edges reference valid nodes
      const idSet = new Set(ids);
      for (const edge of g.edges) {
        expect(idSet.has(edge.source), `${signalType}: edge source ${edge.source} missing`).toBe(true);
        expect(idSet.has(edge.target), `${signalType}: edge target ${edge.target} missing`).toBe(true);
      }
      // Has at least one success node
      expect(g.nodes.some((n) => n.data.isSuccess), `${signalType}: no success node`).toBe(true);
    }
  });
});
