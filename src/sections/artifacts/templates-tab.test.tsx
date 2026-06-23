import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatesTabView, TemplatesTab } from "./templates-tab";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { EmailEditorPanel } from "@/sections/campaigns/email-editor-panel";
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
        onRename={vi.fn()}
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
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("Push — возвращение")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Создать шаблон вручную/i }),
    ).toBeInTheDocument();
  });

  it("threads onOpenEmail down to an email card and calls it with the content (#32)", () => {
    const onOpenEmail = vi.fn();
    const emailTemplate: MessageTemplate = {
      id: "tpl_email",
      channel: "email",
      name: "Email — приветствие",
      content: {
        kind: "email",
        subject: "Добро пожаловать",
        body: "Текст",
        sender: "hello@afina.ru",
      },
      usedInCampaigns: 0,
    };
    render(
      <TemplatesTabView
        templates={[emailTemplate]}
        onCreateManual={vi.fn()}
        onRename={vi.fn()}
        onOpenEmail={onOpenEmail}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Письмо/i }));
    expect(onOpenEmail).toHaveBeenCalledWith(emailTemplate.content);
  });
});

describe("TemplatesTab (connected) — opens email in the side drawer (#32)", () => {
  it("opens a seeded email template in the read-only preview drawer on «Письмо» click", () => {
    render(
      <AppStateProvider>
        <ChatProvider>
          <TemplatesTab />
          <EmailEditorPanel />
        </ChatProvider>
      </AppStateProvider>,
    );
    // Click the first «Письмо» field (seeded email templates come first).
    const fields = screen.getAllByRole("button", { name: /Письмо/i });
    expect(fields.length).toBeGreaterThan(0);
    fireEvent.click(fields[0]);
    // The side drawer mounts…
    expect(screen.getByTestId("email-editor-panel")).toBeInTheDocument();
    // …in read-only preview mode: no «Сохранить» button.
    expect(
      screen.queryByRole("button", { name: "Сохранить" }),
    ).toBeNull();
  });
});
