import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
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

// The subdomain Tooltip (base-ui) positions itself via floating-ui, which
// touches ResizeObserver on mount — absent in jsdom. Same shim used by other
// popover-ish tests in this codebase (node-field-combobox.test.tsx,
// campaign-screen.test.tsx); without it the tooltip popup silently never
// mounts.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

// finance is the default clientDirection in app-state — pick its first interest,
// that interest's first trigger, and one of that trigger's system domains so we
// can seed the editor with a selected+expanded trigger card.
const financeInterests = resolveInterestsForDirection("finance");
const firstInterest = financeInterests[0];
const firstTrigger = firstInterest.triggers[0];
const firstDomainGroup = getTriggerDomains(firstTrigger.id)[0];
const firstDomain = firstDomainGroup.root;

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

  it("prunes triggerConfig for a trigger once it's deselected (no orphan entry survives)", () => {
    const onChange = vi.fn();
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
      onChange,
    });

    // Exclude a system domain — the trigger is still selected, so its delta
    // IS surfaced in the emitted triggerConfig.
    fireEvent.click(
      screen.getByRole("button", { name: `Исключить ${firstDomain}` })
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggers: [firstTrigger.label],
        triggerConfig: {
          [firstTrigger.id]: { added: [], excluded: [firstDomain] },
        },
      })
    );

    // Deselect the trigger via its checkbox — the orphaned delta entry must
    // NOT survive into the emitted payload (it has no matching `triggers`
    // label), or a later persist would leak the excluded domain forward.
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Снять выбор триггера" })
    );
    const lastPayload = onChange.mock.calls.at(-1)?.[0];
    expect(lastPayload.triggers).toEqual([]);
    expect(lastPayload.triggerConfig).toEqual({});
    expect(lastPayload.triggerConfig).not.toHaveProperty(firstTrigger.id);
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

describe("InterestsTriggersEditor — domain-group chip (subdomains + overflow)", () => {
  afterEach(cleanup);

  // firstTrigger ("credit-banks") is the finance direction's first trigger —
  // it has 12 domain groups (> the expanded card's 10-visible cap) and its
  // first group (sberbank.ru) has 3 subdomains, so it exercises both the
  // muted "·N" counter/tooltip and the "+N" overflow chip in one fixture.
  const allGroups = getTriggerDomains(firstTrigger.id);

  it("renders the muted ·N subdomain counter on a group chip that has subdomains", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    expect(
      screen.getByText(`·${firstDomainGroup.subdomains.length}`)
    ).toBeInTheDocument();
  });

  it("clicking a domain-group chip with subdomains opens the tooltip listing them", async () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    const chip = screen.getByRole("button", {
      name: `Поддомены ${firstDomain}`,
    });
    // base-ui's Tooltip.Trigger only applies its `closeOnClick` override on
    // `pointerdown` (before the `click` fires) — a real browser click always
    // fires pointerdown first, but fireEvent.click alone does not, so we fire
    // it explicitly here to match a real user click.
    fireEvent.pointerDown(chip);
    fireEvent.click(chip);
    for (const sub of firstDomainGroup.subdomains) {
      expect(await screen.findByText(sub)).toBeInTheDocument();
    }
  });

  it("shows exactly 10 domain groups plus a +N overflow chip; clicking it reveals the rest", () => {
    renderEditor({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
    });
    const overflowCount = allGroups.length - 10;
    // Sanity: this fixture must have >10 groups, or the test below is vacuous.
    expect(overflowCount).toBeGreaterThan(0);

    for (const group of allGroups.slice(0, 10)) {
      expect(screen.getByText(group.root)).toBeInTheDocument();
    }
    const hiddenGroups = allGroups.slice(10);
    for (const group of hiddenGroups) {
      expect(screen.queryByText(group.root)).toBeNull();
    }

    fireEvent.click(
      screen.getByRole("button", {
        name: `Показать ещё ${overflowCount} доменов`,
      })
    );

    for (const group of hiddenGroups) {
      expect(screen.getByText(group.root)).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", {
        name: `Показать ещё ${overflowCount} доменов`,
      })
    ).toBeNull();
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
