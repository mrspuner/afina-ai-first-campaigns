// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { WorkflowNodeData } from "@/types/workflow";

const dispatch = vi.fn();
const removeChipsForNode = vi.fn();

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useUpdateNodeInternals: () => () => {},
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, style }: any) => (
      <div className={className} style={style}>{children}</div>
    ),
  },
}));
vi.mock("@/state/app-state-context", () => ({ useAppDispatch: () => dispatch }));
vi.mock("@/state/prompt-chips-context", () => ({
  usePromptChips: () => ({ removeChipsForNode }),
}));
vi.mock("./node-card-content", () => ({ NodeCardBody: () => null }));

import { WorkflowNodeComponent } from "./workflow-node";

function renderNode(data: WorkflowNodeData, selected = true) {
  const props = { id: "n1", data, selected } as unknown as React.ComponentProps<
    typeof WorkflowNodeComponent
  >;
  return render(<WorkflowNodeComponent {...props} />);
}

const sms: WorkflowNodeData = {
  label: "СМС",
  nodeType: "sms",
  params: { kind: "sms", text: "hi", alphaName: "A", scheduledAt: "immediate" },
};

describe("WorkflowNodeComponent — close removes node tags (spec B #2)", () => {
  beforeEach(() => {
    dispatch.mockClear();
    removeChipsForNode.mockClear();
  });

  it("X button deselects AND removes this node's chips", () => {
    renderNode(sms);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку ноды" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "workflow_node_deselected" });
    expect(removeChipsForNode).toHaveBeenCalledWith("n1");
  });
});
