import { describe, it, expect } from "vitest";
import {
  normalizeDomainInput,
  isKnownRootDomain,
  classifyTypedDomain,
  availableRegisteredDomains,
} from "./domain-add";

describe("normalizeDomainInput", () => {
  it("lowercases", () => {
    expect(normalizeDomainInput("Sberbank.RU")).toBe("sberbank.ru");
  });

  it("strips a leading www.", () => {
    expect(normalizeDomainInput("www.sberbank.ru")).toBe("sberbank.ru");
  });

  it("strips a trailing dot", () => {
    expect(normalizeDomainInput("sberbank.ru.")).toBe("sberbank.ru");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeDomainInput("  sberbank.ru  ")).toBe("sberbank.ru");
  });

  it("combines all normalizations at once", () => {
    expect(normalizeDomainInput("  WWW.Sberbank.RU. ")).toBe("sberbank.ru");
  });

  it("leaves an already-normalized domain untouched", () => {
    expect(normalizeDomainInput("new-shop.ru")).toBe("new-shop.ru");
  });

  it("does not strip www. that isn't a leading subdomain label", () => {
    // "wwwstore.ru" doesn't start with the literal "www." (no dot after www)
    expect(normalizeDomainInput("wwwstore.ru")).toBe("wwwstore.ru");
  });
});

describe("isKnownRootDomain", () => {
  const knownRoots = ["sberbank.ru", "vtb.ru", "tinkoff.ru"];

  it("matches a known root, case-insensitively", () => {
    expect(isKnownRootDomain("sberbank.ru", knownRoots)).toBe(true);
  });

  it("returns false for an unknown domain", () => {
    expect(isKnownRootDomain("totally-unknown.ru", knownRoots)).toBe(false);
  });

  it("returns false for a SUBDOMAIN of a known root (roots-only matching)", () => {
    expect(isKnownRootDomain("online.sberbank.ru", knownRoots)).toBe(false);
  });
});

describe("classifyTypedDomain", () => {
  const knownRoots = ["sberbank.ru", "vtb.ru"];

  it("normalizes then classifies a known root as isKnown", () => {
    expect(classifyTypedDomain("WWW.Sberbank.RU.", knownRoots)).toEqual({
      domain: "sberbank.ru",
      isKnown: true,
    });
  });

  it("normalizes then classifies an unknown domain as !isKnown", () => {
    expect(classifyTypedDomain("New-Shop.ru", knownRoots)).toEqual({
      domain: "new-shop.ru",
      isKnown: false,
    });
  });

  it("classifies a known brand's subdomain as unknown (roots-only)", () => {
    expect(classifyTypedDomain("online.sberbank.ru", knownRoots)).toEqual({
      domain: "online.sberbank.ru",
      isKnown: false,
    });
  });
});

describe("availableRegisteredDomains", () => {
  it("returns registered domains sorted, none added yet", () => {
    const own = [{ domain: "b.ru" }, { domain: "a.ru" }];
    expect(availableRegisteredDomains(own, [])).toEqual(["a.ru", "b.ru"]);
  });

  it("excludes domains already in the trigger's delta.added (case-insensitive)", () => {
    const own = [{ domain: "a.ru" }, { domain: "b.ru" }];
    expect(availableRegisteredDomains(own, ["A.ru"])).toEqual(["b.ru"]);
  });

  it("dedupes case-insensitive duplicates within ownDomains", () => {
    const own = [{ domain: "a.ru" }, { domain: "A.ru" }];
    expect(availableRegisteredDomains(own, [])).toEqual(["a.ru"]);
  });

  it("returns an empty list when there are no registered domains", () => {
    expect(availableRegisteredDomains([], [])).toEqual([]);
  });
});
