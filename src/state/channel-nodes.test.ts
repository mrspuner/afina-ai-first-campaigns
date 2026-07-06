import { describe, it, expect } from "vitest";
import {
  CHANNEL_NODE_MAP,
  buildChannelBlock,
  buildCommUnit,
  type Channel,
} from "./channel-nodes";

describe("CHANNEL_NODE_MAP", () => {
  it("covers all 4 channels", () => {
    const channels: Channel[] = ["sms", "email", "push", "ivr"];
    for (const ch of channels) {
      expect(CHANNEL_NODE_MAP[ch]).toBeDefined();
      expect(CHANNEL_NODE_MAP[ch].label).toBeTruthy();
      expect(CHANNEL_NODE_MAP[ch].color).toBeTruthy();
    }
  });

  it("each entry has defaultParams with kind matching channel", () => {
    const channels: Channel[] = ["sms", "email", "push", "ivr"];
    for (const ch of channels) {
      expect(CHANNEL_NODE_MAP[ch].defaultParams.kind).toBe(ch);
    }
  });
});

describe("buildChannelBlock", () => {
  it("creates split→channels with NO merge for multiple channels", () => {
    const { nodes, edges, exitIds } = buildChannelBlock(["sms", "email"], "comm1");
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain("comm1_split");
    expect(ids).toContain("comm1_sms");
    expect(ids).toContain("comm1_email");
    // Слияние удалено — каналы становятся выходами блока.
    expect(ids).not.toContain("comm1_merge");
    // split→sms, split→email only
    expect(edges.length).toBe(2);
    // each channel node is an exit
    expect(exitIds).toEqual(["comm1_sms", "comm1_email"]);
  });

  it("creates single node (no split/merge) for one channel", () => {
    const { nodes, edges } = buildChannelBlock(["push"], "comm2");
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain("comm2_push");
    expect(ids).not.toContain("comm2_split");
    expect(ids).not.toContain("comm2_merge");
    // no edges within a single-channel block
    expect(edges.length).toBe(0);
  });

  it("creates 4-channel block (sms, email, push, ivr)", () => {
    const { nodes, edges } = buildChannelBlock(["sms", "email", "push", "ivr"], "comm3");
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain("comm3_split");
    expect(ids).toContain("comm3_sms");
    expect(ids).toContain("comm3_email");
    expect(ids).toContain("comm3_push");
    expect(ids).toContain("comm3_ivr");
    expect(ids).not.toContain("comm3_merge");
    // split→4 channels only = 4 edges
    expect(edges.length).toBe(4);
  });

  it("node IDs are deterministic and prefixed", () => {
    const { nodes } = buildChannelBlock(["sms", "email"], "test");
    for (const node of nodes) {
      expect(node.id.startsWith("test_")).toBe(true);
    }
  });

  it("uses default prefix 'comm' when no prefix given", () => {
    const { nodes } = buildChannelBlock(["sms"], undefined);
    expect(nodes[0].id.startsWith("comm_")).toBe(true);
  });

  it("channel nodes have correct nodeType and params", () => {
    const { nodes } = buildChannelBlock(["sms", "email"], "x");
    const smsNode = nodes.find((n) => n.id === "x_sms");
    const emailNode = nodes.find((n) => n.id === "x_email");
    expect(smsNode?.data.nodeType).toBe("sms");
    expect(smsNode?.data.params?.kind).toBe("sms");
    expect(emailNode?.data.nodeType).toBe("email");
    expect(emailNode?.data.params?.kind).toBe("email");
  });
});

describe("buildCommUnit", () => {
  it("includes channel block, two conditions, and an end node for single channel", () => {
    const { nodes } = buildCommUnit(["sms"], { prefix: "unit1", onEngaged: "success", onExhausted: "end" });
    const types = nodes.map((n) => n.data.nodeType);
    expect(types).toContain("sms");
    expect(types.filter((t) => t === "condition").length).toBe(2);
  });

  it("includes split (no merge) for multiple channels", () => {
    const { nodes, edges } = buildCommUnit(["sms", "email"], { prefix: "unit2", onEngaged: "success", onExhausted: "end" });
    const types = nodes.map((n) => n.data.nodeType);
    expect(types).toContain("split");
    expect(types).not.toContain("merge");
    expect(types.filter((t) => t === "condition").length).toBe(2);
    // both channel nodes converge directly into the first condition
    const intoCond1 = edges.filter((e) => e.target === "unit2_cond").map((e) => e.source).sort();
    expect(intoCond1).toEqual(["unit2_email", "unit2_sms"]);
  });

  it("has two channel blocks (original + repeat)", () => {
    const { nodes } = buildCommUnit(["sms"], { prefix: "unit3", onEngaged: "success", onExhausted: "end" });
    // Both 'unit3_sms' (first block) and 'unit3_repeat_sms' (repeat block)
    const smsNodes = nodes.filter((n) => n.data.nodeType === "sms");
    expect(smsNodes.length).toBe(2);
  });

  it("includes a wait node between first NO branch and repeat", () => {
    const { nodes } = buildCommUnit(["sms"], { prefix: "unit4", onEngaged: "success", onExhausted: "end" });
    const types = nodes.map((n) => n.data.nodeType);
    expect(types).toContain("wait");
  });

  it("entryId points to a valid node", () => {
    const { nodes, entryId } = buildCommUnit(["email"], { prefix: "unit5", onEngaged: "success", onExhausted: "end" });
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain(entryId);
  });

  it("edges connect onEngaged and onExhausted to external IDs", () => {
    const { edges } = buildCommUnit(["sms"], { prefix: "unit6", onEngaged: "my_success", onExhausted: "my_end" });
    const targets = edges.map((e) => e.target);
    expect(targets).toContain("my_success");
    expect(targets).toContain("my_end");
  });
});
