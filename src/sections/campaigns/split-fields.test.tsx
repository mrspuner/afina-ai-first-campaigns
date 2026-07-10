// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SplitFields } from "./split-fields";
import type { SplitParams } from "@/types/workflow";

vi.mock("@/state/split-segments", () => ({
  splitSegmentBranches: () => [],
  splitSummary: (p: SplitParams) =>
    p.by === "segment" ? "По сегменту · 4 веток" : `Поровну · ${p.branches}`,
}));
vi.mock("next/image", () => ({ default: () => null }));

const params: SplitParams = { kind: "split", by: "equal", branches: 2 };

describe("SplitFields — одна строка «Ветвление» (spec B #3)", () => {
  it("renders a single «Ветвление» AI affordance; click hands off to AI", () => {
    const onAiHandoff = vi.fn();
    const { getByLabelText, queryByLabelText } = render(
      <SplitFields params={params} readOnly={false} onAiHandoff={onAiHandoff} />
    );
    // Old two-row layout is gone.
    expect(queryByLabelText("Настроить «По» с помощью ИИ")).toBeNull();
    expect(queryByLabelText("Настроить «Ветки» с помощью ИИ")).toBeNull();
    getByLabelText("Настроить «Ветвление» с помощью ИИ").click();
    expect(onAiHandoff).toHaveBeenCalled();
  });

  it("summary comes from splitSummary (matches the node subtitle)", () => {
    const { getByText, rerender } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />
    );
    getByText("Поровну · 2");
    rerender(
      <SplitFields
        params={{ kind: "split", by: "segment", branches: 0 }}
        readOnly
        onAiHandoff={vi.fn()}
      />
    );
    getByText("По сегменту · 4 веток");
  });

  it("no affordance button in read-only", () => {
    const { queryByLabelText } = render(
      <SplitFields params={params} readOnly onAiHandoff={vi.fn()} />
    );
    expect(queryByLabelText("Настроить «Ветвление» с помощью ИИ")).toBeNull();
  });
});
