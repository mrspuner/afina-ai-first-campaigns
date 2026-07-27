// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import type { WorkflowNodeData } from "@/types/workflow";
import { NodeCardBody } from "./node-card-content";

// next/image + cmdk (NodeFieldCombobox внутри WaitFields «До события») — тот
// же шим, что description-tag.test.tsx/node-field-combobox.test.tsx.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

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

function renderNodeCard(data: WorkflowNodeData) {
  return render(
    <AppStateProvider>
      <PromptChipsProvider>
        <ChatProvider>
          <NodeCardBody id="n_wait" data={data} />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

// fix round 1, Finding 2: контраст с description-tag.test.tsx / wait-fields.render.test.tsx
// — та же нода ожидания в режиме «До события», но здесь это ГРАФ-канвасная
// карточка (node-card-content.tsx), которая передаёт WaitFields рабочий
// onEventAiHandoff (handleAiField → pushChip + дровер ИИ). Пункт «Сформировать
// с помощью ИИ» обязан остаться здесь — снят он только у поповера паузы на
// карточке кампании, где такого сайдбара нет.
describe("NodeCardBody — «Сформировать с помощью ИИ» у поля «Событие» остаётся в графе (fix round 1, Finding 2)", () => {
  it("нода ожидания в режиме «До события» несёт пункт ИИ-хэндоффа в комбобоксе «Событие»", async () => {
    renderNodeCard({
      label: "Пауза",
      nodeType: "wait",
      params: { kind: "wait", mode: "until_event", untilEvent: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Изменить поле «Событие»" }));
    expect(await screen.findByText("Сформировать с помощью ИИ")).toBeInTheDocument();
  });
});
