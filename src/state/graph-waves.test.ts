import { describe, expect, it } from "vitest";
import { segmentWaves } from "./graph-waves";
import { createTemplate, TEMPLATE_BY_TYPE } from "./workflow-templates";

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
    const fork = segmentWaves(graph).steps.find(
      (s) => s.kind === "wave" && s.wave.forkKind === "split",
    );
    if (fork && fork.kind === "wave") {
      expect(fork.wave.groups).toHaveLength(1);
      expect(fork.wave.groups[0].label).toBeUndefined();
    }
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

  it("повтор сегментированного сценария помечается repeatsPrevious", () => {
    const { steps } = segmentWaves(createTemplate("Удержание", "new", ["sms", "email"]));
    const waves = steps.filter((s) => s.kind === "wave");
    expect(waves).toHaveLength(2);
    expect(waves[0].wave.repeatsPrevious).toBe(false);
    expect(waves[1].wave.repeatsPrevious).toBe(true);
  });

  it("пустой граф даёт пустые шаги", () => {
    expect(segmentWaves({ nodes: [], edges: [] }).steps).toEqual([]);
  });
});
