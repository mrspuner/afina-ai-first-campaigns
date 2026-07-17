import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  InterestsTriggersEditor,
  resolveInterestsForDirection,
  resolveSelectionIds,
} from "./interests-triggers-editor";
import { getTriggerDomains } from "@/data/trigger-domains";
import { AppStateProvider, useAppState } from "@/state/app-state-context";
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
  // cmdk (the add-domain combobox's Command list — Task 8) calls
  // `scrollIntoView` on its selected item; absent in jsdom.
  (
    Element.prototype as unknown as { scrollIntoView?: () => void }
  ).scrollIntoView ??= () => {};
});

// finance is the default clientDirection in app-state — pick its first interest,
// that interest's first trigger, and one of that trigger's system domains so we
// can seed the editor with a selected+expanded trigger card. `secondTrigger` is
// a sibling trigger of the same interest, used by the add-domain combobox tests
// to exercise cross-trigger registry visibility (Task 8).
const financeInterests = resolveInterestsForDirection("finance");
const firstInterest = financeInterests[0];
const firstTrigger = firstInterest.triggers[0];
const secondTrigger = firstInterest.triggers[1];
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

/** Reads `accountSettings.ownDomains` back out as plain `"domain:status"`
 *  strings — a precise assertion surface for the add-domain combobox tests
 *  (Task 8), which need to prove NOT ONLY what the delta chip shows, but
 *  whether/how the domain landed in the account registry. */
function OwnDomainsDebug() {
  const { accountSettings } = useAppState();
  return (
    <div data-testid="own-domains">
      {accountSettings.ownDomains.map((d) => `${d.domain}:${d.status}`).join(",")}
    </div>
  );
}

function renderEditorWithRegistryDebug(props: Partial<EditorProps> = {}) {
  return render(
    <AppStateProvider>
      <PromptInputProvider>
        <PromptChipsProvider>
          <TriggerEditRegistryProvider>
            <InterestsTriggersEditor {...props} />
            <OwnDomainsDebug />
          </TriggerEditRegistryProvider>
        </PromptChipsProvider>
      </PromptInputProvider>
    </AppStateProvider>
  );
}

/** Opens the Nth (0-indexed, in render order) trigger card's «Добавить свой
 *  домен» combobox. */
function openAddDomainCombobox(index: number) {
  const buttons = screen.getAllByRole("button", {
    name: /Добавить свой домен/,
  });
  fireEvent.click(buttons[index]);
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

describe("InterestsTriggersEditor — add-domain combobox (Task 8)", () => {
  afterEach(cleanup);

  it("selecting a previously-registered domain from another trigger adds it active, without a new registration", async () => {
    renderEditorWithRegistryDebug({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id, secondTrigger.id],
    });

    // Register "partner-shop.ru" (unknown — not any trigger's system domain)
    // via trigger 2's typed-custom entry first, so it lands in the account
    // registry as pending and becomes selectable from trigger 1's directory.
    openAddDomainCombobox(1);
    const input1 = await screen.findByPlaceholderText("Домен (example.ru)");
    fireEvent.change(input1, { target: { value: "Partner-Shop.ru" } });
    fireEvent.click(await screen.findByText("Добавить «Partner-Shop.ru»"));
    expect(screen.getByTestId("own-domains").textContent).toBe(
      "partner-shop.ru:pending"
    );

    // Trigger 1's combobox now lists it as a previously-registered option —
    // picking it must NOT create a second registry entry.
    openAddDomainCombobox(0);
    const options = await screen.findAllByRole("option", {
      name: "partner-shop.ru",
    });
    fireEvent.click(options.at(-1)!);
    expect(screen.getByTestId("own-domains").textContent).toBe(
      "partner-shop.ru:pending"
    );
  });

  it("typing a domain that IS a known trigger-domain root (from another trigger) adds it active WITHOUT registering it", async () => {
    const onChange = vi.fn();
    renderEditorWithRegistryDebug({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
      onChange,
    });

    // "zakupki.gov.ru" is a known trigger-domain root (procurement vertical),
    // but not one of firstTrigger's OWN system domains — typed with mixed
    // case, a leading www. and a trailing dot to exercise normalization.
    openAddDomainCombobox(0);
    const input = await screen.findByPlaceholderText("Домен (example.ru)");
    fireEvent.change(input, { target: { value: "WWW.Zakupki.GOV.RU." } });
    fireEvent.click(
      await screen.findByText("Добавить «WWW.Zakupki.GOV.RU.»")
    );

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggerConfig: expect.objectContaining({
          [firstTrigger.id]: { added: ["zakupki.gov.ru"], excluded: [] },
        }),
      })
    );
    // Known root → no registry entry created at all.
    expect(screen.getByTestId("own-domains").textContent).toBe("");
  });

  it("typing an unknown domain registers it as pending in the account registry and adds it as a delta chip", async () => {
    const onChange = vi.fn();
    renderEditorWithRegistryDebug({
      initialInterestIds: [firstInterest.id],
      initialTriggerIds: [firstTrigger.id],
      onChange,
    });

    openAddDomainCombobox(0);
    const input = await screen.findByPlaceholderText("Домен (example.ru)");
    fireEvent.change(input, { target: { value: "brand-new-site.ru" } });
    fireEvent.click(await screen.findByText("Добавить «brand-new-site.ru»"));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggerConfig: expect.objectContaining({
          [firstTrigger.id]: { added: ["brand-new-site.ru"], excluded: [] },
        }),
      })
    );
    expect(screen.getByTestId("own-domains").textContent).toBe(
      "brand-new-site.ru:pending"
    );
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
