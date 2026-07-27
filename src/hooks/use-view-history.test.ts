import { describe, expect, it } from "vitest";
import { addressKey } from "./use-view-history";
import type { ViewAddress } from "@/state/app-state";

// `addressKey` is the browser-history dedup key: `useViewHistory` skips
// `pushState` when two consecutive addresses key the same. The
// guided-campaign branch MUST fold in `campaignId`/`step` (Task 11's point
// -edit address fields) — otherwise two different edit targets collide on
// one key, the history entry between them is silently dropped, and browser
// Back skips a step instead of landing on it. This is exactly the failure
// the address fields exist to prevent, so it is pinned here rather than left
// to be re-discovered once Task 12's isolated step editor starts switching
// steps in place.
describe("addressKey — guided-campaign point-edit target", () => {
  it("differs when only `step` differs for the same campaign", () => {
    const a: ViewAddress = { kind: "guided-campaign", campaignId: "cmp_1", step: "channels" };
    const b: ViewAddress = { kind: "guided-campaign", campaignId: "cmp_1", step: "interests" };
    expect(addressKey(a)).not.toBe(addressKey(b));
  });

  it("differs when only `campaignId` differs for the same step", () => {
    const a: ViewAddress = { kind: "guided-campaign", campaignId: "cmp_1", step: "channels" };
    const b: ViewAddress = { kind: "guided-campaign", campaignId: "cmp_2", step: "channels" };
    expect(addressKey(a)).not.toBe(addressKey(b));
  });

  it("differs between an edit target and the plain new-campaign wizard", () => {
    const editing: ViewAddress = { kind: "guided-campaign", campaignId: "cmp_1", step: "channels" };
    const plain: ViewAddress = { kind: "guided-campaign" };
    expect(addressKey(editing)).not.toBe(addressKey(plain));
  });

  it("leaves the pre-existing scenario-keyed wizard entry unaffected", () => {
    const a: ViewAddress = { kind: "guided-campaign", scenarioId: "registration", scenarioName: "Регистрация" };
    const b: ViewAddress = { kind: "guided-campaign", scenarioId: "registration", scenarioName: "Регистрация" };
    expect(addressKey(a)).toBe(addressKey(b));
    expect(addressKey(a)).toBe("guided-campaign:registration:");
  });
});
