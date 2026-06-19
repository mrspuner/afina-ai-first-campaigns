import { describe, it, expect } from "vitest";
import {
  appReducer,
  initialState,
  isCampaignDone,
  viewToAddress,
  type AppState,
  type Campaign,
  type View,
} from "./app-state";
import {
  DEMO_ACCOUNT_SETTINGS,
  EMPTY_ACCOUNT_SETTINGS,
} from "@/types/account-settings";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Campaign 1",
    status: "draft",
    createdAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("appReducer — initial state", () => {
  it("has an empty campaigns array", () => {
    expect(initialState.campaigns).toEqual([]);
  });

  it("starts on welcome view", () => {
    expect(initialState.view).toEqual({ kind: "welcome" });
  });
});

describe("appReducer — campaign_created", () => {
  it("appends a campaign to the array", () => {
    const campaign = makeCampaign();
    const next = appReducer(initialState, { type: "campaign_created", campaign });
    expect(next.campaigns).toHaveLength(1);
    expect(next.campaigns[0]).toEqual(campaign);
  });

  it("flips view.launched when active campaign matches workflow view", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "c1", name: "C1" }, launched: false },
    };
    const campaign = makeCampaign({ id: "c1", status: "active" });
    const next = appReducer(state, { type: "campaign_created", campaign });
    expect(next.view).toEqual({
      kind: "workflow",
      campaign: { id: "c1", name: "C1" },
      launched: true,
    });
  });

  it("does not flip view.launched when campaign id differs", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "c1", name: "C1" }, launched: false },
    };
    const campaign = makeCampaign({ id: "other", status: "active" });
    const next = appReducer(state, { type: "campaign_created", campaign });
    expect(next.view.kind).toBe("workflow");
    if (next.view.kind === "workflow") {
      expect(next.view.launched).toBe(false);
    }
  });
});

describe("appReducer — campaign_status_changed", () => {
  it("updates status and sets launchedAt when moving to active", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "c1", status: "draft" })],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "active",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("active");
    expect(next.campaigns[0].launchedAt).toBe("2026-04-18T12:00:00.000Z");
  });

  it("sets completedAt when moving to completed", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "c1", status: "active" })],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "completed",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("completed");
    expect(next.campaigns[0].completedAt).toBe("2026-04-18T12:00:00.000Z");
  });

  it("does not mutate other campaigns", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({ id: "c1", status: "draft" }),
        makeCampaign({ id: "c2", status: "draft" }),
      ],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "paused",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[1].status).toBe("draft");
  });
});

describe("appReducer — preset_applied", () => {
  it("replaces campaigns + artifacts", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "old-cmp" })],
    };
    const preset = {
      key: "mid" as const,
      label: "Mid",
      campaigns: [makeCampaign({ id: "new-cmp" })],
      artifacts: [
        {
          id: "art_new",
          campaignId: "new-cmp",
          kind: "signals" as const,
          count: 1000,
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.campaigns.map((c) => c.id)).toEqual(["new-cmp"]);
    expect(next.artifacts.map((a) => a.id)).toEqual(["art_new"]);
  });

  it("preserves view when current view is welcome", () => {
    const preset = { key: "mid" as const, label: "Mid", campaigns: [], artifacts: [] };
    const next = appReducer(initialState, { type: "preset_applied", preset });
    expect(next.view).toEqual({ kind: "welcome" });
  });

  it("falls back to section Кампании when current workflow view references non-existent campaign", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "gone", name: "Gone" }, launched: false },
      campaigns: [makeCampaign({ id: "gone" })],
    };
    const preset = {
      key: "empty" as const,
      label: "Empty",
      campaigns: [],
      artifacts: [],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.view).toEqual({ kind: "section", name: "Кампании" });
  });

  it("keeps workflow view when campaign still exists in new preset", () => {
    const kept = makeCampaign({ id: "kept" });
    const state: AppState = {
      ...initialState,
      view: { kind: "workflow", campaign: { id: "kept", name: "Kept" }, launched: false },
    };
    const preset = {
      key: "mid" as const,
      label: "Mid",
      campaigns: [kept],
      artifacts: [],
    };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.view.kind).toBe("workflow");
  });

  it("does not touch workflowCommand or launchFlyoutOpen", () => {
    const state: AppState = {
      ...initialState,
      workflowCommand: "some-command",
      launchFlyoutOpen: true,
    };
    const preset = { key: "empty" as const, label: "Empty", campaigns: [], artifacts: [] };
    const next = appReducer(state, { type: "preset_applied", preset });
    expect(next.workflowCommand).toBe("some-command");
    expect(next.launchFlyoutOpen).toBe(true);
  });
});

describe("appReducer — campaign_renamed", () => {
  it("updates name on the matching campaign", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Original" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_A", name: "New name" });
    expect(next.campaigns[0].name).toBe("New name");
  });

  it("trims whitespace", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Original" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_A", name: "  Trimmed  " });
    expect(next.campaigns[0].name).toBe("Trimmed");
  });

  it("is a no-op when id is unknown", () => {
    const state: AppState = { ...initialState, campaigns: [makeCampaign({ id: "cmp_A" })] };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_missing", name: "x" });
    expect(next).toBe(state);
  });

  it("is a no-op when name is empty after trim", () => {
    const state: AppState = { ...initialState, campaigns: [makeCampaign({ id: "cmp_A" })] };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_A", name: "   " });
    expect(next).toBe(state);
  });

  it("updates view.campaign.name when workflow view points to the same id", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Original" });
    const state: AppState = {
      ...initialState,
      campaigns: [c],
      view: { kind: "workflow", campaign: { id: "cmp_A", name: "Original" }, launched: false },
    };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_A", name: "Next" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.campaign.name).toBe("Next");
  });

  it("does not update view when workflow view points to a different id", () => {
    const target = makeCampaign({ id: "cmp_A" });
    const other = makeCampaign({ id: "cmp_B", name: "Other" });
    const state: AppState = {
      ...initialState,
      campaigns: [target, other],
      view: { kind: "workflow", campaign: { id: "cmp_B", name: "Other" }, launched: false },
    };
    const next = appReducer(state, { type: "campaign_renamed", id: "cmp_A", name: "Next" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.campaign.name).toBe("Other");
  });
});

describe("appReducer — campaign_saved_draft", () => {
  it("returns the same state reference (no-op)", () => {
    const state: AppState = { ...initialState, campaigns: [makeCampaign({ id: "cmp_A" })] };
    const next = appReducer(state, { type: "campaign_saved_draft", id: "cmp_A" });
    expect(next).toBe(state);
  });
});

describe("appReducer — workflow node selection + AI cycle", () => {
  it("workflow_node_selected stores id and label", () => {
    const next = appReducer(initialState, {
      type: "workflow_node_selected",
      id: "email",
      label: "Email",
    });
    expect(next.selectedWorkflowNode).toEqual({ id: "email", label: "Email" });
  });

  it("workflow_node_deselected clears the selection", () => {
    const state: AppState = {
      ...initialState,
      selectedWorkflowNode: { id: "x", label: "X" },
    };
    const next = appReducer(state, { type: "workflow_node_deselected" });
    expect(next.selectedWorkflowNode).toBeNull();
  });

  it("workflow_node_command_submit captures the batch and keeps the node selected", () => {
    const state: AppState = {
      ...initialState,
      selectedWorkflowNode: { id: "email", label: "Email" },
    };
    const next = appReducer(state, {
      type: "workflow_node_command_submit",
      commands: [{ nodeLabel: "Email", text: "Задержка 2 часа" }],
    });
    expect(next.workflowNodeCommand).toEqual({
      commands: [{ nodeLabel: "Email", text: "Задержка 2 часа" }],
    });
    // Узел, в котором правят, остаётся открытым — пользователь может править
    // дальше (см. фикс «не закрывать узел после изменения»).
    expect(next.selectedWorkflowNode).toEqual({ id: "email", label: "Email" });
  });

  it("workflow_node_command_submit accepts multi-node batch", () => {
    const next = appReducer(initialState, {
      type: "workflow_node_command_submit",
      commands: [
        { nodeLabel: "СМС", text: "текст: привет" },
        { nodeLabel: "Email", text: "тема: скидка" },
      ],
    });
    expect(next.workflowNodeCommand?.commands).toHaveLength(2);
  });

  it("workflow_node_command_handled clears the pending command", () => {
    const state: AppState = {
      ...initialState,
      workflowNodeCommand: {
        commands: [{ nodeLabel: "Email", text: "x" }],
      },
    };
    const next = appReducer(state, { type: "workflow_node_command_handled" });
    expect(next.workflowNodeCommand).toBeNull();
  });

  it("ai_reply_shown stores the text", () => {
    const next = appReducer(initialState, { type: "ai_reply_shown", text: "Готово" });
    expect(next.aiReply).toBe("Готово");
  });

  it("ai_reply_dismissed clears the text", () => {
    const state: AppState = { ...initialState, aiReply: "Hello" };
    const next = appReducer(state, { type: "ai_reply_dismissed" });
    expect(next.aiReply).toBeNull();
  });
});

describe("appReducer — campaign_opened", () => {
  it("opens draft campaign in the campaign card view", () => {
    // campaign_opened now routes every status to the campaign card
    // (the card itself decides the next step: workflow, payment, etc.)
    const c = makeCampaign({ id: "cmp_A", name: "Draft A", status: "draft" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view).toEqual({
      kind: "campaign",
      campaign: { id: "cmp_A", name: "Draft A" },
    });
  });

  it("opens active campaign in the campaign feed view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Running", status: "active" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view).toEqual({
      kind: "campaign",
      campaign: { id: "cmp_A", name: "Running" },
    });
  });

  it("opens completed campaign in the campaign feed view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "Done", status: "completed" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.view).toEqual({
      kind: "campaign",
      campaign: { id: "cmp_A", name: "Done" },
    });
  });

  it("is a no-op when id is unknown", () => {
    const state: AppState = { ...initialState, campaigns: [makeCampaign()] };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_missing" });
    expect(next).toBe(state);
  });

  it("clears activeSection so the workflow fills the pane", () => {
    const c = makeCampaign({ id: "cmp_A" });
    const state: AppState = {
      ...initialState,
      campaigns: [c],
      activeSection: "Кампании",
    };
    const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
    expect(next.activeSection).toBeNull();
  });
});

describe("appReducer — launched campaign screen", () => {
  it("campaign_launched sets active + launchedAt and navigates to campaign view", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "draft" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_A",
      timestamp: "2026-05-20T00:00:00.000Z",
      budget: 500,
    });
    const updated = next.campaigns.find((x) => x.id === "cmp_A");
    expect(updated?.status).toBe("active");
    expect(updated?.launchedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(next.view).toEqual({
      kind: "campaign",
      campaign: { id: "cmp_A", name: "C" },
    });
  });

  it("campaign_launched is a no-op for unknown id", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "cmp_A" })],
    };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_unknown",
      timestamp: "t",
      budget: 500,
    });
    expect(next).toBe(state);
  });

  it("campaign_launched stores the provided budget on the campaign", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "draft" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_A",
      timestamp: "2026-05-20T00:00:00.000Z",
      budget: 1234.56,
    });
    const updated = next.campaigns.find((x) => x.id === "cmp_A");
    expect(updated?.budget).toBe(1234.56);
    expect(updated?.status).toBe("active");
  });

  it("campaign_launched preserves an existing budget if none is provided", () => {
    // Action shape requires budget after this change — but if a future caller
    // passes 0 or omits it via TS, we don't erase a previously-stored value.
    const c = makeCampaign({ id: "cmp_A", name: "C", status: "draft", budget: 999 });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, {
      type: "campaign_launched",
      id: "cmp_A",
      timestamp: "2026-05-20T00:00:00.000Z",
      budget: 0,
    });
    const updated = next.campaigns.find((x) => x.id === "cmp_A");
    // Zero-budget launches keep the previously-stored value.
    expect(updated?.budget).toBe(999);
  });

  it("open_workflow switches the view to a launched workflow", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "campaign", campaign: { id: "cmp_A", name: "C" } },
    };
    const next = appReducer(state, {
      type: "open_workflow",
      campaign: { id: "cmp_A", name: "C" },
      launched: true,
    });
    expect(next.view).toEqual({
      kind: "workflow",
      campaign: { id: "cmp_A", name: "C" },
      launched: true,
    });
  });
});

describe("appReducer — paused transitions", () => {
  it("active → paused sets pausedAt and preserves launchedAt", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({
          id: "c1",
          status: "active",
          launchedAt: "2026-03-01T00:00:00.000Z",
        }),
      ],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "paused",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("paused");
    expect(next.campaigns[0].pausedAt).toBe("2026-04-18T12:00:00.000Z");
    expect(next.campaigns[0].launchedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("paused → active clears pausedAt but keeps launchedAt", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({
          id: "c1",
          status: "paused",
          launchedAt: "2026-03-01T00:00:00.000Z",
          pausedAt: "2026-04-10T00:00:00.000Z",
        }),
      ],
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "active",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    expect(next.campaigns[0].status).toBe("active");
    expect(next.campaigns[0].pausedAt).toBeUndefined();
    expect(next.campaigns[0].launchedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("keeps view.launched true when workflow view transitions into paused", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({
          id: "c1",
          status: "active",
          launchedAt: "2026-03-01T00:00:00.000Z",
        }),
      ],
      view: { kind: "workflow", campaign: { id: "c1", name: "C1" }, launched: true },
    };
    const next = appReducer(state, {
      type: "campaign_status_changed",
      id: "c1",
      status: "paused",
      timestamp: "2026-04-18T12:00:00.000Z",
    });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(true);
  });
});

describe("appReducer — campaign_duplicated", () => {
  it("creates a draft copy named with 'Копия —' prefix", () => {
    const original = makeCampaign({
      id: "cmp_orig",
      name: "Летний апсейл",
      status: "active",
    });
    const state: AppState = { ...initialState, campaigns: [original] };
    const next = appReducer(state, { type: "campaign_duplicated", id: "cmp_orig" });
    expect(next.campaigns).toHaveLength(2);
    const dup = next.campaigns[1];
    expect(dup.name).toBe("Копия — Летний апсейл");
    expect(dup.status).toBe("draft");
    expect("signalId" in dup).toBe(false);
    expect(dup.id).not.toBe(original.id);
    expect(dup.id).toMatch(/^cmp_/);
  });

  it("switches view to workflow pointing to the new copy (launched=false)", () => {
    const original = makeCampaign({ id: "cmp_orig", name: "Orig" });
    const state: AppState = { ...initialState, campaigns: [original] };
    const next = appReducer(state, { type: "campaign_duplicated", id: "cmp_orig" });
    if (next.view.kind !== "workflow") throw new Error("unreachable");
    expect(next.view.launched).toBe(false);
    expect(next.view.campaign.name).toBe("Копия — Orig");
    expect(next.view.campaign.id).toBe(next.campaigns[1].id);
  });

  it("is a no-op when the id is unknown", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "cmp_A" })],
    };
    const next = appReducer(state, { type: "campaign_duplicated", id: "cmp_missing" });
    expect(next).toBe(state);
  });
});

describe("appReducer — goto_stats with campaignId", () => {
  it("stores campaignId on the section view", () => {
    const next = appReducer(initialState, {
      type: "goto_stats",
      campaignId: "cmp_X",
    });
    expect(next.view).toEqual({
      kind: "section",
      name: "Статистика",
      campaignId: "cmp_X",
    });
    expect(next.activeSection).toBe("Статистика");
  });

  it("leaves campaignId undefined when not passed", () => {
    const next = appReducer(initialState, { type: "goto_stats" });
    if (next.view.kind !== "section") throw new Error("unreachable");
    expect(next.view.campaignId).toBeUndefined();
    expect(next.view.name).toBe("Статистика");
  });
});

describe("isCampaignDone", () => {
  it("returns true when any campaign is paused", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "c1", status: "paused" })],
    };
    expect(isCampaignDone(state)).toBe(true);
  });

  it("returns true for active/completed as before", () => {
    expect(
      isCampaignDone({
        ...initialState,
        campaigns: [makeCampaign({ status: "active" })],
      })
    ).toBe(true);
    expect(
      isCampaignDone({
        ...initialState,
        campaigns: [makeCampaign({ status: "completed" })],
      })
    ).toBe(true);
  });

  it("returns false for draft-only campaign lists", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [
        makeCampaign({ id: "c1", status: "draft" }),
        makeCampaign({ id: "c2", status: "draft" }),
      ],
    };
    expect(isCampaignDone(state)).toBe(false);
  });
});

describe("appReducer — survey actions", () => {
  it("survey_updated patches fields without changing status", () => {
    const next = appReducer(initialState, {
      type: "survey_updated",
      patch: { companyName: "Acme" },
    });
    expect(next.survey.companyName).toBe("Acme");
    expect(next.survey.companyWebsite).toBe("");
    expect(next.survey.directionId).toBeNull();
    expect(next.surveyStatus).toBe("not_started");
  });

  it("survey_completed stamps the survey and flips status", () => {
    const next = appReducer(initialState, {
      type: "survey_completed",
      survey: {
        companyName: "Acme",
        companyWebsite: "https://acme.com",
        directionId: "banking",
      },
    });
    expect(next.surveyStatus).toBe("completed");
    expect(next.survey).toEqual({
      companyName: "Acme",
      companyWebsite: "https://acme.com",
      directionId: "banking",
    });
  });

  it("survey_completed maps survey direction → business direction (banking → finance)", () => {
    const next = appReducer(initialState, {
      type: "survey_completed",
      survey: {
        companyName: "Acme",
        companyWebsite: "https://acme.com",
        directionId: "banking",
      },
    });
    expect(next.clientDirection).toBe("finance");
  });

  it("survey_completed maps auto-sales → auto", () => {
    const next = appReducer(initialState, {
      type: "survey_completed",
      survey: {
        companyName: "Drive",
        companyWebsite: "https://drive.ru",
        directionId: "auto-sales",
      },
    });
    expect(next.clientDirection).toBe("auto");
  });

  it("survey_completed falls back to default when direction is unknown", () => {
    const next = appReducer(initialState, {
      type: "survey_completed",
      survey: {
        companyName: "X",
        companyWebsite: "https://x.com",
        directionId: "unknown-direction-id",
      },
    });
    expect(next.clientDirection).toBe("finance");
  });

  it("open_survey switches view.kind to survey", () => {
    const next = appReducer(initialState, { type: "open_survey" });
    expect(next.view).toEqual({ kind: "survey" });
  });

  it("open_survey does not mutate survey data or surveyStatus", () => {
    const state: AppState = {
      ...initialState,
      survey: {
        companyName: "Acme",
        companyWebsite: "https://acme.example",
        directionId: "auto",
      },
      surveyStatus: "not_started",
    };
    const next = appReducer(state, { type: "open_survey" });
    expect(next.survey).toBe(state.survey);
    expect(next.surveyStatus).toBe("not_started");
  });

  it("dev_survey_force_complete flips status without touching survey data or direction", () => {
    const state: AppState = {
      ...initialState,
      survey: {
        companyName: "",
        companyWebsite: "",
        directionId: null,
      },
      surveyStatus: "not_started",
      clientDirection: "auto",
    };
    const next = appReducer(state, { type: "dev_survey_force_complete" });
    expect(next.surveyStatus).toBe("completed");
    expect(next.survey).toBe(state.survey);
    expect(next.clientDirection).toBe("auto");
  });

  it("survey_reset clears data, returns status to not_started, and restores default direction", () => {
    const state: AppState = {
      ...initialState,
      survey: {
        companyName: "Acme",
        companyWebsite: "https://acme.com",
        directionId: "banking",
      },
      surveyStatus: "completed",
      clientDirection: "auto",
      campaigns: [makeCampaign()],
    };
    const next = appReducer(state, { type: "survey_reset" });
    expect(next.surveyStatus).toBe("not_started");
    expect(next.survey).toEqual({
      companyName: "",
      companyWebsite: "",
      taskDescription: "",
      directionId: null,
    });
    expect(next.clientDirection).toBe("finance");
    // unrelated slices preserved
    expect(next.campaigns).toBe(state.campaigns);
  });
});

describe("appReducer — workflow_structural_commands", () => {
  it("workflow_structural_commands_submit captures ops and deselects", () => {
    const state: AppState = {
      ...initialState,
      selectedWorkflowNode: { id: "x", label: "X" },
    };
    const ops = [{ kind: "remove" as const, ref: "X" }];
    const next = appReducer(state, {
      type: "workflow_structural_commands_submit",
      ops,
    });
    expect(next.workflowStructuralCommands).toEqual({ ops });
    expect(next.selectedWorkflowNode).toBeNull();
  });

  it("workflow_structural_commands_handled clears pending", () => {
    const state: AppState = {
      ...initialState,
      workflowStructuralCommands: {
        ops: [{ kind: "remove" as const, ref: "X" }],
      },
    };
    const next = appReducer(state, {
      type: "workflow_structural_commands_handled",
    });
    expect(next.workflowStructuralCommands).toBeNull();
  });
});

describe("appReducer — balance_topup", () => {
  it("adds positive amounts to the balance", () => {
    const state: AppState = { ...initialState, balance: 100 };
    const next = appReducer(state, { type: "balance_topup", amount: 250 });
    expect(next.balance).toBe(350);
  });

  it("clamps negative amounts to zero (no debit via this action)", () => {
    const state: AppState = { ...initialState, balance: 100 };
    const next = appReducer(state, { type: "balance_topup", amount: -50 });
    expect(next.balance).toBe(100);
  });

  it("works from a zero starting balance", () => {
    const next = appReducer(initialState, {
      type: "balance_topup",
      amount: 1500,
    });
    expect(next.balance).toBe(1500);
  });
});

describe("appReducer — signals_badge_set", () => {
  it("sets the badge value", () => {
    const next = appReducer(initialState, {
      type: "signals_badge_set",
      value: true,
    });
    expect(next.notifications.signalsBadge).toBe(true);

    const cleared = appReducer(next, {
      type: "signals_badge_set",
      value: false,
    });
    expect(cleared.notifications.signalsBadge).toBe(false);
  });
});

describe("appReducer — wizard_random_remix", () => {
  it("wizard_random_remix increments wizardRemixToken", () => {
    const s0 = initialState;
    const s1 = appReducer(s0, { type: "wizard_random_remix" });
    const s2 = appReducer(s1, { type: "wizard_random_remix" });
    expect(s1.wizardRemixToken).toBe(s0.wizardRemixToken + 1);
    expect(s2.wizardRemixToken).toBe(s0.wizardRemixToken + 2);
  });
});

describe("workflow_node_field_set", () => {
  it("stores the pending node field patch", () => {
    const s = appReducer(initialState, {
      type: "workflow_node_field_set",
      nodeId: "sms",
      patch: { text: "Новый текст" },
    });
    expect(s.workflowNodeFieldPatch).toEqual({
      nodeId: "sms",
      patch: { text: "Новый текст" },
    });
  });

  it("clears the patch on handled", () => {
    const withPatch = appReducer(initialState, {
      type: "workflow_node_field_set",
      nodeId: "sms",
      patch: { text: "x" },
    });
    const cleared = appReducer(withPatch, {
      type: "workflow_node_field_set_handled",
    });
    expect(cleared.workflowNodeFieldPatch).toBeNull();
  });

  it("replaces a previous unhandled patch instead of accumulating", () => {
    const first = appReducer(initialState, {
      type: "workflow_node_field_set",
      nodeId: "sms",
      patch: { text: "first" },
    });
    const second = appReducer(first, {
      type: "workflow_node_field_set",
      nodeId: "email",
      patch: { subject: "second" },
    });
    expect(second.workflowNodeFieldPatch).toEqual({
      nodeId: "email",
      patch: { subject: "second" },
    });
  });
});

import {
  DEFAULT_FILTERS,
  type StatisticsFilters,
} from "@/sections/statistics/statistics-state";
import { isOnStatisticsSection } from "./app-state";

describe("appReducer — stats slice", () => {
  it("initialState.stats equals DEFAULT_FILTERS", () => {
    expect(initialState.stats).toEqual(DEFAULT_FILTERS);
  });

  it("stats_set_period replaces period", () => {
    const next = appReducer(initialState, {
      type: "stats_set_period",
      period: { preset: "custom", from: "2026-06-01", to: "2026-06-30" },
    });
    expect(next.stats.period).toEqual({
      preset: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("stats_set_calc_method changes calcMethod", () => {
    const next = appReducer(initialState, {
      type: "stats_set_calc_method",
      method: "cohort",
    });
    expect(next.stats.calcMethod).toBe("cohort");
  });

  it("stats_set_currency changes currency", () => {
    const next = appReducer(initialState, {
      type: "stats_set_currency",
      currency: "usd",
    });
    expect(next.stats.currency).toBe("usd");
  });

  it("stats_set_rows changes rows", () => {
    const next = appReducer(initialState, {
      type: "stats_set_rows",
      rows: "campaigns",
    });
    expect(next.stats.rows).toBe("campaigns");
  });

  it("stats_set_row_count changes rowCount", () => {
    const next = appReducer(initialState, {
      type: "stats_set_row_count",
      count: 10,
    });
    expect(next.stats.rowCount).toBe(10);
  });

  it("stats_set_sub_rows changes subRows", () => {
    const next = appReducer(initialState, {
      type: "stats_set_sub_rows",
      subRows: "none",
    });
    expect(next.stats.subRows).toBe("none");
  });

  it("stats_toggle_column removes existing column", () => {
    const next = appReducer(initialState, {
      type: "stats_toggle_column",
      column: "income",
    });
    expect(next.stats.columns).not.toContain("income");
  });

  it("stats_toggle_column adds missing column", () => {
    const state: AppState = {
      ...initialState,
      stats: { ...initialState.stats, columns: ["approves"] },
    };
    const next = appReducer(state, { type: "stats_toggle_column", column: "ar" });
    expect(next.stats.columns).toContain("ar");
  });

  it("stats_reorder_columns replaces columns array", () => {
    const next = appReducer(initialState, {
      type: "stats_reorder_columns",
      columns: ["ar", "rr"],
    });
    expect(next.stats.columns).toEqual(["ar", "rr"]);
  });

  it("stats_set_condition sets include scope", () => {
    const next = appReducer(initialState, {
      type: "stats_set_condition",
      scope: "include",
      entity: "campaigns",
      values: ["cmp_1", "cmp_2"],
    });
    expect(next.stats.conditions.include.campaigns).toEqual(["cmp_1", "cmp_2"]);
  });

  it("stats_set_sort sets sort", () => {
    const next = appReducer(initialState, {
      type: "stats_set_sort",
      sort: { column: "income", direction: "desc" },
    });
    expect(next.stats.sort).toEqual({ column: "income", direction: "desc" });
  });

  it("stats_reset replaces entire filters", () => {
    const custom: StatisticsFilters = {
      ...DEFAULT_FILTERS,
      rows: "campaigns",
      rowCount: 5,
    };
    const next = appReducer(initialState, { type: "stats_reset", filters: custom });
    expect(next.stats).toEqual(custom);
  });

  it("stats_apply_patch merges multiple fields at once", () => {
    const next = appReducer(initialState, {
      type: "stats_apply_patch",
      patch: {
        rows: "campaigns",
        sort: { column: "income", direction: "desc" },
        rowCount: 10,
      },
    });
    expect(next.stats.rows).toBe("campaigns");
    expect(next.stats.sort).toEqual({ column: "income", direction: "desc" });
    expect(next.stats.rowCount).toBe(10);
    expect(next.stats.currency).toBe(DEFAULT_FILTERS.currency);
  });
});

describe("isOnStatisticsSection", () => {
  it("true when view is section Статистика", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "section", name: "Статистика" },
    };
    expect(isOnStatisticsSection(state)).toBe(true);
  });

  it("false for other sections", () => {
    const state: AppState = {
      ...initialState,
      view: { kind: "section", name: "Кампании" },
    };
    expect(isOnStatisticsSection(state)).toBe(false);
  });

  it("false for non-section views", () => {
    expect(isOnStatisticsSection(initialState)).toBe(false);
  });
});

describe("appReducer — settings actions", () => {
  it("initialState carries the demo account settings", () => {
    expect(initialState.accountSettings).toEqual(DEMO_ACCOUNT_SETTINGS);
  });

  it("settings_updated shallow-merges a single field", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { companyWebsite: "newsite.ru" },
    });
    expect(next.accountSettings.companyWebsite).toBe("newsite.ru");
    // other fields untouched
    expect(next.accountSettings.companyName).toBe(
      DEMO_ACCOUNT_SETTINGS.companyName
    );
  });

  it("settings_updated merges multiple fields at once", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { regions: "Казань", brandTone: "Дружелюбный" },
    });
    expect(next.accountSettings.regions).toBe("Казань");
    expect(next.accountSettings.brandTone).toBe("Дружелюбный");
  });

  it("settings_updated replaces array fields wholesale", () => {
    const next = appReducer(initialState, {
      type: "settings_updated",
      patch: { domainBlocklist: ["a.ru", "b.ru"] },
    });
    expect(next.accountSettings.domainBlocklist).toEqual(["a.ru", "b.ru"]);
  });

  it("settings_updated does not touch survey or campaigns slices", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign()],
    };
    const next = appReducer(state, {
      type: "settings_updated",
      patch: { companyName: "X" },
    });
    expect(next.campaigns).toBe(state.campaigns);
    expect(next.survey).toBe(state.survey);
  });

  it("EMPTY_ACCOUNT_SETTINGS has empty collections", () => {
    expect(EMPTY_ACCOUNT_SETTINGS.interests).toEqual([]);
    expect(EMPTY_ACCOUNT_SETTINGS.suggestedInterests).toEqual([]);
    expect(EMPTY_ACCOUNT_SETTINGS.domainBlocklist).toEqual([]);
  });
});

describe("appReducer — open_campaign_payment", () => {
  it("switches view to campaign-payment for an existing campaign", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, {
      type: "open_campaign_payment",
      campaignId: "cmp_A",
    });
    expect(next.view).toEqual({
      kind: "campaign-payment",
      campaign: { id: "cmp_A", name: "C" },
    });
  });

  it("is a no-op for unknown campaignId", () => {
    const state: AppState = {
      ...initialState,
      campaigns: [makeCampaign({ id: "cmp_A" })],
    };
    const next = appReducer(state, {
      type: "open_campaign_payment",
      campaignId: "cmp_unknown",
    });
    expect(next).toBe(state);
  });

  it("preserves campaigns array untouched", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C" });
    const state: AppState = {
      ...initialState,
      campaigns: [c],
    };
    const next = appReducer(state, {
      type: "open_campaign_payment",
      campaignId: "cmp_A",
    });
    expect(next.campaigns).toBe(state.campaigns);
  });
});

describe("ViewAddress — campaign-payment round-trip", () => {
  it("viewToAddress maps campaign-payment view to address", () => {
    const view: View = {
      kind: "campaign-payment",
      campaign: { id: "cmp_A", name: "C" },
    };
    expect(viewToAddress(view)).toEqual({
      kind: "campaign-payment",
      campaignId: "cmp_A",
    });
  });

  it("restore_address rebuilds campaign-payment view from address", () => {
    const c = makeCampaign({ id: "cmp_A", name: "C" });
    const state: AppState = { ...initialState, campaigns: [c] };
    const next = appReducer(state, {
      type: "restore_address",
      address: { kind: "campaign-payment", campaignId: "cmp_A" },
    });
    expect(next.view).toEqual({
      kind: "campaign-payment",
      campaign: { id: "cmp_A", name: "C" },
    });
  });

  it("restore_address falls back to Кампании when campaign id is gone", () => {
    const state: AppState = { ...initialState, campaigns: [] };
    const next = appReducer(state, {
      type: "restore_address",
      address: { kind: "campaign-payment", campaignId: "cmp_missing" },
    });
    expect(next.view).toEqual({ kind: "section", name: "Кампании" });
  });
});

import { activeNavSection } from "./app-state";

describe("activeNavSection — подсветка пункта меню по view", () => {
  it("визард кампании → «Кампании»", () => {
    expect(
      activeNavSection({ ...initialState, view: { kind: "guided-campaign" } })
    ).toBe("Кампании");
  });

  it("работа с кампанией (воркфлоу/карточка/оплата/выбор типа) → «Кампании»", () => {
    expect(
      activeNavSection({
        ...initialState,
        view: { kind: "workflow", campaign: { id: "c1", name: "C" }, launched: false },
      })
    ).toBe("Кампании");
    expect(
      activeNavSection({
        ...initialState,
        view: { kind: "campaign", campaign: { id: "c1", name: "C" } },
      })
    ).toBe("Кампании");
    expect(
      activeNavSection({
        ...initialState,
        view: { kind: "campaign-payment", campaign: { id: "c1", name: "C" } },
      })
    ).toBe("Кампании");
  });

  it("раздел → имя раздела; welcome → activeSection (null)", () => {
    expect(
      activeNavSection({
        ...initialState,
        view: { kind: "section", name: "Статистика" },
      })
    ).toBe("Статистика");
    expect(
      activeNavSection({ ...initialState, view: { kind: "welcome" } })
    ).toBeNull();
  });
});

describe("appReducer — entity cards", () => {
  it("campaign_opened routes every status to the campaign card", () => {
    for (const status of ["draft", "active", "paused", "completed"] as const) {
      const state: AppState = {
        ...initialState,
        campaigns: [makeCampaign({ id: "cmp_A", name: "C", status })],
      };
      const next = appReducer(state, { type: "campaign_opened", id: "cmp_A" });
      expect(next.view).toEqual({
        kind: "campaign",
        campaign: { id: "cmp_A", name: "C" },
      });
    }
  });
});

describe("appReducer — intro overlay", () => {
  it("starts with introSeen false", () => {
    expect(initialState.introSeen).toBe(false);
  });

  it("intro_dismissed flips introSeen to true", () => {
    const next = appReducer(initialState, { type: "intro_dismissed" });
    expect(next.introSeen).toBe(true);
  });

  it("intro_dismissed is idempotent and leaves the welcome view intact", () => {
    const once = appReducer(initialState, { type: "intro_dismissed" });
    const twice = appReducer(once, { type: "intro_dismissed" });
    expect(twice.introSeen).toBe(true);
    expect(twice.view).toEqual({ kind: "welcome" });
  });
});

describe("workflowReplyId — переиспользование pending-пузыря", () => {
  it("structural_commands_submit с replyId кладёт workflowReplyId", () => {
    const s = appReducer(initialState, {
      type: "workflow_structural_commands_submit",
      ops: [],
      replyId: "m1",
    });
    expect(s.workflowReplyId).toBe("m1");
  });

  it("structural_commands_submit без replyId обнуляет workflowReplyId", () => {
    const s = appReducer(
      { ...initialState, workflowReplyId: "stale" },
      { type: "workflow_structural_commands_submit", ops: [] }
    );
    expect(s.workflowReplyId).toBeNull();
  });

  it("rebuild_submit и ai_undo_request переносят replyId", () => {
    const r = appReducer(initialState, {
      type: "workflow_rebuild_submit",
      nodes: [],
      edges: [],
      assumptions: "x",
      replyId: "m2",
    });
    expect(r.workflowReplyId).toBe("m2");
    const u = appReducer(initialState, { type: "workflow_ai_undo_request", replyId: "m3" });
    expect(u.workflowReplyId).toBe("m3");
  });

  it("workflow_reply_id_clear обнуляет", () => {
    const s = appReducer({ ...initialState, workflowReplyId: "m1" }, { type: "workflow_reply_id_clear" });
    expect(s.workflowReplyId).toBeNull();
  });
});
