import { describe, expect, it } from "vitest";
import {
  describeWorkflow,
  segmentsText,
  type CampaignFacts,
  type DescriptionSegment,
  type DescribableGraph,
} from "./graph-description";
import { createTemplate } from "./workflow-templates";
import { PRESET_TEMPLATES } from "./app-state";
import type { NodeParams } from "@/types/workflow";

const T = PRESET_TEMPLATES;

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
  describe("Старт", () => {
    it("упоминает скоринг, когда нода скоринга есть в графе (new/stream)", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const start = stages.find((s) => s.id === "start")!;
      expect(start.heading).toBe("Старт.");
      expect(segmentsText(start.body)).toContain("скоринг");
      expect(segmentsText(start.body)).toContain("проявляет намерение");
    });

    it("не упоминает скоринг для своей базы (ноды скоринга нет)", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "own", ["sms"]), T);
      const start = stages.find((s) => s.id === "start")!;
      expect(segmentsText(start.body)).not.toContain("скоринг");
      expect(segmentsText(start.body)).toContain("сверяются с сигналами");
    });
  });

  describe("Судьба доменов на модерации (Task 11)", () => {
    const graphWithScoring = createTemplate("Возврат", "new", ["sms"]);

    it("appends the domain-fate line when there are pending domains", () => {
      const stages = describeWorkflow(graphWithScoring, [], { pending: ["my.ru"] });
      const start = stages.find((s) => s.id === "start")!;
      expect(segmentsText(start.body)).toContain("отправлены на модерацию");
    });

    it("не добавляет строку судьбы доменов, когда pending пуст", () => {
      const stages = describeWorkflow(graphWithScoring, T, { pending: [] });
      const start = stages.find((s) => s.id === "start")!;
      expect(segmentsText(start.body)).not.toContain("отправлены на модерацию");
    });

    it("не добавляет строку судьбы доменов, когда domainStatuses не передан", () => {
      const stages = describeWorkflow(graphWithScoring, T);
      const start = stages.find((s) => s.id === "start")!;
      expect(segmentsText(start.body)).not.toContain("отправлены на модерацию");
    });

    it("перечисляет все pending-домены через запятую в точной формулировке", () => {
      const stages = describeWorkflow(graphWithScoring, T, { pending: ["a.ru", "b.ru"] });
      const start = stages.find((s) => s.id === "start")!;
      expect(segmentsText(start.body)).toContain(
        "Домены a.ru, b.ru отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании",
      );
    });

    // segmentsText() коллапсит whitespace (`.replace(/\s+/g, " ")`), поэтому
    // тест выше не заметил бы, если бы шов между сегментами потерял или
    // задвоил пробел — а это ровно та точка, куда Task 4 вставит тег доменов.
    // Здесь сравниваем сырой массив сегментов через toEqual — пробелы внутри
    // каждого сегмента зафиксированы буквально.
    it("шов фразы о модерации несёт точные пробелы — collapse их бы скрыл", () => {
      const stages = describeWorkflow(graphWithScoring, T, { pending: ["a.ru", "b.ru"] });
      const start = stages.find((s) => s.id === "start")!;
      // Task 4: средний сегмент — раньше сырой текст "a.ru, b.ru" — теперь тег
      // с целью `{ kind: "domains" }`. Соседние текстовые сегменты несут те же
      // пробелы, что и раньше: этот тест и существует, чтобы шов не потерялся.
      expect(start.body).toEqual([
        {
          kind: "text",
          text: "Загруженная база попадает в кампанию и проходит скоринг: контакты сверяются с сигналами, остаются те, кто сейчас проявляет намерение, с разбивкой по уровням склонности. Домены ",
        },
        {
          kind: "tag",
          tag: { id: "start-domains", label: "a.ru, b.ru", target: { kind: "domains" } },
        },
        {
          kind: "text",
          text: " отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании.",
        },
      ]);
    });
  });

  describe("Первое касание", () => {
    it("даёт по одной строке на канал: имя шаблона + текст из params", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(touch.heading).toBe("Первое касание.");
      expect(touch.messages).toHaveLength(2);

      const sms = touch.messages!.find((m) => m.channel === "SMS")!;
      expect(sms.templateName).toBe("SMS — напоминание");
      expect(sms.text).toBe("Ваше предложение ждёт. Подробности на сайте.");

      // Fix: письмо теперь ТОЖЕ засеяно текстом реального пресета справочника
      // (раньше — «Мы подготовили для вас персональное предложение.», которого
      // нет ни в одном письме `email-directory.ts` → шаблон никогда не
      // резолвился, и пилюля просто не рисовалась — баг, который чинит этот
      // тред). Email резолвится наравне с SMS/Push.
      const email = touch.messages!.find((m) => m.channel === "Email")!;
      expect(email.templateName).toBe("Персональный оффер");
      expect(email.subject).toBeUndefined();
      expect(email.text).toContain("персональное предложение");
    });

    it("упоминает деление на потоки, когда в графе есть сплиттер", () => {
      const stages = describeWorkflow(
        createTemplate("Возврат", "new", ["sms", "email"]),
        T,
      );
      expect(segmentsText(stages.find((s) => s.id === "first-touch")!.body)).toContain("потоки");
    });

    it("для одного канала не выдумывает деление на потоки", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      expect(
        segmentsText(stages.find((s) => s.id === "first-touch")!.body),
      ).not.toContain("потоки");
    });

    it("схлопывает одинаковые касания параллельных сегментов в одну строку на канал", () => {
      // Апсейл — сегментированный шаблон: три comm-юнита с одинаковыми params.
      const stages = describeWorkflow(createTemplate("Апсейл", "new", ["sms"]), T);
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(touch.messages).toHaveLength(1);
      expect(touch.messages![0].channel).toBe("SMS");
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
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(segmentsText(touch.body)).toBe(
        "Выбрано 3 канала: SMS, Email, Звонок. Каждому контакту уходит первое сообщение:",
      );
    });

    it("со сплитом: та же вводная фраза, второе предложение — прежняя формулировка деления на потоки", () => {
      const stages = describeWorkflow(graphSplit, T, {
        pending: [],
        channels: ["sms", "email"],
      });
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(segmentsText(touch.body)).toBe(
        "Выбрано 2 канала: SMS, Email. Аудитория делится на потоки, и каждому уходит своё сообщение:",
      );
    });

    it("пилюля несёт ТОЛЬКО счётчик («3 канала») — имена каналов в неё не входят", () => {
      const stages = describeWorkflow(graphNoSplit, T, {
        pending: [],
        channels: ["sms", "email", "ivr"],
      });
      const touch = stages.find((s) => s.id === "first-touch")!;
      const tag = touch.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.label).toBe("3 канала");
    });

    it("пилюля по-прежнему ведёт на шаг «Каналы» (когда он доступен)", () => {
      const stages = describeWorkflow(graphNoSplit, T, {
        pending: [],
        channels: ["sms", "email"],
        editableSteps: ["channels"],
      });
      const touch = stages.find((s) => s.id === "first-touch")!;
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
      const touch = stages.find((s) => s.id === "first-touch")!;
      const tag = touch.body.find((s) => s.kind === "tag")!;
      expect(tag.tag.label).toBe(expected);
    });

    it("без channels в facts — формулировка не меняется (нет пилюли, нет фразы «Выбрано»)", () => {
      const stages = describeWorkflow(graphNoSplit, T, { pending: [] });
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(segmentsText(touch.body)).toBe("Каждому контакту уходит первое сообщение:");
      expect(touch.body.some((s) => s.kind === "tag")).toBe(false);
    });

    it("без фактов вовсе (hasFacts=false) — формулировка та же, что и раньше", () => {
      const stages = describeWorkflow(graphNoSplit, T);
      const touch = stages.find((s) => s.id === "first-touch")!;
      expect(segmentsText(touch.body)).toBe("Каждому контакту уходит первое сообщение:");
    });
  });

  describe("Проверка реакции и повтор", () => {
    it("описывает проверку после первого касания", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const check = stages.find((s) => s.id === "check")!;
      expect(check.heading).toBe("Проверка реакции.");
      expect(segmentsText(check.body)).toContain("успех");
    });

    it("берёт длительность паузы из WaitParams и не цитирует тексты повторно", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const retry = stages.find((s) => s.id === "retry")!;
      expect(retry.heading).toBe("Пауза и повтор.");
      expect(segmentsText(retry.body)).toContain("2 дня"); // durationHours: 48
      expect(retry.messages).toBeUndefined();
    });

    it("не цитирует тексты повторного блока в первом касании", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      // Повторный блок несёт те же две ноды; в описании ровно одна строка.
      expect(stages.find((s) => s.id === "first-touch")!.messages).toHaveLength(1);
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
      const retry = stages.find((s) => s.id === "retry")!;
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
      const retry = stages.find((s) => s.id === "retry")!;
      expect(segmentsText(retry.body)).toContain(expected);
    });

    it("длительность, не кратная неделе, но кратная суткам — по-прежнему в днях", () => {
      // Регресс-щит: неделя не должна начать «съедать» обычные дни (72ч = 3
      // дня, ни разу не делится на 168 без остатка).
      const stages = describeWorkflow(graphWithRetryDuration(72), T);
      const retry = stages.find((s) => s.id === "retry")!;
      expect(segmentsText(retry.body)).toContain("3 дня");
    });
  });

  describe("Итог", () => {
    it("после повтора описывает финальную проверку", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", ["sms"]), T);
      const outcome = stages.find((s) => s.id === "outcome")!;
      expect(outcome.heading).toBe("Итог.");
      expect(segmentsText(outcome.body)).toContain("без конверсии");
    });
  });

  describe("Граф без коммуникаций", () => {
    it("даёт только Старт и Итог, без выдуманных касаний", () => {
      const stages = describeWorkflow(createTemplate("Возврат", "new", []), T);
      expect(stages.map((s) => s.id)).toEqual(["start", "outcome"]);
      expect(segmentsText(stages[1].body)).toContain("готовый сегмент");
      expect(stages.some((s) => s.messages?.length)).toBe(false);
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
        "first-touch",
        "check",
        "retry",
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

  /** Все теги описания одним плоским списком — удобно для утверждений. */
  const allTags = (stages: ReturnType<typeof describeWorkflow>) =>
    stages.flatMap((s) => [
      ...s.body.filter((seg) => seg.kind === "tag").map((seg) => seg.tag),
      ...(s.messages ?? []).flatMap((m) => (m.templateTag ? [m.templateTag] : [])),
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

  it("один триггер даёт единственное число «по триггеру», а не «триггерам»", () => {
    // Finding 1: раньше связка триггеров была захардкожена в множественном
    // числе — «Работает по триггерам Ипотека» на одном-единственном триггере.
    const stages = describeWorkflow(graph, templates, { ...facts, triggers: ["Ипотека"] });
    const text = segmentsText(stages[0].body);
    expect(text).toContain("по триггеру Ипотека");
    expect(text).not.toContain("триггерам");
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
    const message = stages.find((s) => s.id === "first-touch")?.messages?.[0];
    expect(message?.templateTag?.target.kind).toBe("template");
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
    const message = stages.find((s) => s.id === "first-touch")?.messages?.[0];
    expect(message?.templateTag?.label).toBeTruthy();
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

  it("email с телом, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран» — и не теряет тему", () => {
    const graph = commGraph({
      kind: "email",
      subject: "Индивидуальная тема",
      body: "Совершенно нестандартный текст письма, которого нет в справочнике.",
      sender: "noreply@brand.com",
    });
    const stages = describeWorkflow(graph, T, editableFacts);
    const message = stages.find((s) => s.id === "first-touch")!.messages![0];
    expect(message.templateName).toBeUndefined();
    expect(message.subject).toBe("Индивидуальная тема");
    expect(message.templateTag).toBeDefined();
    expect(message.templateTag!.label).toBe("не выбран");
    expect(message.templateTag!.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("ivr со сценарием, не совпавшим ни с одним пресетом, всё равно получает тег «не выбран»", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Совершенно свой сценарий звонка вне библиотеки.",
      voiceType: "neutral",
    });
    const stages = describeWorkflow(graph, T, editableFacts);
    const message = stages.find((s) => s.id === "first-touch")!.messages![0];
    expect(message.templateName).toBeUndefined();
    expect(message.templateTag?.label).toBe("не выбран");
    expect(message.templateTag?.target).toEqual({ kind: "template", nodeId: "n1" });
  });

  it("резолвнутый шаблон по-прежнему несёт своё имя пилюлей — регресс не тронут", () => {
    const smsTemplate = T.find((tpl) => tpl.id === "tpl_sms_reminder")!;
    const graph = commGraph(smsTemplate.content);
    const stages = describeWorkflow(graph, T, editableFacts);
    const message = stages.find((s) => s.id === "first-touch")!.messages![0];
    expect(message.templateTag?.label).toBe("SMS — напоминание");
  });

  it("graphEditable=false демотирует нерезолвнутый тег в носитель значения (§2.12) — «не выбран» остаётся видимым, но не кликабельным", () => {
    const graph = commGraph({ kind: "ivr", scenario: "Свой сценарий.", voiceType: "neutral" });
    const stages = describeWorkflow(graph, T, { pending: [], graphEditable: false });
    const message = stages.find((s) => s.id === "first-touch")!.messages![0];
    expect(message.templateTag?.target.kind).toBe("none");
    expect(message.templateTag?.label).toBe("не выбран");
  });

  it("без фактов (withTags=false) шаблон-тег по-прежнему не создаётся — обратная совместимость Task 3", () => {
    const graph = commGraph({
      kind: "ivr",
      scenario: "Свой сценарий вне библиотеки.",
      voiceType: "neutral",
    });
    const stages = describeWorkflow(graph, T);
    const message = stages.find((s) => s.id === "first-touch")!.messages![0];
    expect(message.templateTag).toBeUndefined();
  });
});
