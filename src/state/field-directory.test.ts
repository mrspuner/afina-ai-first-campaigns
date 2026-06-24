import { afterEach, describe, expect, it } from "vitest";
import {
  FIELD_PRESETS,
  addFieldValue,
  getFieldOptions,
  __resetFieldDirectory,
} from "./field-directory";

afterEach(() => __resetFieldDirectory());

describe("field-directory", () => {
  it("returns presets for a known key", () => {
    expect(getFieldOptions("emailSubject")).toEqual(FIELD_PRESETS.emailSubject);
  });

  it("remembers a manually entered value and surfaces it first", () => {
    addFieldValue("smsText", "Своё сообщение");
    const opts = getFieldOptions("smsText");
    expect(opts[0]).toBe("Своё сообщение");
    expect(opts).toEqual(expect.arrayContaining(FIELD_PRESETS.smsText));
  });

  it("ignores blank values", () => {
    addFieldValue("successGoal", "   ");
    expect(getFieldOptions("successGoal")).toEqual(FIELD_PRESETS.successGoal);
  });

  it("does not duplicate a preset value", () => {
    const preset = FIELD_PRESETS.endReason[0];
    addFieldValue("endReason", preset);
    const opts = getFieldOptions("endReason");
    expect(opts.filter((o) => o === preset)).toHaveLength(1);
  });

  it("does not duplicate a repeated custom value", () => {
    addFieldValue("eventCatalog", "Жми сюда");
    addFieldValue("eventCatalog", "Жми сюда");
    const opts = getFieldOptions("eventCatalog");
    expect(opts.filter((o) => o === "Жми сюда")).toHaveLength(1);
  });
});
