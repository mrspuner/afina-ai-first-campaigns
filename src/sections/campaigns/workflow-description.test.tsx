// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import { segmentsText, type DescriptionStage } from "@/state/graph-description";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";

/** Текстовый сегмент — короткий помощник, чтобы фикстура читалась как раньше. */
const t = (text: string) => [{ kind: "text" as const, text }];

// ВНИМАНИЕ (Task 5 → Task 7/8): поле `DescriptionStage.messages` снято — строки
// коммуникаций живут в `groups[].rows` (`DescriptionCommunication`), а рендерит
// их таблицей Task 8. Из фикстур ниже `messages:` вычищено механически, чтобы
// файл собирался и `tsc` снова показывал только предсуществующие ошибки; сами
// утверждения про строки сообщений оставлены КРАСНЫМИ намеренно — они и есть
// список того, что Task 8 обязана вернуть уже на таблице.

const STAGES: DescriptionStage[] = [
  {
    id: "start",
    kind: "start",
    heading: "Старт.",
    body: t("Загруженная база попадает в кампанию и проходит скоринг."),
  },
  {
    id: "first-touch",
    kind: "touch",
    heading: "Первое касание.",
    body: t("Аудитория делится на потоки, и каждому уходит своё сообщение:"),
  },
  { id: "outcome", kind: "outcome", heading: "Итог.", body: t("Остальные завершают путь без конверсии.") },
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

    it("называет канал, шаблон и текст сообщения", () => {
      render(<WorkflowDescription stages={STAGES} />);
      const sms = screen.getByText(/Ваше предложение ждёт/).textContent ?? "";
      expect(sms).toContain("SMS");
      expect(sms).toContain("SMS — напоминание");
    });

    it("для письма без шаблона показывает тему вместо имени шаблона", () => {
      render(<WorkflowDescription stages={STAGES} />);
      const email = screen.getByText(/персональное предложение/).textContent ?? "";
      expect(email).toContain("Email");
      expect(email).toContain("Специальное предложение");
      expect(email).not.toContain("шаблон");
    });

    it("не рендерит никаких интерактивных элементов — компонент чисто презентационный", () => {
      render(<WorkflowDescription stages={STAGES} />);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    // Все STAGES выше — однoсегментные, поэтому ни один тест ещё не проверял
    // тело из НЕСКОЛЬКИХ сегментов (ровно форма шва судьбы доменов, которую
    // Task 4 заполнит тегом). Сегменты рендерятся как соседние <span>, поэтому
    // у React нет ни одного текстового узла с полным текстом — getByText(fullString)
    // здесь не найдёт ничего, и это ловушка для Task 4/5. Проверяем через
    // textContent параграфа, а не getByText — это рабочий паттерн для тех задач.
    it("несколько сегментов body (текст+тег+текст) склеиваются в один textContent", () => {
      const stages: DescriptionStage[] = [
        {
          id: "start",
          kind: "start",
          heading: "Старт.",
          body: [
            { kind: "text", text: "Домены " },
            { kind: "tag", tag: { id: "domains", label: "a.ru, b.ru", target: { kind: "domains" } } },
            { kind: "text", text: " отправлены на модерацию." },
          ],
        },
      ];

      const { container } = render(<WorkflowDescription stages={stages} />);
      const p = container.querySelector("p")!;
      expect(p.textContent).toBe("Старт. Домены a.ru, b.ru отправлены на модерацию.");

      // Ловушка задокументирована: getByText на полную склеенную строку не
      // находит ничего, потому что текст разбит по нескольким <span>.
      expect(
        screen.queryByText("Домены a.ru, b.ru отправлены на модерацию."),
      ).not.toBeInTheDocument();
    });
  });
});

describe("WorkflowDescription — stageSlots (нодо-блоки под конкретным этапом)", () => {
  it("рендерит слот сразу под текстом своего этапа, а не после всего описания", () => {
    render(
      <WorkflowDescription
        stages={STAGES}
        stageSlots={{ start: <div data-testid="start-slot">блок старта</div> }}
      />,
    );
    const start = screen.getByText("Старт.");
    const slot = screen.getByTestId("start-slot");
    const firstTouch = screen.getByText("Первое касание.");

    expect(
      start.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      slot.compareDocumentPosition(firstTouch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("не рендерит ничего для этапа без слота в карте", () => {
    render(
      <WorkflowDescription
        stages={STAGES}
        stageSlots={{ start: <div data-testid="start-slot" /> }}
      />,
    );
    expect(screen.queryByTestId("outcome-slot")).not.toBeInTheDocument();
  });

  it("без stageSlots поведение не меняется (пусто по умолчанию)", () => {
    render(<WorkflowDescription stages={STAGES} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("WorkflowDescription — nodeTypes для пилюль template/node-fields (Task 6)", () => {
  // Тег сам по себе не несёт тип ноды (Task 5) — без лукапа пилюли template/
  // node-fields падают на нейтральный серый (пробел, который эти тесты
  // закрывают). Фикстура — тег шаблона внутри сообщения «Первого касания»,
  // тот же путь, что реально использует CampaignScreen.
  //
  // Task 7 — тег с target.kind:"template" и резолвнутым nodeType открывает
  // свой собственный поповер (список шаблонов канала), который тянет
  // app-state.templates и useChat() изнутри DescriptionTagPill; без этих
  // провайдеров рендер падает. WorkflowDescription сама остаётся presentational
  // (провайдеры нужны листовому попап-компоненту, не ей), но тест оборачивает
  // рендер, раз реальное дерево (CampaignScreen) их уже даёт.
  function renderWithProviders(node: ReactElement) {
    return render(
      <AppStateProvider>
        <ChatProvider>{node}</ChatProvider>
      </AppStateProvider>,
    );
  }

  const stagesWithTemplateTag: DescriptionStage[] = [
    {
      id: "first-touch",
      kind: "touch",
      heading: "Первое касание.",
      body: t("Первое сообщение:"),
    },
  ];

  it("красит пилюлю шаблона под её nodeType, когда передан лукап nodeId→nodeType", () => {
    renderWithProviders(
      <WorkflowDescription
        stages={stagesWithTemplateTag}
        nodeTypes={new Map([["n1", "sms"]])}
      />,
    );
    const pill = screen.getByRole("button", { name: "SMS — шаблон" });
    // Нейтральный класс уходит — цвет теперь несёт inline style из NODE_STYLES.
    expect(pill.className).not.toContain("border-border");
  });

  it("без лукапа (или без совпадения id) пилюля остаётся нейтральной", () => {
    render(<WorkflowDescription stages={stagesWithTemplateTag} />);
    const pill = screen.getByRole("button", { name: "SMS — шаблон" });
    expect(pill.className).toContain("border-border");
  });

  it("nodeType резолвится и после демоции (none + nodeId) — иконка шаблона не пропадает", () => {
    // fix round 2, Finding 2: demoted template/node-fields tags carry nodeId
    // on the `none` target itself — nodeTypeForTag must follow it there too.
    const demoted: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    render(<WorkflowDescription stages={demoted} nodeTypes={new Map([["n1", "sms"]])} />);
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("SMS — шаблон").parentElement!;
    expect(pill.querySelector("svg")).not.toBeNull();
  });
});

describe("WorkflowDescription — пилюля шаблона рендерится ВСЕГДА, даже нерезолвнутая (баг: без неё нельзя было сменить шаблон)", () => {
  function renderWithProviders(node: ReactElement) {
    return render(
      <AppStateProvider>
        <ChatProvider>{node}</ChatProvider>
      </AppStateProvider>,
    );
  }

  it("нерезолвнутый шаблон (label «не выбран») рендерит пилюлю рядом со словом «шаблон»", () => {
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    renderWithProviders(
      <WorkflowDescription stages={stages} nodeTypes={new Map([["n1", "ivr"]])} />,
    );
    const pill = screen.getByRole("button", { name: "не выбран" });
    const li = pill.closest("li")!;
    expect(li.textContent).toBe(
      "— Звонок, шаблон не выбран: «Свой сценарий звонка.»",
    );
  });

  it("email нерезолвнутый: показывает И тему, И пилюлю «не выбран» — информация о теме не теряется", () => {
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    renderWithProviders(
      <WorkflowDescription stages={stages} nodeTypes={new Map([["n2", "email"]])} />,
    );
    const pill = screen.getByRole("button", { name: "не выбран" });
    const li = pill.closest("li")!;
    expect(li.textContent).toBe(
      "— Email, тема «Специальное предложение», шаблон не выбран: «Мы подготовили для вас персональное предложение.»",
    );
  });

  it("резолвнутый шаблон НЕ дублирует тему, даже если subject тоже задан (защитная проверка)", () => {
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    renderWithProviders(
      <WorkflowDescription stages={stages} nodeTypes={new Map([["n3", "email"]])} />,
    );
    const pill = screen.getByRole("button", { name: "Персональный оффер" });
    const li = pill.closest("li")!;
    expect(li.textContent).not.toContain("тема");
    expect(li.textContent).toBe("— Email, шаблон Персональный оффер: «Текст письма.»");
  });

  it("демотированная (none) нерезолвнутая пилюля остаётся видимой как «не выбран», но без клика (§2.12)", () => {
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    render(<WorkflowDescription stages={stages} nodeTypes={new Map([["n4", "ivr"]])} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("не выбран")).toBeInTheDocument();
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

  it("двоеточие в списке сообщений: пул-бэк только когда перед ним пилюля (templateTag)", () => {
    // fix round 3: тот же дефект, что Finding 1, но в другой разметке — «:
    // «текст»» в списке сообщений литерал, а не сегмент stage.body, поэтому
    // punctuationPullBack его не видит. Двоеточие после РЕЗОЛВНУТОГО шаблона
    // (templateTag → пилюля) должно получить тот же класс; фолбэк на
    // qualifierText (обычный текст, «шаблон «Имя»») — натуральный интервал.
    const stages: DescriptionStage[] = [
      {
        id: "first-touch",
        kind: "touch",
        heading: "Первое касание.",
        body: t("Первое сообщение:"),
      },
    ];
    render(<WorkflowDescription stages={stages} />);

    const withTag = screen.getByText(/Привет!/);
    expect(withTag.className).toContain("-ml-[5px]");

    const withoutTag = screen.getByText(/Другое письмо/);
    expect(withoutTag.className).toBe("");
  });
});
