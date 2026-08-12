// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import { segmentsText, type DescriptionStage } from "@/state/graph-description";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { NODE_STYLES } from "./node-visuals";

/** Текстовый сегмент — короткий помощник, чтобы фикстура читалась как раньше. */
const t = (text: string) => [{ kind: "text" as const, text }];

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
    expect(root.className).toContain("leading-[2.2]");
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

describe("верхнеуровневые блоки описания — нумерованная этапность", () => {
  it("нумерует блоки «1. Сигналы» и «2. Коммуникации», без блока «Итог»", () => {
    render(<WorkflowDescription stages={STAGES} />);
    expect(screen.getByText("1. Сигналы")).toBeTruthy();
    expect(screen.getByText("2. Коммуникации")).toBeTruthy();
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
    expect(screen.getByText("1. Сигналы")).toBeTruthy();
    expect(screen.queryByText("2. Коммуникации")).toBeNull();
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
 * Пилюли шаблона внутри `DescriptionTagPill` зовут `useChat()` (поповер выбора
 * шаблона), поэтому здесь нужна обёртка провайдерами (та же пара, что
 * `campaign-screen.tsx` реально ставит вокруг `WorkflowDescription`).
 */
const wrap = (ui: ReactElement) =>
  render(
    <AppStateProvider>
      <ChatProvider>{ui}</ChatProvider>
    </AppStateProvider>,
  );

// Форк-волна: у неё ветки остаются отдельными ◈-абзацами, каждая несёт своё
// инлайн-перечисление каналов в `group.inline` (у не-форк волн каналы вплетены
// прямо в `stage.body`).
const GROUP_STAGE: DescriptionStage = {
  id: "fork-1",
  kind: "fork",
  block: "communication",
  heading: "Развилка по реакции",
  body: t("Аудитория делится на потоки, каждый получает своё:"),
  groups: [
    {
      id: "g1",
      label: "Высокая склонность",
      rows: [
        {
          nodeId: "n1",
          channel: "Email",
          templateTag: { id: "tt1", label: "Горячий оффер", target: { kind: "none", nodeId: "n1" } },
        },
      ],
      inline: [
        { kind: "text", text: "email с шаблоном " },
        { kind: "tag", tag: { id: "tt1", label: "Горячий оффер", target: { kind: "none", nodeId: "n1" } } },
      ],
    },
    {
      id: "g2",
      label: "Средняя склонность",
      rows: [
        {
          nodeId: "n2",
          channel: "Push",
          templateTag: { id: "tt2", label: "не выбран", target: { kind: "none", nodeId: "n2" } },
        },
      ],
      inline: [
        { kind: "text", text: "push с шаблоном " },
        { kind: "tag", tag: { id: "tt2", label: "не выбран", target: { kind: "none", nodeId: "n2" } } },
      ],
    },
  ],
};

describe("коммуникации — инлайн-текст ветвей (форк-волны)", () => {
  it("рендерит канал и пилюлю шаблона инлайн, без таблицы и кнопки предпросмотра", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    // Пилюля шаблона в тексте ветки.
    expect(screen.getByText("Горячий оффер")).toBeTruthy();
    // Каналы и шаблоны — бегущий текст: ни таблицы, ни кнопки предпросмотра.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /предпросмотр/i })).toHaveLength(0);
  });

  // Имя канала идёт обычным текстом (строчными в потоке), рядом — пилюля
  // шаблона. Контент сообщения инлайн не рендерится (👁 убран): его смотрят
  // через поповер самой пилюли.
  it("канал — обычный текст рядом с пилюлей шаблона", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    expect(screen.getByText(/email с шаблоном/)).toBeTruthy();
    expect(screen.getByText(/push с шаблоном/)).toBeTruthy();
  });

  /**
   * Найдено глазами на живой карточке (ещё в табличной вёрстке): русские
   * имена шаблонов («Персональный оффер», «Push — возвращение») не влезали в
   * колонку и переносились ВНУТРИ пилюли — та вырастала в два ряда и
   * читалась крупным блоком-кнопкой, а не чипом строки. Механика усечения
   * (правка 4) — общее свойство ЛЮБОЙ пилюли, а не табличная особенность, и
   * остаётся в силе у пилюли строки текст-стори.
   */
  it("пилюля шаблона в строке усекается, а не переносится", () => {
    wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const label = screen.getByText("Горячий оффер");
    expect(label.className).toContain("truncate");
    // Без min-w-0 флекс-элемент не сжимается уже своего содержимого, и
    // усечение не срабатывает вовсе.
    expect(label.className).toContain("min-w-0");
    const pill = label.parentElement as HTMLElement;
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
  // усекается, но несёт ТЕ ЖЕ классы механики, что и пилюля строки выше —
  // раньше (при флаге `truncateLabel`) их у прозы не было вовсе.
  it("пилюля в прозе несёт ту же механику усечения, что и пилюля строки коммуникации", () => {
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

  // Вторая половина того же зафиксированного решения (первая — в
  // graph-description.test.ts): описание строку ОТДАЁТ, а рендер её РИСУЕТ —
  // без контента, но с каналом и кнопкой предпросмотра.
  it("ветка с нерезолвнутым шаблоном («не выбран») всё равно рисуется каналом", () => {
    const stage: DescriptionStage = {
      id: "fork-1",
      kind: "fork",
      block: "communication",
      heading: "Развилка по реакции",
      body: t("Аудитория делится на потоки:"),
      groups: [
        {
          id: "g1",
          label: "Высокая склонность",
          rows: [{ nodeId: "n-x", channel: "SMS" }],
          inline: [{ kind: "text", text: "SMS" }],
        },
      ],
    };
    wrap(<WorkflowDescription stages={[stage]} />);
    expect(screen.getByText(/SMS/)).toBeTruthy();
  });

  it("глиф ◈ скрыт от скринридера — озвучивается только название ветки", () => {
    const { container } = wrap(<WorkflowDescription stages={[GROUP_STAGE]} />);
    const label = container.querySelector("[data-testid='group-label']")!;
    const glyph = label.querySelector("[aria-hidden]");
    expect(glyph?.textContent).toContain("◈");
  });

  it("◈-подзаголовок стоит над каналами своей ветки", () => {
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

  it("ветка без метки не рисует ◈-подзаголовок", () => {
    const stage: DescriptionStage = {
      ...GROUP_STAGE,
      groups: [
        { id: "g", rows: GROUP_STAGE.groups![0].rows, inline: GROUP_STAGE.groups![0].inline },
      ],
    };
    const { container } = wrap(<WorkflowDescription stages={[stage]} />);
    expect(container.querySelector("[data-testid='group-label']")).toBeNull();
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
 * Покрытие `nodeTypeForTag` внутри строки коммуникации (Task 8 явно просит
 * его вернуть — прошлая задача сняла юнит-покрытие этой функции, т.к. живого
 * пути к ней не было; строка коммуникации — этот путь). Пилюля шаблона строки
 * (`target.kind:"template"`) красится под `NODE_STYLES` СВОЕГО канала — не
 * общим цветом, не нейтральным — подтверждаем на ДВУХ разных каналах в одной
 * группе, чтобы исключить совпадение по случайности/дефолту.
 */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("коммуникации — пилюля шаблона красится под цвет узла (nodeTypeForTag)", () => {
  it("email- и push-теги шаблонов в тексте красятся разными цветами своих каналов, а не нейтрально", () => {
    // Теги шаблонов вплетены инлайн в текст касания; цвет каждого — из
    // NODE_STYLES своего канала (nodeTypeForTag резолвит nodeType по nodeId).
    const stage: DescriptionStage = {
      id: "touch-1",
      kind: "touch",
      block: "communication",
      heading: "Первое касание",
      body: [
        { kind: "text", text: "email с шаблоном " },
        { kind: "tag", tag: { id: "tt-email", label: "Email — оффер", target: { kind: "template", nodeId: "n-email" } } },
        { kind: "text", text: " и push с шаблоном " },
        { kind: "tag", tag: { id: "tt-push", label: "Push — возвращение", target: { kind: "template", nodeId: "n-push" } } },
        { kind: "text", text: "." },
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
