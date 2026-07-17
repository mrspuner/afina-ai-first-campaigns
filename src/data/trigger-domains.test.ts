import { describe, it, expect } from "vitest";
import { TRIGGER_DOMAINS, getTriggerDomains, knownTriggerDomains } from "./trigger-domains";

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

  it("credit-banks matches the B3 reference (roots + key subdomains)", () => {
    const byRoot = Object.fromEntries(getTriggerDomains("credit-banks").map((g) => [g.root, g.subdomains]));
    expect(Object.keys(byRoot)).toEqual(expect.arrayContaining([
      "sberbank.ru", "vtb.ru", "alfabank.ru", "gazprombank.ru", "tinkoff.ru",
      "raiffeisen.ru", "otkritie.ru", "rshb.ru", "sovcombank.ru", "pochtabank.ru", "mkb.ru", "uralsib.ru",
    ]));
    expect(byRoot["sberbank.ru"]).toEqual(expect.arrayContaining([
      "online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru",
    ]));
    expect(byRoot["sovcombank.ru"]).toContain("halva.sovcombank.ru");
  });

  it("knownTriggerDomains returns unique roots as {id,label}", () => {
    const known = knownTriggerDomains();
    expect(known.every((k) => !k.id.includes("/"))).toBe(true);
    expect(new Set(known.map((k) => k.id)).size).toBe(known.length);
  });
});
