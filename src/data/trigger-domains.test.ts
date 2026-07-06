import { describe, it, expect } from "vitest";
import { knownTriggerDomains } from "./trigger-domains";

describe("knownTriggerDomains", () => {
  it("returns a deduped, sorted list of {id,label} from TRIGGER_DOMAINS", () => {
    const list = knownTriggerDomains();
    const ids = list.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // без дубликатов
    expect(list.every((d) => d.id === d.label)).toBe(true);
    // отсортировано по label
    const sorted = [...list].sort((a, b) => a.label.localeCompare(b.label));
    expect(list).toEqual(sorted);
    // содержит известный домен
    expect(ids).toContain("alfabank.ru");
  });
});
