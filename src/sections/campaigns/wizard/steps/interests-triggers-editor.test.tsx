import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  InterestsTriggersEditor,
  resolveInterestsForDirection,
  resolveSelectionIds,
} from "./interests-triggers-editor";
import { getTriggerDomains } from "@/data/trigger-domains";
import { AppStateProvider } from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { TriggerEditRegistryProvider } from "@/state/trigger-edit-context";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

// next/image pulls extra setup and isn't needed for the assertions.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

// finance is the default clientDirection in app-state — pick its first interest,
// that interest's first trigger, and one of that trigger's system domains so we
// can seed the editor with a selected+expanded trigger card.
const financeInterests = resolveInterestsForDirection("finance");
const firstInterest = financeInterests[0];
const firstTrigger = firstInterest.triggers[0];
const firstDomain = getTriggerDomains(firstTrigger.id)[0];

type EditorProps = React.ComponentProps<typeof InterestsTriggersEditor>;

function renderEditor(props: Partial<EditorProps> = {}) {
  return render(
    <AppStateProvider>
      <PromptInputProvider>
        <PromptChipsProvider>
          <TriggerEditRegistryProvider>
            <InterestsTriggersEditor {...props} />
          </TriggerEditRegistryProvider>
        </PromptChipsProvider>
      </PromptInputProvider>
    </AppStateProvider>
  );
}

describe("InterestsTriggersEditor — wizard/drawer parity", () => {
  afterEach(cleanup);

  it("renders the interest catalog as toggle chips (aria-pressed)", () => {
    renderEditor();
    const chip = screen.getByRole("button", { name: firstInterest.label });
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("renders selected interest chips as pressed when seeded", () => {
    renderEditor({ initialInterestIds: [firstInterest.id] });
    expect(
      screen.getByRole("button", { name: firstInterest.label })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a selected trigger CARD with its domains and delta controls (not just interest chips)", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    // The selected trigger's card renders …
    expect(screen.getByText(firstTrigger.label)).toBeInTheDocument();
    // … the trigger's SYSTEM DOMAIN renders as a chip (domains present) …
    expect(screen.getByText(firstDomain)).toBeInTheDocument();
    // … the per-domain EXCLUDE (delta) control is present …
    expect(
      screen.getByRole("button", { name: `Исключить ${firstDomain}` })
    ).toBeInTheDocument();
    // … and the "add your own domain" delta affordance is present.
    expect(
      screen.getByRole("button", { name: /Добавить свой домен/ })
    ).toBeInTheDocument();
  });

  it("excluding a system domain surfaces the restore (delta) control", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Исключить ${firstDomain}` })
    );
    // Excluded system domain becomes a reversible «Вернуть …» chip (user-layer
    // delta), proving per-trigger domain deltas work in the shared editor.
    expect(
      screen.getByRole("button", { name: `Вернуть ${firstDomain}` })
    ).toBeInTheDocument();
  });

  it("fires onChange with LABELS when an interest is toggled", () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: firstInterest.label }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ interests: [firstInterest.label] })
    );
  });

  it("read-only mode renders selected interests as static text (no toggles)", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
      readOnly: true,
    });
    // The interest is shown as text, but there are no pressable toggles.
    expect(screen.getByText(firstInterest.label)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: firstInterest.label })).toBeNull();
    expect(document.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
    // Read-only still shows the trigger + its domains (content parity).
    expect(screen.getByText(firstTrigger.label)).toBeInTheDocument();
    expect(screen.getByText(firstDomain)).toBeInTheDocument();
  });
});

describe("resolveSelectionIds", () => {
  it("resolves campaign LABELS back to editor ids for the direction", () => {
    const ids = resolveSelectionIds("finance", {
      interests: [firstInterest.label],
      triggers: [firstTrigger.label],
    });
    expect(ids.interestIds).toEqual([firstInterest.id]);
    expect(ids.triggerIds).toEqual([firstTrigger.id]);
  });

  it("drops labels not present in the direction catalog", () => {
    const ids = resolveSelectionIds("finance", {
      interests: ["Не из каталога"],
      triggers: [],
    });
    expect(ids.interestIds).toEqual([]);
  });
});
