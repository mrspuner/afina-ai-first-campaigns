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

/** Письмо с общей темой и подставляемым телом — фикстура двух блоков ниже. */
function emailNode(id: string, body: string): WorkflowNode {
  return node(id, "email", {
    kind: "email",
    subject: "Ваше предложение готово",
    body,
    sender: "offers@brand.com",
  });
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

/**
 * Ключ сравнения писем обязан читать ТО ЖЕ поле, которое правит пилюля шаблона.
 *
 * `templateParamKeyForKind("email")` — это `body`, и поповер выбора шаблона
 * (`TemplateTagPopover.onSelect`) патчит ТОЛЬКО его и ТОЛЬКО на одной ноде.
 * Пока ключ сравнения читал `subject`, смена шаблона письма в первом касании
 * не меняла ключ вовсе: волны оставались «одинаковыми», описание продолжало
 * утверждать «повторяет ту же серию» — и рисовало под этой пометкой ДВЕ
 * таблицы с разными шаблонами. Это прямой провал критерия приёмки 8 на пути,
 * который карточка сама и предлагает.
 */
describe("segmentWaves — ключ письма читает тему И тело", () => {
  it("другое ТЕЛО письма во второй волне — это не повтор, даже при совпавшей теме", () => {
    const graph = {
      nodes: [
        node("signal", "source"),
        emailNode("first", "Первый заход: знакомство с предложением."),
        node("w", "wait", { kind: "wait", mode: "duration", durationHours: 48 }),
        emailNode("second", "Второй заход: другой текст под тем же заголовком."),
      ],
      edges: [edge("signal", "first"), edge("first", "w"), edge("w", "second")],
    };

    const waves = segmentWaves(graph).steps.filter((s) => s.kind === "wave");
    expect(waves).toHaveLength(2);
    expect(waves[1].wave.repeatsPrevious).toBe(false);
  });

  it("совпали и тема, и тело — повтор по-прежнему схлопывается (эталон A)", () => {
    const graph = {
      nodes: [
        node("signal", "source"),
        emailNode("first", "Один и тот же текст."),
        node("w", "wait", { kind: "wait", mode: "duration", durationHours: 48 }),
        emailNode("second", "Один и тот же текст."),
      ],
      edges: [edge("signal", "first"), edge("first", "w"), edge("w", "second")],
    };

    const waves = segmentWaves(graph).steps.filter((s) => s.kind === "wave");
    expect(waves).toHaveLength(2);
    expect(waves[1].wave.repeatsPrevious).toBe(true);
  });

  it("два письма одной волны с одинаковой темой, но разными телами — ДВЕ строки, не одна", () => {
    // Второе следствие того же ключа: дедуп внутри волны молча терял целую
    // коммуникацию, у которой совпал лишь заголовок.
    const graph = {
      nodes: [
        node("signal", "source"),
        emailNode("a", "Условия предложения."),
        emailNode("b", "Инструкция, как им воспользоваться."),
      ],
      edges: [edge("signal", "a"), edge("a", "b")],
    };

    const wave = segmentWaves(graph).steps.find((s) => s.kind === "wave")!;
    expect(wave.kind).toBe("wave");
    const nodes = wave.kind === "wave" ? wave.wave.groups[0].nodes.map((n) => n.id) : [];
    expect(nodes).toEqual(["a", "b"]);
  });
});

