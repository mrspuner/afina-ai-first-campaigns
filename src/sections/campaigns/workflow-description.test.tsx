// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
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

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
}

describe("WorkflowDescription", () => {
  beforeEach(() => render(<WorkflowDescription stages={STAGES} />));

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

    it("отправка отвечает честным «появится позже» и сворачивает инпут", () => {
      openEditor();
      fireEvent.change(screen.getByPlaceholderText("Что вы хотите исправить?"), {
        target: { value: "убери sms" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

      expect(screen.getByText(LATER)).toBeTruthy();
      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
      expect(screen.getByRole("button", { name: "Изменить" })).toBeTruthy();
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

    it("«Отмена» сворачивает инпут без сообщения", () => {
      openEditor();
      fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
      expect(screen.queryByText(LATER)).toBeNull();
    });

    it("Escape сворачивает инпут без сообщения", () => {
      openEditor();
      fireEvent.keyDown(screen.getByPlaceholderText("Что вы хотите исправить?"), {
        key: "Escape",
      });

      expect(screen.queryByPlaceholderText("Что вы хотите исправить?")).toBeNull();
      expect(screen.queryByText(LATER)).toBeNull();
    });

    it("пустая отправка не выдаёт сообщение", () => {
      openEditor();
      fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

      expect(screen.queryByText(LATER)).toBeNull();
    });
  });
});
