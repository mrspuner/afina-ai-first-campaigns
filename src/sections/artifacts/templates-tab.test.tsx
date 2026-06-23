import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatesTabView } from "./templates-tab";
import type { MessageTemplate } from "@/state/app-state";

const templates: MessageTemplate[] = [
  {
    id: "tpl_sms",
    channel: "sms",
    name: "SMS — напоминание",
    content: {
      kind: "sms",
      text: "Привет",
      alphaName: "AFINA",
      scheduledAt: "immediate",
    },
    usedInCampaigns: 0,
  },
  {
    id: "tpl_push",
    channel: "push",
    name: "Push — возвращение",
    content: { kind: "push", title: "T", body: "B" },
    usedInCampaigns: 1,
  },
];

describe("TemplatesTabView", () => {
  it("renders the empty state with a manual-create control when empty", () => {
    const onCreateManual = vi.fn();
    render(
      <TemplatesTabView
        templates={[]}
        onCreateManual={onCreateManual}
      />,
    );
    expect(screen.getByText(/Пока нет шаблонов/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Создать шаблон вручную/i }),
    );
    expect(onCreateManual).toHaveBeenCalled();
  });

  it("renders one card per template plus a tab-level manual-create control", () => {
    render(
      <TemplatesTabView
        templates={templates}
        onCreateManual={vi.fn()}
      />,
    );
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("Push — возвращение")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Создать шаблон вручную/i }),
    ).toBeInTheDocument();
  });
});
