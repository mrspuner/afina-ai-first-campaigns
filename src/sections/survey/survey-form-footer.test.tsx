import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SurveyForm } from "./survey-form";
import * as ctx from "@/state/app-state-context";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SurveyForm — block-12 footer rule", () => {
  it("uses a justify-between footer (not justify-end)", () => {
    vi.spyOn(ctx, "useAppDispatch").mockReturnValue(vi.fn());
    vi.spyOn(ctx, "useAppState").mockReturnValue({
      survey: { companyName: "", companyWebsite: "", directionId: null },
    } as never);

    render(<SurveyForm onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Продолжить" });
    // Footer is the submit button's parent row.
    const footer = submit.parentElement!;
    expect(footer.className).toContain("justify-between");
    expect(footer.className).not.toContain("justify-end");
  });
});
