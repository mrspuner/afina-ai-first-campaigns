import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeriodField } from "./period-field";
import type { Period } from "../statistics-state";

// base-ui Popover's positioner touches ResizeObserver — jsdom lacks it.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

function renderField(value: Period = { preset: "this-quarter" }) {
  return render(<PeriodField value={value} onChange={vi.fn()} />);
}

describe("PeriodField — period dropdown layout guard", () => {
  it("keeps each «name + date range» row on one line (whitespace-nowrap)", () => {
    renderField();
    // Open the popover (trigger label = current period).
    fireEvent.click(screen.getByRole("button", { name: /Этот квартал/ }));
    // A period row carries both its name and a date range — it must not wrap.
    const row = screen.getByRole("button", { name: /Прошлый квартал/ });
    expect(row).toHaveClass("whitespace-nowrap");
  });

  it("widens the popover panel so the longest row fits (w-80, not the default w-72)", () => {
    renderField();
    fireEvent.click(screen.getByRole("button", { name: /Этот квартал/ }));
    const panel = document.querySelector("[data-slot='popover-content']");
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass("w-80");
    expect(panel).not.toHaveClass("w-72");
  });
});
