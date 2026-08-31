import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { SurveyAwaiting } from "./survey-awaiting";

describe("SurveyAwaiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("по умолчанию завершается через 2400мс + 200мс паузы — анкета не затронута", () => {
    const onDone = vi.fn();
    render(<SurveyAwaiting onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("durationMs растягивает ожидание — на дефолтной отсечке ещё не готово", () => {
    const onDone = vi.fn();
    render(<SurveyAwaiting onDone={onDone} durationMs={4000} />);

    // Дефолтные 2400 + 200 прошли, но заказано 4000 — рано.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("footnote рендерится под прогрессом", () => {
    render(
      <SurveyAwaiting onDone={vi.fn()} footnote="Все кампании хранятся в разделе «Кампании»" />,
    );
    expect(
      screen.getByText("Все кампании хранятся в разделе «Кампании»"),
    ).toBeInTheDocument();
  });

  it("без footnote лишнего узла нет", () => {
    render(<SurveyAwaiting onDone={vi.fn()} />);
    expect(screen.queryByText(/хранятся в разделе/)).toBeNull();
  });
});
