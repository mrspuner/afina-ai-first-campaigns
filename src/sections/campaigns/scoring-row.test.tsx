// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import type { ScoringParams } from "@/types/workflow";

// ---- context mocks -------------------------------------------------------
const dispatch = vi.fn();
let mockReadOnly = false;
// Hoisted (not fresh-per-call like the old inline `vi.fn()`s) so tests can
// assert on invocations — mirrors `dispatch` above.
const removeChip = vi.fn();
const pushChip = vi.fn();
const openScoringDrawer = vi.fn();

vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => ({
    view: { kind: "workflow", campaign: { id: "c1", name: "C" }, launched: false },
  }),
}));
vi.mock("./workflow-readonly-context", () => ({
  useWorkflowReadOnly: () => mockReadOnly,
}));
vi.mock("@/state/chat-context", () => ({
  useChat: () => ({ openScoringDrawer }),
}));
vi.mock("@/state/prompt-chips-context", () => ({
  usePromptChips: () => ({ removeChip, pushChip }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

// Imported AFTER the mocks so the module picks them up.
import { ScoringRow } from "./node-card-content";

const params: ScoringParams = {
  kind: "scoring",
  interests: [],
  triggers: [],
  files: [
    { name: "base-1.csv", rowCount: 1000 },
    { name: "base-2.csv", rowCount: 2500 },
  ],
};

describe("ScoringRow — «Файлы» как отдельные удаляемые строки", () => {
  beforeEach(() => {
    dispatch.mockClear();
    removeChip.mockClear();
    pushChip.mockClear();
    openScoringDrawer.mockClear();
    mockReadOnly = false;
  });

  it("рендерит по одной строке на файл с кнопкой удаления (черновик)", () => {
    const { getByText, getAllByRole, getByRole } = render(
      <ScoringRow nodeId="n1" params={params} />,
    );
    // Каждый файл — отдельная строка (не одна сводная).
    expect(getByText("base-1.csv")).not.toBeNull();
    expect(getByText("base-2.csv")).not.toBeNull();
    // По кнопке удаления на файл.
    const removeButtons = getAllByRole("button", { name: /Удалить файл/ });
    expect(removeButtons).toHaveLength(2);
    // «Добавить файл» сохранён.
    expect(getByRole("button", { name: "Добавить файл" })).not.toBeNull();
  });

  it("клик по удалению снимает именно этот файл (reducer + параметр ноды)", () => {
    const { getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    fireEvent.click(getByRole("button", { name: "Удалить файл: base-1.csv" }));

    // Удаление по индексу из Campaign.files.
    expect(dispatch).toHaveBeenCalledWith({
      type: "campaign_file_removed",
      campaignId: "c1",
      index: 0,
    });
    // И синхронно с параметра «Файлы» ноды (остаётся только base-2.csv).
    expect(dispatch).toHaveBeenCalledWith({
      type: "workflow_node_field_set",
      nodeId: "n1",
      patch: { files: [{ name: "base-2.csv", rowCount: 2500 }] },
    });
  });

  it("read-only (запущена): строки есть, кнопок удаления/добавления нет", () => {
    mockReadOnly = true;
    const { getByText, queryAllByRole, queryByRole } = render(
      <ScoringRow nodeId="n1" params={params} />,
    );
    expect(getByText("base-1.csv")).not.toBeNull();
    expect(getByText("base-2.csv")).not.toBeNull();
    expect(queryAllByRole("button", { name: /Удалить файл/ })).toHaveLength(0);
    expect(queryByRole("button", { name: "Добавить файл" })).toBeNull();
  });

  it("удаляет по индексу даже при одинаковых именах", () => {
    const dupes: ScoringParams = {
      ...params,
      files: [
        { name: "same.csv", rowCount: 100 },
        { name: "same.csv", rowCount: 200 },
      ],
    };
    const { getAllByRole } = render(<ScoringRow nodeId="n1" params={dupes} />);
    const rows = getAllByRole("button", { name: "Удалить файл: same.csv" });
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(dispatch).toHaveBeenCalledWith({
      type: "campaign_file_removed",
      campaignId: "c1",
      index: 1,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "workflow_node_field_set",
      nodeId: "n1",
      patch: { files: [{ name: "same.csv", rowCount: 100 }] },
    });
  });

  it("пустой список показывает «—» без кнопок удаления", () => {
    const empty: ScoringParams = { ...params, files: [] };
    const { getByText, queryAllByRole } = render(
      <ScoringRow nodeId="n1" params={empty} />,
    );
    expect(getByText("—")).not.toBeNull();
    expect(queryAllByRole("button", { name: /Удалить файл/ })).toHaveLength(0);
  });

  it("рендерит вторичный текст со счётчиком строк на строке файла", () => {
    const { getByText } = render(<ScoringRow nodeId="n1" params={params} />);
    // Ряд base-1 содержит свой счётчик строк.
    const row = getByText("base-1.csv").closest("div");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(/строк/)).not.toBeNull();
  });

  it("draft: interests/triggers affordance is the mascot, not a pencil", () => {
    const { container, getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    // draft keeps the «Изменить …» button; icon is the mascot image, no pencil.
    expect(getByRole("button", { name: "Изменить интересы и триггеры" })).not.toBeNull();
    expect(container.querySelector('img[src="/mascot-icon.svg"]')).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });

  it("launched (read-only): interests/triggers affordance is the eye", () => {
    mockReadOnly = true;
    const { container, getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    expect(getByRole("button", { name: "Показать интересы и триггеры" })).not.toBeNull();
    expect(container.querySelector("svg.lucide-eye")).not.toBeNull();
    expect(container.querySelector("svg.lucide-pencil")).toBeNull();
  });

  // spec §8: открытие боковика скоринга ДОЛЖНО класть whole-node чип узла в
  // бар (иначе у ИИ нет контекста и он отвечает «нет такой ноды»). Раньше
  // здесь был removeChip(`node_${nodeId}`) — чип наоборот снимался.
  it("клик по «Интересы и триггеры» кладёт whole-node чип скоринга в бар, а не снимает его", () => {
    const { getByRole } = render(<ScoringRow nodeId="n1" params={params} />);
    fireEvent.click(getByRole("button", { name: "Изменить интересы и триггеры" }));

    expect(pushChip).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "node_n1",
        kind: "node",
        payload: expect.objectContaining({ nodeId: "n1", nodeType: "scoring" }),
      }),
    );
    expect(removeChip).not.toHaveBeenCalled();
    expect(openScoringDrawer).toHaveBeenCalledWith({
      nodeId: "n1",
      campaignId: "c1",
      editable: true,
    });
  });
});
