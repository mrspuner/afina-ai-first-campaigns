import { describe, it, expect } from "vitest";
import {
  TIER_QUOTA,
  TIER_SPREAD,
  SERVICE_SHARE,
  tierForTrigger,
  SERVICE_PREFIXES,
  REGION_PREFIXES,
  fillSubdomains,
  type DomainTier,
} from "./subdomain-fill";

describe("tierForTrigger", () => {
  it("квоты тиров — 3 / 7 / 12, разброс сверху — 2 / 4 / 6 (диапазон 3–5 / 7–11 / 12–18)", () => {
    expect(TIER_QUOTA.shallow).toBe(3);
    expect(TIER_QUOTA.medium).toBe(7);
    expect(TIER_QUOTA.deep).toBe(12);
    expect(TIER_SPREAD.shallow).toBe(2);
    expect(TIER_SPREAD.medium).toBe(4);
    expect(TIER_SPREAD.deep).toBe(6);
  });

  it("федеральные потребительские порталы — deep", () => {
    expect(tierForTrigger("credit-banks")).toBe("deep");
    expect(tierForTrigger("apartment-listings")).toBe("deep");
    expect(tierForTrigger("food-grocery")).toBe("deep");
  });

  it("нишевые справочники и калькуляторы — shallow", () => {
    expect(tierForTrigger("mortgage-calculators")).toBe("shallow");
    expect(tierForTrigger("osago-calculators")).toBe("shallow");
    expect(tierForTrigger("procurement-suppliers")).toBe("shallow");
  });

  it("всё остальное — medium, включая незнакомый триггер", () => {
    expect(tierForTrigger("credit-aggregators")).toBe("medium");
    expect(tierForTrigger("hr-job-boards")).toBe("medium");
    expect(tierForTrigger("совершенно-новый-триггер")).toBe("medium");
  });
});

/** Префикс поддомена третьего уровня: `lk.sberbank.ru` при корне
 *  `sberbank.ru` → `lk`. Тестовый помощник, зеркалит логику генератора. */
const prefix = (sub: string, root: string) => sub.slice(0, -`.${root}`.length);

describe("fillSubdomains", () => {
  it("из пустой группы добирает от планки до планки+разброса — не одно и то же число для каждого тира", () => {
    for (const tier of ["shallow", "medium", "deep"] as const) {
      const result = fillSubdomains("example.ru", [], tier);
      expect(result.length, tier).toBeGreaterThanOrEqual(TIER_QUOTA[tier]);
      expect(result.length, tier).toBeLessThanOrEqual(TIER_QUOTA[tier] + TIER_SPREAD[tier]);
    }
  });

  // Это и есть свойство, из-за отсутствия которого баг был замечен: раньше
  // добор всегда бил ровно в планку, поэтому все корни одного тира несли
  // одинаковый ·N — карточка триггера читалась как сгенерированная. Разные
  // корни обязаны получать разное (но детерминированное) количество.
  it("количество добора варьируется между корнями одного тира — не все ·N одинаковые", () => {
    const roots = [
      "alpha.ru", "bravo.ru", "charlie.ru", "delta.ru",
      "echo.ru", "foxtrot.ru", "golf.ru", "hotel.ru",
      "india.ru", "juliet.ru",
    ];
    const lengths = roots.map((root) => fillSubdomains(root, [], "deep").length);
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  it("рукописные сохранены, идут первыми и в исходном порядке; итог — в диапазоне тира", () => {
    const existing = ["online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"];
    const result = fillSubdomains("sberbank.ru", existing, "deep");
    expect(result.length).toBeGreaterThanOrEqual(TIER_QUOTA.deep);
    expect(result.length).toBeLessThanOrEqual(TIER_QUOTA.deep + TIER_SPREAD.deep);
    expect(result.slice(0, 3)).toEqual(existing);
  });

  it("пин: sberbank.ru/deep даёт ровно 14 поддоменов — фиксирует детерминизм отрисованного количества", () => {
    // Число 14 — не планка (12) и не случайное на глаз: оно фиксирует, что
    // ГПСЧ по корню `sberbank.ru` детерминированно даёт +2 сверху планки
    // для тира deep. Если это число когда-нибудь поменяется без изменения
    // сида/формулы — тест поймает регрессию детерминизма.
    const existing = ["online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"];
    expect(fillSubdomains("sberbank.ru", existing, "deep")).toHaveLength(14);
  });

  it("префикс рукописного поддомена не дублируется в доборе", () => {
    // `online` и `my` есть в сервисном пуле — добор обязан их пропустить.
    const existing = ["online.example.ru", "my.example.ru"];
    const result = fillSubdomains("example.ru", existing, "deep");
    const prefixes = result.map((s) => prefix(s, "example.ru"));
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(prefixes.filter((p) => p === "online")).toHaveLength(1);
    expect(prefixes.filter((p) => p === "my")).toHaveLength(1);
  });

  it("группа, чьи рукописные уже не меньше отрисованной планки, не изменяется — и не сжимается, если их больше", () => {
    const root = "example.ru";
    const tier: DomainTier = "shallow";
    const drawnTarget = fillSubdomains(root, [], tier).length;

    // Ровно на отрисованной планке — добора не происходит.
    const atTarget = Array.from({ length: drawnTarget }, (_, i) => `custom${i}.${root}`);
    expect(fillSubdomains(root, atTarget, tier)).toEqual(atTarget);

    // Рукописных больше отрисованной планки — группа не сжимается до неё.
    const aboveTarget = [...atTarget, `extra1.${root}`, `extra2.${root}`];
    expect(fillSubdomains(root, aboveTarget, tier)).toEqual(aboveTarget);
  });

  it("один и тот же корень даёт идентичный результат при повторном вызове", () => {
    const a = fillSubdomains("example.ru", [], "deep");
    const b = fillSubdomains("example.ru", [], "deep");
    expect(a).toEqual(b);
  });

  it("разные корни дают разные наборы префиксов", () => {
    const a = fillSubdomains("alpha.ru", [], "deep").map((s) => prefix(s, "alpha.ru"));
    const b = fillSubdomains("bravo.ru", [], "deep").map((s) => prefix(s, "bravo.ru"));
    expect(a).not.toEqual(b);
  });

  it("у глубокого тира в доборе есть хотя бы один региональный префикс", () => {
    const result = fillSubdomains("example.ru", [], "deep");
    const prefixes = result.map((s) => prefix(s, "example.ru"));
    expect(prefixes.some((p) => REGION_PREFIXES.includes(p))).toBe(true);
  });

  it("пропорция добора — 55% сервисных, округление вверх — от фактически отрисованного количества", () => {
    for (const tier of ["shallow", "medium", "deep"] as const) {
      const result = fillSubdomains("example.ru", [], tier);
      const prefixes = result.map((s) => prefix(s, "example.ru"));
      const serviceCount = prefixes.filter((p) => SERVICE_PREFIXES.includes(p)).length;
      expect(serviceCount, tier).toBe(Math.ceil(result.length * SERVICE_SHARE));
    }
  });

  it("пропорция считается от добора (отрисованная планка минус рукописные), а не от планки тира", () => {
    const root = "example.ru";
    const tier: DomainTier = "deep";
    const existing = ["one.example.ru", "two.example.ru", "three.example.ru"];
    // Тот же корень и тир => тот же ГПСЧ-поток => та же отрисованная планка,
    // независимо от того, что передано в `existing`.
    const target = fillSubdomains(root, [], tier).length;
    const need = target - existing.length;

    const added = fillSubdomains(root, existing, tier)
      .slice(existing.length)
      .map((s) => prefix(s, root));
    expect(added).toHaveLength(need);
    const serviceCount = added.filter((p) => SERVICE_PREFIXES.includes(p)).length;
    expect(serviceCount).toBe(Math.ceil(need * SERVICE_SHARE));
    expect(added.length - serviceCount).toBe(need - serviceCount);
  });

  it("работает с составными и нестандартными TLD", () => {
    for (const root of ["credit.club", "finbroker.pro", "splitka.io"]) {
      const result = fillSubdomains(root, [], "medium");
      expect(result.length).toBeGreaterThanOrEqual(TIER_QUOTA.medium);
      expect(result.length).toBeLessThanOrEqual(TIER_QUOTA.medium + TIER_SPREAD.medium);
      for (const sub of result) {
        expect(sub.endsWith(`.${root}`)).toBe(true);
        expect(prefix(sub, root)).not.toContain(".");
      }
    }
  });

  it("рукописный поддомен, не подчинённый корню, добор не ломает", () => {
    // Защита от кривых данных: такой поддомен просто не даёт занятого префикса.
    const result = fillSubdomains("example.ru", ["чужое.other.ru"], "shallow");
    expect(result.length).toBeGreaterThanOrEqual(TIER_QUOTA.shallow);
    expect(result.length).toBeLessThanOrEqual(TIER_QUOTA.shallow + TIER_SPREAD.shallow);
    expect(result[0]).toBe("чужое.other.ru");
  });
});
