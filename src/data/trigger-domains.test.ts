import { describe, it, expect } from "vitest";
import { TRIGGER_DOMAINS, getTriggerDomains, knownTriggerDomains, type DomainGroup } from "./trigger-domains";
import { TIER_QUOTA, TIER_SPREAD, tierForTrigger } from "./subdomain-fill";

// B3 reference tables — verbatim root → subdomains mapping for the three
// pinned verticals. Any drift in trigger-domains.ts must be intentional and
// reflected here too.
const B3_CREDIT_BANKS: DomainGroup[] = [
  { root: "sberbank.ru", subdomains: ["online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru"] },
  { root: "vtb.ru", subdomains: ["online.vtb.ru", "kredit.vtb.ru"] },
  { root: "alfabank.ru", subdomains: ["online.alfabank.ru", "credit.alfabank.ru"] },
  { root: "gazprombank.ru", subdomains: [] },
  { root: "tinkoff.ru", subdomains: ["credit.tinkoff.ru", "id.tinkoff.ru"] },
  { root: "raiffeisen.ru", subdomains: [] },
  { root: "otkritie.ru", subdomains: [] },
  { root: "rshb.ru", subdomains: [] },
  { root: "sovcombank.ru", subdomains: ["halva.sovcombank.ru"] },
  { root: "pochtabank.ru", subdomains: [] },
  { root: "mkb.ru", subdomains: [] },
  { root: "uralsib.ru", subdomains: [] },
];

const B3_MOBILE_COMPETITORS: DomainGroup[] = [
  { root: "mts.ru", subdomains: ["login.mts.ru", "shop.mts.ru"] },
  { root: "megafon.ru", subdomains: ["lk.megafon.ru", "shop.megafon.ru"] },
  { root: "beeline.ru", subdomains: ["my.beeline.ru", "shop.beeline.ru"] },
  { root: "tele2.ru", subdomains: ["msk.tele2.ru", "spb.tele2.ru"] },
  { root: "yota.ru", subdomains: [] },
  { root: "rostelecom.ru", subdomains: ["lk.rostelecom.ru"] },
  { root: "sbermobile.ru", subdomains: [] },
  { root: "tinkoff-mobile.ru", subdomains: [] },
  { root: "motiv.ru", subdomains: [] },
  { root: "danycom.ru", subdomains: [] },
  { root: "gazprombank-mobile.ru", subdomains: [] },
];

const B3_USED_CAR_LISTINGS: DomainGroup[] = [
  { root: "auto.ru", subdomains: ["msk.auto.ru", "spb.auto.ru"] },
  { root: "drom.ru", subdomains: ["moscow.drom.ru", "baza.drom.ru"] },
  { root: "avito.ru", subdomains: ["avto.avito.ru"] },
  { root: "youla.ru", subdomains: ["auto.youla.ru"] },
  { root: "am.ru", subdomains: [] },
  { root: "carsguru.ru", subdomains: [] },
  { root: "bibinet.ru", subdomains: [] },
  { root: "avtomarket.ru", subdomains: [] },
  { root: "cars.ru", subdomains: [] },
  { root: "quto.ru", subdomains: [] },
  { root: "kolesa.ru", subdomains: [] },
];

describe("TRIGGER_DOMAINS dataset", () => {
  const entries = Object.entries(TRIGGER_DOMAINS);

  it("every trigger has >= 10 root groups", () => {
    for (const [id, groups] of entries) {
      expect(groups.length, `${id}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("no paths in root or subdomains", () => {
    for (const [id, groups] of entries) {
      for (const grp of groups) {
        expect(grp.root, `${id}/${grp.root}`).not.toContain("/");
        for (const s of grp.subdomains) expect(s, `${id}/${s}`).not.toContain("/");
      }
    }
  });

  it("root is unique within a trigger", () => {
    for (const [id, groups] of entries) {
      const roots = groups.map((g) => g.root.toLowerCase());
      expect(new Set(roots).size, `${id}`).toBe(roots.length);
    }
  });

  it("каждый корень добран не меньше планки и не больше планки+разброса своего тира", () => {
    for (const [id] of entries) {
      const tier = tierForTrigger(id);
      const quota = TIER_QUOTA[tier];
      const max = quota + TIER_SPREAD[tier];
      for (const grp of getTriggerDomains(id)) {
        expect(grp.subdomains.length, `${id}/${grp.root}`).toBeGreaterThanOrEqual(quota);
        expect(grp.subdomains.length, `${id}/${grp.root}`).toBeLessThanOrEqual(max);
      }
    }
  });

  // Это и есть свойство, которое пользователь на самом деле просил: планка —
  // минимум, а не цель. До фикса добор всегда бил ровно в планку тира, и
  // раскрытая карточка триггера показывала одинаковый ·N на всех корнях —
  // читалось как сгенерированные данные, а не реальные. credit-banks — deep
  // тир с 12 корнями, включая рукописный B3-слой, поэтому один тест на нём
  // покрывает и «варьируется», и «рукописный слой не мешает вариации».
  it("длины поддоменов варьируются между корнями одного глубокого триггера — не все ·N одинаковые", () => {
    const groups = getTriggerDomains("credit-banks");
    const lengths = groups.map((g) => g.subdomains.length);
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  it("поддомены уникальны, подчинены корню и строго третьего уровня", () => {
    for (const [id] of entries) {
      for (const grp of getTriggerDomains(id)) {
        expect(new Set(grp.subdomains).size, `${id}/${grp.root}`).toBe(
          grp.subdomains.length,
        );
        for (const sub of grp.subdomains) {
          expect(sub.endsWith(`.${grp.root}`), `${id}/${sub}`).toBe(true);
          const prefix = sub.slice(0, -`.${grp.root}`.length);
          expect(prefix, `${id}/${sub}`).not.toContain(".");
        }
      }
    }
  });

  it("getTriggerDomains возвращает стабильную ссылку между вызовами", () => {
    expect(getTriggerDomains("credit-banks")).toBe(getTriggerDomains("credit-banks"));
    // Неизвестный триггер идёт на фолбэк — ссылка обязана быть стабильной и там,
    // иначе редактор ре-рендерится вхолостую на каждый кадр.
    expect(getTriggerDomains("нет-такого")).toBe(getTriggerDomains("нет-такого"));
  });

  it("тиры распределены как 14 deep / 41 medium / 14 shallow", () => {
    const counts = { shallow: 0, medium: 0, deep: 0 };
    for (const [id] of entries) counts[tierForTrigger(id)]++;
    expect(counts).toEqual({ deep: 14, medium: 41, shallow: 14 });
  });

  it("рукописный слой сохранён целиком и стоит первым", () => {
    for (const [id, raw] of entries) {
      const filled = getTriggerDomains(id);
      raw.forEach((rawGroup, i) => {
        expect(filled[i].root, `${id}/${rawGroup.root}`).toBe(rawGroup.root);
        expect(
          filled[i].subdomains.slice(0, rawGroup.subdomains.length),
          `${id}/${rawGroup.root}`,
        ).toEqual(rawGroup.subdomains);
      });
    }
  });

  /**
   * Эталонные таблицы B3 больше не сверяются через `toEqual`: после добора
   * полное равенство недостижимо по построению. Проверяем то, что и должно
   * быть неизменным — состав и порядок корней плюс рукописный префикс каждой
   * группы. Так самая качественная часть датасета (настоящие поддомены Сбера,
   * МТС, auto.ru) остаётся под охраной, а добор ей не мешает.
   */
  function expectMatchesB3Reference(id: string, reference: DomainGroup[]) {
    const actual = getTriggerDomains(id);
    expect(actual.map((g) => g.root), `${id}: состав и порядок корней`).toEqual(
      reference.map((g) => g.root),
    );
    reference.forEach((refGroup, i) => {
      expect(
        actual[i].subdomains.slice(0, refGroup.subdomains.length),
        `${id}/${refGroup.root}: рукописные поддомены`,
      ).toEqual(refGroup.subdomains);
    });
  }

  it("credit-banks keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("credit-banks", B3_CREDIT_BANKS);
  });

  it("mobile-competitors keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("mobile-competitors", B3_MOBILE_COMPETITORS);
  });

  it("used-car-listings keeps its B3 roots and hand-written subdomains", () => {
    expectMatchesB3Reference("used-car-listings", B3_USED_CAR_LISTINGS);
  });

  it("knownTriggerDomains returns unique roots as {id,label}", () => {
    const known = knownTriggerDomains();
    expect(known.every((k) => !k.id.includes("/"))).toBe(true);
    expect(new Set(known.map((k) => k.id)).size).toBe(known.length);
  });
});
