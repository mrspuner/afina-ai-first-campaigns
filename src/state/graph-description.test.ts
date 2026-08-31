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

/**
 * Сегментный сплиттер, у которого все три ветки несут ОДНО И ТО ЖЕ сообщение.
 * Раньше такой граф давал генератор для «Апсейла»/«Удержания»; сегментная
 * генерация снята, но сплит «По сегменту» остаётся легальной нодой — его
 * ставит пользователь или ИИ, — поэтому граф собран руками.
 */
function sameContentSegmentsGraph(): DescribableGraph {
  const sms = (id: string) =>
    node(id, "sms", {
      kind: "sms", text: "Вернитесь — для вас скидка", alphaName: "BRAND", scheduledAt: "immediate",
    });
  const email = (id: string) =>
    node(id, "email", {
      kind: "email", subject: "Вернитесь", body: "Для вас скидка", sender: "promo@brand.com",
    });
  // Каждый сегмент несёт ОБА канала через свой channel-сплиттер (by:"equal") —
  // ровно та форма, что раньше приезжала из сегментного генератора. Два канала,
  // а не один: тесты ниже проверяют, что каналы вплетаются в тело касания
  // ИМЕНАМИ, и на одноканальной фикстуре эта проверка была бы пустой.
  const branch = (seg: string) => [
    node(`${seg}_ch`, "split", { kind: "split", by: "equal", branches: 2 }),
    sms(`${seg}_sms`),
    email(`${seg}_email`),
  ];
  const branchEdges = (seg: string) => [
    edge(`${seg}_ch`, `${seg}_sms`),
    edge(`${seg}_ch`, `${seg}_email`),
  ];
  return {
    nodes: [
      node("signal", "source"),
      node("split", "split", { kind: "split", by: "segment", branches: 3 }),
      ...branch("high"), ...branch("mid"), ...branch("low"),
    ],
    edges: [
      edge("signal", "split"),
      edge("split", "high_ch", "Выс"), edge("split", "mid_ch", "Ср"), edge("split", "low_ch", "Низ"),
      ...branchEdges("high"), ...branchEdges("mid"), ...branchEdges("low"),
    ],
  };
}

/**
 * Развилка условия: signal → email → condition("opened") → ДА:email / НЕТ:sms.
 * Та же форма графа, что уже проверяет `graph-waves.test.ts` («condition с
 * разными сообщениями в ветках») — тестовые фикстуры графов не шарятся между
 * файлами, поэтому собрана здесь заново. Ветки нарочно РАЗНЫМ каналом
 * (email/sms) и разным текстом — тексты обязаны различаться (Task 3 brief),
 * иначе `segmentWaves` схлопнул бы их в одну группу без метки, и развилки не
 * получилось бы вовсе: тест на цель тега проверял бы обычное касание, а не
 * развилку.
 */
function conditionForkGraph(): DescribableGraph {
  return {
    nodes: [
      node("signal", "source"),
      node("first", "email", {
        kind: "email", subject: "Первое письмо", body: "Знакомство", sender: "care@brand.com",
      }),
      node("react", "condition", { kind: "condition", trigger: "opened" }),
      node("offer", "email", {
        kind: "email", subject: "Оффер −10%", body: "Скидка тем, кто открыл", sender: "promo@brand.com",
      }),
      node("nudge", "sms", {
        kind: "sms", text: "Короткое напоминание", alphaName: "BRAND", scheduledAt: "immediate",
      }),
    ],
    edges: [
      edge("signal", "first"),
      edge("first", "react"),
      edge("react", "offer", "ДА"),
      edge("react", "nudge", "НЕТ"),
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

/**
 * Теги шаблонов волны (id `msg-…`). У НЕ-форк волн каналы вплетены инлайн прямо
 * в `stage.body`; у ФОРК-волн — в `group.inline` каждой ветки. Хелпер собирает
 * их из обоих мест, в порядке текста.
 */
function templateTagsOf(stage: ReturnType<typeof describeWorkflow>[number]) {
  const segs: DescriptionSegment[] = [
    ...stage.body,
    ...(stage.groups ?? []).flatMap((g) => g.inline ?? []),
  ];
  return segs.flatMap((s) => (s.kind === "tag" && s.tag.id.startsWith("msg-") ? [s.tag] : []));
}

describe("describeWorkflow", () => {
  describe("Этап старта", () => {
    it("называется «Скоринг базы», когда нода скоринга есть", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.heading).toBe("Скоринг базы");
      // Без фактов — базы/триггеров тегами нет, тело только общая фраза скоринга.
      expect(segmentsText(start.body)).toBe(
        "Загруженная база проходит скоринг через алгоритмы афины и оператора данных: остаются те, кто проявляет намерение, с разбивкой по уровням склонности.",
      );
    });

    it("называется «Загрузка базы» для собственной базы", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.heading).toBe("Загрузка базы");
      expect(segmentsText(start.body)).toContain("сверяются с сигналами");
    });

    it("вплетает базу и триггеры инлайн-тегами в текст, а не отдельным списком (сценарий/режим/бюджет — не тут)", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], baseRows: 186255, baseFileCount: 1, scenarioName: "Win-back оффер",
        triggers: ["Вклады", "Рассрочка", "Авто", "Ипотека", "Карты"],
        analysisMode: "once", budget: 571186, editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      // Списка «подпись — значение» больше нет — база и триггеры теперь пилюли
      // прямо в прозе.
      expect(start.settings).toBeUndefined();
      expect(segmentsText(start.body)).toBe(
        "Загруженная база 186 255 строк проходит скоринг через алгоритмы афины и оператора данных по триггерам: остаются те, кто проявляет намерение, с разбивкой по уровням склонности.",
      );
      // База — тег с целью «file»; триггеры — единый тег «триггерам» (без
      // перечисления конкретных), полный список — в hoverList.
      const tags = start.body.flatMap((s) => (s.kind === "tag" ? [s.tag] : []));
      const base = tags.find((t) => t.id === "start-base")!;
      // toLocaleString("ru-RU") группирует разряды через NBSP (U+00A0) — сравниваем
      // с тем же форматтером, а не с ASCII-пробелом в буквальном тексте.
      expect(base.label).toBe(`${(186255).toLocaleString("ru-RU")} строк`);
      const trig = tags.find((t) => t.id === "start-triggers")!;
      expect(trig.label).toBe("триггерам");
      expect(trig.hoverList).toEqual(["Вклады", "Рассрочка", "Авто", "Ипотека", "Карты"]);
    });

    it("склоняет «база»→«базы» при нескольких файлах", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], baseRows: 45000, baseFileCount: 2, triggers: ["Вклады"], editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).toContain("Загруженные базы 45 000 строк проходят скоринг");
    });

    it("без базы/триггеров тег не появляется, текст остаётся связным", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T, {
        pending: [], baseRows: 1000, editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      // Своя база (без скоринга) — только тег базы, триггеров/дровера нет.
      const tags = start.body.flatMap((s) => (s.kind === "tag" ? [s.tag] : []));
      expect(tags.map((t) => t.id)).toEqual(["start-base"]);
    });

    it("без фактов тегов в теле нет, а текст — только общее предложение", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.kind === "start")!;
      expect(start.body.some((s) => s.kind === "tag")).toBe(false);
    });

    it("фраза о доменах на модерации остаётся предложением тела", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: ["a.ru", "b.ru"], editableSteps: [],
      });
      const start = stages.find((s) => s.kind === "start")!;
      expect(segmentsText(start.body)).toContain("Домены a.ru, b.ru отправлены на модерацию");
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
          text: "Загруженная база проходит скоринг через алгоритмы афины и оператора данных: остаются те, кто проявляет намерение, с разбивкой по уровням склонности. Домены ",
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
    it("первая волна — инлайн-текст с каналами и тегами шаблонов", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms", "email"]), T, {
        pending: [], graphEditable: true,
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(touch.heading).toBe("Первое касание");
      // Каналы вплетены в текст (не таблица), не форк — групп нет.
      expect(touch.groups).toBeUndefined();
      const body = segmentsText(touch.body);
      expect(body).toContain("Аудитория делится по каналам, каждому приходит своё сообщение:");
      expect(body).toContain("SMS с шаблоном");
      expect(body).toContain("email с шаблоном");
    });

    it("email резолвит свой шаблон — имя видно пилюлей в тексте", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["email"]), T, {
        pending: [], graphEditable: true,
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      // Положительный резолв шаблона ИМЕННО этого канала (исторический баг:
      // сид-текст письма не совпадал ни с одним пресетом справочника, шаблон не
      // резолвился и пилюля не рисовалась).
      const tag = templateTagsOf(touch)[0];
      expect(tag.label).toBe("Персональный оффер");
      expect(tag.target).toEqual({ kind: "template", nodeId: expect.stringMatching(/email/) });
      expect(segmentsText(touch.body)).toContain("email с шаблоном");
    });

    it("ivr резолвит свой шаблон — тот же щит для канала звонка", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["ivr"]), T, {
        pending: [], graphEditable: true,
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toContain("звонок с шаблоном");
      expect(templateTagsOf(touch)[0].label).toBe("Звонок — приветствие");
    });

    it("нерезолвнутый шаблон даёт пилюлю «не выбран»", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), [], {
        pending: [], editableSteps: [], graphEditable: true,
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(templateTagsOf(touch)[0].label).toBe("не выбран");
    });

    // Зафиксированное решение финального ревью: снятая `describeMessage`
    // ОТБРАСЫВАЛА коммуникацию с пустым контентом, и нода, которая в графе
    // есть и деньги за неё считаются, молча пропадала из описания. Инлайн-текст
    // её показывает — каналом и тегом шаблона, даже с пустым текстом ноды.
    it("коммуникация с ПУСТЫМ текстом ноды всё равно даёт канал в тексте, а не исчезает молча", () => {
      const stages = describeWorkflow(
        commGraph({ kind: "sms", text: "", alphaName: "BRAND", scheduledAt: "immediate" }),
        T,
      );
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toContain("SMS");
    });

    it("схлопывает одинаковые касания параллельных сегментов в один канал (не форк)", () => {
      // Три ветки сегментного сплиттера с одинаковыми params. Одинаковые
      // потоки — не потоки: развилки нет, есть обычное касание.
      // Фикстура рукотворная: генератор сегментных шаблонов снесён, и
      // createTemplate("Апсейл", …) больше такой формы не строит — а сам
      // сегментный сплит остался легальной нодой, которую ставят руками и ИИ.
      const stages = describeWorkflow(sameContentSegmentsGraph(), T);
      expect(stages.some((s) => s.kind === "fork")).toBe(false);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(touch.groups).toBeUndefined();
      expect(segmentsText(touch.body)).toContain("SMS");
    });

    it("объединяет проверку реакции и паузу в один шаг перед вторым касанием", () => {
      const retryGraph = createTemplate("Возврат", "new", ["sms"]);
      const stages = describeWorkflow(retryGraph, T);
      const headings = stages.map((s) => s.heading);
      expect(headings).toContain("Проверка реакции и пауза");
      expect(headings).not.toContain("Пауза и повтор");
      expect(headings).toContain("Второе касание");
    });

    it("идентичный повтор — «Второе касание» с той же таблицей, что и первое", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], editableSteps: [], graphEditable: true,
      });
      // Повтор больше не отдельный этап «Пауза и повтор» (спека §5): его паузу
      // забрала слитая «Проверка реакции и пауза», а сам он — обычное «Второе
      // касание» с той же таблицей, что и первое.
      expect(stages.some((s) => s.kind === "retry")).toBe(false);
      const [first, second] = stages.filter((s) => s.kind === "touch");
      expect(second.heading).toBe("Второе касание");
      // Та же серия — те же теги шаблонов, что и в первом касании.
      expect(templateTagsOf(second).map((t) => t.label))
        .toEqual(templateTagsOf(first).map((t) => t.label));
      expect(segmentsText(second.body)).toContain("Та же серия по тем же каналам");
    });

    /**
     * Критерий приёмки 8 на том пути, который карточка сама и предлагает:
     * пользователь меняет шаблон письма пилюлей «Шаблон» в «Первом касании».
     * Поповер (`TemplateTagPopover.onSelect`) патчит РОВНО `body` и РОВНО одну
     * ноду — воспроизводим это здесь, вместо того чтобы моделировать «другую
     * серию» произвольной правкой, которой у пользователя нет.
     */
    it("смена шаблона письма в первом касании снимает утверждение «та же серия»", () => {
      const base = createTemplate("Возврат", "new", ["email"]);
      // Нода повтора несёт префикс `_repeat` (buildCommUnit), первая — нет.
      const firstEmail = base.nodes.find(
        (n) => n.data.nodeType === "email" && !n.id.includes("repeat"),
      )!;
      const other = T.find((tpl) => tpl.channel === "email")!;
      const otherBody = (other.content as unknown as Record<string, unknown>)["body"] as string;
      const graph = {
        nodes: base.nodes.map((n) =>
          n.id === firstEmail.id
            ? { ...n, data: { ...n.data, params: { ...n.data.params!, body: otherBody } } }
            : n,
        ),
        edges: base.edges,
      };
      // Тест ловит реальный кейс, а не проходит вхолостую: тела разошлись,
      // а ТЕМЫ у обеих нод остались одинаковыми — на этом прежний ключ и слеп.
      const bodies = graph.nodes
        .filter((n) => n.data.nodeType === "email")
        .map((n) => n.data.params as Extract<NodeParams, { kind: "email" }>);
      expect(bodies).toHaveLength(2);
      expect(bodies[0].subject).toBe(bodies[1].subject);
      expect(bodies[0].body).not.toBe(bodies[1].body);

      const stages = describeWorkflow(graph, T);
      expect(stages.some((s) => s.kind === "retry")).toBe(false);
      expect(stages.some((s) => s.sameAsHeading !== undefined)).toBe(false);
      expect(stages.map((s) => segmentsText(s.body)).join(" ")).not.toContain("ту же серию");
      // Вторая волна осталась видимой — она стала обычным касанием.
      expect(stages.filter((s) => s.kind === "touch")).toHaveLength(2);
    });

    it("«Проверка реакции и пауза» берёт длительность паузы из WaitParams повторной волны", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(segmentsText(check.body)).toContain("2 дня"); // durationHours: 48
    });

    it("«Проверка реакции» появляется один раз, даже когда условий в графе два", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      expect(stages.filter((s) => s.kind === "check")).toHaveLength(1);
    });

    it("«Проверка реакции и пауза» описывает уход отреагировавших в успех", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(check.heading).toBe("Проверка реакции и пауза");
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
        "Первое касание", "Второе касание", "Третье касание", "Четвёртое касание", "Касание 5",
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

      /**
       * Обратная сторона критерия приёмки 8: описание не должно утверждать
       * «другими сообщениями» над двумя ИДЕНТИЧНЫМИ таблицами. Волна с тем же
       * содержанием, но БЕЗ разделяющей паузы, повтором (`repeatsPrevious`) не
       * считается — и раньше проваливалась в ветку расхождения, где каналы
       * совпали и оставалось только соврать про «другие сообщения».
       *
       * Форма достижима правкой графа (условие без паузы), а не шаблоном
       * репозитория, поэтому граф собран руками — но именно графом, не
       * рукотворным массивом этапов.
       */
      it("то же письмо без разделяющей паузы — повтор серии, а не «другие сообщения»", () => {
        const letter = (id: string) =>
          node(id, "email", {
            kind: "email", subject: "Ваше предложение", body: "Подробности на сайте",
            sender: "care@brand.com",
          });
        const graph = {
          nodes: [
            node("signal", "source"),
            letter("first"),
            node("react", "condition", { kind: "condition", trigger: "opened" }),
            node("win", "success"),
            letter("again"),
          ],
          edges: [
            edge("signal", "first"),
            edge("first", "react"),
            edge("react", "win", "ДА"),
            edge("react", "again", "НЕТ"),
          ],
        };

        const stages = describeWorkflow(graph, T);
        const touches = stages.filter((s) => s.kind === "touch");
        // Тест ловит реальный кейс, а не проходит вхолостую: вторая волна
        // существует, повтором её никто не пометил, и содержание совпадает.
        expect(touches).toHaveLength(2);
        expect(stages.some((s) => s.kind === "retry")).toBe(false);
        expect(templateTagsOf(touches[1]).map((t) => t.label))
          .toEqual(templateTagsOf(touches[0]).map((t) => t.label));

        const body = segmentsText(touches[1].body);
        expect(body).not.toContain("другими сообщениями");
        expect(body).not.toContain("другими каналами");
        expect(body).toContain("повторяет ту же серию");
        // Паузы в графе нет — фраза не имеет права её выдумывать.
        expect(body).not.toContain("выжидает");
        // Заголовок — обычное касание: «Второе касание» (повтор без паузы
        // отдельным этапом не выделяется).
        expect(touches[1].heading).toBe("Второе касание");
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

  // Слияние паузы в «Проверку реакции» верно для 6 канонических шаблонов
  // (соседство `касание → проверка → пауза → повтор`), но неканоничные, но
  // достижимые правкой графы ломали и адрес паузы (баг #1), и её порядковый
  // номер (баг #2). Фикс: сливаем ТОЛЬКО на непосредственном соседстве, номер
  // выводим из счётчика, а неслитый повтор рассказывает о своей паузе сам.
  describe("Проверка реакции — слияние паузы только на непосредственном соседстве (fix)", () => {
    const sms = (id: string, text: string) =>
      node(id, "sms", { kind: "sms", text, alphaName: "BRAND", scheduledAt: "immediate" });
    const wait = (id: string, hours: number) =>
      node(id, "wait", { kind: "wait", mode: "duration", durationHours: hours });

    it("каноничный граф по-прежнему сливает паузу: «Проверка реакции и пауза» + «второе касание»", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(check.heading).toBe("Проверка реакции и пауза");
      expect(segmentsText(check.body)).toContain("второе касание");
      const touches = stages.filter((s) => s.kind === "touch");
      expect(touches[1].heading).toBe("Второе касание");
      expect(segmentsText(touches[1].body)).toBe("Та же серия по тем же каналам: SMS.");
    });

    // Баг #1: проверка сканировала ВПЕРЁД до первого повтора и заимствовала его
    // паузу, хотя её непосредственный сосед — обычное касание. Пауза оседала
    // не на своём переходе, а собственный повтор о ней молчал.
    it("проверка НЕ у самого повтора — простая «Проверка реакции», паузу держит сам повтор (баг #1)", () => {
      // touch1(A) → проверка → touch2(B, без паузы) → пауза → touch3(повтор B).
      const graph = {
        nodes: [
          node("signal", "source"),
          sms("a1", "Первый заход"),
          node("react", "condition", { kind: "condition", trigger: "opened" }),
          sms("b1", "Другой заход"),
          wait("w", 72),
          sms("b2", "Другой заход"),
        ],
        edges: [
          edge("signal", "a1"),
          edge("a1", "react"),
          edge("react", "b1"),
          edge("b1", "w"),
          edge("w", "b2"),
        ],
      };
      const stages = describeWorkflow(graph, T);
      const check = stages.find((s) => s.kind === "check")!;
      // Простая проверка: заголовок без «и пауза», тело без утверждений о паузе
      // и о номере касания.
      expect(check.heading).toBe("Проверка реакции");
      expect(segmentsText(check.body)).not.toContain("паузу");
      expect(segmentsText(check.body)).not.toContain("касание");
      // Повтор (последнее касание) держит свою паузу сам — она нигде не потеряна.
      const touches = stages.filter((s) => s.kind === "touch");
      const repeat = touches[touches.length - 1];
      expect(repeat.heading).toBe("Третье касание");
      const body = segmentsText(repeat.body);
      expect(body).toContain("выжидает");
      expect(body).toContain("3 дня"); // 72ч
      expect(body).toContain("повторяет ту же серию по тем же каналам");
    });

    // Баг #2: слитая проверка хардкодила «второе касание». Когда проверке
    // предшествуют ДВА касания, следующий (слитый) повтор — «Третье касание», и
    // «второе» стояло прямо над заголовком «Третье касание».
    it("проверка перед неканоничным повтором берёт номер из счётчика, а не хардкодит «второе» (баг #2)", () => {
      // touch1(A) → пауза → touch2(B) → проверка → пауза → touch3(повтор B).
      const graph = {
        nodes: [
          node("signal", "source"),
          sms("a1", "Первый заход"),
          wait("w1", 24),
          sms("b1", "Второй заход"),
          node("react", "condition", { kind: "condition", trigger: "opened" }),
          wait("w2", 48),
          sms("b2", "Второй заход"),
        ],
        edges: [
          edge("signal", "a1"),
          edge("a1", "w1"),
          edge("w1", "b1"),
          edge("b1", "react"),
          edge("react", "w2"),
          edge("w2", "b2"),
        ],
      };
      const stages = describeWorkflow(graph, T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(check.heading).toBe("Проверка реакции и пауза");
      const checkBody = segmentsText(check.body);
      // Номер выведен из счётчика — «третье», не хардкод «второе».
      expect(checkBody).toContain("третье касание");
      expect(checkBody).not.toContain("второе касание");
      // И он совпадает с ЗАГОЛОВКОМ фактического следующего касания.
      const touches = stages.filter((s) => s.kind === "touch");
      const repeat = touches[touches.length - 1];
      expect(repeat.heading).toBe("Третье касание");
      expect(segmentsText(repeat.body)).toBe("Та же серия по тем же каналам: SMS.");
    });

    // Пробел из code review: решение сливать паузу проверяло только то, что
    // непосредственно следующий шаг — волна-повтор с разрешимой нодой
    // ожидания, но не то, что эта волна вообще ОТРЕНДЕРИТСЯ. Волна с
    // коммуникацией без `params` (граф на середине правки) рендерит ноль
    // строк и пропускается циклом ниже через `if (!groups.length) continue;`
    // — а этот `continue` заодно пропускает и сброс `pauseMergedIntoCheck`.
    // Флаг остаётся `true` и ошибочно достаётся следующему НАСТОЯЩЕМУ повтору,
    // роняя его собственную паузу из описания молча.
    it("следующий повтор без рендерящихся строк не сливает паузу и не крадёт её у более позднего повтора", () => {
      // touch1(A, пустой текст) → проверка → touch2(B, БЕЗ params — не
      // рендерится) → пауза 24ч → touch3(тот же пустой текст — настоящий
      // повтор, рендерится) → пауза 48ч.
      // Пустой текст у A и у повторов — намеренно: `contentKey` ноды без
      // `params` тоже пуст («sms|»), и это единственный способ сделать
      // вторую волну одновременно `repeatsPrevious` (нужно для самого условия
      // слияния) и нерендерящейся (нет `params` вовсе).
      const graph = {
        nodes: [
          node("signal", "source"),
          sms("a1", ""),
          node("react", "condition", { kind: "condition", trigger: "opened" }),
          wait("w1", 24),
          node("b1", "sms"), // params не заданы — коммуникация не отрендерится
          wait("w2", 48),
          sms("b2", ""),
        ],
        edges: [
          edge("signal", "a1"),
          edge("a1", "react"),
          edge("react", "w1"),
          edge("w1", "b1"),
          edge("b1", "w2"),
          edge("w2", "b2"),
        ],
      };
      const stages = describeWorkflow(graph, T);

      // Проверка НЕ сливает паузу: непосредственно следующая волна (b1) не
      // отрендерится, а значит «сольём» и «отрендерится» разошлись бы —
      // фикс это запрещает. Заголовок остаётся простым, без «и пауза».
      const check = stages.find((s) => s.kind === "check")!;
      expect(check.heading).toBe("Проверка реакции");

      // Нерендерящаяся волна (b1) не оставляет своего этапа вовсе — второй
      // касание в списке уже настоящий повтор (b2).
      const touches = stages.filter((s) => s.kind === "touch");
      expect(touches).toHaveLength(2);

      // Второй ОТРЕНДЕРЕННЫЙ повтор (b2) по-прежнему рассказывает о своей
      // паузе сам: `pauseMergedIntoCheck` не унаследован от пропущенной
      // волны b1, потому что проверка выше вообще не подняла флаг.
      const repeat = touches[1];
      expect(repeat.heading).toBe("Второе касание");
      const body = segmentsText(repeat.body);
      expect(body).toContain("выжидает");
      expect(body).toContain("2 дня"); // 48ч
      expect(body).toContain("повторяет ту же серию по тем же каналам");
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
      const fork = describeWorkflow(conditionForkGraph(), T).find((s) => s.kind === "fork")!;
      expect(fork.heading).toBe("Развилка по реакции");
      expect(fork.groups!.map((g) => g.label)).toEqual(["Открыл письмо", "Не открыл письмо"]);
      // Каждая ветка несёт своё инлайн-перечисление каналов (без фактов —
      // только имя канала: email в одной ветке, SMS в другой).
      expect(fork.groups!.map((g) => segmentsText(g.inline!))).toEqual(["email", "SMS"]);
      expect(segmentsText(fork.body)).toContain("расходится по условию открыл письмо?");
    });

    // Task 3: условие правится прямо с карточки, пока граф ещё черновик —
    // деление на потоки остаётся некликабельным НАВСЕГДА (поля сплиттера
    // правит только ИИ-дровер, которого на карточке нет).
    describe("Тег условия кликабелен, пока граф правится (Task 3)", () => {
      it("пилюля условия кликабельна, пока граф правится", () => {
        const stages = describeWorkflow(conditionForkGraph(), T, {
          pending: [], editableSteps: [], graphEditable: true,
        });
        const fork = stages.find((s) => s.kind === "fork")!;
        const tag = fork.body.find((s) => s.kind === "tag")!;
        expect(tag.kind === "tag" && tag.tag.target).toEqual({ kind: "node-fields", nodeId: "react" });
      });

      it("после запуска пилюля условия теряет клик, но не личность", () => {
        const stages = describeWorkflow(conditionForkGraph(), T, {
          pending: [], editableSteps: [], graphEditable: false,
        });
        const fork = stages.find((s) => s.kind === "fork")!;
        const tag = fork.body.find((s) => s.kind === "tag")!;
        expect(tag.kind === "tag" && tag.tag.target).toEqual({ kind: "none", nodeId: "react" });
      });

      it("пилюля деления некликабельна всегда — поля сплиттера правит только ИИ", () => {
        const stages = describeWorkflow(TEMPLATE_BY_TYPE["Удержание"](), T, {
          pending: [], editableSteps: [], graphEditable: true,
        });
        const fork = stages.find((s) => s.kind === "fork")!;
        const tag = fork.body.find((s) => s.kind === "tag")!;
        expect(tag.kind === "tag" && tag.tag.target.kind).toBe("none");
      });
    });

    it("развилка ТРАТИТ номер касания: следующая волна — «Второе касание», и она про неотреагировавших", () => {
      // Развилка первой волной (легаси-«Удержание» — развилка по построению),
      // за ней через паузу вторая волна. Если бы развилка номер не тратила,
      // вторая волна назвалась бы «Первым касанием», рассказывая при этом про
      // тех, кто не отреагировал, — этап противоречил бы сам себе.
      const stages = describeWorkflow(forkThenTouchGraph(), T, {
        pending: [], channels: ["ivr", "email", "push"],
      });
      // Последний этап — закрывающая строка блока коммуникаций (Task 6): без
      // заголовка (пустая строка), а не отдельный нумерованный «Итог».
      expect(stages.map((s) => s.heading)).toEqual([
        "Загрузка базы", "Деление на потоки", "Второе касание", "",
      ]);
      expect(segmentsText(stages.find((s) => s.kind === "touch")!.body))
        .toContain("Тем, кто не отреагировал");
    });

    it("развилка-первая-волна: тело — только подводка развилки, без пилюли «N каналов»", () => {
      // Пилюля-счётчик каналов убрана — каналы теперь названы инлайн в ветках.
      const stages = describeWorkflow(forkThenTouchGraph(), T, {
        pending: [], channels: ["ivr", "email", "push"], editableSteps: ["channels"],
      });
      const fork = stages.find((s) => s.kind === "fork")!;
      expect(segmentsText(fork.body)).toBe(
        "Аудитория делится на 3 потока по уровню склонности, каждый получает своё:",
      );
      // Тега-счётчика каналов в теле развилки больше нет (каналы — в ветках).
      expect(fork.body.some((s) => s.kind === "tag" && s.tag.id === "first-touch-channels")).toBe(
        false,
      );
    });

    it("повтор ТРАТИТ номер касания: касание → повтор → касание даёт «Первое / Второе / Третье»", () => {
      // Повтор больше не отдельный этап «Пауза и повтор» (спека §5) — он идёт
      // обычным касанием и тратит порядковый номер наравне с прочими, так что
      // следующая, третья по счёту волна получает «Третье касание».
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
        ["touch", "Второе касание"],
        ["touch", "Третье касание"],
      ]);
    });

    it("одинаковые по содержанию потоки развилкой не становятся — это обычное касание", () => {
      const stages = describeWorkflow(sameContentSegmentsGraph(), T);
      expect(stages.some((s) => s.kind === "fork")).toBe(false);
      const touch = stages.find((s) => s.kind === "touch")!;
      // Не форк — групп нет, каналы вплетены инлайн в тело.
      expect(touch.groups).toBeUndefined();
      const body = segmentsText(touch.body);
      expect(body).toContain("SMS");
      expect(body).toContain("email");
    });
  });

  // Каналы больше не выносятся отдельной пилюлей-счётчиком «N каналов»: они
  // названы ИНЛАЙН прямо в тексте касания («SMS с шаблоном [тег] и email…»).
  describe("Первое касание — каналы вплетены инлайн (пилюля «N каналов» убрана)", () => {
    // Один канал → сплиттера в графе нет; два и больше → есть.
    const graphNoSplit = createTemplate("Возврат", "new", ["sms"]);
    const graphSplit = createTemplate("Возврат", "new", ["sms", "email"]);
    const noChannelsPill = (body: DescriptionSegment[]) =>
      body.some((s) => s.kind === "tag" && s.tag.id === "first-touch-channels");

    it("один канал: «Каждому контакту уходит первое сообщение: {канал} с шаблоном [тег]»", () => {
      const stages = describeWorkflow(graphNoSplit, T, { pending: [], channels: ["sms"] });
      const touch = stages.find((s) => s.kind === "touch")!;
      const body = segmentsText(touch.body);
      expect(body).toContain("Каждому контакту уходит первое сообщение:");
      expect(body).toContain("SMS с шаблоном");
      expect(noChannelsPill(touch.body)).toBe(false);
    });

    // Слово «поток» закреплено за СЕГМЕНТОМ аудитории (сегментная развилка):
    // многоканальная волна делит по КАНАЛАМ и называет свой механизм своим
    // именем, а не занимает чужое слово.
    it("несколько каналов: «Аудитория делится по каналам, каждому приходит своё сообщение: …»", () => {
      const stages = describeWorkflow(graphSplit, T, { pending: [], channels: ["sms", "email"] });
      const touch = stages.find((s) => s.kind === "touch")!;
      const body = segmentsText(touch.body);
      expect(body).toContain("Аудитория делится по каналам, каждому приходит своё сообщение:");
      expect(body).toContain("SMS с шаблоном");
      expect(body).toContain("email с шаблоном");
    });

    it("«поток» остаётся словом сегментной развилки — многоканальная волна его не занимает", () => {
      const stages = describeWorkflow(graphSplit, T, { pending: [], channels: ["sms", "email"] });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).not.toContain("поток");
      // А сегментная развилка — по-прежнему «потоки».
      const fork = describeWorkflow(forkThenTouchGraph(), T).find((s) => s.kind === "fork")!;
      expect(segmentsText(fork.body)).toContain("потока");
    });

    it("пилюли-счётчика каналов нет даже когда шаг «channels» в editableSteps", () => {
      const stages = describeWorkflow(graphSplit, T, {
        pending: [], channels: ["sms", "email"], editableSteps: ["channels"],
      });
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(noChannelsPill(touch.body)).toBe(false);
    });

    it("без фактов — одно имя канала без «с шаблоном»", () => {
      const stages = describeWorkflow(graphNoSplit, T);
      const touch = stages.find((s) => s.kind === "touch")!;
      expect(segmentsText(touch.body)).toBe("Каждому контакту уходит первое сообщение: SMS.");
    });
  });

  describe("Первое касание не втягивает повторный блок", () => {
    it("ноды повтора уходят в свою волну, а не в таблицу первого касания", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T, {
        pending: [], graphEditable: true,
      });
      // Повторный блок несёт ту же ноду; первое касание несёт ровно один канал
      // (один тег шаблона), а повтор — отдельное «Второе касание» со своим.
      const touches = stages.filter((s) => s.kind === "touch");
      expect(templateTagsOf(touches[0])).toHaveLength(1);
      expect(templateTagsOf(touches[1])).toHaveLength(1);
    });
  });

  // fix round 1, Finding 1: `waitPhrase` раньше форматировала только
  // дни/часы — 840 часов (ровно 5 недель) читались как «35 дней», пока
  // `splitDuration` (wait-fields.tsx, поле внутри поповера паузы Task 8)
  // тот же час читало как «5 недель» — два числа на одном экране одновременно
  // противоречили друг другу. Хелпер подменяет durationHours ноды паузы перед
  // повтором «Возврата» (по умолчанию 48ч/«2 дня» — не кратно неделе, багом не
  // ловится); длительность теперь звучит в слитой «Проверке реакции и паузе».
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
      const check = stages.find((s) => s.kind === "check")!;
      expect(segmentsText(check.body)).toContain("5 недель");
      expect(segmentsText(check.body)).not.toContain("35 дней");
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
      const check = stages.find((s) => s.kind === "check")!;
      expect(segmentsText(check.body)).toContain(expected);
    });

    it("длительность, не кратная неделе, но кратная суткам — по-прежнему в днях", () => {
      // Регресс-щит: неделя не должна начать «съедать» обычные дни (72ч = 3
      // дня, ни разу не делится на 168 без остатка).
      const stages = describeWorkflow(graphWithRetryDuration(72), T);
      const check = stages.find((s) => s.kind === "check")!;
      expect(segmentsText(check.body)).toContain("3 дня");
    });
  });

  // Нарратив конверсии больше не отдельный блок «Итог» — он закрывающая строка
  // своего блока (Task 6): без заголовка, `block` — блок, который он закрывает,
  // а `block:"outcome"` describeWorkflow не выпускает вовсе.
  describe("Нарратив конверсии закрывает свой блок", () => {
    it("после повтора закрывающая строка блока коммуникаций описывает финальную проверку", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const commClose = stages.filter((s) => s.block === "communication").at(-1)!;
      // Закрывающая строка — без заголовка (плоский абзац, не нумерованный шаг).
      expect(commClose.heading).toBe("");
      expect(segmentsText(commClose.body)).toContain("без конверсии");
      // Отдельного блока «Итог» describeWorkflow больше не порождает.
      expect(stages.some((s) => s.block === "outcome")).toBe(false);
    });
  });

  describe("Граф без коммуникаций", () => {
    it("даёт только старт и закрывающую строку сигнала, без выдуманных касаний", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      // Закрывающую строку несёт блок СИГНАЛА (Task 6): коммуникаций нет,
      // закрывать блок коммуникаций нечем — на выходе только сегмент.
      expect(stages.map((s) => s.id)).toEqual(["start", "signal-close"]);
      expect(stages.at(-1)!.block).toBe("signal");
      expect(segmentsText(stages[1].body)).toContain("готовый сегмент");
      expect(stages.some((s) => s.block === "outcome")).toBe(false);
      expect(stages.some((s) => s.groups?.length)).toBe(false);
    });

    it("без коммуникаций закрывающую строку про сегмент несёт блок сигнала, а не отдельный блок", () => {
      // Сигналы без каналов/коммуникаций: `waveOrdinal === 0`, поэтому нарратив
      // конверсии закрывает блок СИГНАЛА (Task 6).
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      const signalClose = stages.filter((s) => s.block === "signal").at(-1);
      expect(segmentsText(signalClose!.body)).toMatch(/готовый сегмент/);
      expect(stages.some((s) => s.block === "outcome")).toBe(false);
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
        "touch-2",
        "comm-close",
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
   * База и триггеры теперь ИНЛАЙН-теги в `body`; теги шаблонов у не-форк волн —
   * тоже в `body`, у форк-волн — в `group.inline`. `settings` больше не
   * используется, но читаем его на всякий случай (обратная совместимость).
   */
  const allTags = (stages: ReturnType<typeof describeWorkflow>) =>
    stages.flatMap((s) => [
      ...s.body.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
      ...(s.settings ?? []).flatMap((setting) =>
        setting.value.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
      ),
      ...(s.groups ?? []).flatMap((g) =>
        (g.inline ?? []).filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
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

  it("база — кликабельный тег (file), триггеры — тег дровера (triggers), пилюли каналов нет", () => {
    const tags = allTags(describeWorkflow(graph, templates, facts));
    const base = tags.find((t) => t.id === "start-base")!;
    expect(base.target).toEqual({ kind: "wizard-step", step: "file" });
    const trig = tags.find((t) => t.id === "start-triggers")!;
    // Клик по «триггерам» открывает боковой дровер (черновик + есть скоринг).
    expect(trig.target).toEqual({ kind: "triggers" });
    // Пилюли-счётчика каналов больше нет.
    expect(tags.some((t) => t.id === "first-touch-channels")).toBe(false);
  });

  it("в тексте старта нет сценария/режима/бюджета, но есть триггеры", () => {
    const ids = allTags(describeWorkflow(graph, templates, facts)).map((t) => t.id);
    expect(ids).not.toContain("start-scenario");
    expect(ids).not.toContain("start-mode");
    expect(ids).not.toContain("start-budget");
    expect(ids).toContain("start-triggers");
  });

  it("триггеры — единый тег «триггерам», полный список в hoverList (без схлопки «ещё N»)", () => {
    const trig = allTags(describeWorkflow(graph, templates, facts)).find(
      (t) => t.id === "start-triggers",
    )!;
    expect(trig.label).toBe("триггерам");
    expect(trig.hoverList).toEqual(["Ипотека", "Новостройки", "Вторичка", "Аренда"]);
    // Отдельных тегов на каждый триггер (и схлопки «ещё N») больше нет.
    expect(allTags(describeWorkflow(graph, templates, facts)).some((t) => t.label.startsWith("ещё "))).toBe(
      false,
    );
  });

  it("триггеры некликабельны, когда граф не правится (запущена) — носитель значения без клика", () => {
    const trig = allTags(
      describeWorkflow(graph, templates, { ...facts, graphEditable: false }),
    ).find((t) => t.id === "start-triggers")!;
    expect(trig.target).toEqual({ kind: "none", step: "interests" });
  });

  it("пустой editableSteps снимает цель со всех шаговых тегов — кампания запущена", () => {
    const tags = allTags(describeWorkflow(graph, templates, { ...facts, editableSteps: [] }));
    expect(tags.some((t) => t.target.kind === "wizard-step")).toBe(false);
    // Значения при этом остаются — теги носители данных, а не только аффорданс.
    // toLocaleString("ru-RU") группирует разряды через NBSP (U+00A0), не через
    // обычный пробел — используем ту же букву, что реально возвращает форматтер
    // (сверено эмпирически; ASCII-пробел в буквальном тексте брифа не совпал бы).
    // Task 7: бюджет (был «50 000») больше не рендерится тут вовсе (переехал
    // в «Итог»), поэтому носитель значения проверяем на строках базы.
    expect(tags.some((t) => t.label.includes("12 000"))).toBe(true);
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

  it("один триггер — тот же единый тег «триггерам», hoverList из одного имени", () => {
    // Триггеры не перечисляются в пилюле поимённо (спека): всегда единый тег
    // «триггерам», полный список — в hoverList. С одним триггером — hoverList
    // из одного имени, без ложного множественного числа в самом лейбле.
    const stages = describeWorkflow(graph, templates, { ...facts, triggers: ["Ипотека"] });
    const trig = allTags(stages).find((t) => t.id === "start-triggers")!;
    expect(trig.label).toBe("триггерам");
    expect(trig.hoverList).toEqual(["Ипотека"]);
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
    const touch = stages.find((s) => s.kind === "touch")!;
    expect(templateTagsOf(touch)[0]?.target.kind).toBe("template");
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
    const touch = stages.find((s) => s.kind === "touch")!;
    expect(templateTagsOf(touch)[0]?.label).toBeTruthy();
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

  it("каждый этап несёт block: signal | communication, а block:outcome не выпускается", () => {
    const stages = describeWorkflow(graph, templates, facts);
    expect(stages.find((s) => s.id === "start")?.block).toBe("signal");
    expect(stages.find((s) => s.kind === "touch")?.block).toBe("communication");
    // Нарратив конверсии теперь ЗАКРЫВАЕТ блок коммуникаций (Task 6), а не сидит
    // в отдельном блоке «Итог»: последний коммуникационный этап несёт его текст,
    // и ни один этап describeWorkflow не имеет block:"outcome".
    const commClose = stages.filter((s) => s.block === "communication").at(-1)!;
    expect(segmentsText(commClose.body)).toContain("без конверсии");
    expect(stages.some((s) => s.block === "outcome")).toBe(false);
  });

  it("нарратив конверсии закрывает блок коммуникаций, а не отдельный блок", () => {
    // `graph` («Возврат»/new/sms) несёт повтор — коммуникации есть, закрывающую
    // строку берёт блок коммуникаций.
    const retryGraph = graph;
    const stages = describeWorkflow(retryGraph, templates, facts);
    const commClose = stages.filter((s) => s.block === "communication").at(-1);
    expect(segmentsText(commClose!.body)).toMatch(/завершают путь без конверсии/);
    expect(stages.some((s) => s.block === "outcome")).toBe(false);
  });
});

describe("describeWorkflow — пилюля шаблона рендерится ВСЕГДА (баг: аффорданс «сменить шаблон» пропадал, если текущий текст ноды случайно не совпал с пресетом библиотеки)", () => {
  const editableFacts: CampaignFacts = { pending: [], graphEditable: true };

  /** Единственный тег шаблона единственного касания (каналы вплетены в body). */
  const onlyTag = (stages: ReturnType<typeof describeWorkflow>) =>
    templateTagsOf(stages.find((s) => s.kind === "touch")!)[0];

  it("email с телом, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран»", () => {
    const graph = commGraph({
      kind: "email",
      subject: "Индивидуальная тема",
      body: "Совершенно нестандартный текст письма, которого нет в справочнике.",
      sender: "noreply@brand.com",
    });
    const tag = onlyTag(describeWorkflow(graph, T, editableFacts));
    expect(tag).toBeDefined();
    expect(tag.label).toBe("не выбран");
    expect(tag.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("ivr со сценарием, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран»", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Совершенно свой сценарий звонка вне библиотеки.",
      voiceType: "neutral",
    });
    const tag = onlyTag(describeWorkflow(graph, T, editableFacts));
    expect(tag.label).toBe("не выбран");
    expect(tag.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("резолвнутый шаблон по-прежнему несёт своё имя пилюлей", () => {
    const smsTemplate = T.find((tpl) => tpl.id === "tpl_sms_reminder")!;
    const graph = commGraph(smsTemplate.content);
    expect(onlyTag(describeWorkflow(graph, T, editableFacts)).label).toBe("SMS — напоминание");
  });

  it("graphEditable=false демотирует нерезолвнутый тег в носитель значения (§2.12) — «не выбран» остаётся видимым, но не кликабельным", () => {
    const graph = commGraph({ kind: "ivr", scenario: "Свой сценарий.", voiceType: "neutral" });
    const tag = onlyTag(describeWorkflow(graph, T, { pending: [], graphEditable: false }));
    expect(tag.target.kind).toBe("none");
    expect(tag.label).toBe("не выбран");
  });

  it("без фактов (withTags=false) шаблон-тег по-прежнему не создаётся — обратная совместимость Task 3", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Свой сценарий вне библиотеки.",
      voiceType: "neutral",
    });
    const touch = describeWorkflow(graph, T).find((s) => s.kind === "touch")!;
    expect(templateTagsOf(touch)).toHaveLength(0);
  });

  it("тег шаблона знает свою ноду — по ней рендер адресует поповер", () => {
    const graph = commGraph({ kind: "sms", text: "Текст.", alphaName: "BRAND", scheduledAt: "immediate" });
    expect(onlyTag(describeWorkflow(graph, T, editableFacts)).target).toEqual({
      kind: "template",
      nodeId: "n1",
    });
  });
});
