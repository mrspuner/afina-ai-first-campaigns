import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtifactsSection } from "./artifacts-section";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";

function renderSection() {
  return render(
    <AppStateProvider>
      <ChatProvider>
        <ArtifactsSection />
      </ChatProvider>
    </AppStateProvider>,
  );
}

describe("ArtifactsSection", () => {
  it("renders Сигналы and Шаблоны tabs", () => {
    renderSection();
    const tabs = screen.getAllByRole("tab");
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toContain("Сигналы");
    expect(labels).toContain("Шаблоны");
  });

  it("shows the Шаблоны panel after activating the Шаблоны tab", () => {
    renderSection();
    fireEvent.click(screen.getByRole("tab", { name: "Шаблоны" }));
    // The Шаблоны tab lists seeded preset templates (channel badges).
    // Each card carries the grey «Использовано N раз» usage chip.
    expect(screen.getAllByText(/Использовано \d+ раз/).length).toBeGreaterThan(
      0,
    );
  });
});
