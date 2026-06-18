import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AppSidebar } from "./app-sidebar";
import * as ctx from "@/state/app-state-context";
import { initialState } from "@/state/app-state";

function mockState(badge: boolean) {
  vi.spyOn(ctx, "useAppState").mockReturnValue({
    ...initialState,
    notifications: { signalsBadge: badge },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppSidebar — ready-artifact badge", () => {
  it("shows the badge on Артефакты when notifications.signalsBadge is true", () => {
    mockState(true);
    render(<AppSidebar activeNav="Кампании" />);
    expect(screen.getByLabelText("Есть новые артефакты")).toBeInTheDocument();
  });

  it("renders no badge when the flag is false", () => {
    mockState(false);
    render(<AppSidebar activeNav="Кампании" />);
    expect(
      screen.queryByLabelText("Есть новые артефакты")
    ).not.toBeInTheDocument();
  });

  it("does not put the badge on the Сигналы label (it no longer exists)", () => {
    mockState(true);
    render(<AppSidebar activeNav="Кампании" />);
    expect(
      screen.queryByLabelText("Есть новые сигналы")
    ).not.toBeInTheDocument();
  });
});
