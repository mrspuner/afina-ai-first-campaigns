import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatePreviewBody, TemplatePreviewDrawer } from "./template-preview-drawer";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider, useChat } from "@/state/chat-context";
import type { MessageTemplate } from "@/state/app-state";

const sms: MessageTemplate = {
  id: "t_sms",
  channel: "sms",
  name: "SMS — напоминание",
  content: {
    kind: "sms",
    text: "Ваше предложение ждёт. Подробности на сайте.",
    alphaName: "AFINA",
    scheduledAt: "immediate",
  },
  usedInCampaigns: 0,
};

const push: MessageTemplate = {
  id: "t_push",
  channel: "push",
  name: "Push — возвращение",
  content: { kind: "push", title: "Давно вас не видели", body: "Загляните" },
  usedInCampaigns: 0,
};

const email: MessageTemplate = {
  id: "t_email",
  channel: "email",
  name: "Email — приветствие",
  content: {
    kind: "email",
    subject: "Добро пожаловать! Начнём?",
    body: "Здравствуйте!",
    sender: "Афина <noreply@afina.ai>",
  },
  usedInCampaigns: 0,
};

const ivr: MessageTemplate = {
  id: "t_ivr",
  channel: "ivr",
  name: "Звонок — напоминание",
  content: {
    kind: "ivr",
    scenario:
      "Здравствуйте! Это звонок от Афины.\n\nМы напоминаем о вашей заявке — перезвоните нам, когда будет удобно.",
    voiceType: "female",
  },
  usedInCampaigns: 0,
};

describe("TemplatePreviewBody — routes by channel", () => {
  it("renders the SMS styled preview for an sms template", () => {
    render(<TemplatePreviewBody template={sms} />);
    expect(
      screen.getByText("Ваше предложение ждёт. Подробности на сайте."),
    ).toBeInTheDocument();
    expect(screen.getByText("AFINA")).toBeInTheDocument();
  });

  it("renders the Push styled preview for a push template", () => {
    render(<TemplatePreviewBody template={push} />);
    expect(screen.getByText("Давно вас не видели")).toBeInTheDocument();
    expect(screen.getByText("Загляните")).toBeInTheDocument();
  });

  it("renders the Email styled preview for an email template", () => {
    render(<TemplatePreviewBody template={email} />);
    expect(screen.getByText("Добро пожаловать! Начнём?")).toBeInTheDocument();
    // EmailRenderer prints the sender in the «От:» header line.
    expect(screen.getByText(/Афина <noreply@afina.ai>/)).toBeInTheDocument();
  });

  it("renders IVR as a full-text call-script panel (whole scenario, voice meta)", () => {
    render(<TemplatePreviewBody template={ivr} />);
    // The FULL script is shown — both the opening and the trailing line.
    const script = screen.getByText(/Здравствуйте! Это звонок от Афины\./);
    expect(script).toHaveTextContent("перезвоните нам, когда будет удобно");
    // Voice value is mapped to a human label.
    expect(screen.getByText(/Женский/)).toBeInTheDocument();
  });
});

/** Opens the preview drawer for a seeded template id (the eye-icon's effect). */
function Harness({ templateId }: { templateId: string }) {
  const chat = useChat();
  return (
    <button type="button" onClick={() => chat.openTemplatePreview(templateId)}>
      open
    </button>
  );
}

/** Opens the preview drawer for an INLINE template (the IVR node's eye — its
 *  scenario lives on the node, not in the templates library). */
function InlineHarness({ template }: { template: MessageTemplate }) {
  const chat = useChat();
  return (
    <button type="button" onClick={() => chat.openTemplatePreview(template)}>
      open
    </button>
  );
}

describe("TemplatePreviewDrawer (connected) — eye-icon wiring", () => {
  it("opens the drawer and shows the selected SMS template's message", () => {
    render(
      <AppStateProvider>
        <ChatProvider>
          <Harness templateId="tpl_sms_reminder" />
          <TemplatePreviewDrawer />
        </ChatProvider>
      </AppStateProvider>,
    );
    // Closed initially.
    expect(screen.queryByTestId("template-preview-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    // Drawer mounts and renders the seeded SMS template's message.
    expect(screen.getByTestId("template-preview-drawer")).toBeInTheDocument();
    expect(
      screen.getByText("Ваше предложение ждёт. Подробности на сайте."),
    ).toBeInTheDocument();
    // The channel-scoped header and a working close affordance are present.
    expect(screen.getByText(/Шаблон · SMS/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрыть" }),
    ).toBeInTheDocument();
  });

  it("opens the drawer for an inline IVR template (node scenario, not in library)", () => {
    render(
      <AppStateProvider>
        <ChatProvider>
          <InlineHarness template={ivr} />
          <TemplatePreviewDrawer />
        </ChatProvider>
      </AppStateProvider>,
    );
    expect(screen.queryByTestId("template-preview-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    const drawer = screen.getByTestId("template-preview-drawer");
    expect(drawer).toBeInTheDocument();
    // The inline template's own script renders via IvrRenderer — the id is NOT
    // in app-state.templates, proving the inline object is preferred.
    expect(screen.getByText(/Здравствуйте! Это звонок от Афины\./)).toBeInTheDocument();
    expect(screen.getByText(/Шаблон · Звонок/)).toBeInTheDocument();
    expect(screen.getByText(/Женский/)).toBeInTheDocument();
  });
});
