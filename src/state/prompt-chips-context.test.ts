import { describe, it, expect } from "vitest";
import { promptChipsReducer, type NodeTagPayload, type PromptChipsState } from "./prompt-chips-context";

const empty: PromptChipsState = { chips: [] };

describe("promptChipsReducer", () => {
  it("push appends a chip and assigns an id", () => {
    const next = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "trigger", label: "Сайты автодилеров", payload: "auto-dealers", removable: true },
    });
    expect(next.chips).toHaveLength(1);
    expect(next.chips[0].id).toMatch(/^chip_/);
    expect(next.chips[0].label).toBe("Сайты автодилеров");
  });

  it("push with explicit id deduplicates by id (last write wins)", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { id: "fixed", kind: "node", label: "Email", payload: "n1", removable: true },
    });
    const b = promptChipsReducer(a, {
      type: "push",
      chip: { id: "fixed", kind: "node", label: "Email 2", payload: "n2", removable: true },
    });
    expect(b.chips).toHaveLength(1);
    expect(b.chips[0].label).toBe("Email 2");
  });

  it("remove drops a chip by id", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { id: "x", kind: "trigger", label: "A", payload: null, removable: true },
    });
    const b = promptChipsReducer(a, { type: "remove", id: "x" });
    expect(b.chips).toEqual([]);
  });

  it("removeLastRemovable pops the last removable chip", () => {
    let s = empty;
    s = promptChipsReducer(s, {
      type: "push",
      chip: { kind: "trigger", label: "A", payload: null, removable: false },
    });
    s = promptChipsReducer(s, {
      type: "push",
      chip: { kind: "trigger", label: "B", payload: null, removable: true },
    });
    const next = promptChipsReducer(s, { type: "removeLastRemovable" });
    expect(next.chips.map((c) => c.label)).toEqual(["A"]);
  });

  it("removeLastRemovable is a no-op when there is nothing to remove", () => {
    const s = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "node", label: "fixed", payload: null, removable: false },
    });
    const next = promptChipsReducer(s, { type: "removeLastRemovable" });
    expect(next).toBe(s);
  });

  it("clear empties chips", () => {
    const a = promptChipsReducer(empty, {
      type: "push",
      chip: { kind: "trigger", label: "A", payload: null, removable: true },
    });
    const b = promptChipsReducer(a, { type: "clear" });
    expect(b.chips).toEqual([]);
  });

  it("supports section kind chips", () => {
    const s = promptChipsReducer(
      { chips: [] },
      {
        type: "push",
        chip: {
          id: "section_interests",
          kind: "section",
          label: "Интересы",
          payload: "interests",
          removable: true,
        },
      }
    );
    expect(s.chips[0].kind).toBe("section");
    expect(s.chips[0].label).toBe("Интересы");
  });

  it("preserves NodeTagPayload with color on push", () => {
    const next = promptChipsReducer(
      { chips: [] },
      {
        type: "push",
        chip: {
          id: "nodefield_n1_Текст",
          kind: "node",
          label: "Текст",
          payload: { nodeId: "n1", nodeType: "sms", color: "#5eead4", paramLabel: "Текст" },
          removable: true,
        },
      }
    );
    const p = next.chips[0].payload as NodeTagPayload;
    expect(p.color).toBe("#5eead4");
    expect(p.nodeId).toBe("n1");
    expect(p.paramLabel).toBe("Текст");
  });
});

describe("removeForNode", () => {
  const push = (s: PromptChipsState, id: string) =>
    promptChipsReducer(s, {
      type: "push",
      chip: { id, kind: "node", label: id, payload: null, removable: true },
    });

  it("drops the whole-node chip and all its field chips, keeps other nodes", () => {
    let s = empty;
    s = push(s, "node_n1");
    s = push(s, "nodefield_n1_Текст");
    s = push(s, "nodefield_n1_Время");
    s = push(s, "node_n2");
    s = push(s, "nodefield_n2_Текст");
    const next = promptChipsReducer(s, { type: "removeForNode", nodeId: "n1" });
    expect(next.chips.map((c) => c.id)).toEqual(["node_n2", "nodefield_n2_Текст"]);
  });

  it("does not falsely match a longer node id (n1 vs n10)", () => {
    let s = empty;
    s = push(s, "node_n10");
    s = push(s, "nodefield_n10_Текст");
    const next = promptChipsReducer(s, { type: "removeForNode", nodeId: "n1" });
    expect(next.chips.map((c) => c.id)).toEqual(["node_n10", "nodefield_n10_Текст"]);
  });
});
