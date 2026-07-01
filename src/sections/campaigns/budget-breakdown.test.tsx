import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { BudgetBreakdown } from "./budget-breakdown";
import type { CommunicationGroups } from "./communication-breakdown";

afterEach(cleanup);

const cell = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

const multi: CommunicationGroups = {
  primary: [
    { channel: "sms", sum: 50_000 },
    { channel: "email", sum: 10_000 },
  ],
  repeat: [{ channel: "sms", sum: 15_000 }],
};

const single: CommunicationGroups = {
  primary: [{ channel: "sms", sum: 50_000 }],
  repeat: [{ channel: "sms", sum: 15_000 }],
};

const empty: CommunicationGroups = { primary: [], repeat: [] };

function renderBreakdown(over: Partial<React.ComponentProps<typeof BudgetBreakdown>> = {}) {
  return render(
    <BudgetBreakdown
      signalsDisplay="бесплатно"
      communicationDisplay="65 000 ₽"
      totalDisplay="65 000 ₽"
      commGroups={multi}
      formatCell={cell}
      {...over}
    />
  );
}

describe("BudgetBreakdown — merged «Сигналы» row", () => {
  it("renders a single «Сигналы» row with label + amount", () => {
    renderBreakdown({ signalsDisplay: "2 500 ₽" });
    expect(screen.getByText("Сигналы")).toBeTruthy();
    expect(screen.getByText("2 500 ₽")).toBeTruthy();
  });

  it("renders the optional signals hint when provided", () => {
    renderBreakdown({ signalsDisplay: "2 500 ₽", signalsHint: "уже оплачено" });
    expect(screen.getByText("уже оплачено")).toBeTruthy();
  });

  it("omits the hint when not provided", () => {
    renderBreakdown();
    expect(screen.queryByText("уже оплачено")).toBeNull();
  });
});

describe("BudgetBreakdown — collapsible «Коммуникации» table", () => {
  it("is collapsed by default: the table is hidden", () => {
    renderBreakdown();
    expect(screen.getByRole("button", { name: /Коммуникации/ })).toBeTruthy();
    // No table headers while collapsed.
    expect(screen.queryByText("Канал")).toBeNull();
    expect(screen.queryByText("Первичные")).toBeNull();
    expect(screen.queryByText("Повторные")).toBeNull();
  });

  it("clicking «Коммуникации» reveals the Канал | Первичные | Повторные | Итого table", () => {
    renderBreakdown();
    fireEvent.click(screen.getByRole("button", { name: /Коммуникации/ }));
    expect(screen.getByText("Канал")).toBeTruthy();
    expect(screen.getByText("Первичные")).toBeTruthy();
    expect(screen.getByText("Повторные")).toBeTruthy();
    // aria-expanded flips to true.
    expect(
      screen.getByRole("button", { name: /Коммуникации/ }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("clicking again collapses the table back", () => {
    renderBreakdown();
    const btn = screen.getByRole("button", { name: /Коммуникации/ });
    fireEvent.click(btn);
    expect(screen.getByText("Канал")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText("Канал")).toBeNull();
  });

  it("multi-channel → one row per channel with primary/repeat/total", () => {
    renderBreakdown({ commGroups: multi, defaultExpanded: true });
    const table = screen.getByRole("table");
    const body = table.querySelector("tbody")!;
    const bodyRows = body.querySelectorAll("tr");
    expect(bodyRows.length).toBe(2);
    // SMS row: primary 50 000, repeat 15 000, total 65 000.
    const smsRow = within(body).getByText("SMS").closest("tr")!;
    expect(smsRow.textContent).toContain(cell(50_000));
    expect(smsRow.textContent).toContain(cell(15_000));
    expect(smsRow.textContent).toContain(cell(65_000));
    // Email row present (second channel).
    expect(within(body).getByText("Email")).toBeTruthy();
  });

  it("single-channel → the SAME table with one channel row (no simplified variant)", () => {
    renderBreakdown({ commGroups: single, defaultExpanded: true });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Канал")).toBeTruthy();
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(1);
    expect(within(table).getByText("SMS")).toBeTruthy();
  });
});

describe("BudgetBreakdown — «Итого» row", () => {
  it("renders «Итого» with the total amount when communication exists", () => {
    renderBreakdown({ totalDisplay: "65 000 ₽" });
    expect(screen.getByText("Итого")).toBeTruthy();
  });

  it("the «Итого» amount is NOT yellow/brand-colored (foreground only)", () => {
    renderBreakdown({ totalDisplay: "65 000 ₽" });
    const total = screen.getByText("Итого").closest("div")!;
    expect(total.className).not.toMatch(/text-brand|text-\[#ffec00\]|text-yellow/i);
    expect(total.className).toContain("text-foreground");
  });
});

describe("BudgetBreakdown — no communication (empty channels)", () => {
  it("renders ONLY «Сигналы» — no «Коммуникации» row, no «Итого»", () => {
    renderBreakdown({ commGroups: empty });
    expect(screen.getByText("Сигналы")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Коммуникации/ })).toBeNull();
    expect(screen.queryByText("Коммуникации")).toBeNull();
    expect(screen.queryByText("Итого")).toBeNull();
  });

  it("treats null commGroups the same as empty (only «Сигналы»)", () => {
    renderBreakdown({ commGroups: null });
    expect(screen.getByText("Сигналы")).toBeTruthy();
    expect(screen.queryByText("Коммуникации")).toBeNull();
    expect(screen.queryByText("Итого")).toBeNull();
  });
});
