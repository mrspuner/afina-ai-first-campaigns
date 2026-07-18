import { describe, it, expect } from "vitest";
import { resolveCardLogicContext, cardLogicSignalLabel } from "./card-logic-context";
import { createTemplate } from "@/state/workflow-templates";
import type { AppState } from "@/state/app-state";
import type { ChipSegment, PromptChip } from "@/state/prompt-chips-context";

const campaignView: AppState["view"] = {
  kind: "campaign",
  campaign: { id: "c1", name: "Демо" },
};

function logicChip(campaignId = "c1"): PromptChip {
  return {
    id: `campaign-logic_${campaignId}`,
    kind: "campaign-logic",
    label: "Логика кампании",
    payload: { campaignId },
    removable: true,
  };
}

function seg(chip: PromptChip, text = ""): ChipSegment {
  return { chip, text };
}

// Реальный граф кампании — то, что вернёт resolveGraph в хуке (кэш/шаблон).
const graph = createTemplate("Регистрация", "new", ["sms", "email"]);

describe("resolveCardLogicContext — гейт граф-контекста для карточной правки логики", () => {
  it("активный тег campaign-logic на карточке → прикладывает граф + screen=workflow", () => {
    const r = resolveCardLogicContext(campaignView, [seg(logicChip("c1"), "добавь SMS перед письмом")], () => graph);
    expect(r).not.toBeNull();
    // Сервер регистрирует графовые tools только при screen==="workflow".
    expect(r!.screen).toBe("workflow");
    expect(r!.campaignId).toBe("c1");
    // Граф действительно приложен (сводка из summarizeGraph).
    expect(r!.graph.nodes.length).toBeGreaterThan(0);
    expect(r!.graph.edges.length).toBeGreaterThan(0);
    // Форма payload'а совпадает с workflow-путём: {id,label,nodeType}.
    expect(r!.graph.nodes[0]).toHaveProperty("id");
    expect(r!.graph.nodes[0]).toHaveProperty("nodeType");
    expect(typeof r!.cachedSignalLabel).toBe("string");
  });

  it("нет тега campaign-logic → null (обычный путь без графа)", () => {
    const r = resolveCardLogicContext(campaignView, [], () => graph);
    expect(r).toBeNull();
  });

  it("тег есть, но экран не карточка → null", () => {
    const workflowView: AppState["view"] = {
      kind: "workflow",
      campaign: { id: "c1", name: "Демо" },
      launched: false,
    };
    const r = resolveCardLogicContext(workflowView, [seg(logicChip("c1"))], () => graph);
    expect(r).toBeNull();
  });

  it("тег нацелен на другую кампанию → null (страховка от рассинхрона)", () => {
    const r = resolveCardLogicContext(campaignView, [seg(logicChip("c2"))], () => graph);
    expect(r).toBeNull();
  });

  it("граф не разрешился (нет кэша/сценария) → null, чтобы не слать пустой контекст", () => {
    const r = resolveCardLogicContext(campaignView, [seg(logicChip("c1"))], () => null);
    expect(r).toBeNull();
  });
});

describe("cardLogicSignalLabel", () => {
  it("берёт метку входной source/signal ноды, иначе «Сигнал»", () => {
    expect(cardLogicSignalLabel(graph)).toBeTruthy();
    expect(cardLogicSignalLabel({ nodes: [] })).toBe("Сигнал");
  });
});
