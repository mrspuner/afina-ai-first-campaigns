import { describe, it, expect } from "vitest";
import { starterTemplateVariants } from "./template-starters";
import { FIELD_PRESETS } from "./field-directory";

describe("starterTemplateVariants — orphaned presets as starter texts (block 7 §5)", () => {
  it("returns 3 variants per channel with the channel kind", () => {
    for (const ch of ["sms", "email", "push", "ivr"] as const) {
      const vs = starterTemplateVariants(ch);
      expect(vs).toHaveLength(3);
      for (const v of vs) {
        expect(v.name).toBeTruthy();
        expect(v.content.kind).toBe(ch);
      }
    }
  });

  it("SMS variants seed text from the smsText presets", () => {
    const vs = starterTemplateVariants("sms");
    expect(vs[0].content.text).toBe(FIELD_PRESETS.smsText[0]);
    expect(vs[0].content).toMatchObject({ alphaName: "BRAND", scheduledAt: "immediate" });
  });

  it("Push variants seed title/body from the push presets", () => {
    const vs = starterTemplateVariants("push");
    expect(vs[0].content.title).toBe(FIELD_PRESETS.pushTitle[0]);
    expect(vs[0].content.body).toBe(FIELD_PRESETS.pushText[0]);
  });
});
