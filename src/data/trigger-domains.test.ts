import { describe, it, expect } from "vitest";
import { TRIGGER_DOMAINS, getTriggerDomains, knownTriggerDomains, type DomainGroup } from "./trigger-domains";

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

  it("credit-banks matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("credit-banks")).toEqual(B3_CREDIT_BANKS);
  });

  it("mobile-competitors matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("mobile-competitors")).toEqual(B3_MOBILE_COMPETITORS);
  });

  it("used-car-listings matches the B3 reference exactly (full root -> subdomains map)", () => {
    expect(getTriggerDomains("used-car-listings")).toEqual(B3_USED_CAR_LISTINGS);
  });

  it("knownTriggerDomains returns unique roots as {id,label}", () => {
    const known = knownTriggerDomains();
    expect(known.every((k) => !k.id.includes("/"))).toBe(true);
    expect(new Set(known.map((k) => k.id)).size).toBe(known.length);
  });
});
