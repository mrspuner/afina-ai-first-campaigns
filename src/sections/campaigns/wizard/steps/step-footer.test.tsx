import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepFooter } from "./step-footer";

afterEach(cleanup);

describe("StepFooter — block-12 alignment rule", () => {
  it("uses a justify-between row so Назад pins left and the main button pins right", () => {
    const { container } = render(
      <StepFooter
        onBack={vi.fn()}
        onContinue={vi.fn()}
        continueLabel="Продолжить"
      />
    );
    const row = container.querySelector(".justify-between");
    expect(row).not.toBeNull();
    // Назад is the first interactive child (left), Продолжить the last (right).
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Назад");
    expect(buttons[buttons.length - 1]).toHaveTextContent("Продолжить");
  });

  it("keeps the main button right via a spacer when there is no Назад", () => {
    const { container } = render(
      <StepFooter onContinue={vi.fn()} continueLabel="Запустить" />
    );
    const row = container.querySelector(".justify-between");
    expect(row).not.toBeNull();
    // Only one button; an aria-hidden spacer holds the left slot.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Запустить");
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });
});
