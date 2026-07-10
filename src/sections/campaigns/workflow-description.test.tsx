// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowDescription } from "./workflow-description";
import type { DescriptionStage } from "@/state/graph-description";

const STAGES: DescriptionStage[] = [
  {
    id: "start",
    heading: "Старт.",
    body: "Загруженная база попадает в кампанию и проходит скоринг.",
  },
  {
    id: "first-touch",
    heading: "Первое касание.",
    body: "Аудитория делится на потоки, и каждому уходит своё сообщение:",
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
  { id: "outcome", heading: "Итог.", body: "Остальные завершают путь без конверсии." },
];

const LATER = "Пока не могу применить правку — эта возможность появится позже.";

describe("WorkflowDescription — фазы правки", () => {
  it("во время работы модели размывает текст, показывает спиннер и «Отмена»", () => {
    render(<WorkflowDescription stages={STAGES} canEdit phase="working" />);
    expect(screen.getByText("Исправляю кампанию")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
    // Кнопка входа в правку на время работы уходит.
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
    expect(screen.getByTestId("description-body").className).toContain("blur");
  });

  it("на фазе вопросов держит блюр и отсылает в дровер", () => {
    render(<WorkflowDescription stages={STAGES} canEdit phase="asking" />);
    expect(screen.getByText(/посмотрите в открытом дровере/)).toBeTruthy();
    expect(screen.queryByText("Исправляю кампанию")).toBeNull();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
    expect(screen.getByTestId("description-body").className).toContain("blur");
  });

  it("в покое текст не размыт", () => {
    render(<WorkflowDescription stages={STAGES} canEdit phase="idle" />);
    expect(screen.getByTestId("description-body").className).not.toContain("blur");
  });

  it("«Отмена» на фазе работы зовёт onCancelEdit", () => {
    const onCancelEdit = vi.fn();
    render(
      <WorkflowDescription stages={STAGES} canEdit phase="working" onCancelEdit={onCancelEdit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("отправка правки уходит наружу через onSubmitEdit", () => {
    const onSubmitEdit = vi.fn();
    render(<WorkflowDescription stages={STAGES} canEdit onSubmitEdit={onSubmitEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByPlaceholderText("Что вы хотите исправить?"), {
      target: { value: "убери sms" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(onSubmitEdit).toHaveBeenCalledWith("убери sms");
  });

  it("показывает ошибку модели под кнопкой", () => {
    render(
      <WorkflowDescription
        stages={STAGES}
        canEdit
        error="Не удалось разобрать правку — попробуйте ещё раз."
      />,
    );
    expect(screen.getByText(/Не удалось разобрать правку/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Изменить" })).toBeTruthy();
  });
});

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
}

describe("WorkflowDescription — гейт правки", () => {
  it("показывает «Изменить», когда правка разрешена", () => {
    render(<WorkflowDescription stages={STAGES} canEdit />);
    expect(screen.getByRole("button", { name: "Изменить" })).toBeTruthy();
  });

  it("прячет «Изменить» у запущенной кампании", () => {
    render(<WorkflowDescription stages={STAGES} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
  });

  it("текст описания читается и без права правки", () => {
    render(<WorkflowDescription stages={STAGES} canEdit={false} />);
    expect(screen.getByText("Старт.")).toBeTruthy();
  });
});

describe("WorkflowDescription", () => {
  beforeEach(() => render(<WorkflowDescription stages={STAGES} canEdit />));

  describe("текст описания", () => {
    it("показывает подзаголовок и тело каждого этапа", () => {
      for (const stage of STAGES) {
        expect(screen.getByText(stage.heading)).toBeTruthy();
        expect(screen.getByText(stage.body)).toBeTruthy();
      }
    });

    it("называет канал, шаблон и текст сообщения", () => {
      const sms = screen.getByText(/Ваше предложение ждёт/).textContent ?? "";
      expect(sms).toContain("SMS");
      expect(sms).toContain("SMS — напоминание");
    });

    it("для письма без шаблона показывает тему вместо имени шаблона", () => {
      const email = screen.getByText(/персональное предложение/).textContent ?? "";
      expect(email).toContain("Email");
      expect(email).toContain("Специальное предложение");
      expect(email).not.toContain("шаблон");
    });

    it("не рендерит интерактивных элементов внутри самого описания", () => {
      // Единственная кнопка блока — «Изменить»; карточек нод и плашек нет.
      expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Изменить"]);
    });
  });

  describe("вход в правку", () => {
    it("по «Изменить» показывает инпут вместо кнопки", () => {
      openEditor();
      expect(screen.getByPlaceholderText("Что вы хотите исправить?")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
    });

    it("отправка сворачивает инпут — дальше ведёт фаза, а не инлайн-ответ", () => {
      openEditor();
      fireEvent.change(screen.getByPlaceholderText("Что вы хотите исправить?"), {
        target: { value: "убери sms" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
      // Старая инертная заглушка внутри карточки больше не показывается:
      // честный ответ приходит от ассистента в дровере.
      expect(screen.queryByText(LATER)).toBeNull();
    });

    it("не сохраняет введённый текст между открытиями", () => {
      openEditor();
      fireEvent.change(screen.getByPlaceholderText("Что вы хотите исправить?"), {
        target: { value: "убери sms" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
      openEditor();

      expect(screen.getByPlaceholderText<HTMLInputElement>("Что вы хотите исправить?").value).toBe("");
    });

    it("«Отмена» сворачивает инпут", () => {
      openEditor();
      fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
    });

    it("Escape сворачивает инпут", () => {
      openEditor();
      fireEvent.keyDown(screen.getByPlaceholderText("Что вы хотите исправить?"), {
        key: "Escape",
      });
      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
    });
  });
});

describe("WorkflowDescription — пустая отправка", () => {
  it("не зовёт onSubmitEdit и оставляет инпут открытым", () => {
    const onSubmitEdit = vi.fn();
    render(<WorkflowDescription stages={STAGES} canEdit onSubmitEdit={onSubmitEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(onSubmitEdit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Что вы хотите исправить?")).toBeTruthy();
  });
});
