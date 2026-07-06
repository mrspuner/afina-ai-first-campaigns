// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SettingsEmptyState } from "./settings-empty-state";

afterEach(cleanup);

describe("SettingsEmptyState", () => {
  it("shows the onboarding prompt and calls onStart on the CTA", () => {
    const onStart = vi.fn();
    render(<SettingsEmptyState onStart={onStart} />);
    expect(
      screen.getByRole("heading", { name: "Расскажите о вашей компании" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Настроить с афиной" }),
    );
    expect(onStart).toHaveBeenCalled();
  });
});
