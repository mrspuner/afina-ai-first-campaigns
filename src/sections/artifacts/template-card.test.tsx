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

describe("TemplateCard", () => {
  it("shows channel label, name and a grey usage chip «Использовано N раз»", () => {
    render(<TemplateCard template={sms} onRename={vi.fn()} />);
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("Использовано 3 раза")).toBeInTheDocument();
  });

  it("usage chip is neutral/grey, not the accent or channel color", () => {
    const { container } = render(<TemplateCard template={sms} onRename={vi.fn()} />);
    const usageChip = container.querySelector(
      "[data-usage-chip]",
    ) as HTMLElement;
    expect(usageChip).not.toBeNull();
    expect(usageChip.textContent).toContain("Использовано 3 раза");
    // grey chip must NOT reuse the channel node color (sms accent)
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    expect(usageChip.style.color).not.toBe(hexToRgb(NODE_STYLES.sms.color));
  });

  it("channel chip is on its own line (separate element from the title)", () => {
    const { container } = render(
      <TemplateCard template={sms} onRename={vi.fn()} />,
    );
    const chip = container.querySelector("[data-channel='sms']");
    expect(chip).not.toBeNull();
    // The chip's parent should NOT contain the template name text
    expect(chip!.parentElement!.textContent).not.toContain("SMS — напоминание");
  });

  it("channel chip has inline style derived from NODE_STYLES for the channel", () => {
    const { container } = render(
      <TemplateCard template={sms} onRename={vi.fn()} />,
    );
    const chip = container.querySelector("[data-channel='sms']") as HTMLElement;
    expect(chip).not.toBeNull();
    // The chip should carry node-derived color styling
    const style = chip.style;
    expect(style.color).toBeTruthy();
    // The color should correspond to the sms node style.
    // jsdom converts hex colors to rgb() form in .style, so we compare via
    // a CSS-color-to-hex helper rather than direct hex comparison.
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    expect(style.color).toBe(hexToRgb(NODE_STYLES.sms.color));
  });

  it("does not render a «Использовать в новой кампании» action button", () => {
    render(<TemplateCard template={sms} onRename={vi.fn()} />);
    expect(
      screen.queryByRole("button", {
        name: /Использовать в новой кампании/i,
      }),
    ).toBeNull();
  });

  it("enters rename mode via the pencil control and shows an input with the current name", () => {
    render(<TemplateCard template={sms} onRename={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    expect(input).toHaveValue("SMS — напоминание");
  });

  it("calls onRename with id and trimmed new name on Enter", () => {
    const onRename = vi.fn();
    render(<TemplateCard template={sms} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    fireEvent.change(input, { target: { value: "  Новое  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("tpl_sms", "Новое");
  });

  it("cancels rename on Escape without calling onRename", () => {
    const onRename = vi.fn();
    render(<TemplateCard template={sms} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать/i }));
    const input = screen.getByRole("textbox", { name: /Название шаблона/i });
    fireEvent.change(input, { target: { value: "X" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
  });

  it("renders per-channel fields for sms: text and alpha-name", () => {
    render(<TemplateCard template={sms} onRename={vi.fn()} />);
    expect(screen.getByText("Текст:")).toBeInTheDocument();
    expect(
      screen.getByText(/Ваше предложение ждёт/),
    ).toBeInTheDocument();
    expect(screen.getByText("Альфа-имя:")).toBeInTheDocument();
    expect(screen.getByText("AFINA")).toBeInTheDocument();
  });

  it("does not truncate a long field value with line-clamp-1 (#29)", () => {
    const longText =
      "Очень длинный текст сообщения, который раньше обрезался по одной " +
      "строке line-clamp-1, а теперь должен показываться полностью без усечения.";
    const longSms: MessageTemplate = {
      ...sms,
      content: {
        ...sms.content,
        kind: "sms",
        text: longText,
      } as MessageTemplate["content"],
    };
    const { container } = render(
      <TemplateCard template={longSms} onRename={vi.fn()} />,
    );
    // The full value must be present in the DOM…
    const valueEl = screen.getByText(longText);
    expect(valueEl).toBeInTheDocument();
    // …and rendered without the line-clamp-1 truncation class anywhere.
    expect(container.querySelector(".line-clamp-1")).toBeNull();
    expect(valueEl.className).not.toContain("line-clamp-1");
  });

  it("renders email as a compact «Письмо» field (no inline letter card) and opens it on click (#32)", () => {
    const onOpenEmail = vi.fn();
    const emailWithBody: MessageTemplate = {
      ...email,
      content: {
        kind: "email",
        subject: "Тема письма для предпросмотра",
        body:
          "Здравствуйте!\n\n" +
          "Это первый содержательный абзац письма.\n\n" +
          "А это второй абзац.",
        sender: "Афина <hello@afina.ru>",
        link: "https://example.com/cta",
      },
    };
    const { container } = render(
      <TemplateCard
        template={emailWithBody}
        onRename={vi.fn()}
        onOpenEmail={onOpenEmail}
      />,
    );

    // A compact field labelled «Письмо» is shown…
    expect(screen.getByText("Письмо:")).toBeInTheDocument();
    // …surfacing the subject as the value.
    expect(
      screen.getByText("Тема письма для предпросмотра"),
    ).toBeInTheDocument();

    // The inline letter card is GONE: body paragraphs are NOT rendered inline.
    expect(screen.queryByText(/первый содержательный абзац/)).toBeNull();
    expect(screen.queryByText(/второй абзац/)).toBeNull();
    const paragraphs = Array.from(container.querySelectorAll("p")).filter(
      (p) =>
        p.textContent?.includes("первый содержательный") ||
        p.textContent?.includes("второй абзац"),
    );
    expect(paragraphs.length).toBe(0);

    // Clicking the «Письмо» field opens the email with the template content.
    fireEvent.click(screen.getByRole("button", { name: /Письмо/i }));
    expect(onOpenEmail).toHaveBeenCalledTimes(1);
    expect(onOpenEmail).toHaveBeenCalledWith(emailWithBody.content);
  });

  it("renders a fields list for push channel", () => {
    const push: MessageTemplate = {
      id: "tpl_push",
      channel: "push",
      name: "Push",
      content: { kind: "push", title: "Заголовок", body: "Текст пуша" },
      usedInCampaigns: 0,
    };
    render(<TemplateCard template={push} onRename={vi.fn()} />);
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
    render(<TemplateCard template={ivr} onRename={vi.fn()} />);
    expect(screen.getByText("Сценарий:")).toBeInTheDocument();
    expect(screen.getByText("auto_call_v2")).toBeInTheDocument();
    expect(screen.getByText("Голос:")).toBeInTheDocument();
    expect(screen.getByText("female")).toBeInTheDocument();
  });
});
