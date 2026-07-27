import { describe, it, expect } from "vitest";
import {
  TIER_QUOTA,
  tierForTrigger,
  SERVICE_PREFIXES,
  REGION_PREFIXES,
  fillSubdomains,
} from "./subdomain-fill";

describe("tierForTrigger", () => {
  it("квоты тиров — 3 / 7 / 12", () => {
    expect(TIER_QUOTA.shallow).toBe(3);
    expect(TIER_QUOTA.medium).toBe(7);
    expect(TIER_QUOTA.deep).toBe(12);
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
  it("из пустой группы добирает ровно до планки каждого тира", () => {
    expect(fillSubdomains("example.ru", [], "shallow")).toHaveLength(3);
    expect(fillSubdomains("example.ru", [], "medium")).toHaveLength(7);
    expect(fillSubdomains("example.ru", [], "deep")).toHaveLength(12);
  });

  it("рукописные сохранены, идут первыми и в исходном порядке", () => {
    const existing = ["online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"];
    const result = fillSubdomains("sberbank.ru", existing, "deep");
    expect(result).toHaveLength(12);
    expect(result.slice(0, 3)).toEqual(existing);
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

  it("группа, где рукописных не меньше планки, не изменяется", () => {
    const existing = ["a.example.ru", "b.example.ru", "c.example.ru", "d.example.ru"];
    expect(fillSubdomains("example.ru", existing, "shallow")).toEqual(existing);
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

  it("пропорция добора — 55% сервисных, округление вверх", () => {
    const forTier = (tier: "shallow" | "medium" | "deep") =>
      fillSubdomains("example.ru", [], tier)
        .map((s) => prefix(s, "example.ru"))
        .filter((p) => SERVICE_PREFIXES.includes(p)).length;
    expect(forTier("shallow")).toBe(2); // ceil(3 * 0.55)
    expect(forTier("medium")).toBe(4); // ceil(7 * 0.55)
    expect(forTier("deep")).toBe(7); // ceil(12 * 0.55)
  });

  it("пропорция считается от добора, а не от планки", () => {
    // 3 рукописных + deep(12) → добор 9 → ceil(9*0.55)=5 сервисных, 4 региональных.
    const existing = ["one.example.ru", "two.example.ru", "three.example.ru"];
    const added = fillSubdomains("example.ru", existing, "deep")
      .slice(3)
      .map((s) => prefix(s, "example.ru"));
    expect(added).toHaveLength(9);
    expect(added.filter((p) => SERVICE_PREFIXES.includes(p))).toHaveLength(5);
    expect(added.filter((p) => REGION_PREFIXES.includes(p))).toHaveLength(4);
  });

  it("работает с составными и нестандартными TLD", () => {
    for (const root of ["credit.club", "finbroker.pro", "splitka.io"]) {
      const result = fillSubdomains(root, [], "medium");
      expect(result).toHaveLength(7);
      for (const sub of result) {
        expect(sub.endsWith(`.${root}`)).toBe(true);
        expect(prefix(sub, root)).not.toContain(".");
      }
    }
  });

  it("рукописный поддомен, не подчинённый корню, добор не ломает", () => {
    // Защита от кривых данных: такой поддомен просто не даёт занятого префикса.
    const result = fillSubdomains("example.ru", ["чужое.other.ru"], "shallow");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("чужое.other.ru");
  });
});
