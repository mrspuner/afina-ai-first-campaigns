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

// Task 8: описание группируется по верхнеуровневым блокам. Реалистичный вывод
// `describeWorkflow` для этих тестов — сигнальный титул (его собственный
// заголовок поглощается заголовком блока), два нумерованных коммуникационных
// шага и закрывающая строка блока (пустой heading). Блока «Итог» здесь нет —
// денежный «Итог» рисует экран кампании.
const STAGES: DescriptionStage[] = [
  {
    id: "start",
    kind: "start",
    block: "signal",
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
    block: "communication",
    heading: "Первое касание",
    body: t("Каждому контакту уходит первое сообщение:"),
  },
  {
    id: "check-1",
    kind: "check",
    block: "communication",
    heading: "Проверка реакции",
    body: t("Кто отреагировал — уходит в успех."),
  },
  {
    id: "comm-close",
    kind: "outcome",
    block: "communication",
    heading: "",
    body: t("Остальные завершают путь без конверсии."),
  },
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
    it("показывает подзаголовки коммуникационных шагов и тело каждого этапа", () => {
      render(<WorkflowDescription stages={STAGES} />);
      // Заголовки нумерованных коммуникационных под-шагов рендерятся жирным.
      expect(screen.getByText("Первое касание")).toBeTruthy();
      expect(screen.getByText("Проверка реакции")).toBeTruthy();
      // Заголовок сигнального титула поглощён заголовком блока «Сигнал
      // (Скоринг)» — своим подзаголовком не дублируется.
      expect(screen.queryByText("Скоринг базы")).toBeNull();
      // Тело КАЖДОГО этапа (включая сигнальный титул и закрывающую строку)
      // присутствует — сегменты односегментные, поэтому getByText находит их.
      for (const stage of STAGES) {
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
    // задач. Сигнальный титул (Task 8) поглощён заголовком блока: своего
    // подзаголовка-<p> у него больше нет, поэтому тело — ПЕРВЫЙ <p> этапа.
    it("несколько сегментов body (текст+тег+текст) склеиваются в один textContent", () => {
      const stages: DescriptionStage[] = [
        {
          id: "start",
          kind: "start",
          block: "signal",
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
      expect(paragraphs[0].textContent).toBe("Домены a.ru, b.ru отправлены на модерацию.");

      // Ловушка задокументирована: getByText на полную склеенную строку не
      // находит ничего, потому что текст разбит по нескольким <span>.
      expect(
        screen.queryByText("Домены a.ru, b.ru отправлены на модерацию."),
      ).not.toBeInTheDocument();
    });
  });
});

describe("верхнеуровневые блоки описания (Task 8)", () => {
  it("группирует этапы в блоки «Сигнал (Скоринг)» и «Коммуникации», без блока «Итог»", () => {
    render(<WorkflowDescription stages={STAGES} />);
    expect(screen.getByText("Сигнал (Скоринг)")).toBeTruthy();
    expect(screen.getByText("Коммуникации")).toBeTruthy();
    // Денежный «Итог» рисует ЭКРАН кампании, а не это описание — заголовка
    // блока «Итог» здесь быть не должно.
    expect(screen.queryByText("Итог")).toBeNull();
  });

  it("блок рисуется только при наличии этапов — без коммуникаций нет заголовка «Коммуникации»", () => {
    const signalOnly: DescriptionStage[] = [
      { id: "start", kind: "start", block: "signal", heading: "Загрузка базы", body: t("База загружена.") },
      { id: "signal-close", kind: "outcome", block: "signal", heading: "", body: t("На выходе — готовый сегмент.") },
    ];
    render(<WorkflowDescription stages={signalOnly} />);
    expect(screen.getByText("Сигнал (Скоринг)")).toBeTruthy();
    expect(screen.queryByText("Коммуникации")).toBeNull();
  });

  it("этап с пустым heading рендерит тело обычным абзацем — без бейджа-номера", () => {
    const stages: DescriptionStage[] = [
      { id: "touch-1", kind: "touch", block: "communication", heading: "Первое касание", body: t("Уходит первое сообщение.") },
      { id: "comm-close", kind: "outcome", block: "communication", heading: "", body: t("Остальные завершают путь без конверсии.") },
    ];
    const { container } = render(<WorkflowDescription stages={stages} />);
    // Текст закрывающего этапа присутствует, лежит в обычном <p>...
    const closingText = screen.getByText("Остальные завершают путь без конверсии.");
    expect(closingText.closest("p")?.tagName).toBe("P");
    // ...и не сидит в <li> нумерованного шага (значит, без бейджа и рельса).
    expect(closingText.closest("li")).toBeNull();
    // Единственный бейдж-номер — у «Первого касания»; у закрывающей строки его нет.
    const numbers = [...container.querySelectorAll("[data-testid='stage-number']")].map((n) => n.textContent);
    expect(numbers).toEqual(["1"]);
  });
});

describe("WorkflowDescription — пунктуация вплотную к пилюле (fix round 2, Finding 1)", () => {
  it("текстовый сегмент сразу после тега, начинающийся со знака препинания, получает pull-back класс", () => {
    const stages: DescriptionStage[] = [
      {
        id: "start",
        kind: "start",
        block: "signal",
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
        block: "communication",
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
        block: "signal",
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
        block: "signal",
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
  // Нумерация перезапускается внутри блока и считает ТОЛЬКО нумерованные
  // (непустой heading) под-шаги. У STAGES в блоке «Коммуникации» их два
  // (касание + проверка); сигнальный титул поглощён заголовком блока, а
  // закрывающая строка бейджа не несёт — итого два бейджа.
  it("нумерует шаги по порядку внутри блока", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const numbers = [...container.querySelectorAll("[data-testid='stage-number']")].map((n) => n.textContent);
    expect(numbers).toEqual(["1", "2"]);
  });

  // Task 4: номер шага — кружок-бейдж (Ø28px), а не плоская цифра на левом
  // поле. `tabular-nums` держит одинаковую ширину цифр 1–9 внутри круга.
  it("номер шага — в кружке-бейдже, а не плоской цифрой", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const badge = container.querySelector("[data-testid='stage-number']") as HTMLElement;
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).toContain("tabular-nums");
  });

  // Task 4: вертикальная линия-таймлайн связывает бейджи соседних шагов.
  it("шаги связаны вертикальной линией-таймлайном", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    expect(container.querySelector("[data-testid='stage-rail']")).toBeTruthy();
  });

  // Соединять нечего — линия рисуется ТОЛЬКО между соседними нумерованными
  // под-шагами блока. Одинокий нумерованный шаг рельса не даёт.
  it("одинокий шаг линии не рисует", () => {
    const { container } = render(
      <WorkflowDescription stages={[{ id: "o", kind: "touch", block: "communication", heading: "Первое касание", body: t("Всё.") }]} />,
    );
    expect(container.querySelector("[data-testid='stage-rail']")).toBeNull();
  });

  // Ревью (fix round): исходный вариант теста проверял лишь наличие текста
  // заголовка и текста тела ГДЕ-ТО в документе — это проходило и на СТАРОЙ
  // run-in разметке (`<p><strong>{heading}</strong> {body}</p>`), потому что
  // там заголовок и тело и так были разными текстовыми узлами (`<strong>` и
  // соседний `<span>`). Тест не отличал run-in от блочной структуры — ровно
  // то, ради чего он написан. Теперь утверждаем БЛОЧНУЮ структуру: заголовок
  // — СВОЙ `<p>` (а не `<strong>` внутри чужого), и тело живёт в СЛЕДУЮЩЕМ
  // соседнем `<p>` — не в том же узле, что заголовок. Проверяем на
  // нумерованном коммуникационном под-шаге: у него есть свой подзаголовок (у
  // сигнального титула он поглощён заголовком блока — Task 8).
  it("заголовок шага — на своей строке, а не вклеен в абзац", () => {
    render(<WorkflowDescription stages={STAGES} />);
    const heading = screen.getByText("Первое касание");
    const headingParagraph = heading.closest("p");
    // textContent строго равен заголовку — если бы тело было приклеено в тот
    // же <p> (run-in), здесь оказался бы ещё и текст тела.
    expect(headingParagraph?.tagName).toBe("P");
    expect(headingParagraph?.textContent).toBe("Первое касание");

    const bodyParagraph = headingParagraph?.nextElementSibling;
    expect(bodyParagraph?.tagName).toBe("P");
    expect(bodyParagraph?.textContent).toBe("Каждому контакту уходит первое сообщение:");
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
      <WorkflowDescription stages={[{ id: "o", kind: "touch", block: "communication", heading: "Первое касание", body: t("Всё.") }]} />,
    );
    expect(container.querySelector("[data-testid='stage-settings']")).toBeNull();
  });

  // Правка 1 (владелец продукта, разбор живой карточки): подписи занимали
  // каждая свою ширину — теги-значения соседних строк начинались на разной
  // горизонтали, список читался «рваным». Фиксированная ширина у ВСЕХ `dt`
  // выравнивает старт значений по одной вертикали.
  it("подписи настроек фиксированной ширины — значения выстраиваются по одной вертикали", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const labels = [...container.querySelectorAll("[data-testid='stage-settings'] dt")];
    expect(labels.length).toBeGreaterThan(0);
    for (const dt of labels) {
      expect((dt as HTMLElement).className).toContain("w-[92px]");
    }
  });

  // Правка 5: зазор между строками списка настроек доведён до 8px (`gap-2`,
  // было `gap-1` = 4px).
  it("зазор между строками списка настроек — 8px (gap-2)", () => {
    const { container } = render(<WorkflowDescription stages={STAGES} />);
    const list = container.querySelector("[data-testid='stage-settings']") as HTMLElement;
    expect(list.className).toContain("gap-2");
    // Wildcard-безопасная проверка: `gap-1` не должен остаться отдельным
    // словом-классом (не подстрокой внутри `gap-1.5` и т.п., которых тут нет).
    expect(list.className).not.toMatch(/(?:^|\s)gap-1(?:\s|$)/);
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
  block: "communication",
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

  // Task 4: таблица лежит в обрамлённой панели — фон, обводка, скруглённые
  // углы, overflow: hidden (иначе строки/шапка вылезали бы за радиус).
  it("таблица лежит в обрамлённой панели", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const panel = container.querySelector("[data-testid='table-panel']") as HTMLElement;
    expect(panel.className).toContain("rounded-[10px]");
    expect(panel.className).toContain("overflow-hidden");
  });

  // Task 4: кнопка предпросмотра теряет видимую подпись «Предпросмотр», но не
  // доступность — aria-label уже уникальный (различает канал/этап/группу),
  // title дублирует его для наведения мышью.
  it("кнопка предпросмотра — только иконка, подпись остаётся доступной", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const btn = screen.getAllByRole("button", { name: /^Предпросмотр/ })[0];
    expect(btn.textContent).toBe("");
    expect(btn.getAttribute("title")).toMatch(/Предпросмотр/);
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

  // Финальное ревью: прежний вариант считал `<thead>` и требовал ровно один на
  // шаг — визуально верно, но вторая и последующие ◈-таблицы оставались
  // полностью НЕПОДПИСАННЫМИ сетками данных для скринридера. Тест переписан на
  // то, что он на самом деле охраняет: ВИДИМАЯ шапка одна на шаг, у остальных
  // таблиц шапка есть, но только для скринридера.
  it("видимая шапка — одна на шаг; у последующих ◈-таблиц шапка только для скринридера", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const tables = [...container.querySelectorAll("table")];
    expect(tables).toHaveLength(2);

    const heads = tables.map((table) => table.querySelector("thead"));
    // Ни одна таблица данных не остаётся без подписей колонок.
    expect(heads.every((head) => head !== null)).toBe(true);
    // Но видимая ровно одна — у первой группы; остальные скрыты визуально.
    expect(heads[0]!.className).not.toContain("sr-only");
    expect(heads.slice(1).every((head) => head!.className.includes("sr-only"))).toBe(true);
  });

  /**
   * Найдено глазами на живой карточке: русские имена шаблонов («Персональный
   * оффер», «Push — возвращение») не влезали в колонку и переносились ВНУТРИ
   * пилюли — та вырастала в два ряда и читалась крупным блоком-кнопкой, а не
   * чипом строки. Замер на карточке: имя в одну строку требует до 178px, в
   * колонке было 157px. Лечится парой — усечением у пилюли и шириной у
   * колонки; порознь ни одно не даёт однострочного чипа.
   */
  // Правка 4 (владелец продукта, разбор живой карточки): потолок ширины стал
  // символьным (`max-w-[20ch]`) и общим для ВСЕХ пилюль — раньше здесь была
  // табличная особенность `max-w-full`, завязанная на ширину колонки.
  it("пилюля шаблона в таблице усекается, а не переносится, и не вылезает из ячейки", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const pill = container.querySelector("tbody tr td:nth-child(2) > *") as HTMLElement;
    const label = pill.querySelector("span") as HTMLElement;
    expect(label.className).toContain("truncate");
    // Без min-w-0 флекс-элемент не сжимается уже своего содержимого, и
    // усечение не срабатывает вовсе.
    expect(label.className).toContain("min-w-0");
    expect(pill.className).toContain("max-w-[20ch]");
  });

  it("усечённая пилюля отдаёт полное имя подсказкой — иначе его негде прочитать", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    // Пилюля запущенной кампании (`none`) — обычный span: подсказка нативная.
    expect(screen.getByText("Горячий оффер").closest("[title]")?.getAttribute("title"))
      .toBe("Горячий оффер");
  });

  // Правка 4 (владелец продукта, разбор живой карточки): усечение перестало
  // быть табличной особенностью — это ТА ЖЕ механика у ЛЮБОЙ пилюли, включая
  // теги ПРОЗЫ (например, перечисление триггеров в «Скоринге базы»). Короткий
  // домен «a.ru» (4 симв.) не достигает потолка `max-w-[20ch]` и визуально не
  // усекается, но несёт ТЕ ЖЕ классы механики, что и табличная пилюля выше —
  // раньше (при флаге `truncateLabel`) их у прозы не было вовсе.
  it("пилюля в прозе несёт ту же механику усечения, что и табличная", () => {
    const { container } = render(
      <WorkflowDescription
        stages={[
          {
            id: "start",
            kind: "start",
            block: "signal",
            heading: "Скоринг базы",
            body: [
              { kind: "text", text: "Домены " },
              { kind: "tag", tag: { id: "d", label: "a.ru", target: { kind: "domains" } } },
              { kind: "text", text: " на модерации." },
            ],
          },
        ]}
      />,
    );
    // Сигнальный титул (Task 8) поглощён заголовком блока — тело этапа
    // теперь ПЕРВЫЙ <p>, отдельного подзаголовка-<p> над ним больше нет.
    const prose = container.querySelectorAll("p")[0];
    expect(prose.textContent).toContain("a.ru");
    expect(prose.innerHTML).toContain("truncate");
    expect(prose.innerHTML).toContain("max-w-[20ch]");
  });

  // Покрытие для самой правки 4: метка ДЛИННЕЕ 20 символов в прозе получает
  // усекающие классы (jsdom не считает layout/эллипсис — реальный рендер
  // проверен Playwright'ом отдельно, см. отчёт), а её полное значение не
  // теряется — уходит в `title` (демоция `none` отдаёт подсказку нативным
  // атрибутом, см. тест выше про «Горячий оффер»).
  it("длинная пилюля в прозе усекается многоточием, полное значение остаётся в подсказке", () => {
    const longLabel = "оченьдлинноеимятриггерадлятеста"; // 30 симв. — длиннее 20ch
    render(
      <WorkflowDescription
        stages={[
          {
            id: "start",
            kind: "start",
            block: "signal",
            heading: "Скоринг базы",
            body: [
              { kind: "text", text: "Триггеры: " },
              { kind: "tag", tag: { id: "d2", label: longLabel, target: { kind: "none" } } },
            ],
          },
        ]}
      />,
    );
    const label = screen.getByText(longLabel);
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("min-w-0");
    const pill = label.parentElement as HTMLElement;
    expect(pill.className).toContain("max-w-[20ch]");
    expect(pill.getAttribute("title")).toBe(longLabel);
  });

  /**
   * Ширины колонок — единственный источник на ВСЕ таблицы шага: `table-fixed`
   * берёт их из первой строки СВОЕЙ таблицы, поэтому разъехавшийся `<colgroup>`
   * сдвинул бы колонки таблицы повтора относительно таблицы касания. Task 4
   * приводит ширины к макету (110px / 196px / авто / 52px) — кнопка стала
   * квадратной иконкой без подписи, поэтому её колонка сузилась с 7rem/120px
   * до 52px (28px кнопки + по 12px паддинга с каждой стороны).
   */
  it("colgroup одинаков у всех таблиц шага и несёт ширины макета", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const widths = [...container.querySelectorAll("table")].map((table) =>
      [...table.querySelectorAll("col")].map((col) => col.className),
    );
    expect(widths).toHaveLength(2);
    expect(widths[0]).toEqual(widths[1]);
    expect(widths[0]).toEqual(["w-[110px]", "w-[196px]", "", "w-[52px]"]);
  });

  it("колонка предпросмотра прижимает кнопку к правому краю и не переносит подпись", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const cell = container.querySelector("tbody tr td:nth-child(4)") as HTMLElement;
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("whitespace-nowrap");
  });

  it("ячейки шапки объявлены заголовками КОЛОНОК (scope=col)", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const ths = [...container.querySelectorAll("th")];
    expect(ths.length).toBeGreaterThan(0);
    expect(ths.every((th) => th.getAttribute("scope") === "col")).toBe(true);
  });

  // Вторая половина того же зафиксированного решения (первая — в
  // graph-description.test.ts): описание строку ОТДАЁТ, а таблица её РИСУЕТ —
  // с пустой ячейкой контента, но с каналом и кнопкой предпросмотра.
  it("строка с пустым контентом рисуется, а не пропускается таблицей", () => {
    const stage: DescriptionStage = {
      id: "touch-1",
      kind: "touch",
      block: "communication",
      heading: "Первое касание",
      body: t("Каждому контакту уходит первое сообщение:"),
      groups: [{ id: "g1", rows: [{ nodeId: "n-empty", channel: "SMS", contentText: "" }] }],
    };
    const nodeParams = new Map<string, NodeParams>([
      ["n-empty", { kind: "sms", text: "", alphaName: "BRAND", scheduledAt: "immediate" }],
    ]);
    const { container } = wrap(
      <WorkflowDescription stages={[stage]} nodeParams={nodeParams} />,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("SMS")).toBeTruthy();
    expect(screen.getByRole("button", { name: /предпросмотр/i })).toBeInTheDocument();
  });

  it("глиф ◈ скрыт от скринридера — озвучивается только название ветки", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const label = container.querySelector("[data-testid='group-label']")!;
    const glyph = label.querySelector("[aria-hidden]");
    expect(glyph?.textContent).toContain("◈");
  });

  it("кнопка предпросмотра несёт кольцо focus-visible, как соседние контролы", () => {
    const nodeParams = new Map<string, NodeParams>([
      ["n2", { kind: "push", title: "Напоминание", body: "У нас есть кое-что для вас." }],
    ]);
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} nodeParams={nodeParams} />);
    const button = screen.getAllByRole("button", { name: /предпросмотр/i })[0];
    expect(button.className).toContain("focus-visible:ring");
  });

  it("◈-подзаголовок стоит над таблицей своей группы", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(screen.getByText(/Высокая склонность/)).toBeTruthy();
    expect(screen.getByText(/Средняя склонность/)).toBeTruthy();
  });

  // Финальное ревью (Important): §7 спеки визуала требует у подзаголовка глиф
  // цветом развилки и текст веса 600 — до этого он наследовал `text-foreground`
  // и весил 500. Цвет берём из `NODE_STYLES.condition` (= `split`), а не из
  // литерала «#E08BD0»: подзаголовок помечает ветку узла-развилки и обязан
  // ехать вместе с его палитрой, а не отдельным хексом.
  it("глиф ◈ окрашен палитрой развилки, а подзаголовок весит 600", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const label = container.querySelector("[data-testid='group-label']") as HTMLElement;
    const glyph = label.querySelector("[aria-hidden]") as HTMLElement;
    expect(glyph.style.color).toBe(hexToRgb(NODE_STYLES.condition.color));
    expect(label.className).toContain("font-semibold");
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
 * заполняется только настоящей развилкой, `forkKind`), а этап повторной волны
 * (на момент Task 9 — «Пауза и повтор», после переименования Task 5 — обычное
 * «Второе касание» и т. п.): он рисует СВОЮ таблицу с содержательно той же
 * строкой, что и оригинальное касание, и ОБЕ группы при этом без
 * `group.label` (повтор никогда не развилка). Единственный различитель,
 * который реально покрывает этот случай, — заголовок ЭТАПА (уникален в
 * описании, человекочитаем). `groupLabel` добавляется поверх для НАСТОЯЩИХ
 * развилок — обе причины дублей закрыты независимо друг от друга.
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
    expect(labels).toContain("Предпросмотр — SMS, Второе касание");
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
    block: "communication",
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
  // не по построению. После Task 5 повтор идёт обычным касанием и порядковый
  // номер в touchHeading растёт монотонно внутри одного вызова
  // `describeWorkflow` — реальный граф внутри одного прогона больше не может
  // сам породить два одноимённых этапа. Но описание строится и вручную (ИИ-
  // правка графа, будущие виды этапов), и именно тогда старая гарантия
  // «заголовок = уникальный ключ» ломается. Уникален по построению только
  // `stage.id`, поэтому он и дописывается — но ТОЛЬКО когда заголовки реально
  // совпали, иначе ярлык терял бы человекочитаемость на всех обычных
  // карточках. Фикстура — рукотворная пара этапов с намеренно одинаковым
  // `heading` (тот же приём, что у `GROUP_STAGE`/`sameChannelStage` выше), а
  // не вывод `describeWorkflow`: реальный граф такой коллизии внутри одного
  // вызова больше не даёт.
  it("два этапа с ОДИНАКОВЫМ заголовком получают различающиеся ярлыки", () => {
    const sameHeadingStage = (id: string, nodeId: string): DescriptionStage => ({
      id,
      kind: "touch",
      block: "communication",
      heading: "Второе касание",
      body: t("Та же серия по тем же каналам:"),
      groups: [
        {
          id: `${id}-g`,
          rows: [
            {
              nodeId,
              channel: "SMS",
              contentText: "Ваше предложение ждёт.",
              previewTemplateId: "tpl_sms",
            },
          ],
        },
      ],
    });
    // Тест ловит реальный кейс, а не проходит вхолостую: оба этапа
    // действительно несут один и тот же заголовок.
    const stages = [sameHeadingStage("touch-2", "n-a2"), sameHeadingStage("touch-3", "n-a3")];
    expect(stages[0].heading).toBe(stages[1].heading);

    wrap(<WorkflowDescription stages={stages} />);
    const labels = screen
      .getAllByRole("button", { name: /предпросмотр/i })
      .map((btn) => btn.getAttribute("aria-label"));
    expect(labels).toHaveLength(2);
    // Человекочитаемость не потеряна: канал и заголовок этапа по-прежнему
    // ведут ярлык, id дописан хвостом и только у совпавших.
    expect(labels.every((l) => l?.startsWith("Предпросмотр — SMS, Второе касание"))).toBe(true);
    // И главное утверждение — различимость: ни одно имя не повторяется.
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Предпросмотр — SMS, Второе касание, touch-2");
    expect(labels).toContain("Предпросмотр — SMS, Второе касание, touch-3");
  });

  /**
   * Дыра, оставшаяся после правки ключа сравнения писем: две строки ОДНОГО
   * канала внутри ОДНОЙ группы. Канал, заголовок этапа и метка ветки у них
   * общие — различать нечем. Форма реальная: ключ сравнения читает тему И
   * тело, поэтому два письма с одной темой и разными телами доходят до таблицы
   * обе, а показывается у обеих одна и та же тема.
   */
  const twoInOneGroup = (first: NodeParams, second: NodeParams) => {
    const graph = {
      nodes: [node("signal", "source"), node("m1", first.kind, first), node("m2", second.kind, second)],
      edges: [
        { id: "e1", source: "signal", target: "m1" },
        { id: "e2", source: "m1", target: "m2" },
      ],
    };
    const stages = describeWorkflow(graph, [], { pending: [], graphEditable: true });
    const nodeParams = new Map(
      graph.nodes.filter((n) => n.data.params).map((n) => [n.id, n.data.params!] as const),
    );
    return { stages, nodeParams };
  };

  it("две строки одного канала в ОДНОЙ группе различаются началом своего контента", () => {
    const { stages, nodeParams } = twoInOneGroup(
      { kind: "sms", text: "Первый заход", alphaName: "BRAND", scheduledAt: "immediate" },
      { kind: "sms", text: "Второй заход", alphaName: "BRAND", scheduledAt: "immediate" },
    );
    // Тест ловит реальный кейс: обе строки — в одной группе одного этапа.
    const groups = stages.find((s) => s.kind === "touch")!.groups!;
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);

    wrap(<WorkflowDescription stages={stages} nodeParams={nodeParams} />);
    expect(
      screen.getByRole("button", { name: "Предпросмотр — SMS, Первое касание, Первый заход" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Предпросмотр — SMS, Первое касание, Второй заход" }),
    ).toBeInTheDocument();
  });

  it("два письма с ОДНОЙ темой и разными телами всё равно различимы — номером строки", () => {
    const { stages, nodeParams } = twoInOneGroup(
      { kind: "email", subject: "Ваше предложение", body: "Первый вариант", sender: "a@brand.com" },
      { kind: "email", subject: "Ваше предложение", body: "Второй вариант", sender: "a@brand.com" },
    );
    // Тест ловит реальный кейс: видимый контент обеих строк ОДИНАКОВ (таблица
    // показывает у письма одну тему) — содержательного различителя нет.
    const rows = stages.find((s) => s.kind === "touch")!.groups![0].rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].contentText).toBe(rows[1].contentText);

    wrap(<WorkflowDescription stages={stages} nodeParams={nodeParams} />);
    const labels = screen
      .getAllByRole("button", { name: /предпросмотр/i })
      .map((btn) => btn.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    // Номер уникален по построению, но канал и этап ярлык не теряет.
    expect(labels).toEqual([
      "Предпросмотр — Email, Первое касание, сообщение 1",
      "Предпросмотр — Email, Первое касание, сообщение 2",
    ]);
  });

  it("строки с ПУСТЫМ контентом получают номер, а не одинаковый пустой хвост", () => {
    const { stages, nodeParams } = twoInOneGroup(
      { kind: "sms", text: "", alphaName: "BRAND", scheduledAt: "immediate" },
      { kind: "sms", text: " ", alphaName: "BRAND", scheduledAt: "immediate" },
    );
    wrap(<WorkflowDescription stages={stages} nodeParams={nodeParams} />);
    const labels = screen
      .getAllByRole("button", { name: /предпросмотр/i })
      .map((btn) => btn.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Предпросмотр — SMS, Первое касание, сообщение 1",
      "Предпросмотр — SMS, Первое касание, сообщение 2",
    ]);
  });

  it("единственная строка канала хвоста не получает — ярлык остаётся коротким", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(
      screen.getByRole("button", {
        name: "Предпросмотр — Email, Первое касание, Высокая склонность",
      }),
    ).toBeInTheDocument();
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
      block: "communication",
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
      block: "communication",
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
      block: "communication",
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
