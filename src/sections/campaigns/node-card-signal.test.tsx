// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { WorkflowNodeData } from "@/types/workflow";

// Minimal context/stubs so NodeCardBody renders in isolation.
vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => vi.fn(),
  useAppState: () => ({
    templates: [],
    view: { kind: "workflow", campaign: { id: "c1", name: "C" } },
    artifacts: [],
  }),
}));
vi.mock("@/state/prompt-chips-context", () => ({
  usePromptChips: () => ({ pushChip: vi.fn(), removeChip: vi.fn() }),
}));
vi.mock("@/state/chat-context", () => ({
  useChat: () => ({
    openTemplateCreate: vi.fn(),
    openTemplatePreview: vi.fn(),
    openSidebar: vi.fn(),
    openScoringDrawer: vi.fn(),
  }),
}));
vi.mock("./workflow-readonly-context", () => ({
  useWorkflowReadOnly: () => true,
}));

import { NodeCardBody } from "./node-card-content";

describe("NodeCardBody — signal branch", () => {
  it("mounts SignalFiles (draft placeholder) for a signal node with no files", () => {
    const data: WorkflowNodeData = {
      label: "Сигнал",
      nodeType: "signal",
      params: { kind: "signal", fileName: "", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } },
    };
    const { getByText, queryByText } = render(<NodeCardBody id="signal_result" data={data} />);
    expect(getByText("После запуска здесь появятся файлы сигналов")).not.toBeNull();
    // Generic «Файл: …» row must NOT render (signal bypasses PARAM_RENDERERS).
    expect(queryByText(/^Файл$/)).toBeNull();
  });
});
