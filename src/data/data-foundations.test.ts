import { describe, it, expect } from "vitest";
import { DIRECTIONS } from "./directions";
import { INTERESTS_BY_DIRECTION } from "./interests-by-direction";
import {
  VERTICALS,
  INTERESTS,
  getInterestById,
  getTriggerById,
  getInterestForTrigger,
  getTriggerShortLabel,
} from "./triggers-by-vertical";

describe("data foundations contract", () => {
  it("DIRECTIONS contains 22 entries with unique ids", () => {
    expect(DIRECTIONS).toHaveLength(22);
    const ids = DIRECTIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("VERTICALS contains 8 entries with unique ids", () => {
    expect(VERTICALS).toHaveLength(8);
    const ids = VERTICALS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("interest ids are globally unique", () => {
    const ids = INTERESTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("trigger ids are globally unique", () => {
    const ids = INTERESTS.flatMap((i) => i.triggers.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every interest belongs to its declared vertical", () => {
    for (const v of VERTICALS) {
      for (const i of v.interests) {
        expect(i.verticalId).toBe(v.id);
      }
    }
  });

  it("every direction has a mapping entry", () => {
    for (const d of DIRECTIONS) {
      expect(INTERESTS_BY_DIRECTION).toHaveProperty(d.id);
      expect(INTERESTS_BY_DIRECTION[d.id].length).toBeGreaterThan(0);
    }
  });

  it("every mapped interest id exists in the interest catalog", () => {
    for (const [directionId, interestIds] of Object.entries(INTERESTS_BY_DIRECTION)) {
      for (const interestId of interestIds) {
        expect(
          getInterestById(interestId),
          `direction ${directionId} references unknown interest ${interestId}`
        ).toBeDefined();
      }
    }
  });

  it("getTriggerById round-trips via getInterestForTrigger", () => {
    for (const i of INTERESTS) {
      for (const t of i.triggers) {
        expect(getTriggerById(t.id)?.label).toBe(t.label);
        expect(getInterestForTrigger(t.id)?.id).toBe(i.id);
      }
    }
  });

  it("every interest has at least one trigger", () => {
    for (const i of INTERESTS) {
      expect(i.triggers.length, `interest ${i.id} has no triggers`).toBeGreaterThan(0);
    }
  });

  it("every trigger has a short label that is shorter than the full one and fits a tag", () => {
    for (const i of INTERESTS) {
      for (const t of i.triggers) {
        expect(t.shortLabel.trim(), `trigger ${t.id} has empty shortLabel`).not.toBe("");
        // Тег в описании режется на 20 символах (max-w-[20ch] в description-tag.tsx),
        // короткое имя должно помещаться без многоточия.
        expect(t.shortLabel.length, `trigger ${t.id} shortLabel too long`).toBeLessThanOrEqual(24);
        expect(
          t.shortLabel.length,
          `trigger ${t.id} shortLabel not shorter than full label`
        ).toBeLessThan(t.label.length);
      }
    }
  });

  it("getTriggerShortLabel maps a full label to its short form and falls back to the input", () => {
    for (const i of INTERESTS) {
      for (const t of i.triggers) {
        expect(getTriggerShortLabel(t.label)).toBe(t.shortLabel);
      }
    }
    // Неизвестный label выдаёт сам себя — произвольные/пользовательские триггеры
    // тег показывает как есть, а не пустотой.
    expect(getTriggerShortLabel("Произвольный триггер")).toBe("Произвольный триггер");
  });
});
