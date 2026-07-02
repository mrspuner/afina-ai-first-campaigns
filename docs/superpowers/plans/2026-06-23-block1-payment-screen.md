# Экран оплаты + бюджет визарда: цифры и подписи — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the payment screen vs. wizard cost mismatch (582 188 ₽ vs 149k), clean up three labels/values on the payment screen, and bring two budget-step (бюджет визарда) tweaks into scope — все строки на русском. This is Блок 1 ("Экран оплаты + бюджет визарда: цифры и подписи") of the AIM batch decomposition, covering aim edits 2, 3, 4, 5, 19, 20. Edits 19 (insufficient-budget launch label in the wizard) and 20 (optional «Максимальный дневной бюджет» display-only field) both live in `step-budget.tsx`.

**Architecture:** The cost model is shared across three surfaces via `computeCampaignCost` (`campaign-cost.ts`) and the thin `graphCostFor` wrapper (`campaign-graph-cost.ts`). Both the wizard Budget step (`step-budget.tsx`) and the payment screen (`campaign-payment-screen.tsx`) are supposed to price the SAME graph. The mismatch (edit 2) is because the wizard's two `graphCostFor` calls omit the `channels` argument, so `createTemplate` falls into the legacy hardcoded path and builds a different graph → different total. The payment screen already passes channels (`campaign-payment-screen.tsx:78`). Edits 3/4/5 are label/value tweaks living in `campaign-payment-screen.tsx` lines 287–334, done in ONE sequential pass to avoid self-conflict. Edit 3 also touches `step-budget.tsx`.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, Vitest (test runner — colocated `*.test.ts` next to source, run with `npm run test`). Lint via `npm run lint` (eslint).

⚠️ **This is NOT the Next.js you know.** Before writing any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/`. (Block 1 touches no routing/server code, so this is unlikely to matter here — but heed it if you stray.)

---

## Task 0: Set up the worktree

**Files:** none (environment setup)

- [ ] **Step 1: Create an isolated worktree off `main` (repo rule, AGENTS.md).** From the repo root run:
  ```bash
  git worktree add .worktrees/block1-payment -b feature/block1-payment main
  cd .worktrees/block1-payment
  npm install
  ```
  Do ALL subsequent work, commits, and any dev-server runs inside `.worktrees/block1-payment`. The main checkout owns port 3000 — if you need a dev server, run `npm run dev -- -p 3001`. Prefer `npm run test` / `npm run lint` over the dev server. `.worktrees/` is already in `.gitignore`; do not commit its contents.

- [ ] **Step 2: Confirm the baseline is green.** Run:
  ```bash
  npm run test -- src/sections/campaigns
  ```
  Expected: PASS (existing campaign tests pass before you start). This anchors the regression baseline.

---

## Task 1 (Edit 2): Thread `channels` into the wizard's two `graphCostFor` calls

**Files:**
- `src/sections/campaigns/wizard/steps/step-budget.tsx` (calls at ~70–74 inside `buildBudgetForecast`, and ~150–158 inside `StepBudget`'s `cost` memo)
- `src/sections/campaigns/wizard/steps/step-budget.test.ts` (NEW — colocated test)

Root cause: `buildBudgetForecast` calls `graphCostFor({ scenarioId, sourceType, baseSize })` WITHOUT `channels` (step-budget.tsx:70–74), and the `cost` memo in `StepBudget` does the same (step-budget.tsx:150–158). `graphCostFor` already accepts an optional `channels` arg (`campaign-graph-cost.ts:24`) and forwards it to `createTemplate`. With channels omitted, `createTemplate` builds the legacy graph → a different total than the payment screen (which passes `campaign.channels ?? []` at campaign-payment-screen.tsx:78). Fix: pass channels in both wizard calls. `BudgetForecastInput` already carries `channels` (step-budget.tsx:38).

- [ ] **Step 1: Write a failing test proving the wizard forecast is channel-aware and converges with the payment-side graph cost.** Create `src/sections/campaigns/wizard/steps/step-budget.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { buildBudgetForecast } from "./step-budget";
  import { graphCostFor } from "@/sections/campaigns/campaign-graph-cost";
  import type { Channel } from "@/types/campaign";

  // base-first-deal → signalType "Первая сделка". "own" → scoring free, so the
  // forecast total is the pure graph communication cost (no scoring noise).
  const SCENARIO = "base-first-deal";
  const BASE = 10_000;

  describe("buildBudgetForecast channel-awareness (aim #2 mismatch fix)", () => {
    it("forecast.total equals the channel-aware graph cost (wizard ≡ payment)", () => {
      const channels: Channel[] = ["sms", "email"];
      const forecast = buildBudgetForecast({
        scenarioId: SCENARIO,
        sourceType: "own",
        channels,
        baseSize: BASE,
      });
      // The payment screen prices the SAME scenario+source+channels graph.
      const paymentGraph = graphCostFor({
        scenarioId: SCENARIO,
        sourceType: "own",
        baseSize: BASE,
        channels,
      });
      expect(paymentGraph).not.toBeNull();
      // own → signals are free, so forecast.communication === forecast.total.
      expect(forecast.communication).toBe(paymentGraph!.total);
      expect(forecast.total).toBe(paymentGraph!.total);
    });

    it("different channels yield different forecast totals (channels are actually threaded)", () => {
      const smsOnly = buildBudgetForecast({
        scenarioId: SCENARIO, sourceType: "own", channels: ["sms"], baseSize: BASE,
      });
      const ivrOnly = buildBudgetForecast({
        scenarioId: SCENARIO, sourceType: "own", channels: ["ivr"], baseSize: BASE,
      });
      // ivr (8 ₽/send) > sms (5 ₽/send): if channels were dropped these would be equal.
      expect(ivrOnly.total).toBeGreaterThan(smsOnly.total);
    });
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: FAIL. Before the fix, `buildBudgetForecast` ignores channels (graphCostFor called without them → legacy graph), so `forecast.communication` will NOT equal the channel-aware `paymentGraph.total`, and the sms-vs-ivr totals will be equal (both legacy).

- [ ] **Step 3: Thread `channels` into the `buildBudgetForecast` graph call.** In `src/sections/campaigns/wizard/steps/step-budget.tsx`, in `buildBudgetForecast`, change the `graphCostFor` call (currently lines 70–74):
  ```ts
  const graph = graphCostFor({
    scenarioId: input.scenarioId,
    sourceType: input.sourceType,
    baseSize: base,
  });
  ```
  to:
  ```ts
  const graph = graphCostFor({
    scenarioId: input.scenarioId,
    sourceType: input.sourceType,
    baseSize: base,
    channels: input.channels,
  });
  ```

- [ ] **Step 4: Thread `channels` into the `cost` memo in `StepBudget`.** In the same file, in the `cost = useMemo(...)` block (currently lines 150–158), change:
  ```ts
  const cost = useMemo(
    () =>
      graphCostFor({
        scenarioId: data.scenario,
        sourceType: data.sourceType,
        baseSize: data.fileRowCount && data.fileRowCount > 0 ? data.fileRowCount : FALLBACK_BASE,
      }),
    [data.scenario, data.sourceType, data.fileRowCount]
  );
  ```
  to (add `channels: data.channels` to the args AND add `data.channels` to the deps array so the memo recomputes when channels change):
  ```ts
  const cost = useMemo(
    () =>
      graphCostFor({
        scenarioId: data.scenario,
        sourceType: data.sourceType,
        baseSize: data.fileRowCount && data.fileRowCount > 0 ? data.fileRowCount : FALLBACK_BASE,
        channels: data.channels,
      }),
    [data.scenario, data.sourceType, data.channels, data.fileRowCount]
  );
  ```

- [ ] **Step 5: Run the test — expect PASS.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: PASS.

- [ ] **Step 6: Run the existing convergence regression to confirm no break.** Run:
  ```bash
  npm run test -- src/sections/campaigns/campaign-graph-consistency.test.ts src/sections/campaigns/campaign-graph-cost.test.ts
  ```
  Expected: PASS (these already pass; this proves the wizard fix doesn't regress the shared model).

- [ ] **Step 7: Commit.** Run:
  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
fix(step-budget): thread channels into both graphCostFor calls (aim #2)

Wizard forecast showed ~149k while payment screen showed 582 188 ₽.
Root cause: buildBudgetForecast and the StepBudget cost memo called
graphCostFor without `channels`, so createTemplate fell into the legacy
hardcoded path → a different graph → different total. Threading
data.channels into both calls makes the wizard price the same
scenario+source+channels graph as the payment screen, so the figures
converge.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 2 (Edit 3): "Повторные коммуникации" = коммуникации не первого касания

**Files:**
- `src/sections/campaigns/campaign-cost.ts` (`DYNAMIC_RATE` = 0.3 at line 26; repeat accumulation at 195; `isDynamic` mark at 156–158 in `computeReach`)
- `src/sections/campaigns/campaign-cost.test.ts` (existing — append a test)

Clarification from the user: "Повторные коммуникации (+30% буфер)" means **all communications that are NOT first-time** (i.e. non-первичные). The current model already implements exactly this: in `computeReach`, anything downstream of a `condition` node is marked `dynamic` (campaign-cost.ts:156–158), and in `computeCampaignCost` a line's `sum` is added to `repeat` when `isDynamic`, else to `primary` (campaign-cost.ts:195). So `repeat` = sum of all communication nodes that are NOT first-touch. The job here is to (a) lock this semantic with a regression test, and (b) confirm the rendered label/logic in both surfaces reflects "repeat = non-first-time communications" (the rendering changes themselves are folded into Task 3 for the payment screen; the wizard render is verified below).

- [ ] **Step 1: Write a failing test asserting `repeat` = sum of non-first-time (dynamic) communication lines, and `primary` = first-time lines.** Append to `src/sections/campaigns/campaign-cost.test.ts`:
  ```ts
  describe("repeat = non-first-time communications (aim #3)", () => {
    it("splits cost lines into primary (first touch) and repeat (post-condition) buckets", () => {
      // Graph: signal → sms (first touch) → condition → push (repeat, post-condition).
      const nodes: WorkflowNode[] = [
        { id: "sig", position: { x: 0, y: 0 }, data: { nodeType: "signal", label: "Сигнал", params: { kind: "signal", segments: { max: 100, high: 0, mid: 0, low: 0 } } } },
        { id: "sms", position: { x: 0, y: 0 }, data: { nodeType: "sms", label: "SMS" } },
        { id: "cond", position: { x: 0, y: 0 }, data: { nodeType: "condition", label: "Условие" } },
        { id: "push", position: { x: 0, y: 0 }, data: { nodeType: "push", label: "Push" } },
      ] as unknown as WorkflowNode[];
      const edges: WorkflowEdge[] = [
        { id: "e1", source: "sig", target: "sms" },
        { id: "e2", source: "sms", target: "cond" },
        { id: "e3", source: "cond", target: "push" },
      ] as unknown as WorkflowEdge[];

      const cost = computeCampaignCost(nodes, edges, 1000);
      const smsLine = cost.lines.find((l) => l.channel === "sms")!;
      const pushLine = cost.lines.find((l) => l.channel === "push")!;

      // SMS is the first touch → not dynamic → counts toward primary.
      expect(smsLine.isDynamic).toBe(false);
      // Push sits after the condition → a repeat (non-first-time) communication.
      expect(pushLine.isDynamic).toBe(true);
      // Buckets reflect the split.
      expect(cost.primary).toBe(smsLine.sum);
      expect(cost.repeat).toBe(pushLine.sum);
      expect(cost.hasDynamic).toBe(true);
    });
  });
  ```
  Ensure the imports at the top of `campaign-cost.test.ts` include `WorkflowNode` / `WorkflowEdge` types and `computeCampaignCost` — add `import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";` if not already present, and `import { computeCampaignCost } from "./campaign-cost";` (match the file's existing import style; do not duplicate existing imports).

- [ ] **Step 2: Run the test — expect PASS (this codifies existing behavior).** Run:
  ```bash
  npm run test -- src/sections/campaigns/campaign-cost.test.ts
  ```
  Expected: PASS. The model ALREADY computes repeat as non-first-time communications; this test is a regression lock. If it FAILS, fix the model so `repeat` accumulates `isDynamic` lines and `primary` accumulates the rest (it should already — investigate before changing constants; do NOT change `DYNAMIC_RATE`).

- [ ] **Step 3: Verify the wizard label/logic already reflects "non-first-time".** Read `src/sections/campaigns/wizard/steps/step-budget.tsx` lines 295–306. The label `Повторные коммуникации (+30% буфер)` is rendered there driven by `cost.repeat` / `cost.hasDynamic`. Confirm it reads from the same `cost.repeat` (the non-first-time bucket). No code change is required in `step-budget.tsx` for edit 3 beyond what Task 1 already did (Task 1 made `cost` channel-aware, so `cost.repeat` is now correct here). If the label text differs, leave it — the payment-screen label is handled in Task 3; the wizard text "Повторные коммуникации (+30% буфер)" already matches the agreed wording.

- [ ] **Step 4: Commit.** Run:
  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
test(campaign-cost): lock repeat = non-first-time communications (aim #3)

Regression test asserting computeCampaignCost buckets each communication
line into primary (first touch) vs repeat (post-condition / non-first-time),
matching the user's clarification that "Повторные коммуникации" means all
communications that are NOT first-time.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 3 (Edits 4, 5, 3-render): ONE sequential pass over `campaign-payment-screen.tsx` lines 287–334

**Files:**
- `src/sections/campaigns/campaign-payment-screen.tsx` (lines 287–334 — the «Платежи» block)
- `src/sections/campaigns/campaign-payment-screen.test.tsx` (NEW — colocated, `.tsx` because it renders the component)

⚠️ **All three of edits 4, 5, and the edit-3 render touch the SAME 287–334 region. Do them in this single task, one Edit after another, NOT as parallel sub-tasks** — parallel edits to the same lines self-conflict.

The three changes:
- **Edit 4:** rename the scoring line label `Скоринг (сигналы)` → `Сигналы` (line 288). The wizard already uses "Сигналы".
- **Edit 5:** replace the static `"уже оплачено"` string (lines 290–292) with the actual already-paid amount. The amount is the scoring figure from the payment split: `displaySplit.scoring` (which derives from `paymentSplit.scoring`, sourced from `splitCampaignPayments` → `est.signals`). For `own` sources scoring is 0 → keep showing `"бесплатно"`. For `new`/`stream`, scoring > 0 was already paid during signal scoring → show that rouble amount via the existing `formatRubPlain` helper.
- **Edit 3 (render):** the repeat label already reads `Повторные коммуникации (+30% буфер)` (line 328) — keep the wording. No value change needed; it already renders `displayRepeat`.

This component renders against `useAppState()` so a full render test needs the app-state provider. To keep the test focused and avoid heavy provider wiring, drive the value/label logic through a tiny exported pure helper and unit-test that, then make the JSX call it. This matches the repo's "pure model + thin render" pattern (cf. `buildBudgetRows`, `splitCampaignPayments`).

- [ ] **Step 1: Write a failing test for the scoring-line label + value helper.** Create `src/sections/campaigns/campaign-payment-screen.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { scoringLineDisplay } from "./campaign-payment-screen";

  describe("scoringLineDisplay (aim #4 label, #5 already-paid amount)", () => {
    it("own source: scoring is free → «бесплатно»", () => {
      expect(scoringLineDisplay({ sourceType: "own", scoring: 0 })).toBe("бесплатно");
    });

    it("new source: scoring already paid → the rouble amount (not «уже оплачено»)", () => {
      // 2500 ₽ scoring already paid during signal scoring.
      expect(scoringLineDisplay({ sourceType: "new", scoring: 2500 })).toBe("2 500 ₽");
    });

    it("stream source: scoring already paid → the rouble amount", () => {
      expect(scoringLineDisplay({ sourceType: "stream", scoring: 1234 })).toBe("1 234 ₽");
    });

    it("non-own with zero scoring still reads «бесплатно» (degenerate)", () => {
      expect(scoringLineDisplay({ sourceType: "new", scoring: 0 })).toBe("бесплатно");
    });
  });
  ```
  Note: the expected `"2 500 ₽"` / `"1 234 ₽"` use a non-breaking space (` `) thousands separator because `toLocaleString("ru-RU")` produces NBSP. Write the test string literals with a real NBSP between digit groups (copy the byte, do not type a normal space) so the assertion matches `formatRubPlain`'s output exactly.

- [ ] **Step 2: Run the test — expect FAIL.** Run:
  ```bash
  npm run test -- src/sections/campaigns/campaign-payment-screen.test.tsx
  ```
  Expected: FAIL — `scoringLineDisplay` is not exported yet (import error / undefined).

- [ ] **Step 3 (Edit 5 logic): add the exported `scoringLineDisplay` helper.** In `src/sections/campaigns/campaign-payment-screen.tsx`, just below the existing `formatRub` helper (after line 40), add:
  ```ts
  /**
   * Scoring («Сигналы») payment line text. Own bases score for free. For
   * new/stream the scoring was already paid during signal scoring, so we show
   * the actual already-paid rouble amount instead of a static «уже оплачено».
   */
  export function scoringLineDisplay(args: {
    sourceType: "own" | "new" | "stream";
    scoring: number;
  }): string {
    if (args.sourceType === "own" || args.scoring <= 0) return "бесплатно";
    return formatRubPlain(args.scoring);
  }
  ```

- [ ] **Step 4 (Edits 4 + 5 render): rewrite the scoring `<li>` (lines 287–294) in ONE edit.** Replace:
  ```tsx
  <li className="flex items-baseline justify-between gap-3">
    <span className="text-muted-foreground">Скоринг (сигналы)</span>
    <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
      {campaign.sourceType === "own"
        ? "бесплатно"
        : "уже оплачено"}
    </span>
  </li>
  ```
  with:
  ```tsx
  <li className="flex items-baseline justify-between gap-3">
    <span className="text-muted-foreground">Сигналы</span>
    <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
      {scoringLineDisplay({
        sourceType: campaign.sourceType ?? "new",
        scoring: displaySplit.scoring,
      })}
    </span>
  </li>
  ```
  Notes: `campaign.sourceType` may be `undefined` in the type; the existing screen treats absence as non-own elsewhere, so default to `"new"`. `displaySplit` is non-null inside this block (the block is guarded by `{displaySplit && (...)}` at line 281) and `displaySplit.scoring` is the (possibly rescaled in custom mode) scoring figure originating from `paymentSplit.scoring` ← `splitCampaignPayments`.

- [ ] **Step 5 (Edit 3 render check): confirm the repeat line wording is unchanged.** Verify lines ~325–334 still render the label `Повторные коммуникации (+30% буфер)` and the amount `{formatRubPlain(displayRepeat)}`. No change required — `displayRepeat` is the non-first-time bucket (Task 2). Leave as-is.

- [ ] **Step 6: Run the test — expect PASS.** Run:
  ```bash
  npm run test -- src/sections/campaigns/campaign-payment-screen.test.tsx
  ```
  Expected: PASS.

- [ ] **Step 7: Grep to prove the stale strings are gone.** Run:
  ```bash
  grep -n "Скоринг (сигналы)\|уже оплачено" src/sections/campaigns/campaign-payment-screen.tsx || echo "OK: no stale strings"
  ```
  Expected: `OK: no stale strings`.

- [ ] **Step 8: Commit.** Run:
  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
fix(payment-screen): «Сигналы» label + real already-paid amount (aim #4, #5)

- Rename scoring line «Скоринг (сигналы)» → «Сигналы» (matches wizard).
- Replace static «уже оплачено» with the actual already-paid scoring
  amount (paymentSplit.scoring) for new/stream; own stays «бесплатно».
  Logic extracted into a pure, tested scoringLineDisplay helper.
- Repeat line keeps «Повторные коммуникации (+30% буфер)» (aim #3 render).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 4 (Edit 19): Wizard «Запустить» → «Пополнить и запустить» on insufficient budget

**Files:**
- `src/sections/campaigns/wizard/steps/step-budget.tsx` (the `StepBudget` component; `StepFooter` call at line ~408–413 with `continueLabel="Запустить"`; the chosen budget is `activeValue` at line ~174)
- `src/sections/campaigns/wizard/steps/step-footer.tsx` (READ ONLY — confirm it is dumb; do NOT change it)
- `src/sections/campaigns/wizard/steps/step-budget.test.ts` (existing from Task 1 — append a test)

The payment screen already does this at `campaign-payment-screen.tsx:469` (`{enoughBalance ? "Запустить" : "Пополнить и запустить"}`, with `balance` from `useAppState()`, `shortfall = computeShortfall(balance, activeBudget)`, `enoughBalance = shortfall <= 0`). **DO NOT touch the payment screen — it is done.** `StepFooter` (step-footer.tsx) is a dumb presentational footer with no balance access (confirmed: it only renders `continueLabel`) — keep it dumb, just feed it the computed string.

`computeShortfall` is exported from `@/sections/signals/top-up-modal` (confirmed: `top-up-modal.tsx:29` — `export function computeShortfall(balance: number, cost: number): number`). The payment screen imports it from there too. Reuse it so the wizard logic matches the payment screen exactly. The wizard already has the chosen budget in `activeValue` (step-budget.tsx:174: `mode === "recommended" ? recommendedValue : customIsValid ? customParsed : 0`). The wizard step does NOT yet read `balance` — add `useAppState`.

To keep the label logic unit-testable without wiring the whole app-state provider into a render test, extract a pure exported helper (mirrors the `scoringLineDisplay` pattern from Task 3) and call it from the JSX.

- [ ] **Step 1: Write a failing test for the launch-label helper.** Append to `src/sections/campaigns/wizard/steps/step-budget.test.ts`:
  ```ts
  import { launchButtonLabel } from "./step-budget";

  describe("launchButtonLabel (aim #19 insufficient-budget wizard label)", () => {
    it("balance ≥ required → «Запустить»", () => {
      expect(launchButtonLabel({ balance: 10_000, required: 5_000 })).toBe("Запустить");
    });
    it("balance < required → «Пополнить и запустить»", () => {
      expect(launchButtonLabel({ balance: 1_000, required: 5_000 })).toBe(
        "Пополнить и запустить",
      );
    });
    it("balance exactly equal to required → «Запустить» (shortfall 0)", () => {
      expect(launchButtonLabel({ balance: 5_000, required: 5_000 })).toBe("Запустить");
    });
    it("zero required (degenerate) → «Запустить»", () => {
      expect(launchButtonLabel({ balance: 0, required: 0 })).toBe("Запустить");
    });
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: FAIL — `launchButtonLabel` is not exported yet.

- [ ] **Step 3: Add the imports for `useAppState` and `computeShortfall`.** In `src/sections/campaigns/wizard/steps/step-budget.tsx`, add to the import block at the top of the file:
  ```ts
  import { useAppState } from "@/state/app-state-context";
  import { computeShortfall } from "@/sections/signals/top-up-modal";
  ```

- [ ] **Step 4: Add the exported `launchButtonLabel` helper.** In the same file, near the other module-level helpers (e.g. just after `formatRubApprox` / before `RadioDot`), add:
  ```ts
  /**
   * Launch button label for the budget step: when the balance does not cover
   * the chosen budget we surface the top-up path, matching the payment screen
   * (campaign-payment-screen.tsx). Uses the same computeShortfall as the
   * payment screen so the threshold is identical.
   */
  export function launchButtonLabel(args: {
    balance: number;
    required: number;
  }): string {
    return computeShortfall(args.balance, args.required) <= 0
      ? "Запустить"
      : "Пополнить и запустить";
  }
  ```

- [ ] **Step 5: Read `balance` in `StepBudget` and feed the computed label to `StepFooter`.** Inside `StepBudget` (after the existing hooks, e.g. right after `const isStream = ...` at line ~161), add:
  ```ts
  const { balance } = useAppState();
  ```
  Then change the `StepFooter` call (currently lines ~408–413):
  ```tsx
  <StepFooter
    onBack={onBack}
    onContinue={handleContinue}
    continueLabel="Запустить"
    continueDisabled={!canContinue}
  />
  ```
  to:
  ```tsx
  <StepFooter
    onBack={onBack}
    onContinue={handleContinue}
    continueLabel={launchButtonLabel({ balance, required: activeValue })}
    continueDisabled={!canContinue}
  />
  ```
  Note: `activeValue` (step-budget.tsx:174) is the chosen budget — recommended total or the custom amount — exactly what must be covered by balance, mirroring the payment screen's `activeBudget`.

- [ ] **Step 6: Run the test — expect PASS.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: PASS.

- [ ] **Step 7: Confirm `StepFooter` was not modified.** Run:
  ```bash
  git diff --name-only | grep step-footer && echo "VIOLATION: step-footer changed" || echo "OK: step-footer untouched"
  ```
  Expected: `OK: step-footer untouched`.

- [ ] **Step 8: Commit.** Run:
  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
feat(step-budget): «Пополнить и запустить» on insufficient balance (aim #19)

The wizard budget step now reads balance via useAppState and reuses
computeShortfall (same as the payment screen) to switch the launch label
to «Пополнить и запустить» when the balance does not cover activeValue.
StepFooter stays dumb — it just renders the computed label string.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 5 (Edit 20): Optional «Максимальный дневной бюджет» field — input + DISPLAY ONLY

**Files:**
- `src/types/campaign.ts` (`StepData` interface, ~lines 12–37 — add an optional field)
- `src/sections/campaigns/wizard/steps/step-budget.tsx` (the `StepBudget` component; «Дневной бюджет» row at ~311–318; `StepFooter` at ~408)
- `src/sections/campaigns/wizard/steps/step-budget.test.ts` (existing — append tests)

⚠️ **The cost model (`campaign-cost.ts`) MUST NOT change.** This field is an editable display-only ceiling; it does NOT re-derive totals, stretch `STREAM_DAYS`, or feed `computeCampaignCost`/`graphCostFor`. The existing derived `dailyBudget = Math.round(total / STREAM_DAYS)` (BudgetForecast.dailyBudget, computed at step-budget.tsx:81, rendered in the «Дневной бюджет» row at ~311–318) is unchanged.

**State decision (read-the-code finding):** In `campaign-workspace.tsx:218` the budget step's `onNext` is overridden to `() => handleLaunchFromBudget()`, which ignores its partial — so the budget step's per-field changes do NOT round-trip into the wizard `stepData` through `onNext`. The established in-step pattern (cf. `mode`, `customValue` at step-budget.tsx:163–169) is **local component state**, seeded from `data` for restore-on-revisit. We follow that exact pattern: hold the value in local state seeded from `data.maxDailyBudget`, render it in the summary, and add the optional `maxDailyBudget?: number` field to `StepData` so the value has a typed home (seed source + future launch wiring). Edit 20 is explicitly "input + DISPLAY ONLY", so no dispatch/cost wiring is required beyond this.

- [ ] **Step 1: Write failing tests for the ceiling display helper.** The summary line is pure: given a user-entered value it shows «Максимальный дневной бюджет» with the formatted amount, and when empty it shows nothing. Extract a tiny pure helper. Append to `src/sections/campaigns/wizard/steps/step-budget.test.ts`:
  ```ts
  import { maxDailyBudgetLine } from "./step-budget";

  describe("maxDailyBudgetLine (aim #20 optional ceiling, display-only)", () => {
    it("returns the RU label + formatted amount when a positive value is set", () => {
      expect(maxDailyBudgetLine(1000)).toEqual({
        label: "Максимальный дневной бюджет",
        display: "₽ 1 000",
      });
    });
    it("returns null when unset (undefined)", () => {
      expect(maxDailyBudgetLine(undefined)).toBeNull();
    });
    it("returns null for empty/zero/invalid (no ceiling)", () => {
      expect(maxDailyBudgetLine(0)).toBeNull();
      expect(maxDailyBudgetLine(NaN)).toBeNull();
    });
  });
  ```
  Note: `"₽ 1 000"` uses the file's `formatRub` (which is `₽ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`) → the space between «₽» and the number is a normal space, and the thousands separator is a NBSP. Write the literal with the exact bytes `formatRub(1000)` produces (a normal space after ₽, NBSP inside the number) so the assertion matches.

- [ ] **Step 2: Run the tests — expect FAIL.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: FAIL — `maxDailyBudgetLine` is not exported yet.

- [ ] **Step 3: Add the optional field to `StepData`.** In `src/types/campaign.ts`, inside the `StepData` interface (after the existing `dailyBudget?` field, ~line 35), add:
  ```ts
  /** Optional user-set ceiling shown in the budget summary. Display only —
   *  does NOT feed the cost model. Empty/undefined = not set. */
  maxDailyBudget?: number;
  ```

- [ ] **Step 4: Add the exported `maxDailyBudgetLine` helper.** In `src/sections/campaigns/wizard/steps/step-budget.tsx`, near the other module-level helpers (after `launchButtonLabel` from Task 4, or after `formatRubApprox`), add:
  ```ts
  /**
   * Optional ceiling line for the budget summary (aim #20). Display-only — it
   * does NOT alter the cost model. Returns null when unset so the row is
   * omitted entirely.
   */
  export function maxDailyBudgetLine(
    value: number | undefined,
  ): { label: string; display: string } | null {
    if (value === undefined || !(value > 0)) return null;
    return { label: "Максимальный дневной бюджет", display: formatRub(value) };
  }
  ```

- [ ] **Step 5: Add local state for the input, seeded from `data`.** Inside `StepBudget`, alongside the existing `mode`/`customValue` state (after step-budget.tsx:170), add:
  ```ts
  const [maxDailyValue, setMaxDailyValue] = useState<string>(
    data.maxDailyBudget != null ? String(data.maxDailyBudget) : "",
  );
  const maxDailyParsed = parseFloat(maxDailyValue.replace(",", "."));
  const maxDailyLine = maxDailyBudgetLine(
    !isNaN(maxDailyParsed) ? maxDailyParsed : undefined,
  );

  function handleMaxDailyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMaxDailyValue(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."));
  }
  ```

- [ ] **Step 6: Render the optional input + the ceiling summary line.** Inside the summary card (the `<div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">` block, after the `isStream && estimate.dailyBudget` row that ends at ~318, still inside that card), add the ceiling summary row (only when set):
  ```tsx
  {maxDailyLine && (
    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
      <span>{maxDailyLine.label}</span>
      <span className="tabular-nums">{maxDailyLine.display}</span>
    </div>
  )}
  ```
  Then add the optional input field just above `<StepFooter ...>` (after the budget cards grid, ~line 407, inside the outer `flex flex-col gap-5`):
  ```tsx
  <div className="flex flex-col gap-1.5">
    <label
      htmlFor="max-daily-budget"
      className="text-xs font-medium text-muted-foreground"
    >
      Максимальный дневной бюджет (необязательно)
    </label>
    <div className="relative">
      <Input
        id="max-daily-budget"
        type="text"
        inputMode="decimal"
        placeholder="Без ограничения"
        value={maxDailyValue}
        onChange={handleMaxDailyChange}
        className="pr-8 tabular-nums"
        aria-label="Максимальный дневной бюджет"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
        ₽
      </span>
    </div>
  </div>
  ```
  (`Input` is already imported at step-budget.tsx:4.) Persisting into wizard `stepData` is out of scope for this display-only edit (the budget step's `onNext` is hijacked for launch — see the state decision above); the field is seeded from `data.maxDailyBudget` for restore-on-revisit and the typed home is added in Step 3.

- [ ] **Step 7: Run the tests — expect PASS.** Run:
  ```bash
  npm run test -- src/sections/campaigns/wizard/steps/step-budget.test.ts
  ```
  Expected: PASS.

- [ ] **Step 8: Confirm the cost model was not touched.** Run:
  ```bash
  git diff --name-only | grep -E "campaign-cost\.ts$|campaign-graph-cost\.ts$|campaign-budget-estimate\.ts$" && echo "VIOLATION: cost model changed" || echo "OK: cost model untouched"
  ```
  Expected: `OK: cost model untouched`.

- [ ] **Step 9: Commit.** Run:
  ```bash
  git add -A && git commit -m "$(cat <<'EOF'
feat(step-budget): optional «Максимальный дневной бюджет» field (aim #20)

Display-only optional ceiling input on the wizard budget step. Value is
held in local state (seeded from data.maxDailyBudget, a new optional
StepData field) and shown in the budget summary when set. The cost model
(campaign-cost.ts / graph-cost / budget-estimate) is untouched — this does
not re-derive totals or stretch days.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Task 6: Full verification

**Files:** none (verification)

- [ ] **Step 1: Run the full test suite.** Run:
  ```bash
  npm run test
  ```
  Expected: PASS (all green). Pay attention to `campaign-graph-consistency`, `campaign-graph-cost`, `campaign-cost`, `campaign-payments`, `step-budget`, and `campaign-payment-screen` test files.

- [ ] **Step 2: Lint.** Run:
  ```bash
  npm run lint
  ```
  Expected: no errors. (Watch for unused-import or exhaustive-deps warnings introduced by the `data.channels` dep change in Task 1 Step 4 — the existing `// eslint-disable-next-line react-hooks/exhaustive-deps` may need removing if the deps array is now complete; if lint complains either way, resolve it minimally.)

- [ ] **Step 3 (optional manual check): visually confirm convergence.** Only if you want a visual check, start the dev server on the alternate port (main checkout owns 3000):
  ```bash
  npm run dev -- -p 3001
  ```
  Walk a campaign through the wizard Budget step, note the «Итого», then open the payment screen for the same campaign with the same channels — the «Коммуникация» figure must match the wizard total. Stop the server when done.

- [ ] **Step 4: Report back to the user.** Report the worktree path (`.worktrees/block1-payment`) and branch (`feature/block1-payment`). Per AGENTS.md, leave merge/cleanup (`git worktree remove`, branch delete) to the user. Summarize: edit 2 (channels threaded → costs converge), edit 3 (repeat = non-first-time, locked by test), edit 4 (label «Сигналы»), edit 5 (real already-paid amount), edit 19 (wizard «Пополнить и запустить» on insufficient balance), edit 20 (optional «Максимальный дневной бюджет» display-only field — cost model untouched).

---

## Self-review checklist (mapping spec → tasks)

- **Edit 2** (wizard↔payment mismatch): Task 1 — both `graphCostFor` calls in `step-budget.tsx` now pass `channels`; regression test + existing convergence tests confirm.
- **Edit 3** (repeat = non-first-time): Task 2 (model lock test, no constant changes) + Task 3 Step 5 (render wording preserved on payment screen) + Task 1 (wizard repeat now channel-aware).
- **Edit 4** (label rename): Task 3 Step 4 — `Скоринг (сигналы)` → `Сигналы`.
- **Edit 5** (real already-paid amount): Task 3 Steps 3–4 — `scoringLineDisplay` from `displaySplit.scoring` (← `splitCampaignPayments`), `own`/zero → «бесплатно».
- **Edit 19** (wizard insufficient-budget label): Task 4 — `launchButtonLabel({ balance, required: activeValue })` reuses `computeShortfall` (same as payment screen); `balance` via `useAppState`; `StepFooter` stays dumb (verified unchanged in Step 7). Payment screen NOT touched.
- **Edit 20** (optional ceiling field, display-only): Task 5 — `maxDailyBudgetLine` helper + local-state input seeded from new `StepData.maxDailyBudget`; cost model untouched (verified in Step 8); RU label «Максимальный дневной бюджет», `formatRub` formatting.
- **Constraint — Russian only:** all new/changed UI strings («Сигналы», «бесплатно», «Запустить»/«Пополнить и запустить», «Максимальный дневной бюджет (необязательно)», «Без ограничения», rouble amounts via `formatRubPlain`/`formatRub`) are Russian.
- **Constraint — 287–334 single pass:** edits 3/4/5 on the payment screen are all in Task 3, sequential.
- **Constraint — both new edits in step-budget.tsx sequenced:** edit 19 (Task 4) then edit 20 (Task 5) — both follow the existing step-budget tasks (Task 1) and run sequentially so the two `step-budget.tsx` edits never self-conflict.
- **Constraint — worktree + ports:** Task 0 creates `.worktrees/block1-payment`; dev server on `-p 3001`.
- Symbol names verified against source: `graphCostFor`, `buildBudgetForecast`, `BudgetForecastInput.channels`, `computeCampaignCost`, `CostLine.isDynamic`, `CampaignCost.{primary,repeat,hasDynamic}`, `DYNAMIC_RATE`, `splitCampaignPayments`, `CampaignPaymentSplit.scoring`, `displaySplit`, `displayRepeat`, `formatRubPlain`, `campaign.sourceType`, `StepBudget`, `activeValue`, `recommendedValue`, `estimate.dailyBudget`, `StepFooter.continueLabel`, `computeShortfall` (`@/sections/signals/top-up-modal`), `useAppState` (`@/state/app-state-context`, exposes `balance`), `StepData.maxDailyBudget` (new), `formatRub`, `Input`.
