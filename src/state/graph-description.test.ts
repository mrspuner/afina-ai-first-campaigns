import { describe, expect, it } from "vitest";
import {
  describeWorkflow,
  firstTouchCommunicationNodes,
  segmentsText,
  type CampaignFacts,
} from "./graph-description";
import { createTemplate } from "./workflow-templates";
import { PRESET_TEMPLATES } from "./app-state";

const T = PRESET_TEMPLATES;

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

      // Текст письма не совпадает ни с одним пресетом справочника → шаблон не
      // резолвится, и по спеке для email показываем тему.
      const email = touch.messages!.find((m) => m.channel === "Email")!;
      expect(email.templateName).toBeUndefined();
      expect(email.subject).toBe("Специальное предложение");
      expect(email.text).toBe("Мы подготовили для вас персональное предложение.");
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

describe("firstTouchCommunicationNodes", () => {
  it("возвращает одну ноду на канал первого касания (sms+email)", () => {
    const graph = createTemplate("Возврат", "new", ["sms", "email"]);
    const nodes = firstTouchCommunicationNodes(graph);
    expect(nodes.map((n) => n.data.nodeType).sort()).toEqual(["email", "sms"]);
  });

  it("исключает ноды повторного блока (за задержкой) — только первый проход", () => {
    // «Возврат» несёт retry-повтор той же ноды sms за wait-задержкой; должна
    // остаться ровно одна sms-нода первого прохода, а не обе.
    const graph = createTemplate("Возврат", "new", ["sms"]);
    const nodes = firstTouchCommunicationNodes(graph);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.nodeType).toBe("sms");
  });

  it("не выдумывает ноды, когда в графе нет коммуникаций", () => {
    const graph = createTemplate("Возврат", "new", []);
    expect(firstTouchCommunicationNodes(graph)).toEqual([]);
  });

  it("пустой граф не роняет обход", () => {
    expect(firstTouchCommunicationNodes({ nodes: [], edges: [] })).toEqual([]);
  });

  it("для сегментированного шаблона схлопывает одинаковые сегменты в ОДИН блок на канал (Fix: как и текст описания)", () => {
    // Апсейл — сегментированный: 3 comm-юнита с одинаковыми sms-параметрами.
    // Раньше нодо-блоки карточки (A2.1) шли один на КАЖДУЮ ноду графа — три
    // визуально идентичных SMS-блока под одной подписью «SMS». Теперь дедуп —
    // тот же ключ channel|text, что и у describeWorkflow, поэтому блоков и
    // строк текста поровну: ровно один на канал.
    const graph = createTemplate("Апсейл", "new", ["sms"]);
    const nodes = firstTouchCommunicationNodes(graph);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.nodeType).toBe("sms");
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

  const facts: CampaignFacts = {
    pending: [],
    baseRows: 12_000,
    triggers: ["Ипотека", "Новостройки", "Вторичка", "Аренда"],
    channels: ["sms", "email"],
    budget: 50_000,
    analysisMode: "once",
    scenarioName: "Ипотечный интерес",
    editableSteps: ["scenario", "intent", "interests", "analysis", "file", "channels", "budget"],
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
    expect(segmentsText(stages[0].body)).not.toMatch(/\s{2}/);
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

  it("идентификаторы тегов уникальны — годятся как React-ключи", () => {
    const ids = allTags(describeWorkflow(graph, templates, facts)).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
