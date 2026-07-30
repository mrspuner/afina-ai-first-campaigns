import { describe, expect, it } from "vitest";
import { segmentWaves } from "./graph-waves";
import { createTemplate, TEMPLATE_BY_TYPE } from "./workflow-templates";
import type {
  NodeParams,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from "@/types/workflow";

/** Нода рукотворного графа: обходу нужны только id, nodeType и params. */
function node(id: string, nodeType: WorkflowNodeType, params?: NodeParams): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, ...(params ? { params } : {}) },
  };
}

function edge(source: string, target: string, label?: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target, ...(label ? { label } : {}) };
}

describe("segmentWaves", () => {
  it("канонический одноканальный граф: одна волна, повтор помечен repeatsPrevious", () => {
    const { steps } = segmentWaves(createTemplate("Возврат", "new", ["sms"]));
    const waves = steps.filter((s) => s.kind === "wave");
    expect(waves).toHaveLength(2);
    expect(waves[0].wave.repeatsPrevious).toBe(false);
    expect(waves[0].wave.groups).toHaveLength(1);
    expect(waves[0].wave.groups[0].label).toBeUndefined();
    expect(waves[1].wave.repeatsPrevious).toBe(true);
    expect(waves[1].wave.waitBefore?.data.nodeType).toBe("wait");
  });

  it("многоканальный фан-аут (split by equal) НЕ даёт ◈-групп — одна группа на волну", () => {
    const { steps } = segmentWaves(createTemplate("Возврат", "new", ["sms", "email", "push"]));
    const first = steps.find((s) => s.kind === "wave")!.wave;
    expect(first.forkKind).toBeUndefined();
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0].nodes).toHaveLength(3);
  });

  it("condition, где обе ветки ведут в успех/паузу, — это проверка, а не развилка", () => {
    const { steps } = segmentWaves(createTemplate("Возврат", "new", ["sms"]));
    expect(steps.some((s) => s.kind === "check")).toBe(true);
    expect(steps.every((s) => s.kind !== "wave" || s.wave.forkKind !== "condition")).toBe(true);
  });

  it("легаси-Удержание: split by segment с разными каналами даёт ◈-группы с метками рёбер", () => {
    const graph = TEMPLATE_BY_TYPE["Удержание"]();
    const fork = segmentWaves(graph).steps.find(
      (s) => s.kind === "wave" && s.wave.forkKind === "split",
    )!;
    expect(fork.kind).toBe("wave");
    const labels = fork.kind === "wave" ? fork.wave.groups.map((g) => g.label) : [];
    expect(labels).toEqual(["Выс", "Ср", "Низ"]);
  });

  it("сегменты с ОДИНАКОВЫМИ каналами схлопываются в одну группу без метки", () => {
    const graph = createTemplate("Удержание", "new", ["sms", "email"]);
    // Без `!` и без guard'а: если развилка перестанет резолвиться, тест обязан
    // упасть — именно эту регрессию он и стережёт.
    const fork = segmentWaves(graph).steps.find(
      (s) => s.kind === "wave" && s.wave.forkKind === "split",
    )!;
    expect(fork.kind).toBe("wave");
    const groups = fork.kind === "wave" ? fork.wave.groups : [];
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
  });

  it("параллельные сегменты дают по одной строке на канал, а не N одинаковых", () => {
    const { steps } = segmentWaves(createTemplate("Удержание", "new", ["sms", "email"]));
    const waves = steps.filter((s) => s.kind === "wave");
    expect(waves.length).toBeGreaterThan(0);
    for (const w of waves) {
      for (const g of w.wave.groups) {
        const keys = g.nodes.map((n) => `${n.data.nodeType}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("из нескольких параллельных пауз waitBefore берёт ПЕРВУЮ по BFS", () => {
    // Сегментный сценарий открывает волну повтора тремя параллельными паузами
    // (по одной на сегмент). Выбор между ними не косметический: слой описания
    // вешает на эту ноду пилюлю длительности, и правка через её поповер
    // переписывает params ИМЕННО её — адрес правки не должен переезжать.
    const graph = createTemplate("Апсейл", "new", ["sms"]);
    const waits = graph.nodes.filter((n) => n.data.nodeType === "wait").map((n) => n.id);
    expect(waits.length).toBeGreaterThan(1);

    const waves = segmentWaves(graph).steps.filter((s) => s.kind === "wave");
    expect(waves[1].wave.waitBefore?.id).toBe(waits[0]);
  });

  it("повтор сегментированного сценария помечается repeatsPrevious", () => {
    const { steps } = segmentWaves(createTemplate("Удержание", "new", ["sms", "email"]));
    const waves = steps.filter((s) => s.kind === "wave");
    expect(waves).toHaveLength(2);
    expect(waves[0].wave.repeatsPrevious).toBe(false);
    expect(waves[1].wave.repeatsPrevious).toBe(true);
  });

  it("condition с РАЗНЫМИ сообщениями в ветках — развилка по реакции, с метками ДА/НЕТ", () => {
    // Ни один шаблон репозитория такой формы не даёт, поэтому граф собран
    // руками: это прямой критерий приёмки спеки («Развилка по реакции»).
    const condition = node("react", "condition", { kind: "condition", trigger: "opened" });
    const graph = {
      nodes: [
        node("signal", "source"),
        node("first", "email", {
          kind: "email",
          subject: "Первое письмо",
          body: "Знакомство",
          sender: "care@brand.com",
        }),
        condition,
        node("offer", "email", {
          kind: "email",
          subject: "Оффер −10%",
          body: "Скидка тем, кто открыл",
          sender: "promo@brand.com",
        }),
        node("nudge", "sms", {
          kind: "sms",
          text: "Короткое напоминание",
          alphaName: "BRAND",
          scheduledAt: "immediate",
        }),
      ],
      edges: [
        edge("signal", "first"),
        edge("first", "react"),
        edge("react", "offer", "ДА"),
        edge("react", "nudge", "НЕТ"),
      ],
    };

    const fork = segmentWaves(graph).steps.find(
      (s) => s.kind === "wave" && s.wave.forkKind === "condition",
    )!;
    expect(fork.kind).toBe("wave");
    const wave = fork.kind === "wave" ? fork.wave : undefined;
    expect(wave!.forkNode).toBe(condition);
    expect(wave!.groups).toHaveLength(2);
    expect(wave!.groups.map((g) => g.label)).toEqual(["ДА", "НЕТ"]);
    expect(wave!.groups.map((g) => g.nodes.map((n) => n.id))).toEqual([["offer"], ["nudge"]]);
  });

  it("пустой граф даёт пустые шаги", () => {
    expect(segmentWaves({ nodes: [], edges: [] }).steps).toEqual([]);
  });
});
