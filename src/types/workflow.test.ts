import { describe, it, expect } from "vitest";
import { patchNodeParams, type NodeParams, type WorkflowNodeData } from "./workflow";
import type { WorkflowNodeType } from "./workflow";

it("source and scoring are valid node types", () => {
  const a: WorkflowNodeType = "source";
  const b: WorkflowNodeType = "scoring";
  expect([a, b]).toEqual(["source", "scoring"]);
});

type TestNode = { id: string; data: WorkflowNodeData };

describe("patchNodeParams", () => {
  it("updates params on matching node", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС",
          nodeType: "sms",
          params: { kind: "sms", text: "old", alphaName: "BRAND", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "new" } as Partial<NodeParams>);
    expect((result[0].data.params as { text: string }).text).toBe("new");
    expect((result[0].data.params as { alphaName: string }).alphaName).toBe("BRAND");
  });

  it("does not touch other nodes", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС 1",
          nodeType: "sms",
          params: { kind: "sms", text: "a", alphaName: "A", scheduledAt: "immediate" },
        },
      },
      {
        id: "n2",
        data: {
          label: "СМС 2",
          nodeType: "sms",
          params: { kind: "sms", text: "b", alphaName: "B", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "patched" } as Partial<NodeParams>);
    expect((result[1].data.params as { text: string }).text).toBe("b");
  });

  it("no-op on legacy node without params", () => {
    const nodes: TestNode[] = [
      { id: "n1", data: { label: "Legacy", nodeType: "default" } },
    ];
    const result = patchNodeParams(nodes, "n1", { text: "x" } as Partial<NodeParams>);
    expect(result[0].data.params).toBeUndefined();
  });

  it("no-op on unknown id", () => {
    const nodes: TestNode[] = [
      {
        id: "n1",
        data: {
          label: "СМС",
          nodeType: "sms",
          params: { kind: "sms", text: "old", alphaName: "A", scheduledAt: "immediate" },
        },
      },
    ];
    const result = patchNodeParams(nodes, "n999", { text: "new" } as Partial<NodeParams>);
    expect(result).toEqual(nodes);
  });
});
