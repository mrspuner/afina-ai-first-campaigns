import { describe, it, expect } from "vitest";
import { resolveSuggestions } from "./registry";
import type { Scope, SuggestionItem } from "./types";
import type { WorkflowNodeType, NodeParams } from "@/types/workflow";
import type { CampaignStatus } from "@/state/app-state";

const NODE_FIXTURE: Array<{ nodeType: WorkflowNodeType; params: string[] }> = [
  { nodeType: "sms", params: ["Текст", "Alpha-name", "Время", "Ссылка"] },
  { nodeType: "email", params: ["Тема", "Текст", "Отправитель", "Ссылка"] },
  { nodeType: "push", params: ["Заголовок", "Текст", "Deeplink"] },
  { nodeType: "ivr", params: ["Сценарий", "Голос"] },
  { nodeType: "wait", params: ["Длительность", "До события"] },
  { nodeType: "condition", params: ["Триггер"] },
  { nodeType: "split", params: ["По", "Ветки"] },
  { nodeType: "signal", params: [] },
  { nodeType: "success", params: ["Цель"] },
  { nodeType: "end", params: ["Причина"] },
];

const PARAMS_KINDS = [
  "sms", "email", "push", "ivr", "wait", "condition", "split",
  "scoring", "signal", "success", "end",
] as const satisfies ReadonlyArray<NodeParams["kind"]>;
type _ExhaustiveCheck = Exclude<NodeParams["kind"], (typeof PARAMS_KINDS)[number]>;
const _verifyExhaustive: _ExhaustiveCheck extends never ? true : false = true;
void _verifyExhaustive;

function assertValid(items: SuggestionItem[], hint: string) {
  expect(items.length, `${hint}: empty`).toBeGreaterThan(0);
  const ids = new Set<string>();
  for (const item of items) {
    expect(item.id, `${hint}: id`).toBeTruthy();
    expect(item.label, `${hint}: label`).toBeTruthy();
    expect(ids.has(item.id), `${hint}: duplicate id ${item.id}`).toBe(false);
    ids.add(item.id);
    expect(["ask", "submit", "dispatch", "chat-submit", "command"]).toContain(item.action.kind);
  }
}

describe("registry — node-context", () => {
  for (const { nodeType, params } of NODE_FIXTURE) {
    it(`whole-node ${nodeType}`, () => {
      assertValid(
        resolveSuggestions({ kind: "node-context", nodeType }),
        `${nodeType}/__node__`
      );
    });
    for (const param of params) {
      it(`${nodeType} / ${param}`, () => {
        assertValid(
          resolveSuggestions({ kind: "node-context", nodeType, paramLabel: param }),
          `${nodeType}/${param}`
        );
      });
    }
  }

  describe("scoring node-context", () => {
    it("отдаёт подсказки для целого узла скоринга", () => {
      const items = resolveSuggestions({ kind: "node-context", nodeType: "scoring" });
      expect(items.length).toBeGreaterThan(0);
      expect(items.map((i) => i.label)).toContain("Сузить аудиторию");
    });
    it("отдаёт подсказки для параметра «Триггеры»", () => {
      const items = resolveSuggestions({
        kind: "node-context", nodeType: "scoring", paramLabel: "Триггеры",
      });
      expect(items.some((i) => i.action.kind === "submit")).toBe(true);
    });
  });

  it("unknown nodeType → GENERIC fallback", () => {
    assertValid(
      resolveSuggestions({ kind: "node-context", nodeType: "default" as WorkflowNodeType }),
      "default → generic"
    );
  });

  it("known nodeType + неизвестный paramLabel → whole-node fallback", () => {
    assertValid(
      resolveSuggestions({ kind: "node-context", nodeType: "sms", paramLabel: "??" }),
      "sms/unknown"
    );
  });
});

describe("registry — section.campaigns (filter-aware)", () => {
  it("hasCampaigns=false → онбординг (2 чипа)", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "campaigns", hasCampaigns: false, activeFilter: [], sort: "default" },
    });
    assertValid(items, "campaigns/empty");
    expect(items.find((i) => i.label.includes("первую кампанию"))).toBeDefined();
  });

  it("hasCampaigns=true, без фильтров → выдаёт сорт+фильтры, без reset", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "campaigns", hasCampaigns: true, activeFilter: [], sort: "default" },
    });
    assertValid(items, "campaigns/with");
    expect(items.find((i) => i.id === "sec-camp-reset")).toBeUndefined();
  });

  it("активный filter[active] → 'active' выпадает из набора, появляется reset", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "campaigns", hasCampaigns: true, activeFilter: ["active"], sort: "default" },
    });
    assertValid(items, "campaigns/active");
    expect(items.find((i) => i.id === "sec-camp-reset")).toBeDefined();
    expect(items.find((i) => i.id === "sec-camp-active")).toBeUndefined();
  });

  it("sort=conversion-desc → 'conversion' выпадает, остаётся reset", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "campaigns", hasCampaigns: true, activeFilter: [], sort: "conversion-desc" },
    });
    expect(items.find((i) => i.id === "sec-camp-conversion")).toBeUndefined();
    expect(items.find((i) => i.id === "sec-camp-reset")).toBeDefined();
  });
});

describe("registry — section.statistics (3 рабочих запроса)", () => {
  it("всегда отдаёт ровно три канонических запроса", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "statistics", period: "today", rowKind: "campaigns" },
    });
    assertValid(items, "stats");
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.action.kind === "submit")).toBe(true);
    expect(items.map((i) => i.id)).toEqual([
      "sec-stats-by-campaigns",
      "sec-stats-top-campaigns",
      "sec-stats-compare-channels",
    ]);
  });

  it("набор не зависит от period/rowKind", () => {
    const a = resolveSuggestions({
      kind: "section",
      sub: { kind: "statistics", period: "this-month", rowKind: "days" },
    });
    const b = resolveSuggestions({
      kind: "section",
      sub: { kind: "statistics", period: "this-year", rowKind: "channels" },
    });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
});

describe("registry — section.signals (онбординг)", () => {
  // Сигналы как сущность удалены (campaign-first); sub отдаёт онбординг-чипы,
  // которые временно переиспользует раздел «Артефакты».
  it("отдаёт ровно 2 онбординг-чипа: вопрос и создание", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "signals" },
    });
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.id === "sec-sig-empty-what")).toBe(true);
    expect(items.some((i) => i.id === "sec-sig-empty-create")).toBe(true);
    const createChip = items.find((i) => i.id === "sec-sig-empty-create")!;
    expect(createChip.action.kind).toBe("dispatch");
  });
});

describe("registry — section.settings", () => {
  it("базовый тариф + интеграций нет → upgrade + add-integrations", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "settings", hasIntegrations: false, isBasicTariff: true },
    });
    assertValid(items, "settings/basic");
    expect(items.some((i) => i.id === "sec-set-tariff-up")).toBe(true);
    expect(items.some((i) => i.id === "sec-set-integrations-add")).toBe(true);
  });

  it("интеграции есть → 'Управлять' вместо 'Подключить'", () => {
    const items = resolveSuggestions({
      kind: "section",
      sub: { kind: "settings", hasIntegrations: true, isBasicTariff: true },
    });
    expect(items.some((i) => i.id === "sec-set-integrations-manage")).toBe(true);
    expect(items.some((i) => i.id === "sec-set-integrations-add")).toBe(false);
  });
});

describe("registry — trigger context", () => {
  // Wizard step questions moved to co-located useScreenHints (see
  // steps/screen-hints.ts + screen-hints.test.ts). The registry keeps only the
  // active-trigger-tag chip, which depends on the bar's input, not the screen.
  it("trigger-context → только чип проверки доменов", () => {
    const items = resolveSuggestions({ kind: "trigger-context" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("wiz-2-check-domains");
    expect(items[0].action.kind).toBe("submit");
  });
});

describe("registry — views & commands", () => {
  it.each(["draft", "active", "paused", "completed"] satisfies CampaignStatus[])(
    "campaign-feed status=%s",
    (status) => {
      const items = resolveSuggestions({ kind: "campaign-feed", status });
      assertValid(items, `feed/${status}`);
    }
  );

  it("campaign-feed paused → 'Возобновить'", () => {
    const items = resolveSuggestions({ kind: "campaign-feed", status: "paused" });
    expect(items.some((i) => i.label === "Возобновить")).toBe(true);
    expect(items.every((i) => i.action.kind === "ask")).toBe(true);
  });

  it("campaign-feed completed → 'Запустить копию'", () => {
    const items = resolveSuggestions({ kind: "campaign-feed", status: "completed" });
    expect(items.some((i) => i.label === "Запустить копию")).toBe(true);
  });

  it("awaiting / select", () => {
    assertValid(resolveSuggestions({ kind: "awaiting-campaign" }), "awaiting");
    assertValid(resolveSuggestions({ kind: "campaign-select" }), "select");
  });

  it("draft-queue → один brand apply-all", () => {
    const items = resolveSuggestions({ kind: "draft-queue" });
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("brand");
  });

  it("welcome-wave маппит чипы", () => {
    const items = resolveSuggestions({
      kind: "welcome-wave",
      chips: [{ id: "c1", label: "Что?", next: "x" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].action.kind).toBe("chat-submit");
  });
});

describe("registry — глобальная уникальность id", () => {
  it("все ключевые scope дают уникальные id", () => {
    const scopes: Scope[] = [
      ...NODE_FIXTURE.map((n) => ({ kind: "node-context" as const, nodeType: n.nodeType })),
      { kind: "draft-queue" },
      { kind: "section", sub: { kind: "campaigns", hasCampaigns: true, activeFilter: [], sort: "default" } },
      { kind: "section", sub: { kind: "campaigns", hasCampaigns: false, activeFilter: [], sort: "default" } },
      { kind: "section", sub: { kind: "statistics", period: "this-month", rowKind: "campaigns" } },
      { kind: "section", sub: { kind: "signals" } },
      { kind: "section", sub: { kind: "settings", hasIntegrations: true, isBasicTariff: false } },
      { kind: "awaiting-campaign" },
      { kind: "campaign-select" },
      { kind: "campaign-feed", status: "active" },
      { kind: "campaign-feed", status: "paused" },
    ];
    for (const scope of scopes) {
      const items = resolveSuggestions(scope);
      const ids = items.map((i) => i.id);
      expect(new Set(ids).size, `dup in ${scope.kind}`).toBe(ids.length);
    }
  });
});
