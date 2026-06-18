import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateCard } from "./template-card";
import type { MessageTemplate } from "@/state/app-state";

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

describe("TemplateCard", () => {
  it("shows channel label, name, preview and usage count", () => {
    render(<TemplateCard template={sms} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(
      screen.getByText(/Ваше предложение ждёт/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Использован в кампаниях: 3/),
    ).toBeInTheDocument();
  });

  it("fires onUseInNewCampaign with the template id", () => {
    const onUse = vi.fn();
    render(<TemplateCard template={sms} onUseInNewCampaign={onUse} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Использовать в новой кампании/i }),
    );
    expect(onUse).toHaveBeenCalledWith("tpl_sms");
  });

  it("renders a preview for each channel kind", () => {
    const push: MessageTemplate = {
      id: "tpl_push",
      channel: "push",
      name: "Push",
      content: { kind: "push", title: "Заголовок", body: "Текст пуша" },
      usedInCampaigns: 0,
    };
    render(<TemplateCard template={push} onUseInNewCampaign={vi.fn()} />);
    expect(screen.getByText(/Заголовок/)).toBeInTheDocument();
    expect(screen.getByText(/Текст пуша/)).toBeInTheDocument();
  });
});
