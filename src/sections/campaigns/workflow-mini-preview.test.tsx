// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowMiniPreview } from "./workflow-mini-preview";
import type { WorkflowNode } from "@/types/workflow";
import type { CachedGraph } from "./workflow-graph-cache";

// Живой граф из кэша: одна узнаваемая нода с id "live-1".
const liveNode: WorkflowNode = {
  id: "live-1",
  type: "workflowNode",
  position: { x: 0, y: 0 },
  data: { label: "Сигнал", nodeType: "signal" },
};
const cached: CachedGraph = {
  nodes: [liveNode],
  edges: [],
};

vi.mock("./workflow-graph-cache", () => ({
  getCachedGraph: vi.fn(() => cached),
}));

// Перехватываем пропсы, переданные в WorkflowGraph.
const graphProps = vi.fn();
vi.mock("./workflow-graph", () => ({
  WorkflowGraph: (props: { nodes: unknown[] }) => {
    graphProps(props);
    return null;
  },
}));

describe("WorkflowMiniPreview", () => {
  it("рендерит граф из кэша (getCachedGraph), а не пересобирает шаблон", () => {
    render(
      <WorkflowMiniPreview campaignId="camp-1" signalType="Регистрация" />,
    );
    expect(graphProps).toHaveBeenCalled();
    const passed = graphProps.mock.calls[0][0] as { nodes: { id: string }[] };
    expect(passed.nodes).toHaveLength(1);
    expect(passed.nodes[0].id).toBe("live-1");
  });
});
