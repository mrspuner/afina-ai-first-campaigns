import { describe, it, expect } from "vitest";
import {
  findInformationalEntry,
  lookupInformationalReply,
  warmFallbackReply,
  allReplyEntries,
  normalize,
} from "./informational-replies";
import { resolveWizardStep } from "@/state/suggestion-registry/wizard";
import { resolveSection } from "@/state/suggestion-registry/sections";
import {
  resolveAwaitingCampaign,
  resolveCampaignSelect,
} from "@/state/suggestion-registry/views";
import type { SuggestionItem, WizardSub } from "@/state/suggestion-registry/types";

// Собираем все ask-подсказки из реестра, которые проходят через chatSubmit и
// которые мы покрываем (разделы инфо, визард, awaiting/campaign-select).
function collectRegistryAsks(): SuggestionItem[] {
  const items: SuggestionItem[] = [];

  const wizardSubs: WizardSub[] = [
    { step: 1 },
    { step: 2, hasInterests: false, hasDomains: false },
    { step: 2, hasInterests: true, hasDomains: true },
    { step: 2, hasInterests: true, hasDomains: false },
    { step: 2, hasInterests: false, hasDomains: true },
    { step: 3 },
    { step: 4 },
    { step: 5 },
    { step: 6, nameSet: false },
    { step: 6, nameSet: true },
    { step: 7 },
    { step: 8 },
  ];
  for (const sub of wizardSubs) items.push(...resolveWizardStep(sub));

  // Разделы: эмпти-варианты + полные фильтры.
  items.push(...resolveSection({ kind: "campaigns", hasCampaigns: false, activeFilter: [], sort: "default" }));
  // SIGNALS_EMPTY (что такое сигналы) — единственный набор для signals-sub
  // после удаления сигналов как сущности.
  items.push(...resolveSection({ kind: "signals" }));
  items.push(...resolveSection({ kind: "settings", isBasicTariff: true, hasIntegrations: false }));
  items.push(...resolveSection({ kind: "settings", isBasicTariff: false, hasIntegrations: true }));

  items.push(...resolveAwaitingCampaign());
  items.push(...resolveCampaignSelect());

  return items.filter((i) => i.action.kind === "ask");
}

describe("informational-replies — каталог", () => {
  it("первая match-фраза каждой записи разрешается в саму запись", () => {
    for (const entry of allReplyEntries()) {
      const found = findInformationalEntry(entry.match[0]);
      expect(found, `entry ${entry.id} (${entry.match[0]})`).not.toBeNull();
      expect(found?.id, `entry ${entry.id}`).toBe(entry.id);
    }
  });

  it("у каждой записи непустые match и replies", () => {
    for (const entry of allReplyEntries()) {
      expect(entry.match.length, entry.id).toBeGreaterThan(0);
      expect(entry.replies.length, entry.id).toBeGreaterThan(0);
      for (const r of entry.replies) expect(r.trim().length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("informational-replies — кросс-проверка с реестром", () => {
  const coveredIds = new Set(allReplyEntries().map((e) => e.id));
  const asks = collectRegistryAsks();

  it("каждый покрытый ask-prompt из реестра матчится точно в свою запись (нет дрейфа формулировок)", () => {
    const covered = asks.filter((a) => coveredIds.has(a.id));
    // sanity: мы реально что-то собрали и покрыли
    expect(covered.length).toBeGreaterThan(20);
    for (const item of covered) {
      if (item.action.kind !== "ask") continue;
      const found = findInformationalEntry(item.action.prompt);
      expect(found?.id, `chip ${item.id}: «${item.action.prompt}»`).toBe(item.id);
    }
  });
});

describe("informational-replies — устойчивость к вариациям", () => {
  it("распознаёт перефразировки", () => {
    expect(findInformationalEntry("что такое сигналы")?.id).toBe("sec-sig-empty-what");
    expect(findInformationalEntry("что такое сигнал")?.id).toBe("sec-sig-empty-what");
    expect(findInformationalEntry("с чего начать")?.id).toBe("wiz-2-where-start");
    expect(findInformationalEntry("как назвать сигнал")?.id).toBe("wiz-6-name-q");
  });

  it("различает близкие пары вопросов, а не отвечает наугад", () => {
    expect(findInformationalEntry("зачем триггеры")?.id).toBe("wiz-2-need-trigger");
    expect(findInformationalEntry("зачем интересы")?.id).toBe("wiz-2-need-interests");
    expect(findInformationalEntry("что такое триггер")?.id).toBe("wiz-2-what-trigger");
  });

  it("инфлексии слов матчатся (сигнал/сигналы/сигналов)", () => {
    expect(findInformationalEntry("покажи готовый сигнал")?.id).toBe("sec-sig-filter-ready");
  });

  it("посторонний текст не распознаётся → null (уйдёт в тёплый fallback)", () => {
    expect(findInformationalEntry("какая сегодня погода в москве")).toBeNull();
    expect(findInformationalEntry("привет")).toBeNull();
    expect(findInformationalEntry("")).toBeNull();
  });
});

describe("informational-replies — выдача ответа", () => {
  it("lookupInformationalReply возвращает один из вариантов записи", () => {
    const entry = allReplyEntries().find((e) => e.id === "sec-sig-empty-what")!;
    const reply = lookupInformationalReply(entry.match[0]);
    expect(reply).not.toBeNull();
    expect(entry.replies).toContain(reply);
  });

  it("нераспознанное → null из lookup", () => {
    expect(lookupInformationalReply("случайная фраза про погоду")).toBeNull();
  });

  it("warmFallbackReply — непустая строка без сухого дисклеймера про прототип", () => {
    const r = warmFallbackReply();
    expect(r.trim().length).toBeGreaterThan(0);
    expect(normalize(r)).not.toContain("реального ответа не будет");
  });
});
