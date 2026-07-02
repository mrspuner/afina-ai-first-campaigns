# Streaming Campaign Artifacts — Implementation Plan (Часть II)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streaming campaigns (`sourceType === "stream"`, i.e. analysisMode «Потоковый» from Часть I — paths A and B) continuously produce downloadable signal artifacts: per-«day» digests («выжимка») plus one cumulative file, shown as a per-campaign collection in the global «Артефакты» section and the campaign card, all downloadable as real CSV.

**Architecture:** Extend `Artifact` with `variant` (`single`/`daily`/`cumulative`) + `periodDate`. A `stream_digest_emitted` reducer appends a seeded daily digest and grows the cumulative artifact; an accelerated `<StreamDigestDriver>` timer (mirroring the 8s scoring timer) fires it for active streaming campaigns until a cap. Streaming campaigns skip the single launch artifact. The global «Сигналы» list groups by campaign — a streaming campaign renders one `ArtifactCollectionCard` that opens a collection detail (reusing `ArtifactScreen`, branched on the cumulative variant); one-time campaigns render the existing single `ArtifactCard`. Downloads use a shared `downloadCsv` util + a seeded `buildSignalsCsv` generator, replacing the current `window.alert` mocks.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest + React Testing Library (jsdom), Playwright. Reducer in `src/state/app-state.ts`; seeded RNG in `src/state/metrics.ts` (`rngFor`, `seededInt`); artifacts UI in `src/sections/artifacts/**`; campaign card in `src/sections/campaigns/**`.

**Working directory:** worktree `.worktrees/wizard-intent-reframe` (branch `feature/wizard-intent-reframe`, continues after Часть I). Spec: `docs/superpowers/specs/2026-07-01-wizard-intent-reframe-design.md` (Часть II, §12–19).

**Conventions:** single test file `npx vitest run <path>`; typecheck `npx tsc --noEmit` (~30 pre-existing unrelated errors in `ai-elements/*`, `campaign-cost.ts` — ignore, confirm none reference your files); NEVER `git stash`/`checkout`/`reset`/`restore`/`clean` (an unrelated stash lives in the stash list — leave it); commit style `feat(artifacts): …` / `test(artifacts): …`.

**Key existing anchors (verified):**
- `Artifact` type — `src/state/app-state.ts:88`. Created in `campaign_launched` (`app-state.ts:1017`) and `campaign_phase_advanced` (`app-state.ts:1081`), idempotent (only if no artifact for the campaign). Helpers `estimateArtifactCount` / `artifactKindForCampaign` — `src/state/artifact-metrics.ts:12`.
- Scoring timer pattern — `src/sections/campaigns/campaign-screen.tsx:44` (`useEffect` + `setTimeout` + `clearTimeout`, keyed on a `collecting` flag).
- Seeded RNG — `src/state/metrics.ts`: `rngFor(...parts)`, `seededInt(rng,min,max)`, `hashSeed`.
- `View` union `{ kind: "artifact"; artifactId }` — `app-state.ts:171`; routed in `src/app/page.tsx` `renderMain` (`if (view.kind === "artifact") return <ArtifactScreen/>`).
- `SignalsTabView` / `SignalsTab` — `src/sections/artifacts/signals-tab.tsx` (mock download = `window.alert`, line 65). `ArtifactCard` — `src/sections/artifacts/artifact-card.tsx`. `ARTIFACT_KIND_LABEL` — `src/sections/artifacts/artifact-labels.ts`.
- `ArtifactScreen` / `ArtifactScreenView` — `src/sections/artifacts/artifact-screen.tsx` (EntityCardShell + CardSections, mock download line 135).
- `CampaignArtifactsBlock` — `src/sections/campaigns/campaign-artifacts-block.tsx`; rendered in `campaign-screen.tsx:220`.
- Download pattern — `src/sections/statistics/statistics-view.tsx:280` (inline Blob + createObjectURL).

---

## Task 1: Artifact model — `variant`, `periodDate`, streaming helpers

**Files:**
- Modify: `src/state/app-state.ts` (Artifact type; set `variant:"single"` on the three existing artifact creations)
- Modify: `src/state/artifact-metrics.ts` (add `isStreamingCampaign`, `MAX_DIGESTS`, `digestCount`, `addDaysIso`)
- Test: `src/state/artifact-metrics.test.ts` (create or extend)

- [ ] **Step 1: Write the failing test** — create/extend `src/state/artifact-metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isStreamingCampaign, digestCount, addDaysIso, MAX_DIGESTS } from "./artifact-metrics";
import type { Campaign } from "./app-state";

const streamC = { id: "c1", name: "x", status: "active", createdAt: "2026-06-01T00:00:00.000Z", sourceType: "stream" } as Campaign;
const newC = { ...streamC, sourceType: "new" } as Campaign;

describe("isStreamingCampaign", () => {
  it("true only for sourceType stream", () => {
    expect(isStreamingCampaign(streamC)).toBe(true);
    expect(isStreamingCampaign(newC)).toBe(false);
    expect(isStreamingCampaign({ ...streamC, sourceType: "own" } as Campaign)).toBe(false);
  });
});

describe("digestCount", () => {
  it("is deterministic for a (campaignId, dayIndex) and in range", () => {
    const a = digestCount("c1", 0);
    expect(a).toBe(digestCount("c1", 0));
    expect(a).toBeGreaterThanOrEqual(400);
    expect(a).toBeLessThanOrEqual(5200);
    expect(digestCount("c1", 1)).not.toBe(a); // different day → different count (overwhelmingly likely)
  });
});

describe("addDaysIso", () => {
  it("adds N days and returns a YYYY-MM-DD date", () => {
    expect(addDaysIso("2026-06-28T10:00:00.000Z", 0)).toBe("2026-06-28");
    expect(addDaysIso("2026-06-28T10:00:00.000Z", 3)).toBe("2026-07-01");
  });
});

describe("MAX_DIGESTS", () => {
  it("caps daily digests at 14", () => {
    expect(MAX_DIGESTS).toBe(14);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run src/state/artifact-metrics.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement helpers** in `src/state/artifact-metrics.ts` (append; keep existing exports). Add imports `import { rngFor, seededInt } from "./metrics";` and `import type { Campaign } from "./app-state";` (if not present):

```ts
/** Streaming campaigns (analysisMode «Потоковый» → sourceType "stream") accrue daily digests. */
export function isStreamingCampaign(c: Pick<Campaign, "sourceType">): boolean {
  return c.sourceType === "stream";
}

/** Accelerated-demo cap on the number of daily digests per streaming campaign. */
export const MAX_DIGESTS = 14;

/** Deterministic seeded per-day signal count for a streaming campaign's digest. */
export function digestCount(campaignId: string, dayIndex: number): number {
  return seededInt(rngFor("daily-digest", campaignId, dayIndex), 400, 5200);
}

/** `baseIso` + `days` as a YYYY-MM-DD string (the digest's covered day). */
export function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Extend the `Artifact` type** in `src/state/app-state.ts` (line ~88):

```ts
export type Artifact = {
  id: string;
  campaignId: string;
  kind: "signals" | "signals_conversions";
  count: number;
  createdAt: string;
  /** Role in a streaming campaign's collection. Absent/"single" = a one-time artifact. */
  variant?: "single" | "daily" | "cumulative";
  /** For "daily" digests: the covered day (YYYY-MM-DD). */
  periodDate?: string;
};
```

Set `variant: "single"` on the three existing creation sites so one-time artifacts are explicit: in `campaign_launched` (the `newArtifacts` literal ~line 1046), `campaign_phase_advanced` (~line 1090), and `campaign_artifact_ready` (~line 538) add `variant: "single",` to each artifact object literal.

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/state/artifact-metrics.test.ts` PASS; `npx vitest run` (full) PASS; `npx tsc --noEmit` no new errors.

- [ ] **Step 6: Commit**
```bash
git add src/state/app-state.ts src/state/artifact-metrics.ts src/state/artifact-metrics.test.ts
git commit -m "feat(artifacts): Artifact.variant/periodDate + streaming digest helpers"
```

---

## Task 2: `stream_digest_emitted` reducer + skip single artifact for streaming

**Files:**
- Modify: `src/state/app-state.ts` (action type; reducer case; guard streaming in `campaign_launched`)
- Test: `src/state/stream-digest.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `src/state/stream-digest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { appReducer, initialState, type AppState, type Campaign } from "./app-state";
import { MAX_DIGESTS, digestCount } from "./artifact-metrics";

function withActiveStream(): AppState {
  const c: Campaign = {
    id: "cs1", name: "Поток", status: "active", createdAt: "2026-06-17T00:00:00.000Z",
    launchedAt: "2026-06-17T00:00:00.000Z", sourceType: "stream", channels: [],
  };
  return { ...initialState, campaigns: [c] };
}

const TS = "2026-06-30T12:00:00.000Z";

describe("stream_digest_emitted", () => {
  it("appends a daily digest (seeded count, dated) and creates the cumulative on day 0", () => {
    const s = appReducer(withActiveStream(), { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    const daily = s.artifacts.filter((a) => a.variant === "daily");
    const cum = s.artifacts.filter((a) => a.variant === "cumulative");
    expect(daily).toHaveLength(1);
    expect(cum).toHaveLength(1);
    expect(daily[0].count).toBe(digestCount("cs1", 0));
    expect(daily[0].periodDate).toBe("2026-06-17");
    expect(cum[0].count).toBe(daily[0].count);
  });

  it("second emit adds a second daily and grows the cumulative by that day's count", () => {
    let s = appReducer(withActiveStream(), { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    s = appReducer(s, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    const daily = s.artifacts.filter((a) => a.variant === "daily");
    const cum = s.artifacts.find((a) => a.variant === "cumulative")!;
    expect(daily).toHaveLength(2);
    expect(cum.count).toBe(digestCount("cs1", 0) + digestCount("cs1", 1));
  });

  it("stops at MAX_DIGESTS daily digests", () => {
    let s = withActiveStream();
    for (let i = 0; i < MAX_DIGESTS + 3; i++) {
      s = appReducer(s, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    }
    expect(s.artifacts.filter((a) => a.variant === "daily")).toHaveLength(MAX_DIGESTS);
  });

  it("is a no-op for a non-streaming or non-active campaign", () => {
    const s0 = withActiveStream();
    const paused = appReducer({ ...s0, campaigns: [{ ...s0.campaigns[0], status: "paused" }] }, { type: "stream_digest_emitted", id: "cs1", timestamp: TS });
    expect(paused.artifacts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run src/state/stream-digest.test.ts` → FAIL (action unknown).

- [ ] **Step 3: Add the action type** to the `AppAction` union in `app-state.ts` (near the other `campaign_*` actions, ~line 341):

```ts
  | { type: "stream_digest_emitted"; id: string; timestamp: string }
```

- [ ] **Step 4: Add the reducer case** (place it near `campaign_phase_advanced`). Ensure `nanoid` and the metrics helpers are imported at the top of `app-state.ts` — `import { artifactKindForCampaign, digestCount, addDaysIso, MAX_DIGESTS, isStreamingCampaign } from "./artifact-metrics";` (add the new names to the existing import from `./artifact-metrics`):

```ts
case "stream_digest_emitted": {
  const c = state.campaigns.find((x) => x.id === action.id);
  if (!c || c.status !== "active" || !isStreamingCampaign(c)) return state;
  const dayIndex = state.artifacts.filter(
    (a) => a.campaignId === c.id && a.variant === "daily",
  ).length;
  if (dayIndex >= MAX_DIGESTS) return state;

  const count = digestCount(c.id, dayIndex);
  const kind = artifactKindForCampaign(c);
  const periodDate = addDaysIso(c.launchedAt ?? c.createdAt, dayIndex);
  const daily: Artifact = {
    id: `art_${nanoid(8)}`, campaignId: c.id, kind, count,
    createdAt: action.timestamp, variant: "daily", periodDate,
  };
  const cumulative = state.artifacts.find(
    (a) => a.campaignId === c.id && a.variant === "cumulative",
  );
  const artifacts = cumulative
    ? [
        ...state.artifacts.map((a) =>
          a.id === cumulative.id
            ? { ...a, count: a.count + count, createdAt: action.timestamp }
            : a,
        ),
        daily,
      ]
    : [
        ...state.artifacts,
        { id: `art_${nanoid(8)}`, campaignId: c.id, kind, count, createdAt: action.timestamp, variant: "cumulative" as const },
        daily,
      ];
  return { ...state, artifacts };
}
```

- [ ] **Step 5: Skip the single launch artifact for streaming campaigns.** In `campaign_launched` (~line 1041), change the `makeArtifact` guard so streaming campaigns do NOT get a single artifact (their collection comes from the driver):

```ts
const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
const makeArtifact = !alreadyHasArtifact && !isStreamingCampaign(c);
```

- [ ] **Step 6: Run tests + typecheck** — `npx vitest run src/state/stream-digest.test.ts` PASS; `npx vitest run` (full — a stream-launch artifact test may exist and now expect zero; if a pre-existing test asserts a stream campaign gets a launch artifact, update it to expect the collection model: no single artifact, digests instead — search `sourceType: "stream"` in `*.test.ts`); `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**
```bash
git add src/state/app-state.ts src/state/stream-digest.test.ts
git commit -m "feat(artifacts): stream_digest_emitted — дневные выжимки + общий файл; поток без single-артефакта"
```

---

## Task 3: `StreamDigestDriver` — accelerated per-day timer

**Files:**
- Create: `src/sections/artifacts/stream-digest-driver.tsx`
- Test: `src/sections/artifacts/stream-digest-driver.test.ts`
- Modify: `src/app/page.tsx` (mount the driver once, always)

- [ ] **Step 1: Write the failing test** — `stream-digest-driver.test.ts` (unit-test the pure selector):

```ts
import { describe, it, expect } from "vitest";
import { campaignsNeedingDigest, DIGEST_INTERVAL_MS } from "./stream-digest-driver";
import type { Campaign, Artifact } from "@/state/app-state";

const stream = (id: string, status: Campaign["status"] = "active"): Campaign => ({
  id, name: id, status, createdAt: "2026-06-17T00:00:00.000Z", sourceType: "stream", channels: [],
});
const daily = (campaignId: string): Artifact => ({
  id: `${campaignId}-d`, campaignId, kind: "signals", count: 1, createdAt: "x", variant: "daily",
});

describe("campaignsNeedingDigest", () => {
  it("returns active streaming campaigns under the digest cap", () => {
    expect(campaignsNeedingDigest([stream("a")], [])).toEqual(["a"]);
  });
  it("excludes paused / non-stream", () => {
    expect(campaignsNeedingDigest([stream("a", "paused"), { ...stream("b"), sourceType: "new" }], [])).toEqual([]);
  });
  it("excludes campaigns that reached the cap", () => {
    const capped = Array.from({ length: 14 }, () => daily("a"));
    expect(campaignsNeedingDigest([stream("a")], capped)).toEqual([]);
  });
});

describe("DIGEST_INTERVAL_MS", () => {
  it("is a few seconds (accelerated demo cadence)", () => {
    expect(DIGEST_INTERVAL_MS).toBe(7000);
  });
});
```

- [ ] **Step 2: Run it** — FAIL (module missing).

- [ ] **Step 3: Create** `src/sections/artifacts/stream-digest-driver.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { Artifact, Campaign } from "@/state/app-state";
import { isStreamingCampaign, MAX_DIGESTS } from "@/state/artifact-metrics";

/** Accelerated stand-in for a nightly digest job. */
export const DIGEST_INTERVAL_MS = 7000;

/** Active streaming campaigns that still have digests left to emit. */
export function campaignsNeedingDigest(campaigns: Campaign[], artifacts: Artifact[]): string[] {
  return campaigns
    .filter((c) => c.status === "active" && isStreamingCampaign(c))
    .filter(
      (c) =>
        artifacts.filter((a) => a.campaignId === c.id && a.variant === "daily").length < MAX_DIGESTS,
    )
    .map((c) => c.id);
}

/** Mounted once at app root: ticks a digest for each active streaming campaign. Renders nothing. */
export function StreamDigestDriver() {
  const { campaigns, artifacts } = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const pending = campaignsNeedingDigest(campaigns, artifacts);
    if (pending.length === 0) return;
    const t = setTimeout(() => {
      const timestamp = new Date().toISOString();
      for (const id of pending) dispatch({ type: "stream_digest_emitted", id, timestamp });
    }, DIGEST_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [campaigns, artifacts, dispatch]);

  return null;
}
```

- [ ] **Step 4: Mount it** in `src/app/page.tsx`. Import `import { StreamDigestDriver } from "@/sections/artifacts/stream-digest-driver";` and render `<StreamDigestDriver />` once at the top of the returned tree (a sibling of the main content, OUTSIDE `renderMain()` so it stays mounted across view changes). Example — wrap the existing return:

```tsx
  return (
    <>
      <StreamDigestDriver />
      {/* …existing app shell / renderMain() output… */}
    </>
  );
```
(Read the current `page.tsx` return first and insert `<StreamDigestDriver />` as the first child of the outermost element — do not otherwise restructure.)

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/sections/artifacts/stream-digest-driver.test.ts` PASS; `npx vitest run` PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add src/sections/artifacts/stream-digest-driver.tsx src/sections/artifacts/stream-digest-driver.test.ts src/app/page.tsx
git commit -m "feat(artifacts): StreamDigestDriver — ускоренный таймер дневных выжимок"
```

---

## Task 4: CSV download — `downloadCsv` util + seeded `buildSignalsCsv`, wire real downloads

**Files:**
- Create: `src/lib/download-csv.ts`
- Create: `src/sections/artifacts/signals-csv.ts`
- Create: `src/sections/artifacts/signals-csv.test.ts`
- Modify: `src/sections/artifacts/signals-tab.tsx` and `src/sections/artifacts/artifact-screen.tsx` (replace `window.alert` mock with real CSV)

- [ ] **Step 1: Write the failing test** — `src/sections/artifacts/signals-csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSignalsCsv, SIGNALS_CSV_ROW_CAP } from "./signals-csv";

describe("buildSignalsCsv", () => {
  it("emits a header + one row per signal, deterministic for a seed", () => {
    const a = buildSignalsCsv("seed-1", 3);
    expect(a).toBe(buildSignalsCsv("seed-1", 3));
    const lines = a.split("\n");
    expect(lines[0]).toBe("Телефон,Тип сигнала,Дата");
    expect(lines).toHaveLength(1 + 3);
  });
  it("caps generated rows for very large cumulatives", () => {
    const lines = buildSignalsCsv("seed-2", SIGNALS_CSV_ROW_CAP + 500).split("\n");
    expect(lines).toHaveLength(1 + SIGNALS_CSV_ROW_CAP);
  });
  it("different seeds produce different content", () => {
    expect(buildSignalsCsv("a", 5)).not.toBe(buildSignalsCsv("b", 5));
  });
});
```

- [ ] **Step 2: Run it** — FAIL (module missing).

- [ ] **Step 3: Create** `src/sections/artifacts/signals-csv.ts`:

```ts
import { rngFor, seededInt } from "@/state/metrics";
import { SIGNAL_TYPES } from "@/state/app-state";

/** Prototype cap so a huge cumulative doesn't generate a multi-MB CSV on click. */
export const SIGNALS_CSV_ROW_CAP = 2000;

/** Deterministic mock signal list as CSV — `count` rows (capped), seeded by `seed`. */
export function buildSignalsCsv(seed: string, count: number): string {
  const rows = Math.min(Math.max(count, 0), SIGNALS_CSV_ROW_CAP);
  const lines = ["Телефон,Тип сигнала,Дата"];
  for (let i = 0; i < rows; i++) {
    const rng = rngFor("signal-row", seed, i);
    const phone = `+79${seededInt(rng, 100000000, 999999999)}`;
    const type = SIGNAL_TYPES[seededInt(rng, 0, SIGNAL_TYPES.length - 1)];
    const m = String(seededInt(rng, 1, 12)).padStart(2, "0");
    const d = String(seededInt(rng, 1, 28)).padStart(2, "0");
    lines.push(`${phone},${type},2026-${m}-${d}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Create** `src/lib/download-csv.ts` (extracts the statistics-view Blob pattern into a reusable helper):

```ts
/** Trigger a client-side CSV download (BOM-prefixed for Excel/Cyrillic). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Run the csv test** — `npx vitest run src/sections/artifacts/signals-csv.test.ts` PASS.

- [ ] **Step 6: Wire real downloads.** In `signals-tab.tsx` `handleDownload` (replace the `window.alert` body):

```ts
  function handleDownload(artifactId: string) {
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) return;
    downloadCsv(`afina-signals-${artifact.id}.csv`, buildSignalsCsv(artifact.id, artifact.count));
  }
```
Add imports: `import { downloadCsv } from "@/lib/download-csv";` and `import { buildSignalsCsv } from "./signals-csv";`. Remove the now-unused `total` if it was only used by the alert (check — it may still be referenced; if unused, delete it).

In `artifact-screen.tsx` `handleDownload` (replace the `window.alert` body):

```ts
  function handleDownload() {
    downloadCsv(`afina-signals-${artifact!.id}.csv`, buildSignalsCsv(artifact!.id, artifact!.count));
  }
```
Add the same two imports.

- [ ] **Step 7: Run tests + typecheck** — `npx vitest run` PASS (existing artifact-card/artifact-screen tests still pass — they assert `onDownload` is called, which is unchanged); `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit**
```bash
git add src/lib/download-csv.ts src/sections/artifacts/signals-csv.ts src/sections/artifacts/signals-csv.test.ts src/sections/artifacts/signals-tab.tsx src/sections/artifacts/artifact-screen.tsx
git commit -m "feat(artifacts): реальный CSV-экспорт (downloadCsv + seeded buildSignalsCsv) вместо мок-alert"
```

---

## Task 5: `ArtifactCollectionCard` + group the «Сигналы» list by campaign

**Files:**
- Create: `src/sections/artifacts/artifact-collection-card.tsx`
- Create: `src/sections/artifacts/artifact-grouping.ts` (pure grouping helper) + `artifact-grouping.test.ts`
- Modify: `src/sections/artifacts/signals-tab.tsx` (`SignalsTabView` renders collection vs single)
- Test: `src/sections/artifacts/artifact-collection-card.test.tsx`

- [ ] **Step 1: Write the failing grouping test** — `src/sections/artifacts/artifact-grouping.ts` + test. Test first:

```ts
import { describe, it, expect } from "vitest";
import { groupArtifacts } from "./artifact-grouping";
import type { Artifact } from "@/state/app-state";

const single = (id: string, campaignId: string): Artifact => ({ id, campaignId, kind: "signals", count: 10, createdAt: "2026-06-01", variant: "single" });
const cum = (campaignId: string): Artifact => ({ id: `${campaignId}-c`, campaignId, kind: "signals", count: 99, createdAt: "2026-06-05", variant: "cumulative" });
const day = (id: string, campaignId: string): Artifact => ({ id, campaignId, kind: "signals", count: 5, createdAt: "2026-06-04", variant: "daily", periodDate: "2026-06-04" });

describe("groupArtifacts", () => {
  it("streaming campaign → one collection (cumulative + its dailies); one-time → singles", () => {
    const groups = groupArtifacts([single("s1", "one"), cum("str"), day("d1", "str"), day("d2", "str")]);
    const collection = groups.find((g) => g.kind === "collection");
    const singleG = groups.find((g) => g.kind === "single");
    expect(collection).toMatchObject({ kind: "collection", campaignId: "str", dailyCount: 2 });
    expect(collection!.cumulative.id).toBe("str-c");
    expect(singleG).toMatchObject({ kind: "single" });
    expect(singleG!.artifact.id).toBe("s1");
  });
  it("orders groups by recency (newest artifact first)", () => {
    const groups = groupArtifacts([single("s1", "one"), cum("str")]);
    expect(groups[0].kind).toBe("collection"); // 2026-06-05 > 2026-06-01
  });
});
```

Then `artifact-grouping.ts`:

```ts
import type { Artifact } from "@/state/app-state";

export type ArtifactGroup =
  | { kind: "collection"; campaignId: string; cumulative: Artifact; dailies: Artifact[]; dailyCount: number; latest: string }
  | { kind: "single"; campaignId: string; artifact: Artifact; latest: string };

/** Group a flat artifact list: streaming campaigns (which own a cumulative) collapse into
 *  one collection group; every other artifact is its own single group. Newest-first. */
export function groupArtifacts(artifacts: Artifact[]): ArtifactGroup[] {
  const byCampaign = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const list = byCampaign.get(a.campaignId) ?? [];
    list.push(a);
    byCampaign.set(a.campaignId, list);
  }
  const groups: ArtifactGroup[] = [];
  for (const [campaignId, list] of byCampaign) {
    const cumulative = list.find((a) => a.variant === "cumulative");
    if (cumulative) {
      const dailies = list
        .filter((a) => a.variant === "daily")
        .sort((a, b) => ((a.periodDate ?? "") < (b.periodDate ?? "") ? 1 : -1));
      const latest = list.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), "");
      groups.push({ kind: "collection", campaignId, cumulative, dailies, dailyCount: dailies.length, latest });
    } else {
      for (const artifact of list) {
        groups.push({ kind: "single", campaignId, artifact, latest: artifact.createdAt });
      }
    }
  }
  return groups.sort((a, b) => (a.latest < b.latest ? 1 : -1));
}
```

- [ ] **Step 2: Run** `npx vitest run src/sections/artifacts/artifact-grouping.test.ts` — implement to green (steps 1's code), confirm PASS.

- [ ] **Step 3: Write the collection-card test** — `artifact-collection-card.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArtifactCollectionCard } from "./artifact-collection-card";
import type { Artifact } from "@/state/app-state";

const cumulative: Artifact = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" };

describe("ArtifactCollectionCard", () => {
  afterEach(cleanup);
  function renderCard() {
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    render(<ArtifactCollectionCard campaignName="ЖК Заря" cumulative={cumulative} dailyCount={14} onOpen={onOpen} onDownload={onDownload} />);
    return { onOpen, onDownload };
  }
  it("shows «Поток · <кампания>», file count and total signals", () => {
    renderCard();
    expect(screen.getByText(/Поток · ЖК Заря/)).toBeVisible();
    expect(screen.getByText(/15 файлов/)).toBeVisible();  // 14 dailies + 1 cumulative
    expect(screen.getByText(/12\s?480/)).toBeVisible();
  });
  it("«Скачать общий» triggers onDownload with the cumulative id; card click opens", () => {
    const { onOpen, onDownload } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Скачать общий/i }));
    expect(onDownload).toHaveBeenCalledWith("str-c");
    fireEvent.click(screen.getByRole("button", { name: /Поток · ЖК Заря/ }));
    expect(onOpen).toHaveBeenCalledWith("str-c");
  });
});
```

- [ ] **Step 4: Run it** — FAIL (module missing).

- [ ] **Step 5: Create** `src/sections/artifacts/artifact-collection-card.tsx`:

```tsx
"use client";

import { Download, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Artifact } from "@/state/app-state";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string { return n.toLocaleString("ru-RU"); }

interface ArtifactCollectionCardProps {
  campaignName: string;
  cumulative: Artifact;
  dailyCount: number;
  onOpen: (cumulativeId: string) => void;
  onDownload: (cumulativeId: string) => void;
}

export function ArtifactCollectionCard({ campaignName, cumulative, dailyCount, onOpen, onDownload }: ArtifactCollectionCardProps) {
  const fileCount = dailyCount + 1; // dailies + the cumulative file
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(cumulative.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(cumulative.id); } }}
      aria-label={`Поток · ${campaignName}`}
      className={cn("gap-2 px-5 py-4 cursor-pointer transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            Поток · {campaignName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fileCount} файлов · {formatNumber(cumulative.count)} сигналов · обновляется
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => onDownload(cumulative.id)}>
            <Download className="mr-1.5 h-4 w-4" />
            Скачать общий
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Group the list in `SignalsTabView`.** Rewrite the `.map` in `signals-tab.tsx` `SignalsTabView` to render via `groupArtifacts`:

```tsx
  const groups = groupArtifacts(artifacts);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, i) =>
        g.kind === "collection" ? (
          <ArtifactCollectionCard
            key={g.cumulative.id}
            campaignName={campaigns.find((c) => c.id === g.campaignId)?.name ?? "—"}
            cumulative={g.cumulative}
            dailyCount={g.dailyCount}
            onOpen={onOpen}
            onDownload={onDownload}
          />
        ) : (
          <ArtifactCard
            key={g.artifact.id}
            artifact={g.artifact}
            index={i}
            campaignName={campaigns.find((c) => c.id === g.campaignId)?.name ?? "—"}
            onOpen={onOpen}
            onOpenCampaign={onOpenCampaign}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
```
Add imports for `groupArtifacts` and `ArtifactCollectionCard`. Keep the `artifacts.length === 0 → <ArtifactsEmptyState/>` guard. Remove the now-unused local `sorted` (grouping sorts internally).

- [ ] **Step 7: Run tests + typecheck** — `npx vitest run src/sections/artifacts/` PASS (update any `signals-tab` test that asserted a flat list to expect grouped output — a streaming campaign now shows one «Поток · …» card, not N daily cards); `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit**
```bash
git add src/sections/artifacts/artifact-collection-card.tsx src/sections/artifacts/artifact-collection-card.test.tsx src/sections/artifacts/artifact-grouping.ts src/sections/artifacts/artifact-grouping.test.ts src/sections/artifacts/signals-tab.tsx
git commit -m "feat(artifacts): группировка «Сигналов» — карточка-коллекция для потоков, одиночные для разовых"
```

---

## Task 6: Collection detail — branch `ArtifactScreen` on the cumulative variant

**Files:**
- Modify: `src/sections/artifacts/artifact-screen.tsx` (render a collection detail when the opened artifact is a cumulative)
- Test: `src/sections/artifacts/artifact-screen.test.tsx` (extend)

- [ ] **Step 1: Write the failing test** — add to `artifact-screen.test.tsx` (it renders `ArtifactScreenView` with props). Add a cumulative case that lists dailies + a «Скачать общий»:

```tsx
it("cumulative artifact → collection detail: total, «Дневные выжимки» list, «Скачать общий»", () => {
  const cumulative = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" } as const;
  const dailies = [
    { id: "d2", campaignId: "str", kind: "signals", count: 2140, createdAt: "2026-06-30", variant: "daily", periodDate: "2026-06-30" },
    { id: "d1", campaignId: "str", kind: "signals", count: 1980, createdAt: "2026-06-29", variant: "daily", periodDate: "2026-06-29" },
  ] as const;
  const onDownload = vi.fn();
  render(
    <ArtifactScreenView
      artifact={cumulative} dailies={[...dailies]} campaign={undefined} campaignName="ЖК Заря"
      onBack={vi.fn()} onOpenCampaign={vi.fn()} onDownload={onDownload} onDownloadDaily={vi.fn()} onDelete={vi.fn()}
    />,
  );
  expect(screen.getByText(/Дневные выжимки/)).toBeVisible();
  expect(screen.getByText(/Выжимка · 30\.06/)).toBeVisible();
  expect(screen.getByText(/12\s?480/)).toBeVisible();
});
```

- [ ] **Step 2: Run it** — FAIL (`ArtifactScreenView` has no `dailies`/`onDownloadDaily` props yet; no «Дневные выжимки» section).

- [ ] **Step 3: Extend `ArtifactScreenView`.** Add optional props `dailies?: Artifact[]` and `onDownloadDaily?: (id: string) => void`. When `artifact.variant === "cumulative"`, render the collection layout: keep the EntityCardShell + the big «Всего сигналов за период» count (existing `Всего сигналов` CardSection is fine), add a `<CardSection label="Дневные выжимки">` listing each daily («Выжимка · DD.MM · count» + a per-row «Скачать» button calling `onDownloadDaily(d.id)`), and title the shell «Поток · {campaignName}». For non-cumulative artifacts keep the current rendering unchanged. Format the day from `periodDate` as `DD.MM` (e.g. `periodDate.slice(8,10) + "." + periodDate.slice(5,7)`).

Sketch of the added section (inside `ArtifactScreenView`, only when cumulative):

```tsx
{artifact.variant === "cumulative" && dailies && (
  <CardSection label="Дневные выжимки">
    <div className="flex flex-col">
      {dailies.map((d) => (
        <div key={d.id} className="flex items-center gap-3 border-t border-border/40 py-2.5 text-sm first:border-t-0">
          <span className="flex-1 text-foreground">
            Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}
            <span className="ml-2 text-muted-foreground tabular-nums">{d.count.toLocaleString("ru-RU")}</span>
          </span>
          <Button variant="outline" size="icon" aria-label="Скачать выжимку" onClick={() => onDownloadDaily?.(d.id)}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  </CardSection>
)}
```
Use `title={artifact.variant === "cumulative" ? \`Поток · ${campaignName}\` : kindLabel}` on the shell, and label the total section «Всего сигналов за период» when cumulative.

- [ ] **Step 4: Wire the connected `ArtifactScreen`.** Compute `dailies` for the opened cumulative and pass `onDownloadDaily`:

```tsx
  const dailies = artifact.variant === "cumulative"
    ? artifacts.filter((a) => a.campaignId === artifact.campaignId && a.variant === "daily")
        .sort((a, b) => ((a.periodDate ?? "") < (b.periodDate ?? "") ? 1 : -1))
    : undefined;
  function handleDownloadDaily(id: string) {
    const d = artifacts.find((a) => a.id === id);
    if (d) downloadCsv(`afina-signals-${d.periodDate ?? d.id}.csv`, buildSignalsCsv(d.id, d.count));
  }
```
Pass `dailies={dailies}` and `onDownloadDaily={handleDownloadDaily}` to `ArtifactScreenView`. (imports `downloadCsv`, `buildSignalsCsv` already added in Task 4? — they were added to this file in Task 4; reuse.)

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/sections/artifacts/artifact-screen.test.tsx` PASS; `npx vitest run` PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add src/sections/artifacts/artifact-screen.tsx src/sections/artifacts/artifact-screen.test.tsx
git commit -m "feat(artifacts): детальный экран коллекции потока — «Дневные выжимки» + «Скачать общий»"
```

---

## Task 7: Campaign card «Артефакты» — streaming collection

**Files:**
- Modify: `src/sections/campaigns/campaign-artifacts-block.tsx` (render a collection summary when a cumulative is present)
- Modify: `src/sections/campaigns/campaign-screen.tsx` (add real download wiring for the block)
- Test: `src/sections/campaigns/campaign-artifacts-block.test.tsx` (create or extend)

- [ ] **Step 1: Write the failing test** — `campaign-artifacts-block.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CampaignArtifactsBlock } from "./campaign-artifacts-block";
import type { Artifact } from "@/state/app-state";

const cumulative: Artifact = { id: "str-c", campaignId: "str", kind: "signals", count: 12480, createdAt: "2026-06-30", variant: "cumulative" };
const daily = (id: string, date: string, n: number): Artifact => ({ id, campaignId: "str", kind: "signals", count: n, createdAt: date, variant: "daily", periodDate: date });

describe("CampaignArtifactsBlock — streaming collection", () => {
  afterEach(cleanup);
  it("shows the cumulative («Все сигналы за период») and recent выжимки, opens on click", () => {
    const onOpen = vi.fn();
    render(
      <CampaignArtifactsBlock
        artifacts={[cumulative, daily("d1", "2026-06-30", 2140), daily("d2", "2026-06-29", 1980)]}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/Все сигналы за период/)).toBeVisible();
    expect(screen.getByText(/Выжимка · 30\.06/)).toBeVisible();
    fireEvent.click(screen.getByText(/Все сигналы за период/));
    expect(onOpen).toHaveBeenCalledWith("str-c");
  });
});
```
Keep/verify the existing single-artifact tests (one-time campaign → «Сигналы · count» rows) still pass.

- [ ] **Step 2: Run it** — FAIL (block doesn't special-case cumulative).

- [ ] **Step 3: Branch `CampaignArtifactsBlock`.** When the `artifacts` prop contains a `cumulative`, render: a first row «Все сигналы за период · {cumulative.count}» (clicking opens the cumulative), then up to 3 most-recent daily rows «Выжимка · DD.MM · count», and a muted «…ещё N выжимок» line if there are more. Otherwise render the current single-artifact list unchanged. Reuse the existing `FileText` row markup + `formatNumber`. Example core:

```tsx
  const cumulative = artifacts.find((a) => a.variant === "cumulative");
  if (cumulative) {
    const dailies = artifacts
      .filter((a) => a.variant === "daily")
      .sort((a, b) => ((a.periodDate ?? "") < (b.periodDate ?? "") ? 1 : -1));
    const shown = dailies.slice(0, 3);
    return (
      <div className="flex flex-col">
        <button type="button" onClick={onOpen ? () => onOpen(cumulative.id) : undefined} disabled={!onOpen}
          className="flex items-center gap-3 py-2.5 text-left text-sm enabled:hover:text-foreground disabled:cursor-default">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground">Все сигналы за период</span>
          <span className="text-muted-foreground">{formatNumber(cumulative.count)} сигналов</span>
        </button>
        {shown.map((d) => (
          <button key={d.id} type="button" onClick={onOpen ? () => onOpen(cumulative.id) : undefined} disabled={!onOpen}
            className="flex items-center gap-3 border-t border-border/40 py-2.5 text-left text-sm enabled:hover:text-foreground disabled:cursor-default">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-foreground">Выжимка · {d.periodDate ? `${d.periodDate.slice(8, 10)}.${d.periodDate.slice(5, 7)}` : "—"}</span>
            <span className="text-muted-foreground tabular-nums">{formatNumber(d.count)}</span>
          </button>
        ))}
        {dailies.length > shown.length && (
          <p className="border-t border-border/40 py-2.5 text-xs text-muted-foreground">…ещё {dailies.length - shown.length} выжимок</p>
        )}
      </div>
    );
  }
  // …existing single-artifact rendering below…
```

- [ ] **Step 4: Campaign-screen wiring.** The existing `campaign-screen.tsx` already passes `campaignArtifacts` + `onOpen` (opens the artifact detail — which now renders the collection when the id is a cumulative). No structural change needed, but confirm `campaignArtifacts` includes the cumulative + dailies (it filters by `campaignId`, so it does). Verify the «Артефакты» CardSection still renders (its condition `campaignArtifacts.length > 0 || collectingNow` holds once digests exist).

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/sections/campaigns/campaign-artifacts-block.test.tsx` PASS; `npx vitest run` PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add src/sections/campaigns/campaign-artifacts-block.tsx src/sections/campaigns/campaign-artifacts-block.test.tsx src/sections/campaigns/campaign-screen.tsx
git commit -m "feat(artifacts): секция «Артефакты» карточки — коллекция потока (общий + свежие выжимки)"
```

---

## Task 8: e2e + visual snapshots for the artifacts collection

**Files:** `tests/e2e/screens/catalog.ts` (+ new screen entries), visual snapshots. Optionally a small e2e spec.

- [ ] **Step 1: Add catalog screens** for the new surfaces so they're covered by `screens.smoke`/`screens.visual`. Add entries seeding: (a) the global «Артефакты» → «Сигналы» tab with a streaming campaign that has a cumulative + several daily artifacts (renders one `ArtifactCollectionCard`), and (b) the collection detail view (`view: { kind: "artifact", artifactId: <cumulative id> }`) with dailies present. Follow the existing `SCREENS` entry shape (`id`, `name`, `seed`, `expect`). Seed the artifacts array + a matching `stream` campaign in `seed`.

- [ ] **Step 2: Run** `npm run test:e2e` — fix any failures from the seeded states. Then `npm run test:visual:update` to baseline the two new screens; verify with `npm run test:visual`. Confirm only the NEW artifacts screens' PNGs are added (no unrelated snapshot churn) via `git status --short`.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "test(e2e): коллекция артефактов потока — экраны каталога + визуальные бейзлайны"
```

---

## Self-Review (done while writing)

- **Spec coverage (Часть II §12–19):** §13 rules — one-time keeps single artifact, streaming makes daily+cumulative → Task 1 (variant) + Task 2 (digest reducer + skip single for stream). §14 model → Task 1. §15 accelerated timer (seeded, capped, stops on pause/complete) → Task 2 (reducer guards status/cap) + Task 3 (driver). §16 real CSV → Task 4. §17.1 collection cards / grouping → Task 5. §17.2 collection detail (EntityCardShell reuse) → Task 6. §17.3 campaign-card collection → Task 7. §18 non-goals honored (mock/seeded, path C makes no digests — `isStreamingCampaign` is false for own). §19 phased after Часть I ✓. e2e/visual → Task 8.
- **Placeholder scan:** none — each code step has real content. Task 6/7 give the added-section code and reference existing markup by name; Task 8 is a directed test task (its "figure out" is investigation, not a code placeholder).
- **Type consistency:** `variant`/`periodDate` on `Artifact` (Task 1) used identically in Tasks 2/5/6/7; `stream_digest_emitted { id, timestamp }` (Task 2) dispatched by the driver (Task 3); `buildSignalsCsv(seed, count)` + `downloadCsv(filename, csv)` (Task 4) consumed in Tasks 6/7; `groupArtifacts` → `ArtifactGroup` (Task 5) consumed by `SignalsTabView` (Task 5); `ArtifactScreenView` gains `dailies`/`onDownloadDaily` (Task 6). `isStreamingCampaign`/`MAX_DIGESTS`/`digestCount`/`addDaysIso` (Task 1) reused in Tasks 2/3.
- **Note for executor:** Task 2 Step 6 and Tasks 5/6/7 may require updating PRE-EXISTING tests that assumed the old flat-list / stream-gets-a-launch-artifact behavior — treat those updates as in-scope (adapt, don't delete coverage).
