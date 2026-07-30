import { describe, expect, it } from "vitest";
import {
  describeWorkflow,
  segmentsText,
  type CampaignFacts,
  type DescriptionSegment,
  type DescribableGraph,
} from "./graph-description";
import { createTemplate, TEMPLATE_BY_TYPE } from "./workflow-templates";
import { PRESET_TEMPLATES } from "./app-state";
import type { NodeParams, WorkflowEdge, WorkflowNode, WorkflowNodeType } from "@/types/workflow";

const T = PRESET_TEMPLATES;

/** Нода рукотворного графа — описанию нужны только id, nodeType и params. */
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

/**
 * Развилка ПЕРВОЙ волной, за ней через паузу вторая волна: сегментный сплиттер
 * с разными каналами в ветках (легаси-«Удержание» такой и есть), три ветки
 * сходятся в паузу, за паузой — общее sms. Ни один шаблон репозитория обе
 * половины сразу не даёт, поэтому граф собран руками.
 */
function forkThenTouchGraph(): DescribableGraph {
  return {
    nodes: [
      node("signal", "source"),
      node("split", "split", { kind: "split", by: "segment", branches: 3 }),
      node("ivr", "ivr", { kind: "ivr", scenario: "Удержание", voiceType: "neutral" }),
      node("email", "email", {
        kind: "email", subject: "Ваш дайджест", body: "Самое важное", sender: "d@brand.com",
      }),
      node("push", "push", { kind: "push", title: "Загляните", body: "Есть новое" }),
      node("wait", "wait", { kind: "wait", mode: "duration", durationHours: 168 }),
      node("sms", "sms", {
        kind: "sms", text: "Последнее напоминание", alphaName: "BRAND", scheduledAt: "immediate",
      }),
    ],
    edges: [
      edge("signal", "split"),
      edge("split", "ivr", "Выс"), edge("split", "email", "Ср"), edge("split", "push", "Низ"),
      edge("ivr", "wait"), edge("email", "wait"), edge("push", "wait"),
      edge("wait", "sms"),
    ],
  };
}

/** Однонодовый граф для точечных тестов на резолв шаблона коммуникации — без
 *  scoring/wait, которые describeWorkflow не требует для строки «Первого
 *  касания». */
function commGraph(params: NodeParams): DescribableGraph {
  return {
    nodes: [
      {
        id: "n1",
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: { label: "Comm", nodeType: params.kind, params },
      },
    ],
    edges: [],
  };
}

describe("describeWorkflow", () => {
  describe("Этап старта", () => {
    it("называется «Скоринг базы», когда нода скоринга есть", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.heading).toBe("Скоринг базы");
      expect(segmentsText(start.body)).toBe(
        "Загруженная база проходит скоринг: остаются те, кто проявляет намерение, с разбивкой по уровням склонности.",
      );
    });

    it("называется «Загрузка базы» для собственной базы", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.heading).toBe("Загрузка базы");
      expect(segmentsText(start.body)).toContain("сверяются с сигналами");
    });

    it("выносит факты кампании в список настроек, в фиксированном порядке", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], baseRows: 186255, scenarioName: "Win-back оффер",
        triggers: ["Вклады", "Рассрочка", "Авто", "Ипотека", "Карты"],
        analysisMode: "once", budget: 571186, editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.settings!.map((s) => s.label)).toEqual([
        "База", "Сценарий", "Триггеры", "Режим", "Бюджет",
      ]);
      expect(segmentsText(start.settings![0].value)).toBe("186 255 строк");
      expect(segmentsText(start.settings![3].value)).toBe("разовый");
      expect(segmentsText(start.settings![2].value)).toBe("Вклады, Рассрочка и ещё 3 триггерам");
    });

    it("пункт не появляется, если факта нет", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T, {
        pending: [], baseRows: 1000, editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.settings!.map((s) => s.label)).toEqual(["База"]);
    });

    it("без фактов список настроек пуст, а тело — только общее предложение", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.settings ?? []).toEqual([]);
    });

    it("фраза о доменах на модерации остаётся предложением тела, а не пунктом списка", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: ["a.ru", "b.ru"], editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).toContain("Домены a.ru, b.ru отправлены на модерацию");
      expect((start.settings ?? []).some((s) => s.label === "Домены")).toBe(false);
    });
  });

  describe("Судьба доменов на модерации (Task 11)", () => {
    const graphWithScoring = createTemplate("Возврат", "new", ["sms"]);

    it("appends the domain-fate line when there are pending domains", () => {
      const stages = describeWorkflow(graphWithScoring, [], { pending: ["my.ru"] });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).toContain("отправлены на модерацию");
    });

    it("не добавляет строку судьбы доменов, когда pending пуст", () => {
      const stages = describeWorkflow(graphWithScoring, T, { pending: [] });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).not.toContain("отправлены на модерацию");
    });

    it("не добавляет строку судьбы доменов, когда domainStatuses не передан", () => {
      const stages = describeWorkflow(graphWithScoring, T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).not.toContain("отправлены на модерацию");
    });

    it("перечисляет все pending-домены через запятую в точной формулировке", () => {
      const stages = describeWorkflow(graphWithScoring, T, { pending: ["a.ru", "b.ru"] });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).toContain(
        "Домены a.ru, b.ru отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании",
      );
    });

    it("шов фразы о модерации несёт точные пробелы", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: ["a.ru", "b.ru"], editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.body).toEqual([
        {
          kind: "text",
          text: "Загруженная база проходит скоринг: остаются те, кто проявляет намерение, с разбивкой по уровням склонности. Домены ",
        },
        { kind: "tag", tag: { id: "start-domains", label: "a.ru, b.ru", target: { kind: "domains" } } },
        {
          kind: "text",
          text: " отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании.",
        },
      ]);
    });
  });

  describe("Касания", () => {
    it("первая волна — таблица строк с каналом, контентом и id шаблона", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms", "email"]), T);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(touch.heading).toBe("Первое касание");
      expect(touch.groups).toHaveLength(1);
      const rows = touch.groups![0].rows;
      expect(rows.map((r) => r.channel).sort()).toEqual(["Email", "SMS"]);
      const sms = rows.find((r) => r.channel === "SMS")!;
      expect(sms.contentText).toBe("Ваше предложение ждёт. Подробности на сайте.");
      expect(sms.previewTemplateId).toBe("tpl_sms_reminder");
    });

    it("email кладёт в контент ТЕМУ, а не тело письма, и при этом резолвит свой шаблон", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["email"]), T, {
        pending: [], graphEditable: true,
      });
      const row = stages.find((s) => s.kind === "touch")!.groups![0].rows[0];
      expect(row.channel).toBe("Email");
      // Равенство ТЕМЕ пресета, а не «нет угловых скобок»: тело письма — тоже
      // простой текст, и проверка на «<» темы от тела не отличала бы.
      expect(row.contentText).toBe("Ваше предложение готово");
      expect(row.contentTitle).toBeUndefined();
      // Положительный резолв шаблона ИМЕННО этого канала (исторический баг:
      // сид-текст письма не совпадал ни с одним пресетом справочника, шаблон не
      // резолвился и пилюля не рисовалась). Рассогласование сида со справочником
      // специфично для канала — зелёный SMS за email не отвечает.
      expect(row.previewTemplateId).toBe("tpl_eml_offer");
      expect(row.templateTag!.label).toBe("Персональный оффер");
    });

    it("ivr резолвит свой шаблон — тот же щит для четвёртого канала", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["ivr"]), T, {
        pending: [], graphEditable: true,
      });
      const row = stages.find((s) => s.kind === "touch")!.groups![0].rows[0];
      expect(row.channel).toBe("Звонок");
      expect(row.previewTemplateId).toBe("tpl_ivr_greeting");
    });

    it("push кладёт заголовок отдельной строкой ячейки", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["push"]), T);
      const row = stages.find((s) => s.kind === "touch")!.groups![0].rows[0];
      expect(row.contentTitle).toBe("Давно вас не видели");
      expect(row.contentText).toBe("Загляните — у нас есть кое-что для вас.");
    });

    it("нерезолвнутый шаблон даёт пилюлю «не выбран» и предпросмотр без id", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), [], {
        pending: [], editableSteps: [], graphEditable: true,
      });
      const row = stages.find((s) => s.kind === "touch")!.groups![0].rows[0];
      expect(row.templateTag!.label).toBe("не выбран");
      expect(row.previewTemplateId).toBeUndefined();
    });

    it("схлопывает одинаковые касания параллельных сегментов в одну строку на канал", () => {
      // Апсейл — сегментированный шаблон: три comm-юнита с одинаковыми params.
      // Одинаковые потоки — не потоки: развилки нет, есть обычное касание.
      const stages = describeWorkflow(createTemplate("Апсейл", "new", ["sms"]), T);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(touch.groups).toHaveLength(1);
      expect(touch.groups![0].rows).toHaveLength(1);
      expect(touch.groups![0].rows[0].channel).toBe("SMS");
    });

    it("идентичный повтор — этап «Пауза и повтор» с той же таблицей и ссылкой на оригинал", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], editableSteps: [], graphEditable: true,
      });
      const retry = stages.find((s) => s.kind === "retry")!;
      expect(retry.heading).toBe("Пауза и повтор");
      expect(retry.sameAsHeading).toBe("Первое касание");
      const first = stages.find((s) => s.kind === "touch")!;
      expect(retry.groups![0].rows.map((r) => r.contentText))
        .toEqual(first.groups![0].rows.map((r) => r.contentText));
      expect(segmentsText(retry.body)).toContain("повторяет ту же серию");
    });

    it("«Пауза и повтор» берёт длительность из WaitParams", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const retry = stages.find((s) => s.kind === "retry")!;
      expect(segmentsText(retry.body)).toContain("2 дня"); // durationHours: 48
    });

    it("«Проверка реакции» появляется один раз, даже когда условий в графе два", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      expect(stages.filter((s) => s.kind === "check")).toHaveLength(1);
    });

    it("«Проверка реакции» описывает уход отреагировавших в успех", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(check.heading).toBe("Проверка реакции");
      expect(segmentsText(check.body)).toContain("успех");
    });

    it("волны нумеруются словами до четвёртой, дальше — «Касание N»", () => {
      // Цепочка из пяти РАЗНЫХ касаний через паузы: ни одна волна не повтор,
      // поэтому все пять тратят порядковый номер.
      const texts = ["Первое", "Второе", "Третье", "Четвёртое", "Пятое"];
      const nodes: WorkflowNode[] = [node("signal", "source")];
      const edges: WorkflowEdge[] = [];
      let previous = "signal";
      texts.forEach((text, i) => {
        const wait = `wait${i}`;
        const sms = `sms${i}`;
        nodes.push(
          node(wait, "wait", { kind: "wait", mode: "duration", durationHours: 24 }),
          node(sms, "sms", { kind: "sms", text, alphaName: "BRAND", scheduledAt: "immediate" }),
        );
        edges.push(edge(previous, wait), edge(wait, sms));
        previous = sms;
      });

      const headings = describeWorkflow({ nodes, edges }, T)
        .filter((s) => s.kind === "touch")
        .map((s) => s.heading);
      expect(headings).toEqual([
        "Первое касание", "Повторное касание", "Третье касание", "Четвёртое касание", "Касание 5",
      ]);
    });

    // Расходящаяся волна не должна врать о том, ЧЕМ она отличается: вторая
    // волна тех же каналов с другими текстами — обычная форма кампании.
    describe("расходящаяся волна называет настоящее отличие", () => {
      const wait = (id: string) =>
        node(id, "wait", { kind: "wait", mode: "duration", durationHours: 24 });

      it("те же каналы, другие тексты → «другими сообщениями»", () => {
        const sms = (id: string, text: string) =>
          node(id, "sms", { kind: "sms", text, alphaName: "BRAND", scheduledAt: "immediate" });
        const stages = describeWorkflow(
          {
            nodes: [node("signal", "source"), sms("a", "Первый заход"), wait("w"), sms("b", "Второй заход")],
            edges: [edge("signal", "a"), edge("a", "w"), edge("w", "b")],
          },
          T,
        );
        const second = stages.filter((s) => s.kind === "touch")[1];
        expect(segmentsText(second.body)).toContain("другими сообщениями");
        expect(segmentsText(second.body)).not.toContain("другими каналами");
      });

      it("другой канал → «другими каналами и шаблонами»", () => {
        const stages = describeWorkflow(
          {
            nodes: [
              node("signal", "source"),
              node("a", "sms", { kind: "sms", text: "Первый заход", alphaName: "BRAND", scheduledAt: "immediate" }),
              wait("w"),
              node("b", "email", { kind: "email", subject: "Второй заход", body: "Текст", sender: "b@brand.com" }),
            ],
            edges: [edge("signal", "a"), edge("a", "w"), edge("w", "b")],
          },
          T,
        );
        const second = stages.filter((s) => s.kind === "touch")[1];
        expect(segmentsText(second.body)).toContain("другими каналами и шаблонами");
      });
    });

    it("нет коммуникаций — нет касаний, «Итог» про готовый сегмент", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      expect(stages.some((s) => s.kind === "touch")).toBe(false);
      expect(segmentsText(stages.find((s) => s.kind === "outcome")!.body))
        .toContain("Исходящих коммуникаций нет");
    });
  });

  describe("Ветки и потоки", () => {
    it("сегментный split даёт этап-развилку с ◈-группами по меткам", () => {
      const stages = describeWorkflow(TEMPLATE_BY_TYPE["Удержание"](), T);
      const fork = stages.find((s) => s.kind === "fork")!;
      expect(fork.heading).toBe("Деление на потоки");
      expect(fork.groups!.map((g) => g.label)).toEqual([
        "Высокая склонность", "Средняя склонность", "Низкая склонность",
      ]);
      expect(segmentsText(fork.body)).toContain("делится на 3 потока");
    });

    it("condition с разными сообщениями в ветках — «Развилка по реакции» с подписями «сделал/не сделал»", () => {
      // Ни один шаблон репозитория такой формы не даёт — граф собран руками.
      const graph = {
        nodes: [
          node("signal", "source"),
          node("first", "email", {
            kind: "email", subject: "Первое письмо", body: "Знакомство",
            sender: "care@brand.com",
          }),
          node("react", "condition", { kind: "condition", trigger: "opened" }),
          node("offer", "email", {
            kind: "email", subject: "Оффер −10%", body: "Скидка тем, кто открыл",
            sender: "promo@brand.com",
          }),
          node("nudge", "sms", {
            kind: "sms", text: "Короткое напоминание", alphaName: "BRAND",
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

      const fork = describeWorkflow(graph, T).find((s) => s.kind === "fork")!;
      expect(fork.heading).toBe("Развилка по реакции");
      expect(fork.groups!.map((g) => g.label)).toEqual(["Открыл письмо", "Не открыл письмо"]);
      expect(fork.groups!.map((g) => g.rows.map((r) => r.contentText))).toEqual([
        ["Оффер −10%"], ["Короткое напоминание"],
      ]);
      expect(segmentsText(fork.body)).toContain("расходится по условию открыл письмо?");
    });

    it("развилка ТРАТИТ номер касания: следующая волна — «Повторное касание», и она про неотреагировавших", () => {
      // Развилка первой волной (легаси-«Удержание» — развилка по построению),
      // за ней через паузу вторая волна. Если бы развилка номер не тратила,
      // вторая волна назвалась бы «Первым касанием», рассказывая при этом про
      // тех, кто не отреагировал, — этап противоречил бы сам себе.
      const stages = describeWorkflow(forkThenTouchGraph(), T, {
        pending: [], channels: ["ivr", "email", "push"],
      });
      expect(stages.map((s) => s.heading)).toEqual([
        "Загрузка базы", "Деление на потоки", "Повторное касание", "Итог",
      ]);
      expect(segmentsText(stages.find((s) => s.kind === "touch")!.body))
        .toContain("Тем, кто не отреагировал");
    });

    it("вводная «Выбрано N каналов» есть и тогда, когда первая волна — развилка", () => {
      // Пилюля «Каналы» — единственный вход описания в этот шаг визарда; она не
      // должна пропадать оттого, что первая волна разветвилась.
      const stages = describeWorkflow(forkThenTouchGraph(), T, {
        pending: [], channels: ["ivr", "email", "push"], editableSteps: ["channels"],
      });
      const fork = stages.find((s) => s.kind === "fork")!;
      expect(segmentsText(fork.body)).toBe(
        "Выбрано 3 канала: Звонок, Email, Push. Аудитория делится на 3 потока по уровню склонности, каждый получает своё:",
      );
      const tag = fork.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.label).toBe("3 канала");
      expect(tag.tag.target).toEqual({ kind: "wizard-step", step: "channels" });
    });

    it("повтор номер НЕ тратит: касание → повтор → касание даёт «Первое / Пауза и повтор / Повторное»", () => {
      const sms = (id: string, text: string) =>
        node(id, "sms", { kind: "sms", text, alphaName: "BRAND", scheduledAt: "immediate" });
      const wait = (id: string) =>
        node(id, "wait", { kind: "wait", mode: "duration", durationHours: 24 });
      const graph = {
        nodes: [
          node("signal", "source"),
          sms("a1", "Первый заход"), wait("w1"),
          sms("a2", "Первый заход"), wait("w2"),
          sms("b1", "Совсем другой текст"),
        ],
        edges: [
          edge("signal", "a1"), edge("a1", "w1"), edge("w1", "a2"),
          edge("a2", "w2"), edge("w2", "b1"),
        ],
      };
      const stages = describeWorkflow(graph, T).filter((s) => s.kind !== "start" && s.kind !== "outcome");
      expect(stages.map((s) => [s.kind, s.heading])).toEqual([
        ["touch", "Первое касание"],
        ["retry", "Пауза и повтор"],
        ["touch", "Повторное касание"],
      ]);
    });

    it("одинаковые по содержанию потоки развилкой не становятся — это обычное касание", () => {
      const stages = describeWorkflow(createTemplate("Удержание", "new", ["sms", "email"]), T);
      expect(stages.some((s) => s.kind === "fork")).toBe(false);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(touch.groups).toHaveLength(1);
      expect(touch.groups![0].label).toBeUndefined();
    });
  });

  // Item 3 (финальная полировка): «Первое касание» должно называть, СКОЛЬКО
  // каналов выбрано, а не выводить весь список именами в одной пилюле —
  // «Выбрано [3 канала]: SMS, Email, Звонок. …» — считает пилюля (кликабельна,
  // ведёт на «Каналы»), имена идут дальше обычным текстом.
  describe("Первое касание — «Выбрано N каналов» (Item 3)", () => {
    // Один канал → сплиттера в графе нет (см. "не выдумывает деление на
    // потоки" выше); два и больше → есть.
    const graphNoSplit = createTemplate("Возврат", "new", ["sms"]);
    const graphSplit = createTemplate("Возврат", "new", ["sms", "email"]);

    it("без сплита: «Выбрано N каналов: имена. Каждому контакту…»", () => {
      const stages = describeWorkflow(graphNoSplit, T, {
        pending: [],
        channels: ["sms", "email", "ivr"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toBe(
        "Выбрано 3 канала: SMS, Email, Звонок. Каждому контакту уходит первое сообщение:",
      );
    });

    // Слово «поток» в этом блоке закреплено за СЕГМЕНТОМ аудитории: этап
    // развилки говорит «Аудитория делится на 3 потока по уровню склонности», и
    // ровно этот смысл закрепляют ◈-подзаголовки таблиц. Многоканальная волна
    // делит аудиторию не по склонности, а по каналам (`split by:"equal"` —
    // модель стоимости делит охват на число веток), поэтому она называет свой
    // механизм своим именем, а не занимает чужое слово.
    it("несколько сообщений в волне: та же вводная фраза, второе предложение — про деление по КАНАЛАМ, а не «потокам»", () => {
      const stages = describeWorkflow(graphSplit, T, {
        pending: [],
        channels: ["sms", "email"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toBe(
        "Выбрано 2 канала: SMS, Email. Аудитория делится по каналам — каждому своё сообщение:",
      );
    });

    it("«поток» остаётся словом сегментной развилки — многоканальная волна его не занимает", () => {
      const stages = describeWorkflow(graphSplit, T, {
        pending: [],
        channels: ["sms", "email"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).not.toContain("поток");
      // А сегментная развилка — по-прежнему «потоки»: слово не изгнано из
      // описания, оно закреплено за одним смыслом.
      const fork = describeWorkflow(forkThenTouchGraph(), T).find((s) => s.kind === "fork")!;
      expect(segmentsText(fork.body)).toContain("потока");
    });

    it("пилюля несёт ТОЛЬКО счётчик («3 канала») — имена каналов в неё не входят", () => {
      const stages = describeWorkflow(graphNoSplit, T, {
        pending: [],
        channels: ["sms", "email", "ivr"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      const tag = touch.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.label).toBe("3 канала");
    });

    it("пилюля по-прежнему ведёт на шаг «Каналы» (когда он доступен)", () => {
      const stages = describeWorkflow(graphNoSplit, T, {
        pending: [],
        channels: ["sms", "email"],
        editableSteps: ["channels"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      const tag = touch.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.target).toEqual({ kind: "wizard-step", step: "channels" });
    });

    // Русское числительное «канал»/«канала»/«каналов» — те же контрольные
    // случаи, что и в других местах кодовой базы (1, 2, 5, 11, 21).
    const CH = ["sms", "email", "push", "ivr"] as const;
    it.each([
      [1, "1 канал"],
      [2, "2 канала"],
      [5, "5 каналов"],
      [11, "11 каналов"],
      [21, "21 канал"],
    ])("%s канал(ов) → «%s»", (n, expected) => {
      const channels = Array.from({ length: n }, (_, i) => CH[i % CH.length]);
      const stages = describeWorkflow(graphNoSplit, T, { pending: [], channels });
      const touch = stages.find((s) => s.kind === "touch")!;
      const tag = touch.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.label).toBe(expected);
    });

    it("без channels в facts — формулировка не меняется (нет пилюли, нет фразы «Выбрано»)", () => {
      const stages = describeWorkflow(graphNoSplit, T, { pending: [] });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toBe("Каждому контакту уходит первое сообщение:");
      expect(touch.body.some((s) => s.kind === "tag")).toBe(false);
    });

    it("без фактов вовсе (hasFacts=false) — формулировка та же, что и раньше", () => {
      const stages = describeWorkflow(graphNoSplit, T);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toBe("Каждому контакту уходит первое сообщение:");
    });
  });

  describe("Первое касание не втягивает повторный блок", () => {
    it("ноды повтора уходят в свою волну, а не в таблицу первого касания", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      // Повторный блок несёт ту же ноду; в таблице первого касания ровно одна
      // строка, а повтор — отдельный этап.
      expect(stages.find((s) => s.kind === "touch")!.groups![0].rows).toHaveLength(1);
      expect(stages.find((s) => s.kind === "retry")!.groups![0].rows).toHaveLength(1);
    });
  });

  // fix round 1, Finding 1: `waitPhrase` раньше форматировала только
  // дни/часы — 840 часов (ровно 5 недель) читались как «35 дней», пока
  // `splitDuration` (wait-fields.tsx, поле внутри поповера паузы Task 8)
  // тот же час читало как «5 недель» — два числа на одном экране одновременно
  // противоречили друг другу. Хелпер подменяет durationHours retry-ноды
  // «Возврата» (по умолчанию 48ч/«2 дня» — не кратно неделе, багом не ловится).
  function graphWithRetryDuration(hours: number) {
    const template = createTemplate("Возврат", "new", ["sms"]);
    const waitNode = template.nodes.find((n) => n.data.nodeType === "wait")!;
    return {
      nodes: template.nodes.map((n) =>
        n.id === waitNode.id
          ? { ...n, data: { ...n.data, params: { kind: "wait" as const, mode: "duration" as const, durationHours: hours } } }
          : n,
      ),
      edges: template.edges,
    };
  }

  describe("waitPhrase — крупнейшая точная единица, зеркалит splitDuration (fix round 1, Finding 1)", () => {
    it("840 часов (ровно 5 недель) — «5 недель», НЕ «35 дней»", () => {
      const stages = describeWorkflow(graphWithRetryDuration(840), T);
      const retry = stages.find((s) => s.kind === "retry")!;
      expect(segmentsText(retry.body)).toContain("5 недель");
      expect(segmentsText(retry.body)).not.toContain("35 дней");
    });

    // Русское множественное число «неделя»/«недели»/«недель» — те же случаи,
    // что оговорены в фиксе (1, 2, 5, 11, 21).
    it.each([
      [168, "1 неделя"],
      [336, "2 недели"],
      [840, "5 недель"],
      [1848, "11 недель"],
      [3528, "21 неделя"],
    ])("%s часов → «%s»", (hours, expected) => {
      const stages = describeWorkflow(graphWithRetryDuration(hours), T);
      const retry = stages.find((s) => s.kind === "retry")!;
      expect(segmentsText(retry.body)).toContain(expected);
    });

    it("длительность, не кратная неделе, но кратная суткам — по-прежнему в днях", () => {
      // Регресс-щит: неделя не должна начать «съедать» обычные дни (72ч = 3
      // дня, ни разу не делится на 168 без остатка).
      const stages = describeWorkflow(graphWithRetryDuration(72), T);
      const retry = stages.find((s) => s.kind === "retry")!;
      expect(segmentsText(retry.body)).toContain("3 дня");
    });
  });

  describe("Итог", () => {
    it("после повтора описывает финальную проверку", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const outcome = stages.find((s) => s.kind === "outcome")!;
      expect(outcome.heading).toBe("Итог");
      expect(segmentsText(outcome.body)).toContain("без конверсии");
    });
  });

  describe("Граф без коммуникаций", () => {
    it("даёт только Старт и Итог, без выдуманных касаний", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      expect(stages.map((s) => s.id)).toEqual(["start", "outcome"]);
      expect(segmentsText(stages[1].body)).toContain("готовый сегмент");
      expect(stages.some((s) => s.groups?.length)).toBe(false);
    });
  });

  describe("Порядок и чистота", () => {
    it("этапы идут по пути базы через ноды", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      expect(stages.map((s) => s.id)).toEqual([
        "start",
        "touch-1",
        "check-1",
        "retry-1",
        "outcome",
      ]);
    });

    it("не мутирует переданный граф", () => {
      const graph = createTemplate("Возврат", "new", ["sms"]);
      const snapshot = JSON.stringify(graph);
      describeWorkflow(graph, T);
      expect(JSON.stringify(graph)).toBe(snapshot);
    });

    it("пустой граф не роняет обход", () => {
      expect(describeWorkflow({ nodes: [], edges: [] }, T)).toEqual([]);
    });
  });
});

describe("describeWorkflow — теги", () => {
  // «Возврат»/new/sms несёт и коммуникационную ноду (sms первого касания,
  // шаблон резолвится — см. "Первое касание" выше), и retry-wait ноду (те же
  // 48 часов, что использует "берёт длительность паузы..."), поэтому годится
  // фикстурой сразу для тестов шаблона и паузы.
  const graph = createTemplate("Возврат", "new", ["sms"]);
  const templates = T;

  /**
   * Все теги описания одним плоским списком — удобно для утверждений.
   *
   * Task 4: факты кампании (база, сценарий, триггеры, режим, бюджет) переехали
   * из `body` в `settings` — их теги живут внутри `setting.value`, поэтому
   * список без него не заметил бы половину тегов. Task 5: строки коммуникаций
   * переехали из `messages` в `groups[].rows`.
   */
  const allTags = (stages: ReturnType<typeof describeWorkflow>) =>
    stages.flatMap((s) => [
      ...s.body.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
      ...(s.settings ?? []).flatMap((setting) =>
        setting.value.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
      ),
      ...(s.groups ?? []).flatMap((g) =>
        g.rows.flatMap((row) => (row.templateTag ? [row.templateTag] : [])),
      ),
    ]);

  /**
   * Сырая склейка сегментов БЕЗ схлопывания пробелов (в отличие от
   * `segmentsText`, которая делает `.replace(/\s+/g, " ")` и поэтому не может
   * поймать сдвоенный пробел на шве — review round 1, Finding 3).
   */
  const rawConcat = (body: DescriptionSegment[]) =>
    body.map((s) => (s.kind === "text" ? s.text : s.tag.label)).join("");

  const facts: CampaignFacts = {
    pending: [],
    baseRows: 12_000,
    triggers: ["Ипотека", "Новостройки", "Вторичка", "Аренда"],
    channels: ["sms", "email"],
    budget: 50_000,
    analysisMode: "once",
    scenarioName: "Ипотечный интерес",
    editableSteps: ["scenario", "intent", "interests", "analysis", "file", "channels", "budget"],
    graphEditable: true,
  };

  it("без фактов тегов нет — описание остаётся чистым текстом", () => {
    const tags = allTags(describeWorkflow(graph, templates));
    expect(tags).toHaveLength(0);
  });

  it("число строк базы, каналы, бюджет, режим и сценарий присутствуют тегами", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const steps = tags
      .filter((t) => t.target.kind === "wizard-step")
      .map((t) => (t.target as { step: string }).step);
    expect(steps).toEqual(
      expect.arrayContaining(["file", "interests", "channels", "budget", "analysis", "scenario"]),
    );
  });

  it("перечисление триггеров — два названных плюс схлопка с формой числительного", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const collapse = tags.find((t) => t.label.startsWith("ещё "));
    expect(collapse?.label).toBe("ещё 2 триггерам");
    // Схлопка ведёт туда же, куда названные триггеры.
    expect(collapse?.target).toEqual({ kind: "wizard-step", step: "interests" });
    // По наведению — остаток перечисления.
    expect(collapse?.hoverList).toEqual(["Вторичка", "Аренда"]);
  });

  it("три триггера дают форму «ещё 1 триггеру»", () => {
    const tags = allTags(
      describeWorkflow(graph, templates, { ...facts, triggers: ["А", "Б", "В"] }),
    );
    expect(tags.find((t) => t.label.startsWith("ещё "))?.label).toBe("ещё 1 триггеру");
  });

  it("два триггера схлопки не дают", () => {
    const tags = allTags(
      describeWorkflow(graph, templates, { ...facts, triggers: ["А", "Б"] }),
    );
    expect(tags.some((t) => t.label.startsWith("ещё "))).toBe(false);
  });

  it("пустой editableSteps снимает цель со всех шаговых тегов — кампания запущена", () => {
    const tags = allTags(describeWorkflow(graph, templates, { ...facts, editableSteps: [] }));
    expect(tags.some((t) => t.target.kind === "wizard-step")).toBe(false);
    // Значения при этом остаются — теги носители данных, а не только аффорданс.
    // toLocaleString("ru-RU") группирует разряды через NBSP (U+00A0), не через
    // обычный пробел — используем ту же букву, что реально возвращает форматтер
    // (сверено эмпирически; ASCII-пробел в буквальном тексте брифа не совпал бы).
    expect(tags.some((t) => t.label.includes("50 000"))).toBe(true);
  });

  it("шаг, отсутствующий у этой цели, тега не даёт", () => {
    // Собственная база: шагов «Режим» и «Интересы» в её визарде не существует.
    const tags = allTags(
      describeWorkflow(graph, templates, {
        ...facts,
        analysisMode: undefined,
        editableSteps: ["scenario", "intent", "file", "channels", "budget"],
      }),
    );
    expect(tags.some((t) => t.label === "разовый")).toBe(false);
  });

  it("отсутствующее значение тега не даёт, текст остаётся связным", () => {
    const stages = describeWorkflow(graph, templates, { ...facts, baseRows: undefined });
    const tags = allTags(stages);
    expect(tags.some((t) => t.target.kind === "wizard-step" && t.target.step === "file")).toBe(
      false,
    );
    expect(segmentsText(stages[0].body)).not.toContain("undefined");
    // Проверка на сырой склейке, а не через segmentsText: та коллапсит
    // \s+ в один пробел ДО сравнения, поэтому сдвоенный пробел на шве никогда
    // бы её не завалил (review round 1, Finding 3 — тест не мог упасть).
    expect(rawConcat(stages[0].body)).not.toMatch(/ {2}/);
  });

  it("один триггер даёт голое имя без схлопки и без ложного множественного числа", () => {
    // Finding 1 (исторический): связка триггеров была захардкожена в
    // множественном числе — «Работает по триггерам Ипотека» на
    // одном-единственном триггере. Task 4: связывающая фраза исчезла вовсе —
    // триггеры переехали в пункт списка «Триггеры», значение которого несёт
    // только имя (и опциональную схлопку остатка), поэтому регресс проверяем
    // на значении пункта, а не на сплошном тексте старта.
    const stages = describeWorkflow(graph, templates, { ...facts, triggers: ["Ипотека"] });
    const start = stages.find((s) => s.kind === "start")!;
    const triggerSetting = start.settings!.find((s) => s.label === "Триггеры")!;
    expect(segmentsText(triggerSetting.value)).toBe("Ипотека");
    // И схлопки, разумеется, тоже нет — схлопывать не из чего.
    expect(allTags(stages).some((t) => t.label.startsWith("ещё "))).toBe(false);
  });

  it("домены на модерации несут тег со всеми доменами и статусами", () => {
    const stages = describeWorkflow(graph, templates, {
      ...facts,
      pending: ["new.example.ru"],
      domains: [
        { domain: "new.example.ru", status: "pending" },
        { domain: "old.example.ru", status: "approved" },
      ],
    });
    const tag = allTags(stages).find((t) => t.target.kind === "domains");
    expect(tag).toBeDefined();
    expect(tag!.label).toBe("new.example.ru");
  });

  it("название шаблона становится тегом с целью на свою ноду", () => {
    const stages = describeWorkflow(graph, templates, facts);
    const row = stages.find((s) => s.kind === "touch")?.groups?.[0].rows[0];
    expect(row?.templateTag?.target.kind).toBe("template");
  });

  it("пауза несёт тег с целью node-fields на ноду ожидания", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const wait = tags.find((t) => t.target.kind === "node-fields");
    expect(wait).toBeDefined();
    expect(wait!.label).toMatch(/дн|час/);
  });

  it("graphEditable=false демотирует шаблон и паузу в носители значений (§2.12) — текст остаётся", () => {
    const stages = describeWorkflow(graph, templates, { ...facts, graphEditable: false });
    const tags = allTags(stages);
    expect(tags.some((t) => t.target.kind === "template")).toBe(false);
    expect(tags.some((t) => t.target.kind === "node-fields")).toBe(false);
    // Значения остаются — это носители данных, а не только аффорданс клика.
    const row = stages.find((s) => s.kind === "touch")?.groups?.[0].rows[0];
    expect(row?.templateTag?.label).toBeTruthy();
    expect(tags.some((t) => /дн|час/.test(t.label))).toBe(true);
  });

  it("editableSteps пуст не подменяет graphEditable — разные сигналы (регресс наивного фикса)", () => {
    // Сидовый черновик без снапшота визарда: editableSteps пуст (некуда вести
    // шаговые теги), но граф всё ещё правится. Гейтить template/node-fields на
    // editableSteps (наивный фикс) увело бы их в read-only и для этого случая
    // тоже — ровно регрессия, которую эта пара сигналов не даёт совершить.
    const stages = describeWorkflow(graph, templates, {
      ...facts,
      editableSteps: [],
      graphEditable: true,
    });
    const tags = allTags(stages);
    expect(tags.some((t) => t.target.kind === "wizard-step")).toBe(false);
    expect(tags.some((t) => t.target.kind === "template")).toBe(true);
    expect(tags.some((t) => t.target.kind === "node-fields")).toBe(true);
  });

  it("идентификаторы тегов уникальны — годятся как React-ключи", () => {
    const ids = allTags(describeWorkflow(graph, templates, facts)).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("describeWorkflow — пилюля шаблона рендерится ВСЕГДА (баг: аффорданс «сменить шаблон» пропадал, если текущий текст ноды случайно не совпал с пресетом библиотеки)", () => {
  const editableFacts: CampaignFacts = { pending: [], graphEditable: true };

  /** Единственная строка единственной группы единственного касания. */
  const onlyRow = (stages: ReturnType<typeof describeWorkflow>) =>
    stages.find((s) => s.kind === "touch")!.groups![0].rows[0];

  it("email с телом, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран» — и не теряет тему", () => {
    const graph = commGraph({
      kind: "email",
      subject: "Индивидуальная тема",
      body: "Совершенно нестандартный текст письма, которого нет в справочнике.",
      sender: "noreply@brand.com",
    });
    const row = onlyRow(describeWorkflow(graph, T, editableFacts));
    expect(row.previewTemplateId).toBeUndefined();
    expect(row.contentText).toBe("Индивидуальная тема");
    expect(row.templateTag).toBeDefined();
    expect(row.templateTag!.label).toBe("не выбран");
    expect(row.templateTag!.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("ivr со сценарием, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран»", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Совершенно свой сценарий звонка вне библиотеки.",
      voiceType: "neutral",
    });
    const row = onlyRow(describeWorkflow(graph, T, editableFacts));
    expect(row.previewTemplateId).toBeUndefined();
    expect(row.templateTag?.label).toBe("не выбран");
    expect(row.templateTag?.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("резолвнутый шаблон по-прежнему несёт своё имя пилюлей и id для предпросмотра", () => {
    const smsTemplate = T.find((tpl) => tpl.id === "tpl_sms_reminder")!;
    const graph = commGraph(smsTemplate.content);
    const row = onlyRow(describeWorkflow(graph, T, editableFacts));
    expect(row.templateTag?.label).toBe("SMS — напоминание");
    expect(row.previewTemplateId).toBe("tpl_sms_reminder");
  });

  it("graphEditable=false демотирует нерезолвнутый тег в носитель значения (§2.12) — «не выбран» остаётся видимым, но не кликабельным", () => {
    const graph = commGraph({ kind: "ivr", scenario: "Свой сценарий.", voiceType: "neutral" });
    const row = onlyRow(describeWorkflow(graph, T, { pending: [], graphEditable: false }));
    expect(row.templateTag?.target.kind).toBe("none");
    expect(row.templateTag?.label).toBe("не выбран");
  });

  it("без фактов (withTags=false) шаблон-тег по-прежнему не создаётся — обратная совместимость Task 3", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Свой сценарий вне библиотеки.",
      voiceType: "neutral",
    });
    const row = onlyRow(describeWorkflow(graph, T));
    expect(row.templateTag).toBeUndefined();
  });

  it("строка знает свою ноду — по ней рендер адресует предпросмотр", () => {
    const graph = commGraph({ kind: "sms", text: "Текст.", alphaName: "BRAND", scheduledAt: "immediate" });
    expect(onlyRow(describeWorkflow(graph, T, editableFacts)).nodeId).toBe("n1");
  });
});
