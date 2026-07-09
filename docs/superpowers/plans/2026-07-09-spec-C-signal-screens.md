# Spec C — Signal node feature, daily budget, welcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**For agentic workers:** Execute tasks in order. Each task is a self-contained TDD cycle: write the failing test, run it (RED), write the implementation, run it (GREEN), then commit. Do not skip the RED step. Every code block below is real — copy it, do not paraphrase. Run the single-file command shown after each edit; run the full suite + `tsc` + `lint` only at the gates noted. All paths are absolute-from-repo-root (`src/...`).

**Goal:** Ship Spec C (item 1 full signal-node feature, item 10 daily-budget card row, item 11 welcome-screen rewrite) from the `2026-07-09-spec-C-signal-feature-screens-design.md` spec, in a worktree off `integration`, rebased onto B before touching any A/B-shared file.

**Architecture:** Single-page app driven by a `useReducer` app-state (`src/state/app-state.ts`) with a `View` discriminated union. Screens are `"use client"` React components under `src/sections/**`. The campaign workflow is an xyflow graph built from templates (`src/state/workflow-templates.ts`) whose node bodies render in `node-card-content.tsx` via per-kind renderers, with a few kinds (`split`, `wait`, `scoring`) bypassing the generic renderer to mount dedicated components. Signal becomes the 4th such bypass.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, lucide-react, motion v12. Tests: vitest + `@testing-library/react` (global env `jsdom`, see `vitest.config.ts`). Single file: `npx vitest run <path>`. Types: `npx tsc --noEmit`. Lint: `npm run lint`.

---

## Shared-file / rebase note

C merges **last** (A → B → C). Seven tasks below touch only C-exclusive files and run **before** the rebase. Four shared files are touched **after** the rebase, in different regions than A/B (resolve trivially on rebase):

| Shared file | Owner | C's edit (region) | Conflicts with |
|---|---|---|---|
| `src/types/workflow.ts` | shared A/C | add `SignalParams.files?`, delete `createBaseNodes`/`createBaseEdges` | A edits `merge`/`statistics` in `WorkflowNodeType`/`NODE_CATEGORY` — different regions |
| `src/sections/campaigns/node-visuals.ts` | A | `NODE_ICON.signal: SignalLow → Radar` (+ import) | A edits `merge`/`statistics` keys — different keys |
| `src/sections/campaigns/workflow-view.tsx` | shared A/C | collapse empty-`signalType` fallback to `{ nodes: [], edges: [] }` (line ~76) + drop the `createBaseNodes` import | A edits `computeDynamicSublabel`/`fallbackParamsPatch` — different regions |
| `src/sections/campaigns/node-card-content.tsx` | B | additive `signal` special-case mounting `<SignalFiles/>` + exclusion clause | B owns file; A/B only touch the `merge`/`statistics` renderer keys |

`src/state/workflow-templates.ts` is also A/C-shared (C edits `applyCampaignContext`'s signal branch; A edits `statistics` edges/titles — different regions). `app-state.ts`, `artifact-screen.tsx`, `signals-tab.tsx`, `campaign-screen.tsx`, `campaign-card.tsx`, `workflow-mini-preview.tsx`, `campaign-payment-screen.tsx`, the welcome files, and the new `signal-files.tsx` / `format-rub.ts` do **not** intersect A/B.

**Design decision (documented):** `SignalParams.files` is added as **optional** (`files?: string[]`), not required. Rationale: a required field would force edits into 6 template builders, `src/lib/ai/rebuild-schema.ts`, and three A-owned test files (`campaign-cost.test.ts`, `structural-commands.test.ts`, `graph-summary.test.ts`) that construct `SignalParams` literals — maximizing merge surface for zero behavioral gain. Optional keeps the blast radius to exactly the two C touchpoints: `applyCampaignContext` writes it, `SignalFiles` reads `params.files ?? []`. `fileName` is retained for back-compat, unchanged.

---

## File Structure

**New files**
- `src/sections/campaigns/signal-files.tsx` — the node-body component (item 1.3)
- `src/sections/campaigns/signal-files.test.tsx`
- `src/lib/format-rub.ts` — shared `formatRubPlain` (item 10)
- `src/lib/format-rub.test.ts`
- `src/sections/campaigns/campaign-card.test.tsx` — does **not** exist on integration; created here

**Modified files**
- `src/sections/welcome/onboarding-step-cards.tsx` + `onboarding-step-cards.test.tsx` (item 11)
- `src/sections/welcome/welcome-view.tsx` + `welcome-view.test.tsx` (item 11)
- `src/sections/campaigns/campaign-card.tsx` (item 10)
- `src/sections/campaigns/campaign-payment-screen.tsx` (import shared `formatRubPlain`)
- `src/state/app-state.ts` + `src/state/artifact-routing.test.ts` (item 1.4 origin)
- `src/sections/artifacts/artifact-screen.tsx` + `artifact-screen.test.tsx` (item 1.4 back)
- `src/sections/artifacts/signals-tab.tsx` (item 1.4 origin `"artifacts"`)
- `src/sections/campaigns/campaign-screen.tsx` (item 1.4 origin `"campaign"`)
- `src/sections/campaigns/node-visuals.ts` + `node-visuals.test.ts` (item 1.1 Radar)
- `src/types/workflow.ts` (item 1.2 model + 1.5 legacy removal)
- `src/state/workflow-templates.ts` (item 1.2 population)
- `src/sections/campaigns/node-card-content.tsx` (item 1.3 mount)
- `src/sections/campaigns/workflow-view.tsx` (item 1.5 fallback)
- `src/sections/campaigns/workflow-mini-preview.tsx` + `workflow-mini-preview.test.tsx` (item 1.5 fallback)
- `src/state/workflow-validation.test.ts` (item 1.5 — stop using `createBaseNodes`)

---

## Task 0 — Worktree preflight

From the repo root:

```bash
git worktree add .worktrees/spec-c -b feature/spec-c-signal-screens integration
cd .worktrees/spec-c
npm install
```

Verify the base is level with `integration`:

```bash
git status --short                       # expect: (no output — clean)
git merge --ff-only integration          # expect: "Already up to date."
git rev-list --count HEAD..integration   # expect: 0
```

If the count is not `0` or the merge fails, STOP and report a stale base (do not `git reset --hard` — it is blocked here). Confirm the toolchain:

```bash
npx vitest run src/state/artifact-routing.test.ts   # expect: 2 passed (baseline green)
```

No commit for Task 0.

---

## Task 1 — Item 11: onboarding cards copy (three payment-model plates)

C-only file. **RED —** replace the body of `src/sections/welcome/onboarding-step-cards.test.tsx` with:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — три модели оплаты", () => {
  it("рендерит три карточки: Только сигналы / Сигналы + коммуникация / Коммуникация по файлу", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Только сигналы")).toBeInTheDocument();
    expect(screen.getByText("Сигналы + коммуникация")).toBeInTheDocument();
    expect(screen.getByText("Коммуникация по файлу")).toBeInTheDocument();
    // «Статистика» убрана из карточек.
    expect(screen.queryByText("Статистика")).not.toBeInTheDocument();
    expect(screen.queryByText("Кампании")).not.toBeInTheDocument();
  });

  it("карточка «Только сигналы» — про готовые сегменты и оплату за сигналы", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Афина находит, кому из клиентов нужна коммуникация прямо сейчас, и отдаёт готовые сегменты. Платите за сигналы.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Сигналы + коммуникация» — про запуск сообщений по каналам", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Афина находит нужный момент и сама запускает сообщения по выбранным каналам. Платите за сигналы и коммуникацию.",
      ),
    ).toBeInTheDocument();
  });

  it("карточка «Коммуникация по файлу» — про загруженную базу", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Уже знаете, кому писать — загрузите свою базу, афина отправит сообщения по каналам. Платите за коммуникацию.",
      ),
    ).toBeInTheDocument();
  });
});
```

```bash
npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx   # expect: FAIL (old strings)
```

**GREEN —** in `src/sections/welcome/onboarding-step-cards.tsx` replace the `PLATES` array (lines 10–26) with:

```tsx
const PLATES: readonly Plate[] = [
  {
    heading: "Только сигналы",
    description:
      "Афина находит, кому из клиентов нужна коммуникация прямо сейчас, и отдаёт готовые сегменты. Платите за сигналы.",
  },
  {
    heading: "Сигналы + коммуникация",
    description:
      "Афина находит нужный момент и сама запускает сообщения по выбранным каналам. Платите за сигналы и коммуникацию.",
  },
  {
    heading: "Коммуникация по файлу",
    description:
      "Уже знаете, кому писать — загрузите свою базу, афина отправит сообщения по каналам. Платите за коммуникацию.",
  },
] as const;
```

(Leave `plateClass`, `staggerStyle`, and the render body unchanged — structure is preserved, only copy changes.)

```bash
npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx   # expect: 4 passed
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 11: rewrite onboarding cards as three payment models

Replace Сигналы/Коммуникации/Статистика with Только сигналы /
Сигналы + коммуникация / Коммуникация по файлу; drop Статистика.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Item 11: welcome hero subtitle

C-only file. **RED —** in `src/sections/welcome/welcome-view.test.tsx` replace the `HERO_PARAGRAPH` constant (lines 5–6) with:

```tsx
const HERO_PARAGRAPH =
  "В афине вы запускаете кампании. Кампания находит, кому из ваших клиентов нужна коммуникация прямо сейчас, и может сама отправить сообщения — или работать по загруженной базе. Платите только за то, что используете: сигналы, коммуникацию или всё вместе.";
```

(Leave the rest of the test file untouched — the CTA-wording and wiring tests still hold.)

```bash
npx vitest run src/sections/welcome/welcome-view.test.tsx   # expect: FAIL (old paragraph)
```

**GREEN —** in `src/sections/welcome/welcome-view.tsx` replace the subtitle `<p>` (lines 54–58) with:

```tsx
        <p className="text-[18px] leading-[26px] text-muted-foreground">
          В афине вы запускаете кампании. Кампания находит, кому из ваших
          клиентов нужна коммуникация прямо сейчас, и может сама отправить
          сообщения — или работать по загруженной базе. Платите только за то,
          что используете: сигналы, коммуникацию или всё вместе.
        </p>
```

(JSX collapses the newlines/indentation to single spaces, matching `HERO_PARAGRAPH` exactly. H1 is unchanged.)

```bash
npx vitest run src/sections/welcome/welcome-view.test.tsx   # expect: 5 passed
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 11: rewrite welcome hero subtitle (pay-for-what-you-use)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Item 10: extract shared `formatRubPlain` money util

C-only + a non-A/B screen. **RED —** create `src/lib/format-rub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRubPlain } from "./format-rub";

describe("formatRubPlain", () => {
  it("formats whole thousands as «12 000 ₽» (ru-RU grouping + trailing sign)", () => {
    // Ru-RU groups with a no-break space, so match flexibly.
    expect(formatRubPlain(12000)).toMatch(/^12\s000\s₽$/);
  });

  it("keeps up to two fraction digits", () => {
    expect(formatRubPlain(0.5)).toMatch(/0[.,]5\s₽/);
  });

  it("formats zero", () => {
    expect(formatRubPlain(0)).toMatch(/^0\s₽$/);
  });
});
```

```bash
npx vitest run src/lib/format-rub.test.ts   # expect: FAIL (module missing)
```

**GREEN —** create `src/lib/format-rub.ts` (verbatim copy of the payment screen's local definition, now the single source):

```ts
/** «1 234 ₽» / «0,5 ₽» — plain rouble value with a trailing sign (ru-RU grouping). */
export function formatRubPlain(n: number): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}
```

Now retire the payment screen's private copy so there is exactly one definition. In `src/sections/campaigns/campaign-payment-screen.tsx`:

- Add to the imports (near the other `@/lib` / local imports, e.g. after line 10):
  ```tsx
  import { formatRubPlain } from "@/lib/format-rub";
  ```
- Delete the local `formatRubPlain` function (lines 35–38). `scoringLineDisplay` (line 54) and the four call sites (lines 312–324) now resolve to the imported one — no other change.

```bash
npx vitest run src/lib/format-rub.test.ts                                   # expect: 3 passed
npx tsc --noEmit                                                            # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 10: extract formatRubPlain into a shared lib util

Single exact-rouble formatter (12 000 ₽) shared by the payment screen and
(next task) the campaign card. Removes the payment screen's private copy.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Item 10: «Дневной бюджет» row on the campaign card

C-only file; test file is new (integration has none). **RED —** create `src/sections/campaigns/campaign-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignCard } from "./campaign-card";
import type { Campaign } from "@/state/app-state";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_1",
    name: "Поток ЖК Заря",
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    launchedAt: "2026-06-02T00:00:00.000Z",
    scenario: { id: "sc_1", name: "Удержание" },
    channels: ["sms"],
    ...overrides,
  };
}

describe("CampaignCard — дневной бюджет (item 10)", () => {
  it("stream-кампания с dailyBudget показывает «Дневной бюджет» точным значением", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", dailyBudget: 12000 })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Дневной бюджет")).toBeInTheDocument();
    // Точный формат (ru-RU no-break space), НЕ компактный «12 тыс ₽».
    expect(screen.getByText(/^12\s000\s₽$/)).toBeInTheDocument();
    expect(screen.queryByText(/тыс ₽/)).not.toBeInTheDocument();
  });

  it("разовая (new) кампания не показывает «Дневной бюджет»", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "new", dailyBudget: 12000 })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Дневной бюджет")).not.toBeInTheDocument();
  });

  it("stream без dailyBudget не показывает строку", () => {
    render(
      <CampaignCard
        campaign={makeCampaign({ sourceType: "stream", dailyBudget: undefined })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("Дневной бюджет")).not.toBeInTheDocument();
  });
});
```

```bash
npx vitest run src/sections/campaigns/campaign-card.test.tsx   # expect: FAIL (no row)
```

**GREEN —** in `src/sections/campaigns/campaign-card.tsx`:

- Add the import (after line 7, the `campaign-metrics` import):
  ```tsx
  import { formatRubPlain } from "@/lib/format-rub";
  ```
- Insert the new `StatItem` inside the stats row, right after the «Бюджет (факт)» block (i.e. after line 102, still inside the `<div className="mt-1 flex flex-wrap …">`):
  ```tsx
        {campaign.sourceType === "stream" && campaign.dailyBudget != null && (
          <StatItem
            label="Дневной бюджет"
            value={formatRubPlain(campaign.dailyBudget)}
          />
        )}
  ```

Do **not** touch the card's local compact `formatRub` (still used for the расчётный/факт budget rows).

```bash
npx vitest run src/sections/campaigns/campaign-card.test.tsx   # expect: 3 passed
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 10: add «Дневной бюджет» row to the campaign card

Stream campaigns with a dailyBudget show it in the exact «12 000 ₽» format
(shared formatRubPlain), not the card's compact formatter. Hidden otherwise.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Item 1.4: origin plumbing in `app-state.ts`

C-only file. **RED —** extend `src/state/artifact-routing.test.ts` with two cases (append inside the existing `describe`, before its closing `});`):

```ts
  it("artifact_opened carries the origin through to the view", () => {
    const next = appReducer(initialState, {
      type: "artifact_opened",
      id: "art_1",
      origin: "campaign",
    });
    expect(next.view).toMatchObject({
      kind: "artifact",
      artifactId: "art_1",
      origin: "campaign",
    });
  });

  it("viewToAddress round-trips the artifact origin", () => {
    const addr = viewToAddress({
      kind: "artifact",
      artifactId: "art_1",
      origin: "campaign",
    });
    expect(addr).toEqual({
      kind: "artifact",
      artifactId: "art_1",
      origin: "campaign",
    });
  });
```

```bash
npx vitest run src/state/artifact-routing.test.ts   # expect: FAIL (origin not carried / type error)
```

**GREEN —** in `src/state/app-state.ts`:

1. Add a shared alias next to `SectionName` (after line 180):
   ```ts
   export type ArtifactOrigin = "campaign" | "artifacts";
   ```
2. `View` union — replace the `artifact` member (line 189):
   ```ts
     | { kind: "artifact"; artifactId: string; origin?: ArtifactOrigin }
   ```
3. `ViewAddress` union — replace the `artifact` member (line 202):
   ```ts
     | { kind: "artifact"; artifactId: string; origin?: ArtifactOrigin }
   ```
4. `Action` union — replace the `artifact_opened` member (line 355):
   ```ts
     | { type: "artifact_opened"; id: string; origin?: ArtifactOrigin }
   ```
5. Reducer `case "artifact_opened"` (lines 988–993) — carry origin:
   ```ts
       case "artifact_opened":
         return {
           ...state,
           view: { kind: "artifact", artifactId: action.id, origin: action.origin },
           activeSection: null,
         };
   ```
6. `rebuildViewFromAddress` `case "artifact"` (line 1316):
   ```ts
       case "artifact":
         return { kind: "artifact", artifactId: addr.artifactId, origin: addr.origin };
   ```
7. `viewToAddress` `case "artifact"` (line 1342):
   ```ts
       case "artifact":
         return { kind: "artifact", artifactId: view.artifactId, origin: view.origin };
   ```

(The existing `toEqual` round-trip test at line 11 stays green: `origin` is `undefined` there, and Vitest `toEqual` ignores `undefined` properties.)

```bash
npx vitest run src/state/artifact-routing.test.ts   # expect: 4 passed
npx tsc --noEmit                                     # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.4: thread artifact origin through app-state

Add ArtifactOrigin ("campaign" | "artifacts") to artifact_opened, the
artifact View, and ViewAddress so the artifact screen can derive a
context-aware Back target.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Item 1.4: origin-aware Back on the artifact screen

C-only file. **RED —** extend `src/sections/artifacts/artifact-screen.test.tsx` — append a new `describe` at the end:

```tsx
describe("ArtifactScreenView — back label", () => {
  it("defaults the back button to «К артефактам»", () => {
    renderScreen();
    expect(
      screen.getByRole("button", { name: "К артефактам" }),
    ).toBeInTheDocument();
  });

  it("renders a supplied backLabel («К кампании»)", () => {
    renderScreen({ backLabel: "К кампании" });
    expect(
      screen.getByRole("button", { name: "К кампании" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "К артефактам" }),
    ).not.toBeInTheDocument();
  });
});
```

```bash
npx vitest run src/sections/artifacts/artifact-screen.test.tsx   # expect: FAIL (backLabel prop unknown / hardcoded)
```

**GREEN —** in `src/sections/artifacts/artifact-screen.tsx`:

1. Add `backLabel` to `ArtifactScreenViewProps` (after `onBack` at line 47):
   ```tsx
     onBack: () => void;
     backLabel?: string;
   ```
2. Destructure it with a default in `ArtifactScreenView` (in the params list, after `onBack`):
   ```tsx
     onBack,
     backLabel = "К артефактам",
   ```
3. In the `EntityCardShell` props, replace the hardcoded `backLabel="К артефактам"` (line 73) with:
   ```tsx
         backLabel={backLabel}
   ```
4. In the connected `ArtifactScreen`, derive the target from `view.origin`. Replace the `onBack` line (183) and add the derivation + `backLabel`. After `const campaign = ...` (line 159) add:
   ```tsx
     const backToCampaign = view.origin === "campaign";
   ```
   Then in the returned `<ArtifactScreenView …>` replace the single `onBack={…}` prop with:
   ```tsx
         backLabel={backToCampaign ? "К кампании" : "К артефактам"}
         onBack={() =>
           backToCampaign
             ? dispatch({ type: "campaign_opened", id: artifact.campaignId })
             : dispatch({ type: "sidebar_nav", section: "Артефакты" })
         }
   ```

`campaign_opened` routes to the campaign card (`view.kind === "campaign"`), which is the workflow entry — matching the spec's «возврат в воркфлоу».

```bash
npx vitest run src/sections/artifacts/artifact-screen.test.tsx   # expect: all passed (existing + 2 new)
npx tsc --noEmit                                                  # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.4: origin-aware Back on the artifact screen

origin "campaign" → «К кампании» + campaign_opened; otherwise
«К артефактам» + sidebar_nav Артефакты (default preserved).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Item 1.4: set origin at the two static entry points

C-only files, one-line wiring each (verified by `tsc` + existing tests staying green; the downstream Back behavior is already covered by Tasks 5–6).

**Edit 1 —** `src/sections/artifacts/signals-tab.tsx` line 80 (opening from the «Артефакты» section):
```tsx
      onOpen={(id) => dispatch({ type: "artifact_opened", id, origin: "artifacts" })}
```

**Edit 2 —** `src/sections/campaigns/campaign-screen.tsx` line 234 (opening from a campaign card — fixes the current bug where it landed on «Артефакты»):
```tsx
            onOpen={(id) => dispatch({ type: "artifact_opened", id, origin: "campaign" })}
```

```bash
npx vitest run src/sections/artifacts/signals-tab.test.tsx   # expect: still passing (presentational view unchanged)
npx tsc --noEmit                                             # expect: no errors
```

(The third entry point — SignalFiles' «Посмотреть все» — is wired in Task 11 when that component is authored.)

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.4: set artifact origin at the two static entry points

Артефакты tab → origin "artifacts"; campaign card → origin "campaign"
(fixes the campaign-card entry landing on the Артефакты section on Back).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — REBASE ON B

All remaining tasks touch A/B-shared files, so bring in A+B now. By this point A and B are merged into `integration` (order A → B → C). Fast-forward and rebase the seven C-only commits on top:

```bash
git fetch origin
git rebase origin/integration
```

Expected: the seven commits from Tasks 1–7 replay cleanly (all touch C-exclusive files — no conflicts). If B has not yet reached `integration`, rebase onto B's branch instead: `git rebase origin/feature/spec-b-node-card-ui` (substitute B's actual branch name), then re-target `integration` when B lands.

Verify you are level and green:

```bash
git rev-list --count HEAD..origin/integration   # expect: 0
npx tsc --noEmit                                 # expect: no errors (A's merge/statistics types now present)
```

**Post-rebase reality check** before editing shared files — confirm A's edits are in place so you know which regions to avoid:

```bash
grep -n "statistics" src/types/workflow.ts | head      # A added the statistics node type
grep -n "signal:" src/sections/campaigns/node-visuals.ts   # still SignalLow — C changes this next
```

No commit for Task 8 (rebase only).

> If any shared-file conflict *does* surface during the rebase: keep **both** sides. In `types/workflow.ts` keep A's `WorkflowNodeType`/`NODE_CATEGORY` `statistics` additions and your (not-yet-added) region; in `node-visuals.ts` keep A's `merge`/`statistics` icon keys and your `signal` key; in `workflow-view.tsx` keep A's `computeDynamicSublabel`/`fallbackParamsPatch` and your `initialGraph`; in `node-card-content.tsx` keep B's file and your additive `signal` block.

---

## Task 9 — Item 1.1: Radar icon for the signal node

Shared file `node-visuals.ts` (A-owned; different key than A's edits). **RED —** append to `src/sections/campaigns/node-visuals.test.ts`:

```ts
import { Radar } from "lucide-react";

describe("signal node icon (spec C)", () => {
  it("uses the Radar icon for the signal node type", async () => {
    const { NODE_ICON } = await import("./node-visuals");
    expect(NODE_ICON.signal).toBe(Radar);
  });
});
```

```bash
npx vitest run src/sections/campaigns/node-visuals.test.ts   # expect: FAIL (still SignalLow)
```

**GREEN —** in `src/sections/campaigns/node-visuals.ts`:

- In the lucide import block (lines 1–16), remove `SignalLow,` and add `Radar,` (keep alphabetic-ish ordering irrelevant; just ensure `Radar` is imported and `SignalLow` is gone — it has no other use).
- Change `NODE_ICON.signal` (line 56):
  ```ts
    signal: Radar,
  ```

```bash
npx vitest run src/sections/campaigns/node-visuals.test.ts   # expect: all passed
npx tsc --noEmit                                             # expect: no errors (SignalLow no longer referenced)
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.1: signal node icon SignalLow → Radar

NODE_ICON.signal drives every code path that renders the signal endpoint
(createTemplate → withSignalPath and rebuild-schema both emit nodeType
"signal"), so one change covers the full graph and the mini-preview.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — Item 1.2: `SignalParams.files` + populate in `applyCampaignContext`

Shared files `types/workflow.ts` and `workflow-templates.ts` (different regions than A). **RED —** add a test to `src/state/workflow-templates.test.ts` (append a new `describe`; `createTemplate` + `applyCampaignContext` are already imported there — if not, add `import { createTemplate, applyCampaignContext } from "./workflow-templates";`):

```ts
import type { SignalParams } from "@/types/workflow";

describe("applyCampaignContext — signal node files (spec C)", () => {
  it("populates the signal node's files list from the campaign bases", () => {
    const t = createTemplate("Регистрация", "own");
    const ctx = { files: [{ name: "base-a.csv", rowCount: 1000 }, { name: "base-b.csv", rowCount: 2000 }] };
    const out = applyCampaignContext(t, ctx);
    const signal = out.nodes.find((n) => n.data.params?.kind === "signal");
    const params = signal!.data.params as SignalParams;
    expect(params.files).toEqual(["base-a.csv", "base-b.csv"]);
  });

  it("leaves files empty when the campaign has no bases", () => {
    const t = createTemplate("Регистрация", "own");
    const out = applyCampaignContext(t, { files: [] });
    const signal = out.nodes.find((n) => n.data.params?.kind === "signal");
    const params = signal!.data.params as SignalParams;
    expect(params.files ?? []).toEqual([]);
  });
});
```

> **Verify the `applyCampaignContext` context shape first** — read `src/state/workflow-templates.ts` and confirm the parameter name/shape (`files: {name, rowCount}[]`, `totalRows`, `summary`, `hasScoring`) matches the GREEN edit below. Adjust the test's `ctx` literal to the real signature before running.

```bash
npx vitest run src/state/workflow-templates.test.ts   # expect: FAIL (files not set)
```

**GREEN —**

1. `src/types/workflow.ts`, `SignalParams` (lines 86–91) — add the optional field:
   ```ts
   export type SignalParams = {
     kind: "signal";
     fileName: string;
     /**
      * Spec C — signal file names surfaced in the node body by <SignalFiles/>.
      * Optional for back-compat (templates/rebuild-schema omit it); populated by
      * applyCampaignContext. Empty/undefined = draft placeholder.
      */
     files?: string[];
     count: number;
     segments: { max: number; high: number; mid: number; low: number };
   };
   ```
2. `src/state/workflow-templates.ts`, the signal branch of `applyCampaignContext` (lines 637–653) — add `files` to the params spread. Replace that `if` block with:
   ```ts
       // Signal result node: always carries the base `count` (N for the cost
       // model) AND (spec C) the signal file-name list read by <SignalFiles/>.
       // For `own` (no scoring) it also surfaces the file names on fileName/sublabel.
       if (nd.data.nodeType === "signal" && nd.data.params?.kind === "signal") {
         const showFiles = !hasScoring;
         const fileNames = files.map((f) => f.name);
         return {
           ...nd,
           data: {
             ...nd.data,
             ...(showFiles && summary ? { sublabel: summary } : {}),
             params: {
               ...nd.data.params,
               count: totalRows || nd.data.params.count,
               files: fileNames,
               ...(showFiles
                 ? { fileName: fileNames.join(", ") || nd.data.params.fileName }
                 : {}),
             },
           },
         };
       }
   ```

```bash
npx vitest run src/state/workflow-templates.test.ts   # expect: all passed
npx tsc --noEmit                                       # expect: no errors (existing SignalParams literals still valid — files is optional)
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.2: SignalParams.files + populate in applyCampaignContext

Optional files?: string[] on the signal node, filled from the campaign's
base file names (all sources). Back-compat: fileName untouched, existing
SignalParams literals unaffected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — Item 1.3: `SignalFiles` node-body component

New C-only file (depends on Task 10's type). **RED —** create `src/sections/campaigns/signal-files.test.tsx` (mirrors `scoring-row.test.tsx`'s context-mocking style):

> **Verify context hook names/shape first** — read `src/state/app-state-context.tsx` and confirm the hook exports (`useAppState`, `useAppDispatch`) and the `view` shape (`view.kind === "workflow"` carrying `campaign`). Adjust the mock below to the real names before running (this is the single riskiest assumption in the plan).

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { SignalParams } from "@/types/workflow";

const dispatch = vi.fn();
let mockState: {
  view: { kind: string; campaign?: { id: string; name: string } };
  artifacts: Array<{ id: string; campaignId: string; kind: string }>;
  campaigns: unknown[];
};

vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => mockState,
}));

import { SignalFiles } from "./signal-files";

describe("SignalFiles", () => {
  beforeEach(() => {
    dispatch.mockClear();
    mockState = {
      view: { kind: "workflow", campaign: { id: "c1", name: "C" } },
      artifacts: [{ id: "art_sig", campaignId: "c1", kind: "signals" }],
      campaigns: [],
    };
  });

  it("draft (empty files) → placeholder, no «Посмотреть все»", () => {
    const params: SignalParams = { kind: "signal", fileName: "", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } };
    const { getByText, queryByRole } = render(<SignalFiles params={params} />);
    expect(getByText("После запуска здесь появятся файлы сигналов")).not.toBeNull();
    expect(queryByRole("button", { name: "Посмотреть все" })).toBeNull();
  });

  it("launched (populated) → lists files + «Посмотреть все»", () => {
    const params: SignalParams = {
      kind: "signal", fileName: "s1.csv", count: 10,
      files: ["s1.csv", "s2.csv"],
      segments: { max: 0, high: 0, mid: 0, low: 0 },
    };
    const { getByText, getByRole } = render(<SignalFiles params={params} />);
    expect(getByText("s1.csv")).not.toBeNull();
    expect(getByText("s2.csv")).not.toBeNull();
    expect(getByRole("button", { name: "Посмотреть все" })).not.toBeNull();
  });

  it("«Посмотреть все» opens the campaign's signals artifact with origin campaign", () => {
    const params: SignalParams = {
      kind: "signal", fileName: "s1.csv", count: 10,
      files: ["s1.csv"],
      segments: { max: 0, high: 0, mid: 0, low: 0 },
    };
    const { getByRole } = render(<SignalFiles params={params} />);
    fireEvent.click(getByRole("button", { name: "Посмотреть все" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "artifact_opened",
      id: "art_sig",
      origin: "campaign",
    });
  });
});
```

```bash
npx vitest run src/sections/campaigns/signal-files.test.tsx   # expect: FAIL (module missing)
```

**GREEN —** create `src/sections/campaigns/signal-files.tsx`:

```tsx
"use client";

import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { NodeParams } from "@/types/workflow";

/**
 * Body of the «Сигнал» node card (spec C). Mounted as a special case in
 * NodeCardBody, bypassing the generic PARAM_RENDERERS (mirrors SplitFields /
 * WaitFields / ScoringRow). Reads app-state for the current campaign and its
 * signals-collection artifact.
 *
 * - Draft (empty params.files) → placeholder.
 * - Launched (populated)       → file list + «Посмотреть все», which opens the
 *   campaign's kind:"signals" artifact with origin:"campaign".
 */
export function SignalFiles({
  params,
}: {
  params: Extract<NodeParams, { kind: "signal" }>;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const files = params.files ?? [];
  const campaignId =
    state.view.kind === "workflow" ? state.view.campaign.id : undefined;
  const signalsArtifact = campaignId
    ? state.artifacts.find(
        (a) => a.campaignId === campaignId && a.kind === "signals",
      )
    : undefined;

  if (files.length === 0) {
    return (
      <div className="px-1 py-0.5 text-[11px] text-muted-foreground">
        После запуска здесь появятся файлы сигналов
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-1 py-0.5 text-[11px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        {files.map((name, i) => (
          <span
            key={`${name}__${i}`}
            className="truncate text-foreground"
            title={name}
          >
            {name}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (signalsArtifact) {
            dispatch({
              type: "artifact_opened",
              id: signalsArtifact.id,
              origin: "campaign",
            });
          }
        }}
        className="nodrag -mx-1 mt-0.5 flex w-fit items-center gap-1 rounded px-1 py-0.5 text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:text-foreground focus-visible:outline-none"
      >
        Посмотреть все
      </button>
    </div>
  );
}
```

```bash
npx vitest run src/sections/campaigns/signal-files.test.tsx   # expect: 3 passed
npx tsc --noEmit                                              # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.3: SignalFiles node-body component

Draft → «После запуска здесь появятся файлы сигналов»; launched → file
list + «Посмотреть все» opening the campaign's signals artifact
(origin "campaign"). Third artifact entry point.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — Item 1.3: mount `SignalFiles` in the node card

Shared B-owned file `node-card-content.tsx` — additive `signal` region only. **RED —** add a test asserting the signal branch mounts the placeholder. Append a new `describe` to the node-card test if one exists; otherwise create `src/sections/campaigns/node-card-signal.test.tsx`:

> **Verify the component/prop names first** — read `node-card-content.tsx` and confirm the exported node-body component name (the plan assumes `NodeCardBody`) and the props it takes (`id`, `data`), plus the exact context hooks to mock. Adjust the mocks/imports to reality before running.

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { WorkflowNodeData } from "@/types/workflow";

// Minimal context/stubs so NodeCardBody renders in isolation.
vi.mock("@/state/app-state-context", () => ({
  useAppDispatch: () => vi.fn(),
  useAppState: () => ({
    templates: [],
    view: { kind: "workflow", campaign: { id: "c1", name: "C" } },
    artifacts: [],
  }),
}));
vi.mock("@/state/prompt-chips-context", () => ({
  usePromptChips: () => ({ pushChip: vi.fn(), removeChip: vi.fn() }),
}));
vi.mock("@/state/chat-context", () => ({
  useChat: () => ({
    openTemplateCreate: vi.fn(),
    openTemplatePreview: vi.fn(),
    openSidebar: vi.fn(),
    openScoringDrawer: vi.fn(),
  }),
}));
vi.mock("./workflow-readonly-context", () => ({
  useWorkflowReadOnly: () => true,
}));

import { NodeCardBody } from "./node-card-content";

describe("NodeCardBody — signal branch", () => {
  it("mounts SignalFiles (draft placeholder) for a signal node with no files", () => {
    const data: WorkflowNodeData = {
      label: "Сигнал",
      nodeType: "signal",
      params: { kind: "signal", fileName: "", count: 0, segments: { max: 0, high: 0, mid: 0, low: 0 } },
    };
    const { getByText, queryByText } = render(<NodeCardBody id="signal_result" data={data} />);
    expect(getByText("После запуска здесь появятся файлы сигналов")).not.toBeNull();
    // Generic «Файл: …» row must NOT render (signal bypasses PARAM_RENDERERS).
    expect(queryByText(/^Файл$/)).toBeNull();
  });
});
```

```bash
npx vitest run src/sections/campaigns/node-card-signal.test.tsx   # expect: FAIL (generic row / no SignalFiles)
```

**GREEN —** in `src/sections/campaigns/node-card-content.tsx`:

1. Add the import (after the `WaitFields` import, line 26):
   ```tsx
   import { SignalFiles } from "./signal-files";
   ```
2. Add the special-case mount after the `scoring` block (after line 414, before the generic-path block at line 416):
   ```tsx
         {/* Сигнал (спека C): тело узла — список файлов сигналов + «Посмотреть все»
             (черновик → заглушка). Спец-кейс минует generic PARAM_RENDERERS, как
             split/wait/scoring. */}
         {data.params?.kind === "signal" && <SignalFiles params={data.params} />}
   ```
3. Extend the generic-path exclusion (lines 416–419) to also exclude `signal`:
   ```tsx
         {data.params?.kind !== "split" &&
           data.params?.kind !== "wait" &&
           data.params?.kind !== "scoring" &&
           data.params?.kind !== "signal" &&
           rows.length > 0 && (
   ```

Leave the `signal: (p) => [{ label: "Файл", value: p.fileName }]` entry in `PARAM_RENDERERS` (line 87) untouched — it is required to satisfy the exhaustive mapped type; it is simply no longer reached from the card.

```bash
npx vitest run src/sections/campaigns/node-card-signal.test.tsx   # expect: passed
npx tsc --noEmit                                                  # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.3: mount SignalFiles in the signal node card

Additive signal special-case in NodeCardBody (mirrors split/wait/scoring),
excluded from the generic PARAM_RENDERERS path. PARAM_RENDERERS.signal kept
for the exhaustive mapped type.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 — Item 1.5: remove legacy `signals` node + collapse empty fallbacks

Shared `types/workflow.ts` + `workflow-view.tsx` (A/C, different regions) and C-only `workflow-mini-preview.tsx`, plus two tests that currently depend on `createBaseNodes`. **RED —** first migrate the two dependent tests off `createBaseNodes` (they must keep passing after removal), then run them to confirm they still pass on the current code before the source change.

`src/state/workflow-validation.test.ts` — replace the import (line 3) and `baseGraph()` helper (lines 6–8):
```ts
import { createTemplate } from "@/state/workflow-templates";
```
```ts
function baseGraph() {
  // Own-source registration template: a real graph with a signal node bound
  // and a reachable isSuccess node — replaces the removed createBaseNodes().
  return createTemplate("Регистрация", "own");
}
```

`src/sections/campaigns/workflow-mini-preview.test.tsx` — replace the import (line 5) and the `liveNode` literal (line 9):
```tsx
import type { WorkflowNode } from "@/types/workflow";
```
```tsx
// Живой граф из кэша: одна узнаваемая нода с id "live-1".
const liveNode: WorkflowNode = {
  id: "live-1",
  type: "workflowNode",
  position: { x: 0, y: 0 },
  data: { label: "Сигнал", nodeType: "signal" },
};
```

```bash
npx vitest run src/state/workflow-validation.test.ts src/sections/campaigns/workflow-mini-preview.test.tsx
# expect: all passed (tests now source-independent of createBaseNodes)
```

**GREEN —** remove the legacy node and collapse the two fallbacks:

1. `src/types/workflow.ts` — delete `createBaseNodes` (lines 259–271) and `createBaseEdges` (lines 273–287) entirely, including the `// ── Base graph …` section comment (line 257). Keep `makeNode`, `makeEdge`, `shiftRight`, and `parseWorkflowCommand` (still used by the AI command parser).
2. `src/sections/campaigns/workflow-view.tsx`:
   - Remove `createBaseNodes,` and `createBaseEdges,` from the `@/types/workflow` import (lines 8–9).
   - Collapse the fallback in `initialGraph` (lines 74–76):
     ```tsx
       const template = signalType
         ? createTemplate(signalType, sourceType, channels)
         : { nodes: [], edges: [] };
     ```
3. `src/sections/campaigns/workflow-mini-preview.tsx`:
   - Remove the `import { createBaseNodes, createBaseEdges } from "@/types/workflow";` line (line 6).
   - Collapse the fallback (line 56):
     ```tsx
         return { nodes: [], edges: [] };
     ```

```bash
npx vitest run src/state/workflow-validation.test.ts src/sections/campaigns/workflow-mini-preview.test.tsx
# expect: all passed
grep -rn "createBaseNodes\|createBaseEdges" src   # expect: no matches
npx tsc --noEmit                                   # expect: no errors
```

Commit:
```bash
git add -A && git commit -m "$(cat <<'EOF'
Item 1.5: remove legacy `signals` base graph

Delete createBaseNodes/createBaseEdges and the "signals" default node;
collapse the empty-signalType fallbacks in workflow-view and
workflow-mini-preview to an empty graph. Migrate the two dependent tests to
createTemplate / a literal node. Every wizard campaign carries a signalType,
so the empty branch is unreachable in product flows.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14 — Full verification gate

```bash
npx tsc --noEmit          # expect: no errors
npm run lint              # expect: no errors/warnings on touched files
npx vitest run            # expect: entire suite green
```

If anything fails, fix under TDD (add/adjust a failing test first) before proceeding. Do not claim completion without this output. No code changes here unless a regression surfaced; if so, commit the fix with the Co-Authored-By trailer.

---

## Acceptance criteria (mapped to tasks)

Item 1 — signal node feature:
- [ ] Signal entry node renders the **Radar** icon on every code path and in the mini-preview — Task 9 (`NODE_ICON.signal` is the sole source; `createTemplate`/`rebuild-schema` both emit `nodeType:"signal"`).
- [ ] Draft node shows the placeholder «После запуска здесь появятся файлы сигналов»; no file list — Tasks 10, 11, 12.
- [ ] Launched node shows the file list + «Посмотреть все» opening this campaign's signals artifact — Tasks 10, 11, 12.
- [ ] Artifact-screen Back: «К кампании» + return-to-workflow when entered from node/campaign; «К артефактам» + return-to-section from Артефакты — Tasks 5, 6, 7, 11.
- [ ] `signals` node + `createBaseNodes`/`createBaseEdges` removed; build + tests pass — Tasks 13, 14.

Item 10 — daily budget:
- [ ] Stream campaign shows «Дневной бюджет» with the exact value «12 000 ₽» — Tasks 3, 4.
- [ ] One-time (non-stream / no `dailyBudget`) campaign hides the row — Task 4.

Item 11 — welcome:
- [ ] Subtitle + three plates replaced; «Статистика» removed from the cards — Tasks 1, 2.
- [ ] `onboarding-step-cards.test.tsx` / `welcome-view.test.tsx` updated and passing — Tasks 1, 2.

---

## Self-review note

- **Spec coverage:** Item 1 (icon Task 9, model+population Task 10, `SignalFiles` Task 11, node-card mount Task 12, legacy removal Task 13, origin plumbing Task 5, Back derivation Task 6, entry-point origins Tasks 7 & 11). Item 10 (Tasks 3–4). Item 11 (Tasks 1–2). All three items covered.
- **No placeholders:** every test and edit block is real code copied against the files on `integration`; line anchors verified. `SignalParams.files` is intentionally **optional** (documented above) to avoid touching A-owned literals in `rebuild-schema.ts` / three A test files — behavior is identical since only `applyCampaignContext` writes and only `SignalFiles` reads it.
- **Name consistency:** `SignalFiles` (component + file `signal-files.tsx`), `SignalParams.files` (optional `string[]`), `ArtifactOrigin`/`origin` (`"campaign" | "artifacts"`), `formatRubPlain` (single definition in `src/lib/format-rub.ts`, imported by both the payment screen and the card). The card's compact `formatRub` is left in place for the расчётный/факт rows and is **not** used for the daily-budget value.
- **Rebase discipline:** Tasks 1–7 touch only C-exclusive files (pre-rebase); the four shared files (`node-visuals.ts`, `types/workflow.ts`, `workflow-templates.ts`, `workflow-view.tsx`, `node-card-content.tsx`) are edited only after Task 8, in regions disjoint from A/B, with conflict-resolution guidance inline.
- **Risk flags (verify against real code before RED in the noted tasks):** (1) `app-state-context` hook names + `view.kind==="workflow"`/`campaign` shape — Tasks 11 & 12; (2) `applyCampaignContext` context signature — Task 10; (3) exported node-body component name in `node-card-content.tsx` — Task 12. Each is called out inline with a "verify first" note.
- **Test-runner nuance:** ru-RU money uses a no-break space, so the card test matches `/^12\s000\s₽$/` (JS `\s` covers U+00A0/U+202F) rather than a literal-space string. The `viewToAddress` origin round-trip relies on Vitest `toEqual` ignoring `undefined`, so the pre-existing round-trip test stays green.
