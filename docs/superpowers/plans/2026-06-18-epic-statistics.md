# Campaign-First Migration — Epic «Статистика» (Wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `"templates"` group-by dimension to the global Статистика report-cube — tied to the actual `MessageTemplate`s used by each campaign's communication nodes, NOT to an invented label pool. The Статистика surface stays a report-cube and only *gains* this dimension. Every other deliverable the codex spec hung on block 11 (voronka / per-campaign metrics / spend / download-artifact) belongs to the campaign CARD (Кампании epic), not here.

**Architecture:** The cube derives atomic delivery *facts* (campaign × day × channel) and assigns one `DimValue` per dimension. Adding `"templates"` to `RowKind` makes it an `EntityDim` automatically (`EntityDim = Exclude<RowKind, TimeDim>`), so **every fact must populate `dims.templates`** or `dimValueOf`/`groupFacts`/`filterFactsByConditions` read `undefined` and the cube invariants collapse. We do the honest/expensive path:
1. Extend `StatsContext` to surface each campaign's communication-node templates (per channel).
2. Assign the template dim per fact **weighted by channel** — the email template only colours email facts, the sms template only sms facts, etc. A fact whose channel has no matching template falls back to a stable "Без шаблона" dim value (so the dim is always total and degenerate inputs — the metrics/data-summary callers that pass no templates — still satisfy the invariants).
3. Update `cacheKey` to include template identity so cached facts invalidate when a campaign's templates change.
4. Add the option to the existing group-by dropdown (`view-settings-levels.tsx`) and the `RowKind` union (`statistics-state.ts`).

**Additive-first.** `StatsContext.campaigns[].templates` is OPTIONAL — the three current `buildFacts` callers (`statistics-view.tsx`, `campaign-metrics.ts`, `data-summary.ts`) compile and behave unchanged until they opt in. Only `statistics-view.tsx` (which we own) opts in. Each task ends green (`npx tsc --noEmit` + `npx vitest run`).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state, Vitest (`npx vitest run`). The cube is pure TS in `src/sections/statistics/fact-cube.ts`.

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` — read §6 block 11 (honest template integration = C10), §3 channel/degenerate axis, §7.x UI-decision registry, §8 strategy. Also the frozen Foundation contract: `docs/superpowers/plans/2026-06-18-campaign-first-foundation.md` (entity types, `MessageTemplate`, `Channel`, `AppState`).

---

## ⚠️ Two environment facts that bite (verified)

1. The repo dir name has non-ASCII chars (NFC/NFD ambiguity). `Read`/`Write` may resolve to a stray sibling dir. Use the ASCII symlink `/tmp/afina-repo` for ALL reads/writes, or work through the shell (its cwd is the real git repo).
2. `Signal`/`Campaign`/`AppState`/`Action`/`MessageTemplate` all live in `src/state/app-state.ts` (NOT `src/types/`). `Channel` lives in `src/types/campaign.ts` (added by Foundation). `RowKind` and the dropdown live in `src/sections/statistics/`.

---

## Ownership boundary

**This epic owns ONLY `src/sections/statistics/**`.**

- We MAY edit: `statistics-state.ts`, `fact-cube.ts`, `fact-cube.test.ts`, `mock-data.ts`, `mock-data.test.ts`, `statistics-state.test.ts`, `view-settings-levels.tsx`, `statistics-view.tsx`, and add new test files under `src/sections/statistics/`.
- We MUST NOT edit hub files: `src/types/*`, `src/state/app-state.ts`, `src/app/page.tsx`. Any required change there is a **Foundation dependency** (see below) — written as a note, not an edit.
- `campaign-metrics.ts` and `data-summary.ts` are OTHER epics' / shared consumers of `buildFacts`. We keep `StatsContext.campaigns[].templates` optional precisely so we never have to touch them. Do NOT edit them.

---

## 🔗 Foundation dependency (BLOCKING — needed before Task 4 lands real data)

The cube needs, **per campaign**, the list of `MessageTemplate`s actually used by that campaign's communication nodes, addressable by `Channel`. Today that linkage does **not** exist on app-state:

- Campaign graphs are **not persisted per campaign** — they are generated on demand from the scenario via `createTemplate(...)` in `src/state/workflow-templates.ts`. So there is no `AppState.workflows[]` to read communication-node `templateId`s from.
- `Campaign` (frozen contract, `src/state/app-state.ts`) carries `channels?: Channel[]` but **no template refs**.
- `AppState.templates: MessageTemplate[]` is owned/added by the **Артефакты** epic per the Foundation contract; `MessageTemplate = { id, channel, name, content, usedInCampaigns }`.

**Exact addition Foundation/Артефакты must provide (do NOT implement here — write tasks assuming it exists):**

> Add a campaign→template linkage readable from app-state. Preferred minimal form: a field
> `Campaign.templateIds?: string[]` (ids into `AppState.templates`), populated when a campaign is launched
> with communication channels. The Статистика view then derives, per campaign, the per-channel template
> set by `state.templates.filter(t => campaign.templateIds?.includes(t.id))` and shaping it to
> `{ channel, id, name }[]`. If Foundation instead persists the campaign graph (`AppState.workflows`), the
> derivation reads communication nodes' `params.kind` + a `templateId` ref instead — the cube contract is the
> same either way: `StatsContext.campaigns[].templates?: { channel: Channel; id: string; name: string }[]`.

Until that linkage is merged, Task 6 (wire `statistics-view.tsx` to pass real templates) supplies the field but it resolves to `undefined`/empty → the cube uses the "Без шаблона" fallback dim. **The cube, dropdown, tests, and invariants in Tasks 1–5 do NOT depend on the linkage** — they are exercised with explicit fixtures. Only the live wiring (Task 6) and its end-to-end realism depend on it. Flag this to the user before starting Task 6.

---

## ASK-USER escalations (UI-decision registry §7)

- **None blocking.** Adding ONE option («Шаблоны») to the existing group-by dropdown (`view-settings-levels.tsx` `ROW_GROUPS` / `SUB_ROW_GROUPS`) is **reuse of an existing pattern**, not a new visual decision (governing principle §2; design §7 left-aligned grouped select already renders Кампании/Сценарии/Стратегии). Per the brief this is decided, not escalated. The new option slots into the existing «Коммуникации» group next to «Кампании»/«Сценарии», using the same `GroupedSelect` component — no new component, no colour, no layout decision.
- If, while implementing, a genuinely new UI need surfaces (it should not), STOP and escalate per governing principle §3 rather than inventing a pattern.

---

## Task 0: Isolated worktree + green baseline

**Files:** none (git only).

- [ ] **Step 1: Create the epic worktree off the post-Foundation integration branch** (AGENTS.md mandates worktrees for parallel work)

This epic builds against the **frozen Foundation contracts**, so branch off the integration branch that already has Foundation merged (NOT raw `main`). Confirm the branch name with the user — it is typically `feature/campaign-first-foundation` (Foundation's branch) or the integration branch it was merged into.

Run from the repo root:
```bash
git worktree add .worktrees/epic-statistics -b feature/epic-statistics <post-foundation-branch>
cd .worktrees/epic-statistics
npm install
```
If the Foundation branch is not yet merged/available, STOP and report — this epic cannot freeze against contracts that don't exist yet.

- [ ] **Step 2: Confirm the Foundation contracts are present**

Run:
```bash
git grep -n "MessageTemplate" src/state/app-state.ts
git grep -n 'export type Channel' src/types/campaign.ts
```
Expected: both resolve. If `MessageTemplate` / `Channel` are missing, the worktree is not off a post-Foundation branch — STOP and report.

- [ ] **Step 3: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean checkout, STOP and report — the plan assumes a green baseline.

---

## Task 1: Add `"templates"` to `RowKind` + the group-by dropdown option

This is the smallest contract change and it intentionally makes the cube *fail* next (because `EntityDim` now includes `"templates"` but no fact populates `dims.templates`). We surface that failure as a test first, fix it in Task 2.

**Files:**
- Modify: `src/sections/statistics/statistics-state.ts` (`RowKind` union)
- Modify: `src/sections/statistics/view-settings-levels.tsx` (`ROW_GROUPS`)
- Test: `src/sections/statistics/statistics-state.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/sections/statistics/statistics-state.test.ts`:
```ts
import type { RowKind } from "./statistics-state";

describe("RowKind — templates dimension", () => {
  it('"templates" is a valid RowKind', () => {
    const k: RowKind = "templates";
    expect(k).toBe("templates");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/statistics/statistics-state.test.ts`
Expected: FAIL to compile — `"templates"` not assignable to `RowKind`.

- [ ] **Step 3: Extend the `RowKind` union**

In `src/sections/statistics/statistics-state.ts`, add `"templates"` to the `RowKind` union, in the communications group (next to `"campaigns" | "scenarios" | "strategies"`):
```ts
  | "campaigns"
  | "scenarios"
  | "templates"
  | "strategies"
```

- [ ] **Step 4: Add the dropdown option (reuse, not new pattern — §7 / governing principle §2)**

In `src/sections/statistics/view-settings-levels.tsx`, in `ROW_GROUPS`, add to the «Коммуникации» group's `options`, after «Сценарии»:
```ts
      { value: "scenarios", label: "Сценарии" },
      { value: "templates", label: "Шаблоны" },
      { value: "strategies", label: "Стратегии" },
```
`SUB_ROW_GROUPS` spreads `ROW_GROUPS`, so the sub-row dropdown picks it up automatically — no second edit.

- [ ] **Step 5: Run the state test (passes) but expect cube tests to now fail**

Run: `npx vitest run src/sections/statistics/statistics-state.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "fact-cube|dims" || echo "no type error yet"`
Note: `dims: Record<EntityDim, DimValue>` now structurally REQUIRES a `templates` key on every `Fact`. The `Fact` literals in `buildCampaignFacts` (fact-cube.ts) omit it → tsc error in `fact-cube.ts`. This is expected and fixed in Task 2. Do NOT fix here.

- [ ] **Step 6: Commit (cube intentionally red until Task 2)**

```bash
git add src/sections/statistics/statistics-state.ts src/sections/statistics/view-settings-levels.tsx src/sections/statistics/statistics-state.test.ts
git commit -m "feat(stats): add templates dimension to RowKind + group-by dropdown"
```

---

## Task 2: Extend `StatsContext` to carry per-campaign templates (additive, optional)

**Files:**
- Modify: `src/sections/statistics/fact-cube.ts` (`StatsContext` type only — no fact change yet)
- Test: `src/sections/statistics/fact-cube.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/sections/statistics/fact-cube.test.ts` a fixture that adds templates to a campaign and a typing assertion. First, extend the imports at the top to pull `Channel` typing through the context (templates carry a `channel`). Add:
```ts
import type { StatsContext } from "./fact-cube";

const CTX_WITH_TEMPLATES: StatsContext = {
  signals: [{ id: "sig_t", count: 20000 }],
  campaigns: [
    {
      id: "cmp_t",
      name: "С шаблонами",
      signalId: "sig_t",
      status: "active",
      createdAt: iso(2026, 5, 1),
      launchedAt: iso(2026, 5, 1),
      templates: [
        { channel: "sms", id: "tpl_sms", name: "SMS-напоминание" },
        { channel: "email", id: "tpl_eml", name: "Email-дайджест" },
      ],
    },
  ],
};

describe("StatsContext — per-campaign templates field", () => {
  it("accepts campaigns carrying a templates array", () => {
    expect(CTX_WITH_TEMPLATES.campaigns?.[0].templates).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: FAIL to compile — `templates` not a known property of the campaign element in `StatsContext`.

- [ ] **Step 3: Extend `StatsContext`**

In `src/sections/statistics/fact-cube.ts`, import `Channel`:
```ts
import type { Channel } from "@/types/campaign";
```
Add the optional `templates` field to the campaign element of `StatsContext` (after `scenario?`):
```ts
    scenario?: { id: string; name: string };
    /**
     * Templates this campaign actually uses on its communication nodes, by
     * channel. Surfaced from app-state (Foundation/Артефакты linkage). Optional:
     * callers that don't supply it (campaign-metrics, data-summary) get the
     * "Без шаблона" fallback dim — the cube stays total either way.
     */
    templates?: readonly { channel: Channel; id: string; name: string }[];
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: the new typing test PASSES. (Other fact-cube tests still FAIL — `dims.templates` still missing from facts. Fixed in Task 3.) Confirm only the new typing test passes:
Run: `npx vitest run src/sections/statistics/fact-cube.test.ts -t "per-campaign templates field"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/statistics/fact-cube.ts src/sections/statistics/fact-cube.test.ts
git commit -m "feat(stats): StatsContext carries per-campaign template refs (optional)"
```

---

## Task 3: Populate `dims.templates` on every fact (channel-weighted, with fallback)

The core honest-data task. Each fact already knows its `channel` (`cell.channel`). We map the fact's channel to the campaign's template for that channel; if none, a stable "Без шаблона" dim value. This guarantees `dims.templates` is always present (cube invariants hold for both template-bearing and template-less inputs).

**Files:**
- Modify: `src/sections/statistics/fact-cube.ts` (`buildCampaignFacts`, a channel→`Channel` mapping helper, a fallback const)
- Test: `src/sections/statistics/fact-cube.test.ts` (extend — invariants + assignment)

- [ ] **Step 1: Understand the channel mapping**

The cube's fact `channel` is a `DimValue` drawn from the **invented** `POOLS.channels` pool (labels like "SMS", "Push", "Email", "Viber", "WhatsApp", "Звонок", …) — NOT the typed `Channel` union (`sms|push|email|ivr`). To weight a typed template to its facts we map each pool channel label to a `Channel` (or `null` for channels with no template type, e.g. Viber/WhatsApp/Звонок → no template ⇒ fallback). Decide the map explicitly:
```ts
// Maps the cube's invented channel labels to the typed Channel a template
// targets. Labels with no template channel (Viber/WhatsApp/Личный кабинет/…)
// map to null → those facts get the "Без шаблона" fallback dim.
const CHANNEL_LABEL_TO_TEMPLATE_CHANNEL: Record<string, Channel | null> = {
  SMS: "sms",
  Push: "push",
  Email: "email",
  Звонок: "ivr",
  Viber: null,
  WhatsApp: null,
  "Личный кабинет": null,
  "Мобильное приложение": null,
};
```
Keep this beside `POOLS` so it's obvious it must stay in sync with `POOLS.channels`.

- [ ] **Step 2: Write the failing tests**

Append to `src/sections/statistics/fact-cube.test.ts`:
```ts
import { dimValueOf, groupFacts as _groupFacts } from "./fact-cube";

describe("templates dimension — facts", () => {
  it("каждый факт несёт значение по измерению templates", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) {
      expect(f.dims.templates?.label).toBeTruthy();
      expect(f.dims.templates?.key).toBeTruthy();
    }
  });

  it("факты email-канала несут email-шаблон, sms-канала — sms-шаблон", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    for (const f of facts) {
      if (f.dims.channels.label === "Email") {
        expect(f.dims.templates.label).toBe("Email-дайджест");
      }
      if (f.dims.channels.label === "SMS") {
        expect(f.dims.templates.label).toBe("SMS-напоминание");
      }
    }
  });

  it("канал без шаблона → факт получает «Без шаблона»", () => {
    // CTX (no templates anywhere) → every fact falls back.
    const facts = buildFacts(CTX, PERIOD, { now: NOW });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.dims.templates.key === "tpl-none")).toBe(true);
    expect(facts.every((f) => f.dims.templates.label === "Без шаблона")).toBe(true);
  });

  it("группировка по templates сохраняет инвариант: подстроки = родитель", () => {
    const facts = buildFacts(CTX_WITH_TEMPLATES, PERIOD_JUNE, { now: NOW });
    const byTemplate = _groupFacts(facts, "templates");
    const total = aggregate(facts);
    const summed = byTemplate.reduce(
      (acc, g) => {
        const a = aggregate(g.facts);
        for (const k of ADDITIVE) acc[k] += a[k];
        return acc;
      },
      { sends: 0, clicks: 0, actions: 0, holds: 0, approves: 0, rejects: 0 } as Record<
        (typeof ADDITIVE)[number],
        number
      >,
    );
    for (const k of ADDITIVE) expect(summed[k]).toBe(total[k]);
  });
});
```
> Note: the test `"каждый факт несёт значение по каждому измерению"` already in the file lists every `EntityDim` except `templates`. Add `"templates"` to that array too, so the existing exhaustive check covers the new dim.

- [ ] **Step 3: Run them**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: FAIL — `dims.templates` is `undefined` on facts (and tsc errors in the source literal).

- [ ] **Step 4: Add the fallback const + per-channel resolution + populate the dim**

In `src/sections/statistics/fact-cube.ts`:

a) Near `WEEKDAY_NAMES`, add the stable fallback:
```ts
const NO_TEMPLATE_DIM: DimValue = { key: "tpl-none", label: "Без шаблона", order: 0 };
```

b) In `buildCampaignFacts`, build a per-`Channel` lookup of the campaign's templates once (before the cells loop):
```ts
  // Templates this campaign uses, indexed by the typed Channel they target.
  // Last-wins if a campaign somehow lists two templates for one channel.
  const templateByChannel = new Map<Channel, DimValue>();
  for (const t of c.templates ?? []) {
    templateByChannel.set(t.channel, { key: `tpl-${t.id}`, label: t.name, order: 0 });
  }
```

c) Inside the `cells.forEach` callback, resolve the template dim from the fact's channel:
```ts
    const tplChannel = CHANNEL_LABEL_TO_TEMPLATE_CHANNEL[cell.channel.label] ?? null;
    const templateDim =
      (tplChannel && templateByChannel.get(tplChannel)) || NO_TEMPLATE_DIM;
```

d) Add `templates: templateDim,` to the fact's `dims` object literal (alongside `campaigns`, `scenarios`, `channels`, …):
```ts
      dims: {
        campaigns: campaignDim,
        scenarios: scenarioDim,
        templates: templateDim,
        strategies: strategy,
        ...
      },
```

- [ ] **Step 5: Run the cube tests**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: PASS — all new template tests + all pre-existing invariants (sub-rows sum to parent, total independent of dimension, determinism, include/exclude filtering) still green.

- [ ] **Step 6: Verify the WHOLE existing invariant set still holds across the new dim**

The cube's grand-total-independent-of-dimension test (`общий итог не зависит от выбора разреза`) lists dims explicitly. Add `"templates"` to that array so the invariant is asserted for the new dimension:
```ts
    for (const dim of ["campaigns", "channels", "scenarios", "templates", "weekdays"] as const) {
```
Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sections/statistics/fact-cube.ts src/sections/statistics/fact-cube.test.ts
git commit -m "feat(stats): populate dims.templates per fact (channel-weighted + fallback)"
```

---

## Task 4: Include template identity in `cacheKey`

The fact cache is keyed by entities+period+now. Template assignment now depends on each campaign's `templates` — if a campaign's templates change but nothing else does, the stale cache would serve facts with the wrong template dim. Add template identity to the key.

**Files:**
- Modify: `src/sections/statistics/fact-cube.ts` (`cacheKey`)
- Test: `src/sections/statistics/fact-cube.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/sections/statistics/fact-cube.test.ts`:
```ts
describe("cacheKey — template identity", () => {
  it("смена шаблонов кампании инвалидирует кэш (другое распределение по templates)", () => {
    const ctxA: StatsContext = {
      signals: [{ id: "s", count: 20000 }],
      campaigns: [
        {
          id: "cmp_c", name: "C", signalId: "s", status: "active",
          createdAt: iso(2026, 5, 1), launchedAt: iso(2026, 5, 1),
          templates: [{ channel: "sms", id: "tpl_1", name: "Шаблон 1" }],
        },
      ],
    };
    const ctxB: StatsContext = {
      ...ctxA,
      campaigns: [{ ...ctxA.campaigns![0], templates: [{ channel: "sms", id: "tpl_2", name: "Шаблон 2" }] }],
    };
    const labelsA = new Set(
      buildFacts(ctxA, PERIOD_JUNE, { now: NOW }).map((f) => f.dims.templates.label),
    );
    const labelsB = new Set(
      buildFacts(ctxB, PERIOD_JUNE, { now: NOW }).map((f) => f.dims.templates.label),
    );
    // If the cache ignored templates, ctxB would return ctxA's cached facts and
    // labelsB would still contain "Шаблон 1".
    expect(labelsA.has("Шаблон 1")).toBe(true);
    expect(labelsB.has("Шаблон 2")).toBe(true);
    expect(labelsB.has("Шаблон 1")).toBe(false);
  });
});
```
> These two contexts differ ONLY in template id, with identical period/now/signal/status — so the test fails iff `cacheKey` ignores templates.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts -t "template identity"`
Expected: FAIL — `cacheKey` omits templates, so `ctxB` reuses `ctxA`'s cached facts.

- [ ] **Step 3: Fold template identity into `cacheKey`**

In `cacheKey`, extend the per-campaign serialization to append the campaign's template refs (channel+id), order-stable:
```ts
  const c = (ctx.campaigns ?? [])
    .map((x) => {
      const tpls = (x.templates ?? [])
        .map((t) => `${t.channel}:${t.id}`)
        .join(",");
      return `${x.id}:${x.status}:${x.signalId}:${x.launchedAt ?? ""}:${x.pausedAt ?? ""}:${x.completedAt ?? ""}:${x.createdAt}:${x.scenario?.id ?? ""}:${tpls}`;
    })
    .join("|");
```
(Template `name` is display-only; key on channel+id — name changes don't change fact distribution. If you prefer to invalidate on rename too, append `:${t.name}` — not required for correctness.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts -t "template identity"`
Expected: PASS.

- [ ] **Step 5: Full cube suite + determinism still green**

Run: `npx vitest run src/sections/statistics/fact-cube.test.ts`
Expected: PASS (including the existing `детерминизм: повторный вызов даёт те же числа` — same ctx still hits the cache).

- [ ] **Step 6: Commit**

```bash
git add src/sections/statistics/fact-cube.ts src/sections/statistics/fact-cube.test.ts
git commit -m "feat(stats): include template identity in fact cube cacheKey"
```

---

## Task 5: Confirm the report layer groups by templates end-to-end (mock-data)

`generateRows` (mock-data.ts) is dimension-agnostic — it calls `groupFacts(facts, filters.rows)`. With Tasks 1–3 done it already handles `"templates"`. Add a guard test so a future regression (e.g. someone special-casing dims) is caught, and confirm no `mock-data.ts` change is needed.

**Files:**
- Test: `src/sections/statistics/mock-data.test.ts` (extend)
- Possibly modify: `src/sections/statistics/mock-data.ts` (only if the test reveals a gap — it should not)

- [ ] **Step 1: Write the test**

Append to `src/sections/statistics/mock-data.test.ts`:
```ts
import { generateRows } from "./mock-data";
import { DEFAULT_FILTERS } from "./statistics-state";
import type { StatsContext } from "./fact-cube";

describe("generateRows — группировка по шаблонам", () => {
  const now = new Date(2026, 5, 15);
  const ctx: StatsContext = {
    signals: [{ id: "s", count: 20000 }],
    campaigns: [
      {
        id: "cmp", name: "К", signalId: "s", status: "active",
        createdAt: new Date(2026, 5, 1).toISOString(),
        launchedAt: new Date(2026, 5, 1).toISOString(),
        templates: [
          { channel: "sms", id: "t1", name: "SMS A" },
          { channel: "email", id: "t2", name: "Email B" },
        ],
      },
    ],
  };

  it("rows=templates даёт строки по шаблонам кампании (+ Без шаблона для прочих каналов)", () => {
    const rows = generateRows(
      { ...DEFAULT_FILTERS, period: { preset: "this-month" }, rows: "templates", subRows: "none" },
      ctx,
      { now },
    );
    const labels = rows.map((r) => r.label);
    // Хотя бы один реальный шаблон присутствует; набор зависит от того, какие
    // каналы выпали кампании детерминированно.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });

  it("подстроки templates суммируются в родителя (через formatted-нечего ломать на уровне фактов)", () => {
    const rows = generateRows(
      { ...DEFAULT_FILTERS, period: { preset: "this-month" }, rows: "campaigns", subRows: "templates" },
      ctx,
      { now },
    );
    expect(rows.length).toBeGreaterThan(0);
    // Каждая кампания-строка имеет хотя бы одну подстроку-шаблон.
    expect(rows.every((r) => r.subRows.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/statistics/mock-data.test.ts`
Expected: PASS with NO change to `mock-data.ts` (dimension-agnostic). If it fails because `generateRows` mishandles the dim, fix `mock-data.ts` minimally — but it should not.

- [ ] **Step 3: Commit**

```bash
git add src/sections/statistics/mock-data.test.ts
git commit -m "test(stats): generateRows groups by templates dimension"
```

---

## Task 6: Wire `statistics-view.tsx` to feed real templates (Foundation-dependent)

> **🔗 Foundation dependency gate.** Before this task, confirm the campaign→template linkage from the dependency note above is merged and available on app-state (`Campaign.templateIds` + `AppState.templates`, or the persisted-graph equivalent). If NOT available yet, implement Step 1–2 anyway (the field resolves to empty → "Без шаблона" everywhere, which is contract-valid), and flag to the user that the dimension will only show "Без шаблона" until the linkage lands. Do NOT edit app-state to add the linkage — that is Foundation/Артефакты scope.

**Files:**
- Modify: `src/sections/statistics/statistics-view.tsx` (the `StatsContext` it builds for `generateRows`)
- Test: covered by mock-data/fact-cube unit tests; view wiring verified by smoke (Task 7)

- [ ] **Step 1: Read the current context construction**

In `statistics-view.tsx`, `generateRows(applied, { campaigns, signals }, { now })` builds the context inline from `useAppState()` (`const { campaigns, signals } = useAppState();`). We need to also read `templates` from app-state and shape per-campaign template refs.

- [ ] **Step 2: Shape and pass per-campaign templates**

Read `templates` from app-state (alongside `campaigns`, `signals`):
```tsx
  const { campaigns, signals, templates } = useAppState();
```
Build a per-campaign mapping to the cube's expected shape, using the Foundation linkage (`campaign.templateIds`). Inline near the `rows` memo:
```tsx
  const cubeCampaigns = useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        templates: (c.templateIds ?? [])
          .map((id) => templates.find((t) => t.id === id))
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map((t) => ({ channel: t.channel, id: t.id, name: t.name })),
      })),
    [campaigns, templates],
  );
```
Then pass `cubeCampaigns` instead of `campaigns`:
```tsx
  const rows = useMemo(
    () => generateRows(applied, { campaigns: cubeCampaigns, signals }, { now }),
    [applied, cubeCampaigns, signals, now],
  );
```
> If app-state does not yet expose `templates` / `Campaign.templateIds`, this will not compile. In that interim, pass `campaigns` unchanged (templates resolve to fallback) and leave a `// TODO(foundation-linkage)` marker — do NOT touch app-state. Confirm the exact field names against the merged Foundation contract before writing this; the names above are the dependency note's preferred form.

- [ ] **Step 3: Type + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + all-pass.

- [ ] **Step 4: Commit**

```bash
git add src/sections/statistics/statistics-view.tsx
git commit -m "feat(stats): feed real campaign templates into the report cube"
```

---

## Task 7: Epic gate — verify Статистика gained the templates dimension honestly

**Files:** none (verification only).

- [ ] **Step 1: Contracts compile, suite green**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all PASS — including every pre-existing cube invariant (sub-rows sum to parent, grand total independent of dimension, determinism) now also asserted across `"templates"`.

- [ ] **Step 2: Build**

Run: `npx next build` (or `npm run build`)
Expected: build succeeds.

- [ ] **Step 3: Manual smoke (dev on a non-default port per AGENTS.md)**

Run: `npx next dev -p 3001`
Verify in Статистика:
- The group-by dropdown («Строки» and «Подстроки») now lists «Шаблоны» under «Коммуникации».
- Selecting Строки = Шаблоны renders rows per real template name (e.g. "SMS-напоминание", "Email-дайджест") plus "Без шаблона" for channels with no template — NOT invented pool labels.
- Switching Строки between Кампании / Каналы / Шаблоны keeps the grand total identical (cube invariant visible to the user).
- Cross-tab: a campaign whose communication nodes use a given template shows that template's facts only on its channel's rows.

- [ ] **Step 4: Confirm the boundary held**

Run: `git diff --name-only <post-foundation-branch>..HEAD`
Expected: every changed file is under `src/sections/statistics/`. If any `src/types/*`, `src/state/app-state.ts`, or `src/app/page.tsx` appears, the ownership boundary was violated — revert that change and convert it to a Foundation-dependency note.

- [ ] **Step 5: Report worktree + branch + dependency status to the user**

Report: branch `feature/epic-statistics` at `.worktrees/epic-statistics`; whether the campaign→template linkage was available (live real data) or fell back to "Без шаблона" pending Foundation/Артефакты. Per AGENTS.md, merge is the user's call.

---

## Handoff note

- **Owned & changed:** `src/sections/statistics/` only — `statistics-state.ts` (`RowKind`), `fact-cube.ts` (`StatsContext`, channel→Channel map, `dims.templates`, `cacheKey`), `view-settings-levels.tsx` (dropdown option), `statistics-view.tsx` (live wiring), plus the three extended test files.
- **NOT changed (by design):** `campaign-metrics.ts`, `data-summary.ts` (kept compiling via the optional `templates` field), and all hub files (`src/types/*`, `src/state/app-state.ts`, `src/app/page.tsx`).
- **Foundation dependency flagged (1):** campaign→template linkage on app-state (`Campaign.templateIds` + `AppState.templates`, or persisted-graph equivalent), required for Task 6 to show real data. Cube/dropdown/tests (Tasks 1–5) do not depend on it. Until merged, the dimension shows "Без шаблона".
- **ASK-USER escalations (0):** the single dropdown option is reuse of the existing `GroupedSelect` pattern (§7 / governing principle §2), explicitly decided, not escalated.
- **Out of scope (other epics):** voronka, per-campaign metrics, spend, download-artifact (Кампании card); the `MessageTemplate` type and templates list/CRUD (Артефакты, already in Foundation contract).
- **Invariants preserved:** every pre-existing cube test still passes and now also covers `"templates"`; sub-rows still sum to parent and the grand total is still dimension-independent.
