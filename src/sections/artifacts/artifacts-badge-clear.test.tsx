import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ArtifactsSection } from "./artifacts-section";
import * as ctx from "@/state/app-state-context";
import { initialState } from "@/state/app-state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ArtifactsSection — badge clear on open", () => {
  it("dispatches signals_badge_set:false on mount when the badge is set", () => {
    const dispatch = vi.fn();
    vi.spyOn(ctx, "useAppDispatch").mockReturnValue(dispatch);
    vi.spyOn(ctx, "useAppState").mockReturnValue({
      ...initialState,
      notifications: { signalsBadge: true },
    });

    render(<ArtifactsSection />);
    expect(dispatch).toHaveBeenCalledWith({
      type: "signals_badge_set",
      value: false,
    });
  });

  it("does not dispatch when the badge is already clear", () => {
    const dispatch = vi.fn();
    vi.spyOn(ctx, "useAppDispatch").mockReturnValue(dispatch);
    vi.spyOn(ctx, "useAppState").mockReturnValue({
      ...initialState,
      notifications: { signalsBadge: false },
    });

    render(<ArtifactsSection />);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
