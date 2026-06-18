# Campaign-First Migration — Epic: Анкета (Survey) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the onboarding survey's first screen from a "give us your website URL" field into a free-text "describe your task" field, per design block 6 — without breaking the cosmetic analysis screen, the scenario catalog (which never depended on URL/`directionId`), or the frozen `app-state` reducer that copies the survey's site string into account settings.

**Architecture:** Additive-and-relax. The survey input changes from `Input type=url` to `Textarea`; URL validation (`isWebsiteValid` rejects free text, `normalizeWebsite` would prepend `https://` to a sentence) is replaced by non-empty-description validation. The `Survey` type gains a semantic `taskDescription` field; the legacy `companyWebsite` field is **kept** (the frozen `app-state` reducer reads it — see Foundation dependency) and the form writes the free text into both so the reducer keeps copying a harmless string into `accountSettings`. `hostnameFor` already degrades gracefully (try/catch → `undefined`), so the analysis sub-line falls back to generic copy. Each task ends green (tsc + vitest).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state in `src/state/app-state.ts`, Vitest (`npx vitest run`), shadcn/ui `Textarea` (`@/components/ui/textarea`).

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` — block 6 (§6 row "6": *survey URL→описание*; "Безопасно: подбор сценариев не зависит ни от URL, ни от `directionId` (статичный `isCurated`); анализ косметический. Правим валидацию (`isWebsiteValid`→непустой), пропускаем `normalizeWebsite`, копирайт (A7)"). Also read §0 governing principles (UI reuse; UI-forks escalate) and §7 (UI-fork registry).

**⚠️ Environment fact (verified):** The repo dir name has non-ASCII chars that break the Read/Write tools. Use the ASCII symlink `/tmp/afina-repo` for ALL reads/writes, or work through the shell (its cwd is the real git repo).

---

## Ownership boundary

This epic **owns exclusively**:
- `src/sections/survey/**` (edits: `survey-form.tsx`; touches `survey-section.tsx`, `survey-awaiting.tsx` for copy/wiring only)
- `src/types/survey.ts`
- `src/state/survey-validation.ts` + `src/state/survey-validation.test.ts`

This epic **MUST NOT edit** the frozen hub set: `src/types/campaign.ts`, `src/types/workflow.ts`, `src/state/app-state.ts`, `src/app/page.tsx`. It also does not touch `src/types/account-settings.ts` (account-settings has its own independent `companyWebsite` — unrelated to the survey field) or `src/sections/settings/**`.

> `src/types/survey.ts` and `src/state/survey-validation.ts` are **survey-local**, NOT in the frozen hub — this epic owns them.

---

## 🚩 Foundation dependency — flagged, do NOT resolve in this epic

The clean rename `Survey.companyWebsite` → `Survey.taskDescription` (dropping the old field) is **blocked** because the frozen hub `src/state/app-state.ts` reads the old field name in two places this epic may not edit:

1. **`case "survey_completed":`** (`src/state/app-state.ts:823-824`) reads `action.survey.companyWebsite` and copies it into `accountSettings.companyWebsite`.
2. **`case "dev_preset_applied"` / preset block** (`src/state/app-state.ts:619, 630`) reads `DEMO_SURVEY.companyWebsite`.

Additionally, the frozen hub's own test file `src/state/app-state.test.ts` (lines ~714, 724-825, 1205) asserts on `survey.companyWebsite` — that test belongs to the hub, not this epic.

**Decision for this epic (no-break, reversible):** KEEP `Survey.companyWebsite` as a required field and ADD `taskDescription`. The form writes the free-text value into BOTH `taskDescription` (semantic) and `companyWebsite` (so the frozen reducer keeps copying a harmless string — now a free-text description instead of a URL — into `accountSettings.companyWebsite`; this is cosmetic for the prototype and the settings field is a plain string with no URL constraint).

**Hand-off note for Foundation owner:** to fully drop `companyWebsite` from `Survey`, the Foundation/hub owner must, in `app-state.ts`, rename the reader at `survey_completed` (823-824) and `DEMO_SURVEY` usage (619/630) to `taskDescription`, and update `app-state.test.ts` assertions. Until then, `companyWebsite` stays as an alias populated alongside `taskDescription`. **This epic does not do that rename.**

---

## UI decision (resolved, not escalated)

- **`Input type=url` → `Textarea`** is pure reuse of an existing shadcn/ui component (`Textarea` exists at `src/components/ui/textarea.tsx`, exported `{ Textarea }`). No new visual pattern is introduced — same `Field` wrapper, same label/error slots, same form layout. Per design §0.2 (reuse existing components/patterns) and §7 (asymmetry / left edge preserved), this is **not** a UI-fork and does **not** require user escalation. The only judgement call (number of textarea rows / min-height) uses the component's default `min-h-16` — no new tokens.

> If, while implementing, you discover the design intends a fundamentally different input affordance (e.g. a chat-style prompt bar with the mascot, not a plain textarea), STOP and escalate per §0.3 — but the spec block 6 text ("survey URL→описание", relax validation, fix copy) describes an in-place field swap, so no escalation is expected.

---

## Task 0: Isolated worktree + green baseline

**Files:** none (git only).

- [ ] **Step 1: Create the epic worktree off the post-Foundation integration branch**

This epic depends on the Foundation wave being merged (it relies on a stable, compiling tree). Branch off the integration branch the user nominates (the merged Foundation result — e.g. `main` after Foundation merge, or the Foundation branch `feature/campaign-first-foundation` if the user says to stack on it). Confirm the base with the user if unsure; default to `main`.

Run from the repo root:
```bash
git worktree add .worktrees/epic-survey -b feature/epic-survey <integration-branch>
cd .worktrees/epic-survey
npm install
```
(`.worktrees/` is gitignored per AGENTS.md. Do not commit its contents.)

- [ ] **Step 2: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean checkout, STOP and report — this plan assumes a green baseline.

- [ ] **Step 3: Confirm the symlink for tooling**

Run: `ln -sfn "$(pwd)" /tmp/afina-repo` (so Read/Write tools resolve through ASCII).

---

## Task 1: Relax validation — accept free text, replace URL rule with non-empty-description rule

**Files:**
- Modify: `src/state/survey-validation.ts`
- Modify: `src/state/survey-validation.test.ts`

This is real TDD: the existing `isWebsiteValid` tests encode URL semantics we are reversing, so update them to the new contract first (red), then change the implementation (green).

- [ ] **Step 1: Rewrite the `isWebsiteValid` test block to the new free-text contract**

In `src/state/survey-validation.test.ts`, replace the entire `describe("isWebsiteValid", ...)` block (lines 21-43) with a description-validation contract. Add a new exported validator `isTaskDescriptionValid` (semantic name; we keep `isWebsiteValid` only if something else still imports it — see Step 4). New test:
```ts
describe("isTaskDescriptionValid", () => {
  it("accepts a non-empty description", () => {
    expect(isTaskDescriptionValid("Хотим привлечь людей, ищущих ипотеку")).toBe(true);
  });
  it("accepts a single meaningful word over the min length", () => {
    expect(isTaskDescriptionValid("ипотека")).toBe(true);
  });
  it("rejects empty / whitespace-only", () => {
    expect(isTaskDescriptionValid("")).toBe(false);
    expect(isTaskDescriptionValid("   ")).toBe(false);
  });
  it("rejects too-short input", () => {
    expect(isTaskDescriptionValid("ок")).toBe(false); // < min length
  });
});
```
Choose a small minimum (e.g. `>= 3` trimmed chars) so a one-word answer passes but stray taps don't. Add `isTaskDescriptionValid` to the import list at the top of the test file.

- [ ] **Step 2: Decide the fate of `normalizeWebsite` test block**

`normalizeWebsite` must NOT run on free text (it would prepend `https://` to a sentence). Two options — pick by Step 4's grep result:
- If `normalizeWebsite` has no remaining caller after Task 2, **remove** the `describe("normalizeWebsite", ...)` block (lines 45-61) and delete the function in Step 3.
- If something outside survey still imports it, keep it untouched (it stays dead-but-valid). The grep in Step 4 decides.

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run src/state/survey-validation.test.ts`
Expected: FAIL — `isTaskDescriptionValid` is not exported.

- [ ] **Step 4: Find every importer of the old validators (decides removal vs. keep)**

Run: `git grep -n "isWebsiteValid\|normalizeWebsite" -- src`
Expected today: the only non-test importer is `src/sections/survey/survey-form.tsx` (this epic rewrites it in Task 3). No other module imports them. Therefore both `isWebsiteValid` and `normalizeWebsite` may be **removed** after Task 3. If the grep shows an unexpected external importer, keep that symbol and only add the new one.

- [ ] **Step 5: Implement `isTaskDescriptionValid` in `src/state/survey-validation.ts`**

Add:
```ts
// The survey's first answer is now a free-text task description, not a URL.
// Accept any non-trivial trimmed string; reject empty / whitespace-only / too-short.
export function isTaskDescriptionValid(value: string): boolean {
  return value.trim().length >= 3;
}
```
Leave `isCompanyNameValid` untouched. Remove `isWebsiteValid` and `normalizeWebsite` **only if** Step 4 confirmed survey-form is their sole importer (it gets rewritten in Task 3 — so do the deletion there, in the same green window, to avoid a red gap; for now you may leave them in place and delete in Task 3 Step 4). Keep the file dependency-free (it is unit-tested in the node env).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/state/survey-validation.test.ts`
Expected: PASS for `isCompanyNameValid` + `isTaskDescriptionValid`. (`survey-form.tsx` still imports `isWebsiteValid`/`normalizeWebsite` — those still exist until Task 3, so tsc stays clean. If you deleted them now, tsc will be red on `survey-form.tsx` until Task 3 — acceptable only if you do Tasks 2-3 immediately; otherwise defer deletion to Task 3.)

- [ ] **Step 7: Commit**

```bash
git add src/state/survey-validation.ts src/state/survey-validation.test.ts
git commit -m "feat(survey): add isTaskDescriptionValid; replace URL validation contract"
```

---

## Task 2: Add `taskDescription` to the `Survey` type (keep `companyWebsite` alias)

**Files:**
- Modify: `src/types/survey.ts`
- Test: `src/types/survey.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/types/survey.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { EMPTY_SURVEY, DEMO_SURVEY, type Survey } from "./survey";

describe("Survey task-description field", () => {
  it("EMPTY_SURVEY has an empty taskDescription", () => {
    expect(EMPTY_SURVEY.taskDescription).toBe("");
  });
  it("DEMO_SURVEY has a non-empty taskDescription", () => {
    expect(DEMO_SURVEY.taskDescription.trim().length).toBeGreaterThan(0);
  });
  it("keeps companyWebsite for frozen app-state reducer compat", () => {
    // Foundation dependency: app-state.ts still reads survey.companyWebsite.
    const s: Survey = {
      companyName: "Acme",
      companyWebsite: "Хотим лиды на ипотеку",
      taskDescription: "Хотим лиды на ипотеку",
      directionId: null,
    };
    expect(s.companyWebsite).toBe(s.taskDescription);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/types/survey.test.ts`
Expected: FAIL — `taskDescription` not on `Survey` / not in the constants.

- [ ] **Step 3: Edit `src/types/survey.ts`**

Add `taskDescription` to the interface (keep `companyWebsite` — see Foundation dependency; mark it):
```ts
export interface Survey {
  companyName: string;
  /**
   * @deprecated kept as an alias of `taskDescription` while the frozen
   * `app-state.ts` reducer still reads it (survey_completed / DEMO_SURVEY).
   * Foundation owner renames the reader; then this field can be dropped.
   */
  companyWebsite: string;
  /** Free-text description of the marketing task (replaces the website URL). */
  taskDescription: string;
  directionId: DirectionId | null;
}
```
Update the constants so `companyWebsite` mirrors `taskDescription`:
```ts
export const EMPTY_SURVEY: Survey = {
  companyName: "",
  companyWebsite: "",
  taskDescription: "",
  directionId: null,
};

export const DEMO_SURVEY: Survey = {
  companyName: "Альфа-Банк",
  // Mirror: the frozen reducer copies companyWebsite into accountSettings.
  companyWebsite: "Привлечь клиентов на ипотеку и автокредиты",
  taskDescription: "Привлечь клиентов на ипотеку и автокредиты",
  directionId: "banking",
};
```
> Note: this changes `DEMO_SURVEY.companyWebsite` from `"alfabank.ru"` to a description. The frozen reducer copies it into `accountSettings.companyWebsite` for the demo preset (cosmetic). The hub's `app-state.test.ts` may assert on the old demo value — if it does, that assertion is the **Foundation owner's** to update (flagged above); verify in Step 5 and report, do not edit the hub test from this epic.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/types/survey.test.ts`
Expected: PASS.

- [ ] **Step 5: Check for hub-test fallout (report, do not fix)**

Run: `npx vitest run src/state/app-state.test.ts 2>&1 | tail -20`
If any assertion on the old `DEMO_SURVEY.companyWebsite` value (`"alfabank.ru"`) now fails, RECORD it as a Foundation hand-off item (the hub owns that test). If it is trivial and the user later approves editing the hub test, that is a separate change. For this epic: if the failure is ONLY the demo-website-string assertion, keep `DEMO_SURVEY.companyWebsite = "alfabank.ru"` (do NOT mirror the description into it) and instead set `companyWebsite` to a short site-like string while `taskDescription` holds the real description — this preserves the hub test green without editing the hub. Prefer this fallback if it keeps the suite green:
```ts
export const DEMO_SURVEY: Survey = {
  companyName: "Альфа-Банк",
  companyWebsite: "alfabank.ru",                                  // unchanged: keeps frozen hub test green
  taskDescription: "Привлечь клиентов на ипотеку и автокредиты",  // new semantic field
  directionId: "banking",
};
```
Choose the fallback shape that keeps `npx vitest run` fully green without touching `app-state.test.ts`. Re-run the survey-type test after adjusting.

- [ ] **Step 6: Commit**

```bash
git add src/types/survey.ts src/types/survey.test.ts
git commit -m "feat(survey): add taskDescription field; keep companyWebsite alias for hub compat"
```

---

## Task 3: Swap the survey input to a Textarea + new copy + new validation

**Files:**
- Modify: `src/sections/survey/survey-form.tsx`
- Modify: `src/state/survey-validation.ts` (delete now-dead `isWebsiteValid`/`normalizeWebsite` if Task 1 deferred it)
- Test: `src/sections/survey/survey-form.test.tsx` (create — jsdom)

> This screen has no existing test. Add a focused jsdom test for the behavioral contract (empty submit blocked → error shown; non-empty submit dispatches with the description). Keep it light; the prototype validates UX, not exhaustive form states.

- [ ] **Step 1: Write the failing test**

Create `src/sections/survey/survey-form.test.tsx`. Render `SurveyForm` inside the app-state provider (check the real provider/import via `git grep -n "AppStateProvider\|app-state-context" src` and mirror an existing jsdom test such as `src/sections/survey/onboarding-interests-screen.test.ts` for setup). Assert:
```ts
// Pseudostructure — adapt imports/providers to the repo's test conventions.
it("blocks submit on empty description and shows an error", () => {
  // render with empty survey; click Продолжить; onSubmit not called; error text visible.
});
it("submits the typed task description", () => {
  // type free text into the textarea; click Продолжить;
  // onSubmit called with a Survey whose taskDescription === typed text
  // and whose companyWebsite === typed text (alias).
});
```
If wiring a full provider render is heavy, at minimum assert the validation branch via `isTaskDescriptionValid` integration and that the submitted `Survey` carries `taskDescription`. Confirm the existing test runner env (`onboarding-interests-screen.test.ts` proves jsdom + RTL are available in `src/sections/survey`).

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/survey/survey-form.test.tsx`
Expected: FAIL — form still uses URL validation / `companyWebsite`-only submit.

- [ ] **Step 3: Rewrite `survey-form.tsx`**

Changes:
1. Import `Textarea` instead of `Input`: `import { Textarea } from "@/components/ui/textarea";` (remove the `Input` import).
2. Import `isTaskDescriptionValid` from `@/state/survey-validation` (remove `isWebsiteValid`, `normalizeWebsite`).
3. Default props copy (design block 6 — "survey URL→описание"). Replace:
   - `title` default → e.g. `"С чего начнём — опишите вашу задачу"`
   - `subtitle` default → e.g. `"Опишите, кого хотите привлечь или какую задачу решаете. Афина подберёт подходящие сценарии."`
   (Final wording is product copy; keep tone per PRODUCT.md "уверенный, точный, ненавязчивый". If the user has exact strings, use them.)
4. State seed: `const [description, setDescription] = useState(survey.taskDescription)` (fall back to `survey.companyWebsite` if `taskDescription` is empty, for any pre-existing draft: `useState(survey.taskDescription || survey.companyWebsite)`).
5. Validation: `const descriptionOk = isTaskDescriptionValid(description);`
6. On submit, build the survey writing free text into BOTH fields (alias for the frozen reducer — Foundation dependency):
```ts
const filled: Survey = {
  companyName: survey.companyName,
  companyWebsite: description.trim(), // alias: frozen app-state reducer reads this
  taskDescription: description.trim(),
  directionId: survey.directionId,
};
```
   Do NOT call `normalizeWebsite` (it would corrupt free text).
7. Field: change `label` to e.g. `"Ваша задача"`, error to e.g. `"Опишите задачу хотя бы парой слов"`, and render a `Textarea` instead of `Input` (drop `type="url"`, `inputMode="url"`, `autoComplete="url"`; keep `id`, `value`, `onChange`, `aria-invalid`; set a sensible `rows`/leave default `min-h-16`, `placeholder` like `"Например: привлечь людей, которые ищут ипотеку"`).
8. Keep the `motion.form`, `Field` helper, `Button` "Продолжить", and overall layout unchanged (UI reuse, §0.2 / §7 left-edge).

- [ ] **Step 4: Delete now-dead validators (single green window)**

Now that `survey-form.tsx` no longer imports them and Task 1 Step 4 confirmed no other importer, remove `isWebsiteValid` and `normalizeWebsite` from `src/state/survey-validation.ts` and their `describe` blocks from the test (if not already removed in Task 1). Re-run `git grep -n "isWebsiteValid\|normalizeWebsite" -- src` → expect zero hits.

- [ ] **Step 5: Run the form test + validation test**

Run: `npx vitest run src/sections/survey/survey-form.test.tsx src/state/survey-validation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sections/survey/survey-form.tsx src/sections/survey/survey-form.test.tsx src/state/survey-validation.ts src/state/survey-validation.test.ts
git commit -m "feat(survey): URL field -> task-description textarea; non-empty validation + copy"
```

---

## Task 4: Verify the analysis screen degrades gracefully + fix cosmetic copy

**Files:**
- Modify: `src/sections/survey/survey-section.tsx` (only if copy needs it)
- Modify: `src/sections/survey/survey-awaiting.tsx` (copy only, if needed)

The analysis screen (`survey-awaiting.tsx`) is a cosmetic timer (`TOTAL_DURATION`); scenario curation is the static `isCurated` flag (`src/data/scenarios.ts`) and does not read the survey text. So "анализ без изменений" holds — but two cosmetic bits reference a URL.

- [ ] **Step 1: Confirm `hostnameFor` degrades gracefully**

In `src/sections/survey/survey-section.tsx`, `hostnameFor(phase.survey.companyWebsite)` is passed as `websiteHostname` to `SurveyAwaiting`. Now `companyWebsite` holds free text → `new URL("...")` throws → the try/catch returns `undefined` (lines 189-195). `SurveyAwaiting` then falls back to the generic copy `"афина анализирует сайт и сопоставляет его с данными об аудитории."` (line 56-57). So it does NOT crash — verified by code path. No required change.

- [ ] **Step 2: Decide cosmetic copy for the analysis sub-line**

Because the input is no longer a website, two strings now read oddly:
- `survey-awaiting.tsx` default heading `"Изучаем ваш бизнес"` — still fine, keep.
- The hostname-aware branch (`Анализируем ${hostname}…`) will never fire (no hostname), and the fallback mentions "сайт". Update the fallback sub-line copy to be source-agnostic, e.g. `"Афина анализирует вашу задачу и сопоставляет с данными об аудитории."` Apply by either (a) editing the default in `survey-awaiting.tsx` line ~57, or (b) passing an explicit `subtitle` from `survey-section.tsx` for the `awaiting` phase. Prefer (a) (single source of truth) unless `survey-awaiting` is shared with the "matching" phase that already passes its own subtitle — it is (the matching phase passes explicit title/subtitle, lines 165-169), so editing the default only affects the `awaiting` phase. Safe.
   - You may also drop the now-unused `websiteHostname` prop wiring from the `awaiting` render (line 137) and from `SurveyAwaiting`'s props, since it can never resolve — OPTIONAL cleanup; keep if it reduces surface, leave if it risks scope creep. If removed, also remove `hostnameFor` (lines 189-195) since it becomes dead.

- [ ] **Step 3: Run the survey suite**

Run: `npx vitest run src/sections/survey`
Expected: PASS (existing `onboarding-interests-screen.test.ts` + new `survey-form.test.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/sections/survey/survey-awaiting.tsx src/sections/survey/survey-section.tsx
git commit -m "chore(survey): source-agnostic analysis copy; drop dead hostname wiring"
```

---

## Task 5: Epic gate — full green + smoke

**Files:** none (verification only).

- [ ] **Step 1: Types compile**

Run: `npx tsc --noEmit`
Expected: clean. Confirm no `companyWebsite` / `isWebsiteValid` / `normalizeWebsite` references leaked: `git grep -n "isWebsiteValid\|normalizeWebsite" -- src` → zero; `git grep -n "survey.companyWebsite\|\.companyWebsite" -- src/sections/survey` → zero (survey UI now uses `taskDescription`).

- [ ] **Step 2: Full suite green**

Run: `npx vitest run`
Expected: all PASS. If `src/state/app-state.test.ts` fails ONLY on a demo-website-string assertion, you took the wrong `DEMO_SURVEY` branch in Task 2 Step 5 — switch to the fallback that keeps `companyWebsite = "alfabank.ru"`. The hub test must stay green without this epic editing it.

- [ ] **Step 3: Manual smoke (dev server on non-default port per AGENTS.md)**

Run: `npx next dev -p 3001`
Verify: opening the survey shows a textarea labelled "Ваша задача" (not a URL input); submitting empty shows the error; typing a sentence and pressing "Продолжить" advances to the cosmetic analysis screen (no crash, generic sub-line), then to interests/scenarios as before; the scenario catalog still appears unchanged (curation is static).

- [ ] **Step 4: Report worktree + branch + Foundation hand-off**

This epic is complete on `feature/epic-survey` at `.worktrees/epic-survey`. Merge is the user's call (AGENTS.md). Report the **Foundation hand-off item**: `app-state.ts` still reads `survey.companyWebsite` (survey_completed 823-824, DEMO_SURVEY 619/630) and `app-state.test.ts` asserts on it — the full rename to `taskDescription` and removal of the `companyWebsite` alias must be done by the hub owner, not this epic.

---

## Self-Review (completed)

- **Spec coverage:** block 6 → Task 1 (validation relax: `isWebsiteValid`→non-empty), Task 3 (URL field→description textarea, skip `normalizeWebsite`, copy A7), Task 4 (cosmetic copy + graceful degradation). "Анализ без изменений" upheld (Task 4 Step 1 — `hostnameFor` try/catch + cosmetic timer).
- **Ownership:** edits confined to `src/sections/survey/**`, `src/types/survey.ts`, `src/state/survey-validation.ts` (+ their tests). Frozen hub untouched.
- **Foundation dependency:** flagged (one) — `app-state.ts` + `app-state.test.ts` read `survey.companyWebsite`/`DEMO_SURVEY.companyWebsite`; epic keeps `companyWebsite` as an alias and hands the rename to Foundation.
- **ASK-USER escalations:** none required — Input→Textarea is component reuse (§0.2), not a UI-fork (§7). Conditional escalation noted in Task 3 only if the design turns out to intend a different affordance.
- **No placeholders:** real symbols (`Textarea` from `@/components/ui/textarea`, `isTaskDescriptionValid`, `taskDescription`), real files, real line numbers. Copy strings are product wording (use user's exact strings if provided).
- **TDD:** every behavior task is red→green with `npx vitest run`; types via `npx tsc --noEmit`. First green checkpoint after each task (no intentional red window — this is additive/relax, not a multi-task contract migration).
