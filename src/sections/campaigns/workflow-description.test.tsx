// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import { segmentsText, type DescriptionStage } from "@/state/graph-description";

/** Текстовый сегмент — короткий помощник, чтобы фикстура читалась как раньше. */
const t = (text: string) => [{ kind: "text" as const, text }];

const STAGES: DescriptionStage[] = [
  {
    id: "start",
    heading: "Старт.",
    body: t("Загруженная база попадает в кампанию и проходит скоринг."),
  },
  {
    id: "first-touch",
    heading: "Первое касание.",
    body: t("Аудитория делится на потоки, и каждому уходит своё сообщение:"),
    messages: [
      {
        channel: "SMS",
        templateName: "SMS — напоминание",
        text: "Ваше предложение ждёт. Подробности на сайте.",
      },
      {
        channel: "Email",
        subject: "Специальное предложение",
        text: "Мы подготовили для вас персональное предложение.",
      },
    ],
  },
  { id: "outcome", heading: "Итог.", body: t("Остальные завершают путь без конверсии.") },
];

describe("WorkflowDescription", () => {
  it("не рендерит ничего, если этапов нет", () => {
    const { container } = render(<WorkflowDescription stages={[]} />);
    expect(container.firstChild).toBeNull();
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
          heading: "Старт.",
          body: [
            { kind: "text", text: "Домены " },
            { kind: "tag", tag: { id: "domains", label: "a.ru, b.ru" } },
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
