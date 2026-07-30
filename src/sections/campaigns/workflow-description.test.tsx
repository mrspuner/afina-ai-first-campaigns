// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import { segmentsText, type DescriptionStage } from "@/state/graph-description";

/** Текстовый сегмент — короткий помощник, чтобы фикстура читалась как раньше. */
const t = (text: string) => [{ kind: "text" as const, text }];

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

  it("заголовок шага — на своей строке, а не вклеен в абзац", () => {
    render(<WorkflowDescription stages={STAGES} />);
    const heading = screen.getByText("Скоринг базы");
    expect(heading.textContent).toBe("Скоринг базы");
    expect(screen.getByText("Загруженная база проходит скоринг.")).toBeTruthy();
  });

  it("показывает настройки старта парами «подпись — значение»", () => {
    render(<WorkflowDescription stages={STAGES} />);
    expect(screen.getByText("База")).toBeTruthy();
    expect(screen.getByText("186 255 строк")).toBeTruthy();
    expect(screen.getByText("Режим")).toBeTruthy();
  });

  it("шаг без настроек не рендерит пустой список", () => {
    const { container } = render(
      <WorkflowDescription stages={[{ id: "o", kind: "outcome", heading: "Итог", body: t("Всё.") }]} />,
    );
    expect(container.querySelector("[data-testid='stage-settings']")).toBeNull();
  });
});
