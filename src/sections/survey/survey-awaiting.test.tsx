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

  // Fix round 1 (Task 3 review): `onDone` теперь может создавать кампанию
  // (CampaignWorkspace), а не только переключать локальную фазу анкеты —
  // поздний вызов после размонтирования больше не безобиден. Бар заполняется
  // интервалом; последний тик интервала ставит ТРЕЙЛИНГ-таймаут (200мс паузы)
  // и сам себя чистит (`clearInterval`) — но прежний cleanup эффекта чистил
  // только интервал, а id трейлинг-таймаута нигде не сохранялся и не
  // отменялся. Если компонент размонтируется ВНУТРИ этого 200-мс окна (форс-
  // ремонт визарда новым wizardSessionId, пока пользователь стоит на экране
  // «Создаём кампанию»), старый таймаут всё равно стрелял.
  it("размонтирование в 200-мс хвосте между заполнением бара и onDone — onDone не вызывается", () => {
    const onDone = vi.fn();
    const { unmount } = render(<SurveyAwaiting onDone={onDone} />);

    // Бар заполнен — интервал сам себя очистил и взвёл трейлинг-таймаут.
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(onDone).not.toHaveBeenCalled();

    unmount();

    // Докручиваем трейлинг-окно уже после размонтирования.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});
