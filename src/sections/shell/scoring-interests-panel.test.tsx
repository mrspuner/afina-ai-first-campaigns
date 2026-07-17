import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ScoringInterestsPanel } from "./scoring-interests-panel";
import {
  resolveInterestsForDirection,
} from "@/sections/campaigns/wizard/steps/interests-triggers-editor";
import { getTriggerDomains } from "@/data/trigger-domains";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { TriggerEditRegistryProvider } from "@/state/trigger-edit-context";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

// finance fixtures (the mocked clientDirection below).
const financeInterests = resolveInterestsForDirection("finance");
const interest = financeInterests[0];
const trigger = interest.triggers[0];
const domainGroup = getTriggerDomains(trigger.id)[0];
const domain = domainGroup.root;

const dispatchSpy = vi.fn();
let scoringDrawer = {
  open: true,
  editable: true,
  nodeId: "n_scoring",
  campaignId: "cmp_1",
};
const campaign = {
  id: "cmp_1",
  name: "Черновик",
  status: "draft",
  createdAt: "2026-06-20T09:00:00.000Z",
  interests: [interest.label],
  triggers: [trigger.label],
};

vi.mock("@/state/chat-context", () => ({
  useChat: () => ({ scoringDrawer, messages: [] }),
}));

vi.mock("@/state/app-state-context", () => ({
  useAppState: () => ({
    campaigns: [campaign],
    clientDirection: "finance",
    // `view` is read by useScopeReset (via the real PromptChipsProvider).
    view: {
      kind: "workflow",
      campaign: { id: "cmp_1", name: "Черновик" },
      launched: false,
    },
    wizardRemixToken: 0,
  }),
  useAppDispatch: () => dispatchSpy,
}));

function renderPanel() {
  return render(
    <PromptInputProvider>
      <PromptChipsProvider>
        <TriggerEditRegistryProvider>
          <ScoringInterestsPanel />
        </TriggerEditRegistryProvider>
      </PromptChipsProvider>
    </PromptInputProvider>
  );
}

describe("ScoringInterestsPanel — scoring node «Интересы и триггеры» drawer body", () => {
  beforeEach(() => {
    dispatchSpy.mockClear();
    scoringDrawer = {
      open: true,
      editable: true,
      nodeId: "n_scoring",
      campaignId: "cmp_1",
    };
  });
  afterEach(cleanup);

  it("renders the shared editor seeded from the campaign (interests + trigger + domains)", () => {
    renderPanel();
    // The campaign's interest is a pressed toggle (same control as the wizard).
    expect(
      screen.getByRole("button", { name: interest.label })
    ).toHaveAttribute("aria-pressed", "true");
    // The campaign's trigger card is expanded, showing its system DOMAIN (proves
    // domains/deltas parity — not just interest chips).
    expect(screen.getByText(domain)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Исключить ${domain}` })
    ).toBeInTheDocument();
  });

  it("persists edits to the campaign scoring params (campaign_scoring_set + node params)", () => {
    renderPanel();
    dispatchSpy.mockClear();
    // Remove the seeded interest → onChange → persist.
    fireEvent.click(screen.getByRole("button", { name: interest.label }));
    const types = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(types).toContain("campaign_scoring_set");
    expect(types).toContain("workflow_node_field_set");
    const scoringSet = dispatchSpy.mock.calls
      .map((c) => c[0])
      .find((a) => a.type === "campaign_scoring_set");
    expect(scoringSet).toMatchObject({ id: "cmp_1", interests: [] });
  });

  it("read-only (launched) renders interests as static text with no toggles or persistence", () => {
    scoringDrawer = {
      open: true,
      editable: false,
      nodeId: "n_scoring",
      campaignId: "cmp_1",
    };
    renderPanel();
    dispatchSpy.mockClear();
    expect(screen.getByText(interest.label)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: interest.label })
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
    // No persistence in read-only mode.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
