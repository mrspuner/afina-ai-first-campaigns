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

  it("with an empty delta, all groups stay active and none are excluded", () => {
    const groups = [g("sberbank.ru"), g("vtb.ru"), g("alfabank.ru")];
    const res = splitSystemDomains(groups, { added: [], excluded: [] });
    expect(res.active.map((x) => x.root)).toEqual(["sberbank.ru", "vtb.ru", "alfabank.ru"]);
    expect(res.excluded).toEqual([]);
  });

  it("ignores excluded entries that don't match any group's root", () => {
    const groups = [g("sberbank.ru"), g("vtb.ru")];
    const res = splitSystemDomains(groups, { added: [], excluded: ["tinkoff.ru"] });
    expect(res.active.map((x) => x.root)).toEqual(["sberbank.ru", "vtb.ru"]);
    expect(res.excluded).toEqual([]);
  });

  it("keeps subdomains attached to their group through the partition", () => {
    const groups = [g("sberbank.ru", "online.sberbank.ru", "kredit.sberbank.ru"), g("vtb.ru")];
    const res = splitSystemDomains(groups, { added: [], excluded: ["vtb.ru"] });
    expect(res.active).toEqual([
      g("sberbank.ru", "online.sberbank.ru", "kredit.sberbank.ru"),
    ]);
    expect(res.active[0].subdomains).toEqual(["online.sberbank.ru", "kredit.sberbank.ru"]);
  });
});

describe("previewDomains (groups)", () => {
  it("returns first N groups + overflow", () => {
    const groups = [g("a.ru"), g("b.ru"), g("c.ru"), g("d.ru"), g("e.ru")];
    const res = previewDomains(groups, PREVIEW_VISIBLE_COUNT);
    expect(res.visible.map((x) => x.root)).toEqual(["a.ru", "b.ru", "c.ru"]);
    expect(res.overflowCount).toBe(2);
  });

  it("returns empty visible + no overflow for an empty list", () => {
    const res = previewDomains([], PREVIEW_VISIBLE_COUNT);
    expect(res).toEqual({ visible: [], overflowCount: 0 });
  });

  it("shows everything with no overflow when the list is exactly visibleCount", () => {
    const groups = [g("a.ru"), g("b.ru"), g("c.ru")];
    const res = previewDomains(groups, PREVIEW_VISIBLE_COUNT);
    expect(res.visible).toEqual(groups);
    expect(res.overflowCount).toBe(0);
  });

  it("shows everything with no overflow when the list is shorter than visibleCount", () => {
    const groups = [g("a.ru"), g("b.ru")];
    const res = previewDomains(groups, PREVIEW_VISIBLE_COUNT);
    expect(res.visible).toEqual(groups);
    expect(res.overflowCount).toBe(0);
  });
});
