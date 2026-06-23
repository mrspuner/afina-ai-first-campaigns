// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSaveTimeout } from "./use-save-timeout";

describe("useSaveTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("вызывает onTimeout через 10000мс когда active", () => {
    const onTimeout = vi.fn();
    renderHook(() => useSaveTimeout(true, "sigA", onTimeout));
    vi.advanceTimersByTime(9999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("не ставит таймер когда не active", () => {
    const onTimeout = vi.fn();
    renderHook(() => useSaveTimeout(false, "sigA", onTimeout));
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("сбрасывает таймер при смене resetKey (новая правка → новые 10с)", () => {
    const onTimeout = vi.fn();
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useSaveTimeout(true, key, onTimeout),
      { initialProps: { key: "sigA" } },
    );
    vi.advanceTimersByTime(7000);
    rerender({ key: "sigB" }); // новая правка
    vi.advanceTimersByTime(9999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("очищает таймер при unmount", () => {
    const onTimeout = vi.fn();
    const { unmount } = renderHook(() =>
      useSaveTimeout(true, "sigA", onTimeout),
    );
    vi.advanceTimersByTime(5000);
    unmount();
    vi.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
