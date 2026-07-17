import { describe, it, expect } from "vitest";
import { splitSystemDomains, previewDomains, PREVIEW_VISIBLE_COUNT } from "./trigger-domain-view";
import type { DomainGroup } from "@/data/trigger-domains";

const g = (root: string, ...subs: string[]): DomainGroup => ({ root, subdomains: subs });

describe("splitSystemDomains (groups)", () => {
  it("partitions by root, case-insensitive, keeps order", () => {
    const groups = [g("sberbank.ru", "online.sberbank.ru"), g("vtb.ru"), g("alfabank.ru")];
    const res = splitSystemDomains(groups, { added: [], excluded: ["VTB.ru"] });
    expect(res.active.map((x) => x.root)).toEqual(["sberbank.ru", "alfabank.ru"]);
    expect(res.excluded.map((x) => x.root)).toEqual(["vtb.ru"]);
  });
});

describe("previewDomains (groups)", () => {
  it("returns first N groups + overflow", () => {
    const groups = [g("a.ru"), g("b.ru"), g("c.ru"), g("d.ru"), g("e.ru")];
    const res = previewDomains(groups, PREVIEW_VISIBLE_COUNT);
    expect(res.visible.map((x) => x.root)).toEqual(["a.ru", "b.ru", "c.ru"]);
    expect(res.overflowCount).toBe(2);
  });
});
