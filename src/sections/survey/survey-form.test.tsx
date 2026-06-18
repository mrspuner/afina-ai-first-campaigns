// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { AppStateProvider } from "@/state/app-state-context";
import type { Survey } from "@/types/survey";

import { SurveyForm } from "./survey-form";

afterEach(cleanup);

function renderForm(onSubmit: (s: Survey) => void) {
  return render(
    <AppStateProvider>
      <SurveyForm onSubmit={onSubmit} />
    </AppStateProvider>,
  );
}

describe("SurveyForm", () => {
  it("blocks submit on empty description and shows an error", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onSubmit).not.toHaveBeenCalled();
    // The validation error is surfaced to the user.
    expect(screen.getByText(/опишите задачу/i)).toBeTruthy();
  });

  it("submits the typed task description into both fields", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const textarea = screen.getByLabelText("Ваша задача");
    fireEvent.change(textarea, {
      target: { value: "Привлечь людей, которые ищут ипотеку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as Survey;
    expect(submitted.taskDescription).toBe(
      "Привлечь людей, которые ищут ипотеку",
    );
    // Alias: frozen app-state reducer reads companyWebsite.
    expect(submitted.companyWebsite).toBe(submitted.taskDescription);
  });
});
