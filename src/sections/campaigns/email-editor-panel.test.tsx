import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmailEditorPanel } from "./email-editor-panel";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider, useChat } from "@/state/chat-context";
import type { EmailDraft } from "@/state/email-directory";

const draft: EmailDraft = {
  id: "preview",
  name: "Письмо",
  subject: "Тема письма",
  body: "Здравствуйте!\n\nВторой абзац письма.",
  sender: "hello@afina.ru",
  link: "https://example.com",
  cta: "Перейти",
  showCta: true,
  showImage: false,
};

/** Renders a button that opens the email editor with a given preview flag. */
function Harness({ preview }: { preview: boolean }) {
  const chat = useChat();
  return (
    <button
      type="button"
      onClick={() => chat.openEmailEditor("", { draft, preview })}
    >
      open
    </button>
  );
}

function renderPanel(preview: boolean) {
  return render(
    <AppStateProvider>
      <ChatProvider>
        <Harness preview={preview} />
        <EmailEditorPanel />
      </ChatProvider>
    </AppStateProvider>,
  );
}

describe("EmailEditorPanel — preview mode (#32)", () => {
  it("opens read-only with no «Сохранить» button when preview is true", () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    // The panel content is visible…
    expect(screen.getByTestId("email-editor-panel")).toBeInTheDocument();
    // …but the save action is hidden in read-only preview mode.
    expect(
      screen.queryByRole("button", { name: "Сохранить" }),
    ).toBeNull();
    // Block toolbar toggles are hidden too.
    expect(screen.queryByRole("button", { name: "Кнопка" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Картинка" })).toBeNull();
  });

  it("has no «Сохранить» — «Готово» applies-and-closes in edit mode (#7)", () => {
    renderPanel(false);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    // «Сохранить» убрана: изменения применяются автоматически при закрытии.
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Готово" }),
    ).toBeInTheDocument();
  });
});
