import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/state/app-state-context";
import { useScreenHints } from "./use-screen-hints";
import type { SuggestionItem } from "@/state/suggestion-registry";

const ITEMS: SuggestionItem[] = [
  { id: "h1", label: "Вопрос 1", action: { kind: "ask", prompt: "q1?" } },
  { id: "h2", label: "Вопрос 2", action: { kind: "ask", prompt: "q2?" } },
];
const OTHER: SuggestionItem[] = [
  { id: "x1", label: "Другой", action: { kind: "ask", prompt: "x1?" } },
];

function Publisher({ items }: { items: SuggestionItem[] | null }) {
  useScreenHints(items);
  return null;
}

function Reader() {
  const { screenHints } = useAppState();
  return <span data-testid="hints">{screenHints.map((h) => h.id).join(",")}</span>;
}

function hintsText(): string {
  return screen.getByTestId("hints").textContent ?? "";
}

describe("useScreenHints", () => {
  it("publishes the declared items on mount", () => {
    render(
      <AppStateProvider>
        <Reader />
        <Publisher items={ITEMS} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("h1,h2");
  });

  it("re-publishes when the items' content changes", () => {
    const { rerender } = render(
      <AppStateProvider>
        <Reader />
        <Publisher items={ITEMS} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("h1,h2");

    rerender(
      <AppStateProvider>
        <Reader />
        <Publisher items={OTHER} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("x1");
  });

  it("clears the slice on unmount", () => {
    const { rerender } = render(
      <AppStateProvider>
        <Reader />
        <Publisher items={ITEMS} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("h1,h2");

    // Unmount the publisher only (reader stays so we can observe the slice).
    rerender(
      <AppStateProvider>
        <Reader />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("");
  });

  it("publishing null relinquishes ownership without leaving stale hints", () => {
    const { rerender } = render(
      <AppStateProvider>
        <Reader />
        <Publisher items={ITEMS} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("h1,h2");

    rerender(
      <AppStateProvider>
        <Reader />
        <Publisher items={null} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("");
  });

  it("an inactive (null) sibling does not clobber the active screen's hints", () => {
    // Mirrors the wizard scroll-column: one active publisher + one inactive.
    render(
      <AppStateProvider>
        <Reader />
        <Publisher items={null} />
        <Publisher items={ITEMS} />
      </AppStateProvider>
    );
    expect(hintsText()).toBe("h1,h2");
  });
});
