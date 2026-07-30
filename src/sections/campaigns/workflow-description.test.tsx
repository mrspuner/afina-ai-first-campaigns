// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import { describeWorkflow, segmentsText, type DescriptionStage } from "@/state/graph-description";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { TemplatePreviewDrawer } from "./template-preview-drawer";
import { NODE_STYLES } from "./node-visuals";
import type { NodeParams, WorkflowNode, WorkflowNodeType } from "@/types/workflow";
import { createTemplate } from "@/state/workflow-templates";
import { getScenario } from "@/data/scenarios";

/** Текстовый сегмент — короткий помощник, чтобы фикстура читалась как раньше. */
const t = (text: string) => [{ kind: "text" as const, text }];

/** Нода рукотворного графа — описанию нужны только id, nodeType и params. */
function node(id: string, nodeType: WorkflowNodeType, params?: NodeParams): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, ...(params ? { params } : {}) },
  };
}

// ВНИМАНИЕ (Task 5 → Task 7): поле `DescriptionStage.messages` снято — строки
// коммуникаций живут в `groups[].rows` (`DescriptionCommunication`), рендерит
// их таблицей Task 8. Тесты, проверявшие СТАРЫЙ run-in список сообщений
// («— Канал, шаблон: «текст»») внутри этого файла, удалены целиком вместе с
// этой задачей: они были написаны под модель, которой уже нет, а не под
// будущую таблицу. Своё покрытие для `groups`/таблиц заводит Task 8 — на новой
// разметке, а не здесь.

const STAGES: DescriptionStage[] = [
  {
    id: "start",
    kind: "start",
    heading: "Скоринг базы",
    body: t("Загруженная база проходит скоринг."),
    settings: [
      { id: "s1", label: "База", value: t("186 255 строк") },
      { id: "s2", label: "Режим", value: t("разовый") },
    ],
  },
  {
    id: "touch-1",
    kind: "touch",
    heading: "Первое касание",
    body: t("Каждому контакту уходит первое сообщение:"),
  },
  { id: "outcome", kind: "outcome", heading: "Итог", body: t("Остальные завершают путь без конверсии.") },
];

describe("WorkflowDescription", () => {
  it("не рендерит ничего, если этапов нет", () => {
    const { container } = render(<WorkflowDescription stages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // Item 1 (finale-полировка): пилюли (~23.6px) выше строки текста при
  // leading-relaxed (1.625 × 14px = 22.75px) — соседние строки внутри одного
  // абзаца с несколькими тегами (напр. перечисление триггеров в «Старте»)
  // визуально слипаются, пилюли соприкасаются краями. Подобрано глазом на
  // реальной карточке (несколько пилюль в одном абзаце): 1.75 даёт видимый
  // зазор, не раздувая текст. Меняем только контейнер описания — глобальная
  // типографика (leading-relaxed в других местах приложения) не трогается.
  it("несёт увеличенный line-height контейнера (не leading-relaxed) — пилюли не слипаются со строкой", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("leading-[1.75]");
    expect(root.className).not.toContain("leading-relaxed");
  });

  describe("текст описания", () => {
    it("показывает подзаголовок и тело каждого этапа", () => {
      render(<WorkflowDescription stages={STAGES} />);
      for (const stage of STAGES) {
        expect(screen.getByText(stage.heading)).toBeTruthy();
        expect(screen.getByText(segmentsText(stage.body))).toBeTruthy();
      }
    });

    it("не рендерит никаких интерактивных элементов — компонент чисто презентационный", () => {
      render(<WorkflowDescription stages={STAGES} />);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    // Все STAGES выше — односегментные, поэтому ни один тест ещё не проверял
    // тело из НЕСКОЛЬКИХ сегментов (ровно форма шва судьбы доменов, которую
    // Task 4 заполнит тегом). Сегменты рендерятся как соседние <span>, поэтому
    // у React нет ни одного текстового узла с полным текстом — getByText(fullString)
    // здесь не найдёт ничего, и это ловушка для Task 4/5. Проверяем через
    // textContent параграфа ТЕЛА, а не getByText — рабочий паттерн для тех
    // задач. Заголовок теперь на своей строке (Task 7) в ОТДЕЛЬНОМ <p>, поэтому
    // берём второй <p> этапа, а не первый целиком.
    it("несколько сегментов body (текст+тег+текст) склеиваются в один textContent", () => {
      const stages: DescriptionStage[] = [
        {
          id: "start",
          kind: "start",
          heading: "Старт",
          body: [
            { kind: "text", text: "Домены " },
            { kind: "tag", tag: { id: "domains", label: "a.ru, b.ru", target: { kind: "domains" } } },
            { kind: "text", text: " отправлены на модерацию." },
          ],
        },
      ];

      const { container } = render(<WorkflowDescription stages={stages} />);
      const paragraphs = container.querySelectorAll("p");
      expect(paragraphs[1].textContent).toBe("Домены a.ru, b.ru отправлены на модерацию.");

      // Ловушка задокументирована: getByText на полную склеенную строку не
      // находит ничего, потому что текст разбит по нескольким <span>.
      expect(
        screen.queryByText("Домены a.ru, b.ru отправлены на модерацию."),
      ).not.toBeInTheDocument();
    });
  });
});

describe("WorkflowDescription — пунктуация вплотную к пилюле (fix round 2, Finding 1)", () => {
  it("текстовый сегмент сразу после тега, начинающийся со знака препинания, получает pull-back класс", () => {
    const stages: DescriptionStage[] = [
      {
        id: "start",
        kind: "start",
        heading: "Старт.",
        body: [
          { kind: "text", text: "Сценарий — " },
          { kind: "tag", tag: { id: "scenario", label: "Апсейл", target: { kind: "none" } } },
          { kind: "text", text: "." },
        ],
      },
    ];
    render(<WorkflowDescription stages={stages} />);
    const punct = screen.getByText(".");
    expect(punct.className).toContain("-ml-[5px]");
  });

  it("несколько знаков подряд (запятая, двоеточие) после тега — та же обработка", () => {
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: [
          { kind: "tag", tag: { id: "trig", label: "Ипотека", target: { kind: "none" } } },
          { kind: "text", text: ", ещё текст" },
          { kind: "tag", tag: { id: "chan", label: "SMS", target: { kind: "none" } } },
          { kind: "text", text: ":" },
        ],
      },
    ];
    render(<WorkflowDescription stages={stages} />);
    expect(screen.getByText(", ещё текст").className).toContain("-ml-[5px]");
    expect(screen.getByText(":").className).toContain("-ml-[5px]");
  });

  it("обычный текстовый сегмент после тега (начинается с буквы) класс не получает", () => {
    const stages: DescriptionStage[] = [
      {
        id: "start",
        kind: "start",
        heading: "Старт.",
        body: [
          { kind: "tag", tag: { id: "scenario", label: "Апсейл", target: { kind: "none" } } },
          { kind: "text", text: " по триггеру Ипотека" },
        ],
      },
    ];
    render(<WorkflowDescription stages={stages} />);
    expect(screen.getByText("по триггеру Ипотека", { exact: false }).className).toBe("");
  });

  it("текстовый сегмент, начинающийся с пунктуации, но идущий за обычным текстом (не за тегом), класс не получает", () => {
    // Тот же ведущий символ «.», что и в кейсе «после тега» выше, — но
    // предыдущий сегмент здесь тоже `text`, а не `tag`, поэтому иллюзии
    // пробела от паддинга пилюли тут вообще нет и пул-бэк не нужен.
    const stages: DescriptionStage[] = [
      {
        id: "start",
        kind: "start",
        heading: "Старт.",
        body: [
          { kind: "text", text: "Слово" },
          { kind: "text", text: ". Ещё." },
        ],
      },
    ];
    render(<WorkflowDescription stages={stages} />);
    expect(screen.getByText(". Ещё.", { exact: false }).className).toBe("");
  });
});

describe("нумерованный таймлайн", () => {
  it("нумерует шаги по порядку", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const numbers = [...container.querySelectorAll("[data-testid='stage-number']")].map((n) => n.textContent);
    expect(numbers).toEqual(["1", "2", "3"]);
  });

  // Ревью (fix round): исходный вариант теста проверял лишь наличие текста
  // заголовка и текста тела ГДЕ-ТО в документе — это проходило и на СТАРОЙ
  // run-in разметке (`<p><strong>{heading}</strong> {body}</p>`), потому что
  // там заголовок и тело и так были разными текстовыми узлами (`<strong>` и
  // соседний `<span>`). Тест не отличал run-in от блочной структуры — ровно
  // то, ради чего он написан. Теперь утверждаем БЛОЧНУЮ структуру: заголовок
  // — СВОЙ `<p>` (а не `<strong>` внутри чужого), и тело живёт в СЛЕДУЮЩЕМ
  // соседнем `<p>` — не в том же узле, что заголовок.
  it("заголовок шага — на своей строке, а не вклеен в абзац", () => {
    render(<WorkflowDescription stages={STAGES} />);
    const heading = screen.getByText("Скоринг базы");
    const headingParagraph = heading.closest("p");
    // textContent строго равен заголовку — если бы тело было приклеено в тот
    // же <p> (run-in), здесь оказался бы ещё и текст тела.
    expect(headingParagraph?.tagName).toBe("P");
    expect(headingParagraph?.textContent).toBe("Скоринг базы");

    const bodyParagraph = headingParagraph?.nextElementSibling;
    expect(bodyParagraph?.tagName).toBe("P");
    expect(bodyParagraph?.textContent).toBe("Загруженная база проходит скоринг.");
  });

  // Ревью (fix round): исходный вариант проверял лишь присутствие подписи и
  // значения ГДЕ-ТО в документе — прошёл бы, даже если бы подписи и значения
  // разъехались по разным, рассогласованным строкам. Утверждаем ИМЕННО пару:
  // значение лежит в <dd>, парном тому <dt>, где стоит подпись, — через общий
  // родительский <div> строки (см. разметку `stage.settings.map` в
  // workflow-description.tsx).
  it("показывает настройки старта парами «подпись — значение»", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const list = container.querySelector("[data-testid='stage-settings']");
    const pairs = [...(list?.children ?? [])].map((row) => ({
      label: row.querySelector("dt")?.textContent,
      value: row.querySelector("dd")?.textContent,
    }));
    expect(pairs).toEqual([
      { label: "База", value: "186 255 строк" },
      { label: "Режим", value: "разовый" },
    ]);
  });

  it("шаг без настроек не рендерит пустой список", () => {
    const { container } = render(
      <WorkflowDescription stages={[{ id: "o", kind: "outcome", heading: "Итог", body: t("Всё.") }]} />,
    );
    expect(container.querySelector("[data-testid='stage-settings']")).toBeNull();
  });
});

/**
 * Таблица коммуникаций (Task 8). `PreviewButton` внутри строки зовёт
 * `useChat()` напрямую — компонент перестаёт быть чисто презентационным,
 * поэтому здесь и только здесь нужна обёртка провайдерами (та же пара, что
 * `campaign-screen.tsx` реально ставит вокруг `WorkflowDescription`).
 */
const wrap = (ui: ReactElement) =>
  render(
    <AppStateProvider>
      <ChatProvider>{ui}</ChatProvider>
    </AppStateProvider>,
  );

const GROUP_STAGE: DescriptionStage = {
  id: "touch-1",
  kind: "touch",
  heading: "Первое касание",
  body: t("Аудитория делится по каналам — каждому своё сообщение:"),
  groups: [
    {
      id: "g1",
      label: "Высокая склонность",
      rows: [
        {
          nodeId: "n1",
          channel: "Email",
          contentText: "Ваше предложение готово",
          previewTemplateId: "tpl_email_1",
          templateTag: { id: "tt1", label: "Горячий оффер", target: { kind: "none", nodeId: "n1" } },
        },
      ],
    },
    {
      id: "g2",
      label: "Средняя склонность",
      rows: [
        {
          nodeId: "n2",
          channel: "Push",
          contentTitle: "Напоминание",
          contentText: "У нас есть кое-что для вас.",
          templateTag: { id: "tt2", label: "не выбран", target: { kind: "none", nodeId: "n2" } },
        },
      ],
    },
  ],
};

describe("таблица коммуникаций", () => {
  it("рендерит канал, шаблон и контент строкой таблицы", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("Горячий оффер")).toBeTruthy();
    expect(screen.getByText("Ваше предложение готово")).toBeTruthy();
  });

  it("контент без кавычек и без меток «Тема»/«Текст»", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const cell = screen.getByText("Ваше предложение готово");
    expect(cell.textContent).not.toContain("«");
    expect(cell.textContent).not.toContain("Тема:");
  });

  it("push показывает заголовок и текст двумя строками ячейки", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(screen.getByText("Напоминание")).toBeTruthy();
    expect(screen.getByText("У нас есть кое-что для вас.")).toBeTruthy();
  });

  it("шапка колонок — один раз на шаг, у первой таблицы", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(container.querySelectorAll("thead")).toHaveLength(1);
    expect(container.querySelectorAll("table")).toHaveLength(2);
  });

  it("◈-подзаголовок стоит над таблицей своей группы", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(screen.getByText(/Высокая склонность/)).toBeTruthy();
    expect(screen.getByText(/Средняя склонность/)).toBeTruthy();
  });

  it("группа без метки не рисует ◈-подзаголовок", () => {
    const stage: DescriptionStage = {
      ...GROUP_STAGE,
      groups: [{ id: "g", rows: GROUP_STAGE.groups![0].rows }],
    };
    const { container } = wrap(<WorkflowDescription stages={[stage]} />);
    expect(container.querySelector("[data-testid='group-label']")).toBeNull();
  });

  // Расхождение с эскизом брифа (см. отчёт задачи): у GROUP_STAGE строка
  // Push (n2) не несёт `previewTemplateId` — «не выбран» у её пилюли ровно
  // это и значит (шаблон не резолвился из библиотеки). Кнопка предпросмотра
  // для такой строки существует ТОЛЬКО через синтетический fallback из
  // `nodeParams` (реальный вызывающий, `CampaignScreen`, всегда передаёт его
  // вместе со `stages`) — без него в этой строке нечего превьюить, и брифовский
  // тест (без `nodeParams` вовсе) находит только 1 кнопку, а не 2. Передаём
  // nodeParams для n2 здесь, сохраняя намерение теста «у каждой строки есть
  // кнопка», а не подгоняя реализацию под неполную фикстуру.
  it("у каждой строки есть кнопка предпросмотра", () => {
    const nodeParams = new Map<string, NodeParams>([
      ["n2", { kind: "push", title: "Напоминание", body: "У нас есть кое-что для вас." }],
    ]);
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} nodeParams={nodeParams} />);
    expect(screen.getAllByRole("button", { name: /предпросмотр/i })).toHaveLength(2);
  });

  it("пометка «Та же серия…» показывается у повтора", () => {
    wrap(
      <WorkflowDescription
        stages={[{ ...GROUP_STAGE, kind: "retry", heading: "Пауза и повтор", sameAsHeading: "Первое касание" }]}
      />,
    );
    expect(screen.getByText(/Та же серия, что в шаге «Первое касание»/)).toBeTruthy();
  });
});

/**
 * Task 9 (fix round — ревью нашло дыру в первой версии): РЕАЛЬНЫЙ источник
 * дублей `aria-label` — не несколько ◈-групп одного шага (`group.label`
 * заполняется только настоящей развилкой, `forkKind`), а этап «Пауза и
 * повтор»: он рисует СВОЮ таблицу с содержательно той же строкой, что и
 * оригинальное касание, и ОБЕ группы при этом без `group.label` (повтор
 * никогда не развилка). Единственный различитель, который реально покрывает
 * этот случай, — заголовок ЭТАПА (уникален в описании, человекочитаем).
 * `groupLabel` добавляется поверх для НАСТОЯЩИХ развилок — обе причины дублей
 * закрыты независимо друг от друга.
 */
describe("таблица коммуникаций — уникальный aria-label кнопки предпросмотра (Task 9)", () => {
  it("реальный случай (Апсейл): касание + повтор с той же таблицей — все ярлыки предпросмотра различны", () => {
    // Та же фикстура, что использует campaign-screen.test.tsx (draftCampaign):
    // Апсейл, канал sms, sourceType "new" — реальный `describeWorkflow`, а не
    // сконструированный вручную DescriptionStage[].
    const signalType = getScenario("base-upsell")!.signalType;
    const graph = createTemplate(signalType, "new", ["sms"]);
    const stages = describeWorkflow(graph, [], { pending: [], graphEditable: true });
    const nodeParams = new Map(
      graph.nodes
        .filter((n) => n.data.params !== undefined)
        .map((n) => [n.id, n.data.params!] as const),
    );

    wrap(<WorkflowDescription stages={stages} nodeParams={nodeParams} />);

    const previewButtons = screen.getAllByRole("button", { name: /предпросмотр/i });
    const labels = previewButtons.map((btn) => btn.getAttribute("aria-label"));
    // Доказываем, что тест реально ловит дубль-кейс, а не проходит вхолостую:
    // оба этапа с одноимённым SMS-шаблоном присутствуют.
    expect(labels).toContain("Предпросмотр — SMS, Первое касание");
    expect(labels).toContain("Предпросмотр — SMS, Пауза и повтор");
    // И главное утверждение — различимость: ни одно имя не повторяется.
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Вторая половина правила (её можно оставить синтетической — она не про
  // повтор, а про НАСТОЯЩУЮ развилку внутри одного шага, где `group.label`
  // реально заполняется): два ◈-потока одного канала внутри одного этапа
  // получают разные ярлыки за счёт метки ветки поверх заголовка этапа.
  const sameChannelStage: DescriptionStage = {
    id: "touch-1",
    kind: "touch",
    heading: "Первое касание",
    body: t("Аудитория делится по каналам — каждому своё сообщение:"),
    groups: [
      {
        id: "g1",
        label: "Высокая склонность",
        rows: [
          { nodeId: "n-high", channel: "SMS", contentText: "Текст", previewTemplateId: "tpl_sms" },
        ],
      },
      {
        id: "g2",
        label: "Средняя склонность",
        rows: [
          { nodeId: "n-mid", channel: "SMS", contentText: "Текст", previewTemplateId: "tpl_sms" },
        ],
      },
    ],
  };

  it("две ◈-группы одного канала внутри одного шага получают различающиеся ярлыки — этап + метка ветки", () => {
    wrap(<WorkflowDescription stages={[sameChannelStage]} />);
    // Каждый ярлык находится по отдельности (getByRole кинул бы «multiple
    // elements», если бы метка ветки не вошла в aria-label).
    expect(
      screen.getByRole("button", { name: "Предпросмотр — SMS, Первое касание, Высокая склонность" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Предпросмотр — SMS, Первое касание, Средняя склонность" }),
    ).toBeInTheDocument();
  });

  // Ревью финального круга: заголовок этапа уникален у ШАБЛОНОВ репозитория, но
  // не по построению. Цепочка A → пауза → A → пауза → A даёт ДВА этапа «Пауза и
  // повтор», два условия-развилки — две «Развилки по реакции». Тогда
  // возвращается ровно тот дефект, который различитель и закрывал. Уникален по
  // построению только `stage.id` (`touch-1`, `retry-1`, `retry-2`, …), поэтому
  // он и дописывается — но ТОЛЬКО когда заголовки реально совпали, иначе ярлык
  // терял бы человекочитаемость на всех обычных карточках.
  it("два этапа с ОДИНАКОВЫМ заголовком получают различающиеся ярлыки", () => {
    const sms = (id: string) =>
      node(id, "sms", {
        kind: "sms",
        text: "Ваше предложение ждёт.",
        alphaName: "BRAND",
        scheduledAt: "immediate",
      });
    const wait = (id: string) =>
      node(id, "wait", { kind: "wait", mode: "duration", durationHours: 48 });
    // Две паузы подряд с той же серией: обе волны — «Пауза и повтор».
    const graph = {
      nodes: [node("signal", "source"), sms("a1"), wait("w1"), sms("a2"), wait("w2"), sms("a3")],
      edges: [
        { id: "e1", source: "signal", target: "a1" },
        { id: "e2", source: "a1", target: "w1" },
        { id: "e3", source: "w1", target: "a2" },
        { id: "e4", source: "a2", target: "w2" },
        { id: "e5", source: "w2", target: "a3" },
      ],
    };
    const stages = describeWorkflow(graph, [], { pending: [], graphEditable: true });
    const nodeParams = new Map(
      graph.nodes
        .filter((n) => n.data.params !== undefined)
        .map((n) => [n.id, n.data.params!] as const),
    );

    // Тест ловит реальный кейс, а не проходит вхолостую: заголовок «Пауза и
    // повтор» действительно встречается дважды.
    const repeated = stages.filter((s) => s.heading === "Пауза и повтор");
    expect(repeated).toHaveLength(2);

    wrap(<WorkflowDescription stages={stages} nodeParams={nodeParams} />);
    const labels = screen
      .getAllByRole("button", { name: /предпросмотр/i })
      .map((btn) => btn.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    // Человекочитаемость не потеряна: канал и заголовок этапа по-прежнему
    // ведут ярлык, id дописан хвостом и только у совпавших.
    expect(labels).toContain("Предпросмотр — SMS, Первое касание");
    expect(labels.filter((l) => l?.startsWith("Предпросмотр — SMS, Пауза и повтор,"))).toHaveLength(2);
  });

  it("группа без метки ветки — ярлык несёт канал и этап, без хвоста группы", () => {
    const stage: DescriptionStage = {
      ...GROUP_STAGE,
      groups: [{ id: "g", rows: [GROUP_STAGE.groups![0].rows[0]] }],
    };
    wrap(<WorkflowDescription stages={[stage]} />);
    expect(
      screen.getByRole("button", { name: "Предпросмотр — Email, Первое касание" }),
    ).toBeInTheDocument();
  });
});

describe("таблица коммуникаций — кнопка предпросмотра открывает дровер", () => {
  // `TemplatePreviewDrawer` смонтирован рядом — тот же приём, что
  // `template-preview-drawer.test.tsx` использует для «глаза» ноды: клик по
  // кнопке диспатчит через `useChat()`, а сам дровер читает диспатченное
  // состояние и рендерит содержимое.
  it("резолвнутый шаблон (previewTemplateId) открывает дровер с содержимым библиотеки", () => {
    const stage: DescriptionStage = {
      id: "touch-1",
      kind: "touch",
      heading: "Первое касание",
      body: t("Аудитория делится по каналам — каждому своё сообщение:"),
      groups: [
        {
          id: "g1",
          rows: [
            {
              nodeId: "n1",
              channel: "SMS",
              contentText: "Ваше предложение ждёт. Подробности на сайте.",
              // Реальный библиотечный шаблон — `PRESET_TEMPLATES` в app-state.ts.
              previewTemplateId: "tpl_sms_reminder",
            },
          ],
        },
      ],
    };
    wrap(
      <>
        <WorkflowDescription stages={[stage]} />
        <TemplatePreviewDrawer />
      </>,
    );
    expect(screen.queryByTestId("template-preview-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(drawer).toBeInTheDocument();
    // Скоуп на дровер: та же строка «Ваше предложение ждёт…» лежит ЕЩЁ и в
    // ячейке таблицы позади дровера — screen.getByText без within нашёл бы
    // ДВА узла и упал бы с «multiple elements found».
    expect(
      within(drawer).getByText("Ваше предложение ждёт. Подробности на сайте."),
    ).toBeInTheDocument();
  });

  it("нерезолвнутый шаблон открывает синтетический предпросмотр из params ноды, read-only", () => {
    const stage: DescriptionStage = {
      id: "touch-1",
      kind: "touch",
      heading: "Первое касание",
      body: t("Аудитория делится по каналам — каждому своё сообщение:"),
      groups: [
        {
          id: "g1",
          rows: [
            {
              nodeId: "n2",
              channel: "Push",
              contentTitle: "Напоминание",
              contentText: "У нас есть кое-что для вас.",
              // Нет previewTemplateId — «не выбран», предпросмотр идёт из
              // текущих params ноды (nodePreviewTemplate), не из библиотеки.
            },
          ],
        },
      ],
    };
    const nodeParams = new Map<string, NodeParams>([
      ["n2", { kind: "push", title: "Напоминание", body: "У нас есть кое-что для вас." }],
    ]);
    wrap(
      <>
        <WorkflowDescription stages={[stage]} nodeParams={nodeParams} />
        <TemplatePreviewDrawer />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /предпросмотр/i }));
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(drawer).toBeInTheDocument();
    // Скоуп на дровер — та же причина, что и в тесте выше: контент строки
    // таблицы («У нас есть кое-что для вас.») дублируется дровером поверх неё.
    expect(within(drawer).getByText("У нас есть кое-что для вас.")).toBeInTheDocument();
    // `nodePreviewTemplate` метит синтетический шаблон usedInCampaigns: 1 —
    // без записи в библиотеке «Сохранить» списало бы правку в несуществующий
    // id, поэтому дровер обязан открыть его read-only (баннер-предупреждение).
    expect(within(drawer).getByText(/нельзя редактировать/)).toBeInTheDocument();
  });
});

/**
 * Покрытие `nodeTypeForTag` внутри таблицы (Task 8 явно просит его вернуть —
 * прошлая задача сняла юнит-покрытие этой функции, т.к. живого пути к ней не
 * было; таблица — этот путь). Пилюля шаблона строки (`target.kind:"template"`)
 * красится под `NODE_STYLES` СВОЕГО канала — не общим цветом, не нейтральным —
 * подтверждаем на ДВУХ разных каналах в одной таблице, чтобы исключить
 * совпадение по случайности/дефолту.
 */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("таблица коммуникаций — пилюля шаблона красится под цвет узла (nodeTypeForTag)", () => {
  it("email- и push-строки красятся разными цветами своих каналов, а не нейтрально", () => {
    const stage: DescriptionStage = {
      id: "touch-1",
      kind: "touch",
      heading: "Первое касание",
      body: t("Аудитория делится по каналам — каждому своё сообщение:"),
      groups: [
        {
          id: "g1",
          rows: [
            {
              nodeId: "n-email",
              channel: "Email",
              contentText: "Ваше предложение готово",
              templateTag: {
                id: "tt-email",
                label: "Email — оффер",
                target: { kind: "template", nodeId: "n-email" },
              },
            },
            {
              nodeId: "n-push",
              channel: "Push",
              contentText: "Загляните",
              templateTag: {
                id: "tt-push",
                label: "Push — возвращение",
                target: { kind: "template", nodeId: "n-push" },
              },
            },
          ],
        },
      ],
    };
    const nodeTypes = new Map([
      ["n-email", "email" as const],
      ["n-push", "push" as const],
    ]);
    wrap(<WorkflowDescription stages={[stage]} nodeTypes={nodeTypes} />);

    const emailPill = screen.getByRole("button", { name: "Email — оффер" });
    const pushPill = screen.getByRole("button", { name: "Push — возвращение" });

    expect(emailPill.style.backgroundColor).toBe(hexToRgb(NODE_STYLES.email.bg));
    expect(emailPill.style.color).toBe(hexToRgb(NODE_STYLES.email.color));
    expect(pushPill.style.backgroundColor).toBe(hexToRgb(NODE_STYLES.push.bg));
    expect(pushPill.style.color).toBe(hexToRgb(NODE_STYLES.push.color));
    // Разные каналы → разные цвета: доказывает, что цвет реально зависит от
    // резолвнутого `nodeType` строки, а не от одного дефолтного стиля.
    expect(emailPill.style.backgroundColor).not.toBe(pushPill.style.backgroundColor);
  });
});
