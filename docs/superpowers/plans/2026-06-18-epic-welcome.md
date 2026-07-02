# Campaign-First Migration — Epic Welcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-copy the Welcome screen for the campaign-first model — hero paragraph, the three concept cards (middle card `Кампании` → `Коммуникация`), and the post-survey CTA block — repoint the CTA to dispatch `start_campaign_flow`, and remove the «Пропустить» ghost button from the intro overlay. No behavior beyond copy + which action the existing CTA fires.

**Architecture:** Copy-only, single-section change. We reuse the existing hero layout, the existing `OnboardingStepCards` grid, the existing CTA card (border-`brand`/`brand-muted` plate with a `Button`), and the existing `IntroOverlay` step machinery untouched. The only structural edit is exporting the inner `FirstTimeHero` component so its copy + dispatch can be asserted in isolation without seeding the global reducer. Each task ends green (tsc + vitest).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state in `src/state/app-state.ts`, Vitest + jsdom + `@testing-library/react` (`npx vitest run`). Render tests follow the existing pattern in `src/sections/signals/scenario-card.test.tsx` (`render` / `screen` / `fireEvent` from `@testing-library/react`; setup at `vitest.setup.ts` already wires `cleanup` + jest-dom matchers).

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` (block 7 row of §6 registry: "OK"; §7 governing principle 2/3 reuse-and-escalate). Exact copy strings are frozen in the codex source spec §7 (`~/Downloads/ux-migration-campaign-first-spec.md`, lines 266-292) and reproduced verbatim in the tasks below.

**⚠️ Two environment facts that bite (verified):**
1. The repo dir name has non-ASCII chars with NFC/NFD ambiguity. The `Read`/`Write` tools may resolve to a stray sibling dir. Work through the shell (its cwd is the real git repo) or the ASCII symlink `/tmp/afina-repo` for all reads/writes.
2. `Signal`/`Campaign`/`AppState`/`Action`/`start_signal_flow`/`start_campaign_flow` all live in `src/state/app-state.ts`. **`start_campaign_flow` is a Foundation deliverable** — it does NOT exist on `main`. This epic branches off the post-Foundation integration branch where the action already exists. See "Foundation dependency" notes below.

---

## Ownership boundary

**This epic owns and edits ONLY:** `src/sections/welcome/**`
- `src/sections/welcome/welcome-view.tsx` — hero paragraph, CTA-block copy, CTA dispatch target, export `FirstTimeHero`.
- `src/sections/welcome/onboarding-step-cards.tsx` — middle card `Кампании` → `Коммуникация` + copy.
- `src/sections/welcome/intro-overlay.tsx` — remove the «Пропустить» ghost `Button`.
- `src/sections/welcome/welcome-view.test.tsx` (create), `src/sections/welcome/onboarding-step-cards.test.tsx` (create), `src/sections/welcome/intro-overlay.test.tsx` (create).

**This epic MUST NOT edit (hub / other-epic territory):**
- `src/types/*`, `src/state/app-state.ts`, `src/app/page.tsx` — hub files frozen by Foundation. If Welcome needs an action that does not exist, STOP and raise a **Foundation dependency**, do not edit `app-state.ts`.
- Any other `src/sections/**` directory.

**Reuse vs new (decided, per design §7 governing principle 2 — reuse existing patterns):** all changes reuse existing UI — the hero `<p>`, the `OnboardingStepCards` plate grid, the post-survey CTA `Button` inside the `border-brand/30 bg-brand-muted` plate, and the `IntroOverlay` step UI. **No new pattern is introduced**, so no §7 UI-decision escalation applies to this epic. If during implementation a new visual element seems necessary (it should not), STOP and ASK THE USER rather than inventing one.

**Foundation dependencies (must be satisfied by the branch point — verify in Task 0):**
- `start_campaign_flow` action exists in the `Action` union of `src/state/app-state.ts` and its reducer routes a survey-completed user into the wizard (same body as `start_signal_flow`). The CTA repoint in Task 1 depends on this. If `git grep -n "start_campaign_flow" src/state/app-state.ts` returns nothing, STOP — the branch is not post-Foundation.

---

## File Structure

**Edited (this epic):**
- `src/sections/welcome/welcome-view.tsx`
- `src/sections/welcome/onboarding-step-cards.tsx`
- `src/sections/welcome/intro-overlay.tsx`

**Created (tests):**
- `src/sections/welcome/welcome-view.test.tsx`
- `src/sections/welcome/onboarding-step-cards.test.tsx`
- `src/sections/welcome/intro-overlay.test.tsx`

**Frozen copy contract (verbatim from codex spec §7 — do not paraphrase):**

| Slot | String |
|---|---|
| Hero h1 | `Добро пожаловать в афину` (unchanged) |
| Hero paragraph | `В афине вы создаёте кампанию по готовому сценарию: афина находит, кому нужна коммуникация прямо сейчас, запускает сообщения в нужный момент и показывает результат в статистике.` |
| Card 1 heading / desc | `Сигналы` / `Определяем, кому из клиентов нужна коммуникация прямо сейчас — по поведению и данным.` (unchanged) |
| Card 2 heading / desc | `Коммуникация` / `Запускаем нужное сообщение в нужный момент — по выбранным каналам.` (**changed from `Кампании`**) |
| Card 3 heading / desc | `Статистика` / `Показываем результат в цифрах — кто отреагировал, сколько принесла кампания.` (unchanged) |
| CTA before survey — heading | `Расскажите о вашей задаче — подберём сценарии` (unchanged) |
| CTA before survey — sub | `За минуту афина предложит подходящие варианты.` (unchanged) |
| CTA before survey — button | `Подобрать сценарии` (unchanged) → dispatches `open_survey` (unchanged) |
| CTA after survey — heading | `Подобрали {N} сценариев под ваш бизнес` (existing `SCENARIOS_PICKED_TITLE` already produces this via `pluralRu`; keep) |
| CTA after survey — sub | `Создайте кампанию по одному из них или выберите свой сценарий из каталога.` (**changed**) |
| CTA after survey — button | `Создать кампанию` (**changed from `Найти сигналы`**) → dispatches `start_campaign_flow` (**changed from `start_signal_flow`**) |

> Verified deltas vs current code: hero paragraph, card 2 (heading + desc), post-survey sub-copy, post-survey button label, post-survey button action. Card 1, card 3, hero h1, and the entire before-survey CTA already match the target verbatim — assert them so the contract is pinned, but expect no edit there.

---

## Task 0: Isolated worktree + green baseline

**Files:** none (git only).

- [ ] **Step 1: Create the Welcome worktree off the post-Foundation integration branch** (AGENTS.md mandates worktrees for parallel work)

Run from the repo root. Replace `<integration-branch>` with the branch that already contains Foundation (e.g. `feature/campaign-first-foundation` once merged to the integration line, or the integration branch name the user gives). Do NOT branch off `main` — `start_campaign_flow` will not exist there.
```bash
git worktree add .worktrees/epic-welcome -b feature/epic-welcome <integration-branch>
cd .worktrees/epic-welcome
npm install
```

- [ ] **Step 2: Verify the Foundation dependency is present**

Run: `git grep -n "start_campaign_flow" src/state/app-state.ts`
Expected: at least one hit (the `Action` union member and/or reducer case). If ZERO hits, STOP and report: "Foundation dependency unmet — `start_campaign_flow` absent; branch point is not post-Foundation."

- [ ] **Step 3: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean checkout, STOP and report — this plan assumes a green baseline.

---

## Task 1: Welcome hero paragraph + post-survey CTA copy + repoint CTA to `start_campaign_flow`

We export the inner `FirstTimeHero` so its copy and the dispatched action can be asserted in isolation (the public `WelcomeView` reads state via `useAppState`/`useAppDispatch` against a `useReducer`-backed provider that can't be seeded — `FirstTimeHero` already takes `surveyCompleted` + the two callbacks as props, which is the testable seam). Then we re-copy the post-survey branch and repoint the post-survey CTA to `start_campaign_flow`.

**Files:**
- Modify: `src/sections/welcome/welcome-view.tsx`
- Create: `src/sections/welcome/welcome-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/sections/welcome/welcome-view.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FirstTimeHero } from "./welcome-view";

const HERO_PARAGRAPH =
  "В афине вы создаёте кампанию по готовому сценарию: афина находит, кому нужна коммуникация прямо сейчас, запускает сообщения в нужный момент и показывает результат в статистике.";

describe("FirstTimeHero — copy", () => {
  it("renders the campaign-first hero paragraph", () => {
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(screen.getByText(HERO_PARAGRAPH)).toBeInTheDocument();
  });

  it("before survey: shows the survey CTA wording", () => {
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(
      screen.getByText("Расскажите о вашей задаче — подберём сценарии"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подобрать сценарии" }),
    ).toBeInTheDocument();
  });

  it("after survey: shows the create-campaign CTA wording", () => {
    render(
      <FirstTimeHero
        surveyCompleted
        onOpenSurvey={() => {}}
        onCreateScenario={() => {}}
      />,
    );
    expect(
      screen.getByText(
        "Создайте кампанию по одному из них или выберите свой сценарий из каталога.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Создать кампанию" }),
    ).toBeInTheDocument();
  });
});

describe("FirstTimeHero — wiring", () => {
  it("post-survey button calls onCreateScenario", () => {
    const onCreateScenario = vi.fn();
    render(
      <FirstTimeHero
        surveyCompleted
        onOpenSurvey={() => {}}
        onCreateScenario={onCreateScenario}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Создать кампанию" }));
    expect(onCreateScenario).toHaveBeenCalledTimes(1);
  });

  it("pre-survey button calls onOpenSurvey", () => {
    const onOpenSurvey = vi.fn();
    render(
      <FirstTimeHero
        surveyCompleted={false}
        onOpenSurvey={onOpenSurvey}
        onCreateScenario={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Подобрать сценарии" }));
    expect(onOpenSurvey).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/welcome/welcome-view.test.tsx`
Expected: FAIL — `FirstTimeHero` is not exported (import error), and the post-survey strings (`Создать кампанию`, the new sub-copy) and the new hero paragraph don't match yet.

- [ ] **Step 3: Export `FirstTimeHero`**

In `src/sections/welcome/welcome-view.tsx`, change the declaration:
```tsx
function FirstTimeHero({
```
to:
```tsx
export function FirstTimeHero({
```

- [ ] **Step 4: Repoint the `WelcomeView` CTA to `start_campaign_flow`**

In `WelcomeView`, change the `onCreateScenario` prop:
```tsx
          onCreateScenario={() => dispatch({ type: "start_signal_flow" })}
```
to:
```tsx
          onCreateScenario={() => dispatch({ type: "start_campaign_flow" })}
```
> This relies on the Foundation `start_campaign_flow` action (verified in Task 0 Step 2). If tsc reports `start_campaign_flow` is not in `Action`, STOP — Foundation dependency unmet; do not add the action here.

- [ ] **Step 5: Re-copy the hero paragraph**

In `FirstTimeHero`, replace the hero `<p>` body:
```tsx
        <p className="text-[18px] leading-[26px] text-muted-foreground">
          В афине собраны готовые сценарии для работы с вашими клиентами:
          удержание, допродажи, реактивация и другие. Выберите сигнал по
          нужному сценарию, запустите кампанию, отслеживайте результат в
          статистике.
        </p>
```
with:
```tsx
        <p className="text-[18px] leading-[26px] text-muted-foreground">
          В афине вы создаёте кампанию по готовому сценарию: афина находит,
          кому нужна коммуникация прямо сейчас, запускает сообщения в нужный
          момент и показывает результат в статистике.
        </p>
```
> Keep classNames identical. The test asserts the string with normal spaces; JSX collapses the inter-line whitespace to single spaces, so the rendered text matches `HERO_PARAGRAPH`.

- [ ] **Step 6: Re-copy the post-survey CTA sub-line + button label**

In the CTA plate, change the post-survey sub-paragraph:
```tsx
              {surveyCompleted
                ? "Запустите поиск сигналов по этим сценариям или выберите свой сценарий из каталога"
                : "За минуту афина предложит подходящие варианты."}
```
to:
```tsx
              {surveyCompleted
                ? "Создайте кампанию по одному из них или выберите свой сценарий из каталога."
                : "За минуту афина предложит подходящие варианты."}
```
And change the post-survey button label:
```tsx
            <Button onClick={onCreateScenario} className="shrink-0">
              Найти сигналы
            </Button>
```
to:
```tsx
            <Button onClick={onCreateScenario} className="shrink-0">
              Создать кампанию
            </Button>
```
> Leave `SCENARIOS_PICKED_TITLE` (the post-survey heading) and the entire pre-survey branch untouched — they already match the frozen contract.

- [ ] **Step 7: Run the test**

Run: `npx vitest run src/sections/welcome/welcome-view.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sections/welcome/welcome-view.tsx src/sections/welcome/welcome-view.test.tsx
git commit -m "feat(welcome): campaign-first hero + CTA copy, CTA → start_campaign_flow"
```

---

## Task 2: Middle concept card `Кампании` → `Коммуникация`

**Files:**
- Modify: `src/sections/welcome/onboarding-step-cards.tsx`
- Create: `src/sections/welcome/onboarding-step-cards.test.tsx`

> Note (accepted, do NOT "fix"): these three concept cards (Сигналы / Коммуникация / Статистика) intentionally no longer mirror the sidebar nav (Кампании / Артефакты / Статистика). They are concepts, not navigation. Block 7 only re-copies them.

- [ ] **Step 1: Write the failing test**

Create `src/sections/welcome/onboarding-step-cards.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingStepCards } from "./onboarding-step-cards";

describe("OnboardingStepCards — block-7 copy", () => {
  it("renders the three concept headings with the middle card as Коммуникация", () => {
    render(<OnboardingStepCards />);
    expect(screen.getByText("Сигналы")).toBeInTheDocument();
    expect(screen.getByText("Коммуникация")).toBeInTheDocument();
    expect(screen.getByText("Статистика")).toBeInTheDocument();
    expect(screen.queryByText("Кампании")).not.toBeInTheDocument();
  });

  it("renders the Коммуникация description", () => {
    render(<OnboardingStepCards />);
    expect(
      screen.getByText(
        "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx`
Expected: FAIL — middle card still reads `Кампании` with its old description.

- [ ] **Step 3: Re-copy the middle plate**

In `src/sections/welcome/onboarding-step-cards.tsx`, replace the second `PLATES` entry:
```tsx
  {
    heading: "Кампании",
    description:
      "Запускаем кампанию на нужную аудиторию — правильное сообщение в правильный момент.",
  },
```
with:
```tsx
  {
    heading: "Коммуникация",
    description:
      "Запускаем нужное сообщение в нужный момент — по выбранным каналам.",
  },
```
> Leave plates 1 and 3 untouched — they already match the frozen contract. `key={plate.heading}` stays valid (headings remain unique).

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/welcome/onboarding-step-cards.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/welcome/onboarding-step-cards.tsx src/sections/welcome/onboarding-step-cards.test.tsx
git commit -m "feat(welcome): middle concept card Кампании → Коммуникация"
```

---

## Task 3: Remove the «Пропустить» ghost button from the intro overlay

**Files:**
- Modify: `src/sections/welcome/intro-overlay.tsx`
- Create: `src/sections/welcome/intro-overlay.test.tsx`

> The three steps' text is unchanged. Only the always-visible ghost «Пропустить» `Button` is removed. The per-step «Далее» / «Понятно, начать» buttons stay.

- [ ] **Step 1: Write the failing test**

Create `src/sections/welcome/intro-overlay.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntroOverlay } from "./intro-overlay";

describe("IntroOverlay — no skip button", () => {
  it("does not render a «Пропустить» button on the first step", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Пропустить" }),
    ).not.toBeInTheDocument();
  });

  it("still renders the first-step advance button «Далее»", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Далее" }),
    ).toBeInTheDocument();
  });

  it("keeps the first step title unchanged", () => {
    render(<IntroOverlay onDismiss={() => {}} />);
    expect(screen.getByText("Знакомьтесь — ИИ афина")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/welcome/intro-overlay.test.tsx`
Expected: FAIL — the «Пропустить» button is still rendered.

- [ ] **Step 3: Remove the ghost button (and its comment block)**

In `src/sections/welcome/intro-overlay.tsx`, delete the entire skip-button block inside the inner card `<motion.div>` (the comment + the `<Button variant="ghost" …>Пропустить</Button>`):
```tsx
        {/* «Пропустить» — тихий выход, доступен на любом состоянии. В углу
            карточки, чтобы не конкурировать с основным CTA. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="absolute right-3 top-3 h-7 px-2 text-xs text-muted-foreground"
        >
          Пропустить
        </Button>

```

- [ ] **Step 4: Confirm `Button` is still used (it is — «Далее» / «Понятно, начать»), so the import stays**

Run: `git grep -n "Button" src/sections/welcome/intro-overlay.tsx`
Expected: hits for the import line and the two remaining `<Button>` usages. Do NOT remove the `import { Button }` line. Also confirm no now-unused imports were left by the deletion (`onDismiss` is still used by the final CTA; `Button` still used). If tsc later flags an unused import, remove only that import.

- [ ] **Step 5: Update the file doc-comment so it no longer describes «Пропустить»**

At the top of the file, the JSDoc says skip is available on the first two steps. Edit the relevant sentence so it reflects reality (steps advance via «Далее»; final step is the CTA; no skip):
```
 * Три состояния листаются «Далее»; на последнем — финальный CTA. Любой из
 * этих выходов вызывает onDismiss, после чего оверлей помечается показанным и
 * больше не появляется.
```
> Doc-comment only — keeps the file honest for the next reader. No behavior impact.

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/sections/welcome/intro-overlay.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sections/welcome/intro-overlay.tsx src/sections/welcome/intro-overlay.test.tsx
git commit -m "feat(welcome): remove «Пропустить» from intro overlay"
```

---

## Task 4: Epic gate — full green + smoke

**Files:** none (verification only).

- [ ] **Step 1: Types clean**

Run: `npx tsc --noEmit`
Expected: clean. (If `start_campaign_flow` is flagged as not in `Action`, the branch point is not post-Foundation — STOP and report a Foundation dependency.)

- [ ] **Step 2: Full suite green**

Run: `npx vitest run`
Expected: all PASS, including the three new welcome tests.

- [ ] **Step 3: Manual smoke (dev server on a non-default port to respect AGENTS.md)**

Run: `npx next dev -p 3001`
Verify on the welcome screen:
- Hero paragraph reads the new campaign-first text.
- Concept cards read Сигналы · Коммуникация · Статистика.
- Before survey: CTA «Подобрать сценарии» opens the survey.
- After survey (complete the survey or seed `surveyStatus: "completed"`): CTA reads «Создать кампанию» and opens the wizard (`guided-signal` view) via `start_campaign_flow`.
- Intro overlay (first run / reset intro state): no «Пропустить»; «Далее» advances; last step shows «Понятно, начать».

- [ ] **Step 4: Handoff note**

Welcome epic is complete on `feature/epic-welcome` at `.worktrees/epic-welcome`, branched off the post-Foundation integration branch. Scope was confined to `src/sections/welcome/**`; no hub file (`src/types/*`, `src/state/app-state.ts`, `src/app/page.tsx`) was touched. The CTA now dispatches the Foundation-provided `start_campaign_flow`. Per AGENTS.md, merge is the user's call. Cleanup (`git worktree remove .worktrees/epic-welcome`, branch delete) is the user's call.

---

## Self-Review (completed)

- **Spec coverage:** §7.1 hero paragraph → Task 1; §7.1 post-survey CTA copy + button label → Task 1; CTA → `start_campaign_flow` → Task 1; §7.1 middle card `Кампании`→`Коммуникация` → Task 2; §7.2 remove «Пропустить» → Task 3. Card 1/3, hero h1, before-survey CTA, post-survey heading `SCENARIOS_PICKED_TITLE` already match the frozen contract — pinned by assertions, no edit expected.
- **Ownership respected:** edits confined to `src/sections/welcome/**`. No `src/types/*`, `src/state/app-state.ts`, or `src/app/page.tsx` edits. `start_campaign_flow` consumed, never defined here.
- **Foundation dependency flagged:** `start_campaign_flow` action must pre-exist (verified Task 0 Step 2; re-checked Task 1 Step 4 and Task 4 Step 1). If absent, every task STOPs rather than editing the hub.
- **ASK-USER escalations:** none. All changes reuse existing patterns (hero `<p>`, plate grid, brand CTA plate, intro step UI); design §7 reuse principle applies, and the spec §6 block-7 row is "OK" with no §7 UI-decision item. Escalation only if implementation reveals a forced new pattern (it should not).
- **Testability seam:** `FirstTimeHero` exported so prop-driven copy + dispatch callbacks are asserted without seeding the un-seedable `useReducer` provider. Render-test pattern mirrors `scenario-card.test.tsx`; jsdom + jest-dom already configured in `vitest.setup.ts`.
- **Placeholders:** none — real files, real strings (verbatim from codex spec §7), real symbols.
- **Green checkpoints:** every task ends with a passing test run; Task 4 is the full-suite + tsc + smoke gate.
