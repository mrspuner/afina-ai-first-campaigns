import { describe, it, expect } from "vitest";
import { selectPromptSuggestions, type PromptBarContext } from "./select-prompt-suggestions";
import { initialState, type AppState, type CampaignStatus } from "./app-state";
import type { PromptChip, NodeTagPayload } from "./prompt-chips-context";
import type { SuggestionItem } from "@/state/suggestion-registry";

function nodeChip(nodeType: string, paramLabel?: string): PromptChip {
  const payload: NodeTagPayload = { nodeId: "n1", nodeType, color: "#fff", paramLabel };
  return { id: "chip1", kind: "node", label: paramLabel ?? "Node", payload, removable: true };
}

function campaignLogicChip(campaignId = "c1"): PromptChip {
  return {
    id: `campaign-logic_${campaignId}`,
    kind: "campaign-logic",
    label: "Логика кампании",
    payload: { campaignId },
    removable: true,
  };
}

function ctx(over: Partial<PromptBarContext> = {}): PromptBarContext {
  return { activeTag: null, hasTypedText: false, queueLength: 0, welcomeChips: [], ...over };
}

function withView(view: AppState["view"], over: Partial<AppState> = {}): AppState {
  return { ...initialState, view, ...over };
}

function mkCampaign(id: string, status: CampaignStatus) {
  return {
    id,
    name: id,
    signalId: "s1",
    status,
    createdAt: "2026-01-01",
  };
}

describe("selectPromptSuggestions — приоритеты", () => {
  it("печатает после тега → hidden", () => {
    expect(
      selectPromptSuggestions(
        withView({ kind: "welcome" }),
        ctx({ activeTag: nodeChip("sms", "Текст"), hasTypedText: true })
      ).kind
    ).toBe("hidden");
  });

  it("активный тег → node-context", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "welcome" }),
      ctx({ activeTag: nodeChip("sms", "Текст") })
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.scope.kind).toBe("node-context");
  });

  it("очередь без тега → draft-queue", () => {
    const r = selectPromptSuggestions(withView({ kind: "welcome" }), ctx({ queueLength: 2 }));
    if (r.kind !== "items") throw new Error();
    expect(r.scope.kind).toBe("draft-queue");
    expect(r.items[0].variant).toBe("brand");
  });
});

describe("selectPromptSuggestions — section.campaigns", () => {
  it("пусто → онбординг", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "section", name: "Кампании" }),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items.some((i) => i.id === "sec-camp-onboard-create")).toBe(true);
  });

  it("с фильтром active → 'active' выпадает, появляется reset", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "section", name: "Кампании" },
        { campaigns: [mkCampaign("c1", "active")], campaignFilter: ["active"] }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items.some((i) => i.id === "sec-camp-reset")).toBe(true);
    expect(r.items.some((i) => i.id === "sec-camp-active")).toBe(false);
  });

  it("с sort=conversion-desc → 'conversion' выпадает", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "section", name: "Кампании" },
        { campaigns: [mkCampaign("c1", "active")], campaignSort: "conversion-desc" }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items.some((i) => i.id === "sec-camp-conversion")).toBe(false);
  });
});

describe("selectPromptSuggestions — section.statistics", () => {
  it("отдаёт три канонических запроса статистики", () => {
    const base = withView({ kind: "section", name: "Статистика" });
    const r = selectPromptSuggestions(
      { ...base, stats: { ...base.stats, period: { preset: "this-year" }, rows: "days" } },
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items.map((i) => i.id)).toEqual([
      "sec-stats-by-campaigns",
      "sec-stats-top-campaigns",
      "sec-stats-compare-channels",
    ]);
  });
});

describe("selectPromptSuggestions — section.artifacts", () => {
  it("раздел «Артефакты» отдаёт набор онбординг-чипов", () => {
    // Сигналы как сущность удалены — раздел «Артефакты» отдаёт онбординг-чипы.
    const r = selectPromptSuggestions(
      withView({ kind: "section", name: "Артефакты" }),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items).toHaveLength(2);
    expect(r.items.some((i) => i.id === "sec-sig-empty-what")).toBe(true);
    expect(r.items.some((i) => i.id === "sec-sig-empty-create")).toBe(true);
  });
});

describe("selectPromptSuggestions — section.settings", () => {
  it("дефолтный demo-account имеет интересы → 'Управлять интеграциями'", () => {
    // initialState.accountSettings = DEMO_ACCOUNT_SETTINGS — у него есть
    // interests/regions/domainBlocklist, значит hasIntegrations=true.
    const r = selectPromptSuggestions(
      withView({ kind: "section", name: "Настройки" }),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.items.some((i) => i.id === "sec-set-integrations-manage")).toBe(true);
  });
});

describe("selectPromptSuggestions — guided-campaign reads screenHints", () => {
  // The wizard branch no longer maps a numeric step → hints. Each active wizard
  // screen publishes its own set into `state.screenHints` (via useScreenHints);
  // the selector renders exactly that. The CONTENT of each screen's set lives
  // in (and is covered by) steps/screen-hints.test.ts.
  const sampleHints: SuggestionItem[] = [
    { id: "wiz-x-a", label: "A?", action: { kind: "ask", prompt: "a?" } },
    { id: "wiz-x-b", label: "B?", action: { kind: "ask", prompt: "b?" } },
  ];

  it("no published hints → hidden", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "guided-campaign" }, { screenHints: [] }),
      ctx()
    );
    expect(r.kind).toBe("hidden");
  });

  it("returns exactly the active screen's declared hints under a wizard-screen scope", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "guided-campaign" }, { screenHints: sampleHints }),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.scope.kind).toBe("wizard-screen");
    expect(r.items).toEqual(sampleHints);
  });

  it("ignores wizardCurrentStep entirely (no central step→hints map)", () => {
    // A non-null step with no published hints is still hidden — proving the old
    // index-based mapping is gone and can't resurface wrong/empty hints.
    const r = selectPromptSuggestions(
      withView({ kind: "guided-campaign" }, { wizardCurrentStep: 2, screenHints: [] }),
      ctx()
    );
    expect(r.kind).toBe("hidden");
  });

  it("input-driven overrides still win over screen hints (active node tag)", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "guided-campaign" }, { screenHints: sampleHints }),
      ctx({ activeTag: nodeChip("sms", "Текст") })
    );
    if (r.kind !== "items") throw new Error();
    expect(r.scope.kind).toBe("node-context");
  });
});

describe("selectPromptSuggestions — campaign-feed status-aware", () => {
  it("workflow launched=false без выбранной ноды → scope сценария", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "workflow", campaign: { id: "c1", name: "X" }, launched: false }),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    expect(r.scope.kind).toBe("workflow-scenario");
    expect(r.items.some((i) => i.label === "Настроить логику сценария")).toBe(true);
  });

  it("workflow launched=true, campaign paused → status=paused", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "workflow", campaign: { id: "c1", name: "X" }, launched: true },
        { campaigns: [mkCampaign("c1", "paused")] }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    if (r.scope.kind === "campaign-feed") expect(r.scope.status).toBe("paused");
    expect(r.items.some((i) => i.label === "Возобновить")).toBe(true);
  });

  it("campaign view → status из state.campaigns", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "campaign", campaign: { id: "c1", name: "X" } },
        { campaigns: [mkCampaign("c1", "completed")] }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error();
    if (r.scope.kind === "campaign-feed") expect(r.scope.status).toBe("completed");
  });
});

describe("selectPromptSuggestions — ai-undo suggestion", () => {
  it("aiUndoAvailable=true + редактируемый workflow → подсказка ai-undo первая", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "workflow", campaign: { id: "c1", name: "X" }, launched: false },
        { aiUndoAvailable: true }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.items[0].id).toBe("ai-undo");
    expect(r.items[0].label).toBe("↩ Откатить");
    expect(r.items[0].action.kind).toBe("dispatch");
    if (r.items[0].action.kind === "dispatch") {
      expect(r.items[0].action.action.type).toBe("workflow_ai_undo_request");
    }
  });

  it("aiUndoAvailable=false + редактируемый workflow → подсказка ai-undo отсутствует", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "workflow", campaign: { id: "c1", name: "X" }, launched: false },
        { aiUndoAvailable: false }
      ),
      ctx()
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.items.some((i) => i.id === "ai-undo")).toBe(false);
  });

  it("aiUndoAvailable=true + запущенный (launched) workflow → ai-undo не появляется", () => {
    const r = selectPromptSuggestions(
      withView(
        { kind: "workflow", campaign: { id: "c1", name: "X" }, launched: true },
        { aiUndoAvailable: true, campaigns: [mkCampaign("c1", "active")] }
      ),
      ctx()
    );
    // launched=true → campaign-feed, не workflow-scenario → нет ai-undo
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.items.some((i) => i.id === "ai-undo")).toBe(false);
  });
});

describe("selectPromptSuggestions — тег «Логика кампании» (карточка)", () => {
  const campaignView: AppState["view"] = {
    kind: "campaign",
    campaign: { id: "c1", name: "X" },
  };

  it("активный тег campaign-logic на карточке → scope campaign-logic с 5 подсказками структуры", () => {
    const r = selectPromptSuggestions(
      withView(campaignView),
      ctx({ activeTag: campaignLogicChip("c1") })
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.scope.kind).toBe("campaign-logic");
    expect(r.items.map((i) => i.label)).toEqual([
      "Добавить шаг",
      "Изменить ветвление / условие",
      "Поменять задержку",
      "Добавить или убрать канал",
      "Изменить порядок касаний",
    ]);
    // AI-иконка — единственный жёлтый сигнал; сами подсказки не brand.
    expect(r.items.every((i) => i.variant !== "brand")).toBe(true);
  });

  it("печать после тега campaign-logic → hidden (правило 1)", () => {
    const r = selectPromptSuggestions(
      withView(campaignView),
      ctx({ activeTag: campaignLogicChip("c1"), hasTypedText: true })
    );
    expect(r.kind).toBe("hidden");
  });
});

describe("selectPromptSuggestions — section-чипы интересов/триггеров скоринга", () => {
  it("section-чип «Триггеры» даёт scoring-подсказки, а не hidden", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "welcome" }),
      ctx({
        activeTag: {
          id: "section_triggers",
          kind: "section",
          label: "Триггеры",
          payload: "triggers",
          removable: true,
        },
      })
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.scope.kind).toBe("node-context");
  });

  it("section-чип «Интересы» даёт scoring-подсказки, а не hidden", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "welcome" }),
      ctx({
        activeTag: {
          id: "section_interests",
          kind: "section",
          label: "Интересы",
          payload: "interests",
          removable: true,
        },
      })
    );
    if (r.kind !== "items") throw new Error("expected items");
    expect(r.scope.kind).toBe("node-context");
  });
});

describe("selectPromptSuggestions — welcome / awaiting / select", () => {
  it("welcome без чипов → hidden", () => {
    expect(
      selectPromptSuggestions(withView({ kind: "welcome" }), ctx()).kind
    ).toBe("hidden");
  });

  it("welcome с чипами → welcome-wave", () => {
    const r = selectPromptSuggestions(
      withView({ kind: "welcome" }),
      ctx({ welcomeChips: [{ id: "w1", label: "?", next: "s1-w1" }] })
    );
    if (r.kind !== "items") throw new Error();
    expect(r.scope.kind).toBe("welcome-wave");
  });
});
