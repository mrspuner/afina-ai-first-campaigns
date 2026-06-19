import { describe, expect, it } from "vitest";
import { wireNavigateSchema, toNavigateTarget } from "./navigate-schema";

describe("wireNavigateSchema", () => {
  it("section Статистика валиден", () => {
    const r = wireNavigateSchema.safeParse({ kind: "section", section: "Статистика" });
    expect(r.success).toBe(true);
  });

  it("section Артефакты валиден", () => {
    const r = wireNavigateSchema.safeParse({ kind: "section", section: "Артефакты" });
    expect(r.success).toBe(true);
  });

  it("section без поля section валиден (схема не делает его required)", () => {
    // section опциональное в схеме; toNavigateTarget вернёт null
    const r = wireNavigateSchema.safeParse({ kind: "section" });
    expect(r.success).toBe(true);
  });

  it("section «Лендинги» отклоняется схемой", () => {
    const r = wireNavigateSchema.safeParse({ kind: "section", section: "Лендинги" });
    expect(r.success).toBe(false);
  });

  it("campaign-workflow с campaignId валиден", () => {
    const r = wireNavigateSchema.safeParse({ kind: "campaign-workflow", campaignId: "cmp_abc" });
    expect(r.success).toBe(true);
  });

  it("неизвестный kind отклоняется", () => {
    const r = wireNavigateSchema.safeParse({ kind: "dashboard" });
    expect(r.success).toBe(false);
  });
});

describe("toNavigateTarget", () => {
  it("section Статистика → target", () => {
    const target = toNavigateTarget({ kind: "section", section: "Статистика" });
    expect(target).toEqual({ kind: "section", name: "Статистика" });
  });

  it("section без поля section → null", () => {
    const target = toNavigateTarget({ kind: "section" });
    expect(target).toBeNull();
  });

  it("campaign-workflow с id → target", () => {
    const target = toNavigateTarget({ kind: "campaign-workflow", campaignId: "cmp_abc" });
    expect(target).toEqual({ kind: "campaign-workflow", campaignId: "cmp_abc" });
  });

  it("campaign-workflow без id → null", () => {
    const target = toNavigateTarget({ kind: "campaign-workflow" });
    expect(target).toBeNull();
  });
});
