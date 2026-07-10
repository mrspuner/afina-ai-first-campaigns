// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/state/app-state-context", () => ({ useAppDispatch: () => vi.fn() }));

import { WaitFields } from "./wait-fields";

describe("WaitFields — chevron affordance (spec B #4)", () => {
  it("mode + duration rows both show a chevron, no pencil", () => {
    const { container } = render(
      <WaitFields
        nodeId="n1"
        params={{ kind: "wait", mode: "duration", durationHours: 24 }}
        readOnly={false}
        onEventAiHandoff={vi.fn()}
      />
    );
    expect(container.querySelectorAll("svg.lucide-chevron-down")).toHaveLength(2);
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });
});
