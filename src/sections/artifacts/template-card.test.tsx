import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateCard } from "./template-card";
import type { MessageTemplate } from "@/state/app-state";
import { NODE_STYLES } from "@/sections/campaigns/node-visuals";

const sms: MessageTemplate = {
  id: "tpl_sms",
  channel: "sms",
  name: "SMS — напоминание",
  content: {
    kind: "sms",
    text: "Ваше предложение ждёт. Подробности на сайте.",
    alphaName: "AFINA",
    scheduledAt: "immediate",
  },
  usedInCampaigns: 3,
};

const email: MessageTemplate = {
  id: "tpl_email",
  channel: "email",
  name: "Email — приветствие",
  content: {
    kind: "email",
    subject: "Добро пожаловать в Afina",
    body: "Мы рады вас видеть",
    sender: "hello@afina.ru",
  },
  usedInCampaigns: 1,
};

function renderCard(
  template: MessageTemplate,
  over: Partial<React.ComponentProps<typeof TemplateCard>> = {},
) {
  const props = {
    template,
    onRename: vi.fn(),
    onPreview: vi.fn(),
    onDuplicate: vi.fn(),
    ...over,
  };
  return { ...render(<TemplateCard {...props} />), props };
}

describe("TemplateCard", () => {
  it("shows channel label, name and a grey usage chip «Использовано N раз»", () => {
    renderCard(sms);
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("Использовано 3 раза")).toBeInTheDocument();
  });

  it("usage chip is neutral/grey, not the accent or channel color", () => {
    const { container } = renderCard(sms);
    const usageChip = container.querySelector("[data-usage-chip]") as HTMLElement;
    expect(usageChip).not.toBeNull();
    expect(usageChip.textContent).toContain("Использовано 3 раза");
    const hexToRgb = (hex: string) =>
      `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    expect(usageChip.style.color).not.toBe(hexToRgb(NODE_STYLES.sms.color));
  });

  it("channel chip sits in the footer, not next to the title (#6)", () => {
    const { container } = renderCard(sms);
    const chip = container.querySelector("[data-channel='sms']");
    expect(chip).not.toBeNull();
    // The chip's parent (footer) must NOT contain the template name text.
    expect(chip!.parentElement!.textContent).not.toContain("SMS — напоминание");
  });

  it("channel chip has inline style derived from NODE_STYLES for the channel", () => {
    const { container } = renderCard(sms);
    const chip = container.querySelector("[data-channel='sms']") as HTMLElement;
    const hexToRgb = (hex: string) =>
      `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    expect(chip.style.color).toBe(hexToRgb(NODE_STYLES.sms.color));
  });

  it("нет отдельной кнопки «Предпросмотр» — вся карточка кликабельна (#4)", () => {
    renderCard(sms);
    expect(screen.queryByRole("button", { name: /Предпросмотр/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Письмо/i })).toBeNull();
  });

  it("клик по карточке зовёт onPreview(id) (#4)", () => {
    const onPreview = vi.fn();
    renderCard(sms, { onPreview });
    fireEvent.click(screen.getByText("SMS — напоминание"));
    expect(onPreview).toHaveBeenCalledWith("tpl_sms");
  });

  it("карандаш переименования спрятан до наведения (opacity-0) (#5)", () => {
    renderCard(sms);
    const pencil = screen.getByRole("button", { name: /Переименовать/i });
    expect(pencil.className).toContain("opacity-0");
    expect(pencil.className).toContain("group-hover/card:opacity-100");
  });

  it("enters rename mode via the pencil control and shows an input with the current name", () => {
    renderCard(sms);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    expect(input).toHaveValue("SMS — напоминание");
  });

  it("calls onRename with id and trimmed new name on Enter (не открывая предпросмотр)", () => {
    const onRename = vi.fn();
    const onPreview = vi.fn();
    renderCard(sms, { onRename, onPreview });
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    fireEvent.change(input, { target: { value: "  Новое  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("tpl_sms", "Новое");
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("cancels rename on Escape without calling onRename", () => {
    const onRename = vi.fn();
    renderCard(sms, { onRename });
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    fireEvent.change(input, { target: { value: "X" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
  });

  it("renders per-channel fields for sms: text and alpha-name", () => {
    renderCard(sms);
    expect(screen.getByText("Текст:")).toBeInTheDocument();
    expect(screen.getByText(/Ваше предложение ждёт/)).toBeInTheDocument();
    expect(screen.getByText("Альфа-имя:")).toBeInTheDocument();
    expect(screen.getByText("AFINA")).toBeInTheDocument();
  });

  it("письмо показывает две строки — Тема и Текст (#2)", () => {
    const emailWithBody: MessageTemplate = {
      ...email,
      content: {
        kind: "email",
        subject: "Тема письма для предпросмотра",
        body: "Здравствуйте! Это тело письма.",
        sender: "Афина <hello@afina.ru>",
      },
    };
    renderCard(emailWithBody);
    expect(screen.getByText("Тема:")).toBeInTheDocument();
    expect(screen.getByText("Тема письма для предпросмотра")).toBeInTheDocument();
    expect(screen.getByText("Текст:")).toBeInTheDocument();
    expect(screen.getByText("Здравствуйте! Это тело письма.")).toBeInTheDocument();
    // Нет старой кнопки-коробки «Письмо».
    expect(screen.queryByText("Письмо:")).toBeNull();
  });

  it("превью тела письма зажато line-clamp-2 (карточка компактна) (#2)", () => {
    const { container } = renderCard(email);
    const body = screen.getByText("Мы рады вас видеть");
    expect(body.className).toContain("line-clamp-2");
    expect(container.querySelector(".line-clamp-1")).toBeNull();
  });

  it("⋯-меню → «Дублировать» зовёт onDuplicate(id)", () => {
    const onDuplicate = vi.fn();
    renderCard(sms, { onDuplicate });
    fireEvent.click(screen.getByRole("button", { name: /Действия с шаблоном/i }));
    fireEvent.click(screen.getByText("Дублировать"));
    expect(onDuplicate).toHaveBeenCalledWith("tpl_sms");
  });

  it("renders a fields list for push channel", () => {
    const push: MessageTemplate = {
      id: "tpl_push",
      channel: "push",
      name: "Push",
      content: { kind: "push", title: "Заголовок", body: "Текст пуша" },
      usedInCampaigns: 0,
    };
    renderCard(push);
    expect(screen.getByText("Заголовок:")).toBeInTheDocument();
    expect(screen.getByText("Заголовок")).toBeInTheDocument();
    expect(screen.getByText("Текст:")).toBeInTheDocument();
    expect(screen.getByText("Текст пуша")).toBeInTheDocument();
  });

  it("renders a fields list for ivr channel", () => {
    const ivr: MessageTemplate = {
      id: "tpl_ivr",
      channel: "ivr",
      name: "IVR — звонок",
      content: { kind: "ivr", scenario: "auto_call_v2", voiceType: "female" },
      usedInCampaigns: 0,
    };
    renderCard(ivr);
    expect(screen.getByText("Сценарий:")).toBeInTheDocument();
    expect(screen.getByText("auto_call_v2")).toBeInTheDocument();
    expect(screen.getByText("Голос:")).toBeInTheDocument();
    expect(screen.getByText("female")).toBeInTheDocument();
  });
});
