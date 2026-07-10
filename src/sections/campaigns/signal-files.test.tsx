// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { SignalParams } from "@/types/workflow";

const dispatch = vi.fn();
let mockState: {
  view: { kind: string; campaign?: { id: string; name: string } };
  artifacts: Array<{ id: string; campaignId: string; kind: string }>;
  campaigns: unknown[];
};

vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => mockState,
}));

import { SignalFiles } from "./signal-files";

describe("SignalFiles", () => {
  beforeEach(() => {
    dispatch.mockClear();
    mockState = {
      view: { kind: "workflow", campaign: { id: "c1", name: "C" } },
      artifacts: [{ id: "art_sig", campaignId: "c1", kind: "signals" }],
      campaigns: [],
    };
  });

  it("draft (empty files) → placeholder, no «Посмотреть все»", () => {
    const params: SignalParams = { kind: "signal", fileName: "", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } };
    const { getByText, queryByRole } = render(<SignalFiles params={params} />);
    expect(getByText("После запуска здесь появятся файлы сигналов")).not.toBeNull();
    expect(queryByRole("button", { name: "Посмотреть все" })).toBeNull();
  });

  it("launched (populated) → lists files + «Посмотреть все»", () => {
    const params: SignalParams = {
      kind: "signal", fileName: "s1.csv", count: 10,
      files: ["s1.csv", "s2.csv"],
      segments: { max: 0, high: 0, mid: 0, low: 0 },
    };
    const { getByText, getByRole } = render(<SignalFiles params={params} />);
    expect(getByText("s1.csv")).not.toBeNull();
    expect(getByText("s2.csv")).not.toBeNull();
    expect(getByRole("button", { name: "Посмотреть все" })).not.toBeNull();
  });

  it("«Посмотреть все» opens the campaign's signals artifact with origin campaign", () => {
    const params: SignalParams = {
      kind: "signal", fileName: "s1.csv", count: 10,
      files: ["s1.csv"],
      segments: { max: 0, high: 0, mid: 0, low: 0 },
    };
    const { getByRole } = render(<SignalFiles params={params} />);
    fireEvent.click(getByRole("button", { name: "Посмотреть все" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "artifact_opened",
      id: "art_sig",
      origin: "campaign",
    });
  });
});
