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
  it("shows channel label, name and usage count", () => {
    render(<TemplateCard template={sms} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(
      screen.getByText(/Использован в кампаниях: 3/),
    ).toBeInTheDocument();
  });

  it("channel chip is on its own line (separate element from the title)", () => {
    const { container } = render(
      <TemplateCard template={sms} onUseInNewCampaign={vi.fn()} />,
    );
    const chip = container.querySelector("[data-channel='sms']");
    expect(chip).not.toBeNull();
    // The chip's parent should NOT contain the template name text
    expect(chip!.parentElement!.textContent).not.toContain("SMS — напоминание");
  });

  it("channel chip has inline style derived from NODE_STYLES for the channel", () => {
    const { container } = render(
      <TemplateCard template={sms} onUseInNewCampaign={vi.fn()} />,
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

  it("fires onUseInNewCampaign with the template id", () => {
    const onUse = vi.fn();
    render(<TemplateCard template={sms} onUseInNewCampaign={onUse} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Использовать в новой кампании/i }),
    );
    expect(onUse).toHaveBeenCalledWith("tpl_sms");
  });

  it("renders per-channel fields for sms: text and alpha-name", () => {
    render(<TemplateCard template={sms} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText("Текст:")).toBeInTheDocument();
    expect(
      screen.getByText(/Ваше предложение ждёт/),
    ).toBeInTheDocument();
    expect(screen.getByText("Альфа-имя:")).toBeInTheDocument();
    expect(screen.getByText("AFINA")).toBeInTheDocument();
  });

  it("renders per-channel fields for email: subject, body, sender", () => {
    render(<TemplateCard template={email} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText("Тема:")).toBeInTheDocument();
    expect(screen.getByText("Добро пожаловать в Afina")).toBeInTheDocument();
    expect(screen.getByText("Отправитель:")).toBeInTheDocument();
    expect(screen.getByText("hello@afina.ru")).toBeInTheDocument();
  });

  it("renders a fields list for push channel", () => {
    const push: MessageTemplate = {
      id: "tpl_push",
      channel: "push",
      name: "Push",
      content: { kind: "push", title: "Заголовок", body: "Текст пуша" },
      usedInCampaigns: 0,
    };
    render(<TemplateCard template={push} onUseInNewCampaign={vi.fn()} />);
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
    render(<TemplateCard template={ivr} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText("Сценарий:")).toBeInTheDocument();
    expect(screen.getByText("auto_call_v2")).toBeInTheDocument();
    expect(screen.getByText("Голос:")).toBeInTheDocument();
    expect(screen.getByText("female")).toBeInTheDocument();
  });
});
