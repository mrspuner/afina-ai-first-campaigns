import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatesTabView, TemplatesTab } from "./templates-tab";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { TemplatePreviewDrawer } from "@/sections/campaigns/template-preview-drawer";
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

function renderView(over: Partial<React.ComponentProps<typeof TemplatesTabView>> = {}) {
  const props = {
    templates,
    onCreateManual: vi.fn(),
    onRename: vi.fn(),
    onPreview: vi.fn(),
    onDuplicate: vi.fn(),
    ...over,
  };
  return { ...render(<TemplatesTabView {...props} />), props };
}

describe("TemplatesTabView", () => {
  it("renders the empty state with a manual-create control when empty", () => {
    const onCreateManual = vi.fn();
    renderView({ templates: [], onCreateManual });
    expect(screen.getByText(/Пока нет шаблонов/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Создать шаблон вручную/i }),
    );
    expect(onCreateManual).toHaveBeenCalled();
  });

  it("renders one card per template plus a tab-level manual-create control", () => {
    renderView();
    expect(screen.getByText("SMS — напоминание")).toBeInTheDocument();
    expect(screen.getByText("Push — возвращение")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Создать шаблон вручную/i }),
    ).toBeInTheDocument();
  });

  it("клик по карточке зовёт onPreview с её id (#4)", () => {
    const onPreview = vi.fn();
    renderView({ onPreview });
    fireEvent.click(screen.getByText("SMS — напоминание"));
    expect(onPreview).toHaveBeenCalledWith("tpl_sms");
  });

  it("⋯ → «Дублировать» на карточке зовёт onDuplicate с её id", () => {
    const onDuplicate = vi.fn();
    renderView({ onDuplicate });
    const menus = screen.getAllByRole("button", { name: /Действия с шаблоном/i });
    fireEvent.click(menus[0]);
    fireEvent.click(screen.getByText("Дублировать"));
    expect(onDuplicate).toHaveBeenCalledWith("tpl_sms");
  });
});

describe("TemplatesTab (connected) — карточка открывает единый дровер", () => {
  it("клик по карточке монтирует превью-дровер шаблона (все каналы)", () => {
    render(
      <AppStateProvider>
        <ChatProvider>
          <TemplatesTab />
          <TemplatePreviewDrawer />
        </ChatProvider>
      </AppStateProvider>,
    );
    expect(screen.queryByTestId("template-preview-drawer")).toBeNull();
    // Клик по любой части карточки (чип «Использовано») → onPreview.
    fireEvent.click(screen.getAllByText(/Использовано/)[0]);
    expect(screen.getByTestId("template-preview-drawer")).toBeInTheDocument();
  });
});
