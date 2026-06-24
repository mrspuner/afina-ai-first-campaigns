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
  it("blocks submit when both fields are empty and shows the error", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    // Error is not shown before an invalid submit attempt.
    expect(
      screen.queryByText("Заполните хотя бы одно поле — сайт или задачу"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onSubmit).not.toHaveBeenCalled();
    // The exact validation error is surfaced (not the subtitle copy, which
    // also contains the words «опишите задачу»).
    expect(
      screen.getByText("Заполните хотя бы одно поле — сайт или задачу"),
    ).toBeInTheDocument();
  });

  it("submits task description with empty site when site field is left blank", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const textarea = screen.getByLabelText("Ваша задача");
    fireEvent.change(textarea, {
      target: { value: "Привлечь людей, которые ищут ипотеку" },
    });
    // Leave «Сайт компании» empty — site field is optional.
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as Survey;
    expect(submitted.taskDescription).toBe(
      "Привлечь людей, которые ищут ипотеку",
    );
    // Site is optional; empty string is expected, NOT the task text.
    expect(submitted.companyWebsite).toBe("");
  });

  it("submits both task description and site as distinct values when both are filled", () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const textarea = screen.getByLabelText("Ваша задача");
    fireEvent.change(textarea, {
      target: { value: "Привлечь клиентов на ипотеку" },
    });

    const siteInput = screen.getByLabelText("Сайт компании");
    fireEvent.change(siteInput, { target: { value: "example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as Survey;
    expect(submitted.taskDescription).toBe("Привлечь клиентов на ипотеку");
    expect(submitted.companyWebsite).toBe("example.com");
    // They must be distinct — site is NOT a copy of the task text.
    expect(submitted.companyWebsite).not.toBe(submitted.taskDescription);
  });
});
