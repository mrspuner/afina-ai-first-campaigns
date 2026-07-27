import { beforeAll, describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DescriptionTagPill } from "./description-tag";
import type { DescriptionTag } from "@/state/graph-description";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import type { WorkflowNodeType } from "@/types/workflow";

afterEach(cleanup);

// next/image → plain <img>, как в node-template-select.test.tsx — cmdk-пункт
// «Создать новый шаблон» несёт маскот-иконку через next/image, jsdom не тянет
// её оптимизацию.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

// cmdk (Command primitives внутри NodeTemplateList) требует ResizeObserver +
// scrollIntoView — jsdom не несёт ни то, ни другое (тот же шим, что в
// node-template-select.test.tsx).
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

/**
 * Поповер шаблона (target.kind === "template") тянет `app-state.templates`
 * (useAppState) и `openTemplatePreview`/`openTemplateCreate` (useChat) —
 * оборачиваем в те же провайдеры, что `use-campaign-graph-applier.test.tsx`
 * использует для headless-хуков. nodeType по умолчанию "sms" — ровно то, что
 * `nodeTypes`-лукап в `CampaignScreen` передал бы для sms-ноды графа.
 */
function renderPillWithProviders({
  tag,
  nodeType = "sms",
}: {
  tag: DescriptionTag;
  nodeType?: WorkflowNodeType;
}) {
  return render(
    <AppStateProvider>
      <ChatProvider>
        <DescriptionTagPill tag={tag} nodeType={nodeType} />
      </ChatProvider>
    </AppStateProvider>,
  );
}

const stepTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "wizard-step", step: "file" },
};

const valueTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "none" },
};

describe("DescriptionTagPill", () => {
  it("тег с целью — кнопка, клик поднимает наверх", () => {
    const onActivate = vi.fn();
    render(<DescriptionTagPill tag={stepTag} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: /база на 12 000 строк/ }));
    expect(onActivate).toHaveBeenCalledWith(stepTag);
  });

  it("тег без цели — не кнопка, но значение показывает", () => {
    render(<DescriptionTagPill tag={valueTag} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/база на 12 000 строк/)).toBeInTheDocument();
  });

  it("схлопка перечисления несёт остаток в title для наведения", () => {
    render(
      <DescriptionTagPill
        tag={{ ...stepTag, label: "ещё 2 триггерам", hoverList: ["Вторичка", "Аренда"] }}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("title", "Вторичка, Аренда");
  });

  it("тег шаблона раскрывает список шаблонов канала прямо у пилюли", async () => {
    renderPillWithProviders({
      tag: { id: "msg-n1-template", label: "Приветствие", target: { kind: "template", nodeId: "n1" } },
    });
    fireEvent.click(screen.getByRole("button", { name: /Приветствие/ }));
    expect(await screen.findByText("Создать новый шаблон")).toBeInTheDocument();
  });
});

describe("DescriptionTagPill — иконка после демоции не пропадает (fix round 2, Finding 2)", () => {
  it("демотированный шаговый тег (none + step) остаётся с STEP_ICON, но не кнопка", () => {
    const tag: DescriptionTag = {
      id: "start-base",
      label: "12 000 строк",
      target: { kind: "none", step: "file" },
    };
    render(<DescriptionTagPill tag={tag} />);
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("12 000 строк").parentElement!;
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("демотированный шаблон/пауза (none + nodeId, nodeType пропом) остаётся с NODE_ICON, но не кнопка", () => {
    const tag: DescriptionTag = {
      id: "msg-n1-template",
      label: "SMS — напоминание",
      target: { kind: "none", nodeId: "n1" },
    };
    render(<DescriptionTagPill tag={tag} nodeType="sms" />);
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("SMS — напоминание").parentElement!;
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("демотированный тег без step/nodeType остаётся без иконки — нечего резолвить", () => {
    // Личность демоции определяется ТЕМ, что перенёс сам таргет (step/nodeId);
    // без неё (напр. домены или гипотетический none без личности) иконки не
    // было и раньше — не выдумываем её из ничего.
    const tag: DescriptionTag = {
      id: "x",
      label: "значение без личности",
      target: { kind: "none" },
    };
    render(<DescriptionTagPill tag={tag} />);
    const pill = screen.getByText("значение без личности").parentElement!;
    expect(pill.querySelector("svg")).toBeNull();
  });
});
