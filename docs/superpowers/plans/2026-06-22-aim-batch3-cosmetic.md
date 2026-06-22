# aim Batch 3 (Cosmetic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply the 15 cosmetic/layout aim edits (batch 3) — catalog «Свернуть»+chip color, budget per-channel breakdown, payment block merge + «уже оплачено», campaign-card status/budget, artifact-card layout, template-card fields/chip, scenario chip. Excludes #6/#7/#15 (separate backlog).

**Architecture:** Presentation-only React changes on `feature/finish-campaign-first`. No reducer/state changes — only reads of existing fields/cost objects. Grouped one task per component/area; verified by render tests + tsc.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React, Vitest.

**Source spec:** `docs/superpowers/specs/2026-06-22-aim-batch3-cosmetic-design.md`.

**⚠️ Environment:** repo dir name has a non-breaking space. Shell: `cd /tmp/afina-wt`. Read/Write/Edit: `/tmp/afina-wt/...`.

**⚠️ Baseline gates:** `npx tsc --noEmit` has exactly **13 pre-existing errors** (12 `ai-elements/*`, 1 `campaign-cost.ts:154`) — must remain. Green = `npx tsc --noEmit 2>&1 | grep -vE "ai-elements|campaign-cost" | grep "error TS"` empty. `npx vitest run` fully green (988) — keep it. Commit with TARGETED `git add` (NOT `-am` — dev-only aim inject in `layout.tsx` must not be swept in). Many step components gate children behind a typewriter `StepContent`; mock it in tests like existing step tests do.

**Reuse sources (single sources of truth):**
- Channel color: `getNodeColor(channel)` / `NODE_STYLES` in `src/sections/campaigns/node-visuals.ts` (keys sms/email/push/ivr).
- Channel label: `CHANNEL_LABEL` in `src/sections/campaigns/campaign-cost.ts`.

---

## Task 0: Baseline check
- [ ] `cd /tmp/afina-wt && npx tsc --noEmit 2>&1 | grep -vE "ai-elements|campaign-cost" | grep "error TS"` → empty; `npx vitest run 2>&1 | grep -E "Tests " | tail -1` → all pass. If red, STOP.

---

## Task 1: Catalog — «Свернуть» above search + curated chip color (#1, #2)

**Files:** `src/sections/campaigns/wizard/steps/step-1-scenario.tsx`, `src/sections/signals/scenario-card.tsx` (+ tests).

- [ ] **Step 1 (#1):** In the expanded view, move the «Свернуть» button (currently `~:147-153`, in a flex row beside the search `<Input>` `~:133-146`) to its OWN row ABOVE the search input. Read the current expanded-view JSX; place «Свернуть» as the first element, then the search row below it. Keep its onClick `setShowAll(false)`.
- [ ] **Step 2 (#2):** In `scenario-card.tsx`, the `curatedLabel` badge (`~:94-101`) is currently `<Badge variant="secondary" className="text-[11px] font-normal text-muted-foreground">`. Give it brand-accent styling: change to `className="border-brand/50 bg-brand-muted text-foreground text-[11px] font-normal"` (keep `Badge`; use the same brand-muted treatment as the recommended/selected affordances). Do NOT change the `sourceLabel` badge above it (stays neutral).
- [ ] **Step 3:** Update tests: `step-1-scenario.test.tsx` (the «Свернуть» round-trip test still passes — assert it's present in expanded view; its DOM position change shouldn't break the query); `scenario-card.test.tsx` (the curated-badge test — assert the curated badge has the brand classes, e.g. `toHaveClass("bg-brand-muted")`, while sourceLabel badge does not). Don't weaken.
- [ ] **Step 4:** `cd /tmp/afina-wt && npx tsc --noEmit 2>&1 | grep -vE "ai-elements|campaign-cost" | grep "error TS"` → empty; `npx vitest run 2>&1 | grep -E "Tests " | tail -1` → all pass.
- [ ] **Step 5:** Commit `git add` the 2 files + tests; `git commit -m "feat(catalog): Свернуть above search + brand-colored curated chip"`.

---

## Task 2: Budget step — per-channel breakdown (#3, #4, #5)

**Files:** `src/sections/campaigns/wizard/steps/step-budget.tsx` (+ test). Read it; after batch-2 it has graph `cost` (`CampaignCost { lines:{channel,label,unit,reach,sum}[], repeat, hasDynamic, total }`) in scope plus `formatRub`/`formatRubApprox`, `CHANNEL_LABEL`, the `~N контактов` `contactLabel`, the channel-list line, the «+30% буфер» line.

- [ ] **Step 1 (#3):** Move the `~N контактов` figure OUT of the «Сигналы» row's right side and render it as a muted sub-line UNDER the «Сигналы» row (mirror how the channel list sits under «Коммуникация»). Read the current row rendering (the `contactLabel` span between label and amount) and relocate it.
- [ ] **Step 2 (#4):** Replace the single «Каналы: SMS, Звонок» line with a per-channel list derived from `cost.lines`: one muted line per line — `{CHANNEL_LABEL[line.channel]} · {line.label}` on the left, `{formatRub(line.sum)}` on the right. Fallback when there is no graph `cost` (no scenario): show the simple «Каналы: …» list from `data.channels` (current behavior) without sums. Guard: only render the per-line list when `cost && cost.lines.length > 0`.
- [ ] **Step 3 (#5):** On the «Повторные коммуникации (+30% буфер)» line, append the buffer amount on the right: `{formatRub(cost.repeat)}`. Show this line when `cost?.hasDynamic` (or `cost.repeat > 0`).
- [ ] **Step 4:** Update `step-budget.test.tsx`: assert the contacts line is under «Сигналы»; per-channel lines render channel label + a rouble amount when a scenario/cost is present; buffer line shows an amount. Mock `step-content`. Don't weaken existing assertions (numbers still graph-derived from batch-2).
- [ ] **Step 5:** tsc clean (filtered); full suite green.
- [ ] **Step 6:** Commit `git add src/sections/campaigns/wizard/steps/step-budget.tsx` + test; `git commit -m "feat(budget): per-channel cost lines + contacts under Сигналы + buffer amount"`.

---

## Task 3: Payment screen — merge breakdown + «уже оплачено» (#8, #9)

**Files:** `src/sections/campaigns/campaign-payment-screen.tsx` (+ test if present). Read `~:280-353`.

- [ ] **Step 1 (#9):** Remove the standalone «Из чего складывается стоимость» card block (`~:280-317`) and render its content (the `displayLines` `<ul>` + the «Повторные коммуникации (+30% буфер)» line) INSIDE the «Платежи» card (`~:319-353`), placed immediately AFTER the «Коммуникация» `<li>` as an indented detail. One «Платежи» card. Preserve guards (`cost && displayLines.length > 0` for the lines).
- [ ] **Step 2 (#8):** On the «Скоринг (сигналы)» `<li>` (`~:326-333`), show «уже оплачено» instead of the amount when scoring already happened pre-launch: condition = `campaign.sourceType !== "own" && (campaignArtifact exists OR campaign already collected)`. Simplest robust rule available on this screen: if `campaign.sourceType === "own"` → keep «бесплатно»; else → «уже оплачено» (the new flow collects/charges scoring before reaching payment). Read what campaign/source/artifact data is in scope and pick the cleanest expression; keep «бесплатно» for own.
- [ ] **Step 3:** Update/add payment-screen test if one exists (per batch-1 there was none for this screen — if still none, rely on tsc + a focused render smoke is optional). If you add a smoke test, mock heavy deps. Don't weaken.
- [ ] **Step 4:** tsc clean (filtered); full suite green.
- [ ] **Step 5:** Commit `git add src/sections/campaigns/campaign-payment-screen.tsx` + any test; `git commit -m "feat(payment): merge cost breakdown into Платежи; scoring marked уже оплачено"`.

---

## Task 4: Campaign card — status label + two-line budget (#10, #11)

**Files:** `src/sections/campaigns/campaign-screen.tsx`, `src/sections/campaigns/campaign-stats-block.tsx`, possibly `src/sections/campaigns/campaign-card.tsx` (+ tests).

- [ ] **Step 1 (#10):** `campaign-screen.tsx:162` — change `<CardSection label="Путь кампании">` to `label="Статус кампании"`. Single-string change.
- [ ] **Step 2 (#11):** `campaign-stats-block.tsx:81-87` — the budget row currently renders one span «расчётный {plannedBudget} · факт {actualSpend}». Split into TWO rows: a row «Бюджет (расчётный)» → `{plannedBudget}`, and a row «Бюджет (факт)» → `{actualSpend}`. Use the same row markup as the other StatItem rows in the block. If `campaign-card.tsx:91-98` has the analogous one-line budget, split it there too for consistency.
- [ ] **Step 3:** Update `campaign-stats-block` test (and campaign-card test if touched): assert two distinct budget rows render with the planned/actual values. Don't weaken.
- [ ] **Step 4:** tsc clean (filtered); full suite green.
- [ ] **Step 5:** Commit `git add` the touched files + tests; `git commit -m "feat(campaign-card): Статус кампании label + two-line budget"`.

---

## Task 5: Artifact card — date under title + actions top-right (#12, #13)

**Files:** `src/sections/artifacts/artifact-card.tsx` (+ test). Read `~:46-93`.

- [ ] **Step 1 (#12):** Move the date `<p>` (`~:63`) out of the top flex row; render it as a muted line under the title block.
- [ ] **Step 2 (#13):** Move the actions row (Download + delete DropdownMenu, `~:77-92`) into the top row, right-aligned (top-right corner), so the top row is `[title block] ... [actions]`. Keep `onClick` `stopPropagation` on the inner buttons (card is clickable → opens detail) and `role="button"` behavior intact.
- [ ] **Step 3:** Update `artifact-card.test.tsx`: open-on-click still works; delete still works; date + actions present. (Position change shouldn't break the existing behavioral queries — adjust only if a query depended on DOM order.) Don't weaken.
- [ ] **Step 4:** tsc clean (filtered); full suite green.
- [ ] **Step 5:** Commit `git add src/sections/artifacts/artifact-card.tsx` + test; `git commit -m "feat(artifacts): date under title + actions to top-right of card"`.

---

## Task 6: Template card — fields + chip line + chip color (#14, #16, #17)

**Files:** `src/sections/artifacts/template-card.tsx` (+ test). Read `~:44-68` + `previewOf` (`~:11`). Channel color from `node-visuals.ts` (`getNodeColor`/`NODE_STYLES`).

- [ ] **Step 1 (#16):** Split the header row (`~:49-54`) so the channel `<Badge>` is on its own line (row 1) and the title `<p>{name}</p>` is on a separate line below (row 2).
- [ ] **Step 2 (#17):** Replace the channel `<Badge variant="secondary">` with a chip colored by the channel's workflow-node color. Import from `node-visuals.ts`; build an inline style from `NODE_STYLES[channel]` (`{border, bg, color}`) or `getNodeColor(channel)` — render a small pill with that border+bg+text color. Keep the channel label text (`CHANNEL_LABEL[channel]`).
- [ ] **Step 3 (#14):** Render the per-channel component fields from `content` (discriminate on `content.kind`, mirroring `previewOf`): a small label→value list. email → Тема/Текст/Отправитель (subject/body/sender); sms → Текст/Альфа-имя (text/alphaName); push → Заголовок/Текст (title/body); ivr → Сценарий/Голос (scenario/voiceType). Keep the existing 2-line preview or replace it with the fields list — fields list is the goal of #14; if both, fields list below the preview. Keep «Использован в кампаниях: N» + the action button.
- [ ] **Step 4:** Update/add `template-card.test.tsx`: chip on its own line with channel-colored style (assert an inline color/style or a class derived from the channel); fields list renders email subject/sender for an email template fixture. Don't weaken.
- [ ] **Step 5:** tsc clean (filtered); full suite green.
- [ ] **Step 6:** Commit `git add src/sections/artifacts/template-card.tsx` + test; `git commit -m "feat(templates): channel-colored chip on own line + component fields"`.

---

## Task 7: Campaign card — scenario chip (#18)

**Files:** `src/sections/campaigns/campaign-card.tsx` (+ test). Read `~:44, :71-76`.

- [ ] **Step 1:** The scenario name `scenarioLine = \`Сценарий: ${name}\`` currently renders as a plain `<p>` (`~:71`). Render it as a chip/badge reusing the adjacent `sourceLabel` chip styling (`~:72-76`, `rounded-md border ...`). Keep the text «Сценарий: {name}» (or just the scenario name) inside the chip. Ensure it sits in the same chip row as `sourceLabel`.
- [ ] **Step 2:** Update `campaign-card` test if it asserts the scenario text; assert it now renders within a chip (same styling class as sourceLabel). Don't weaken.
- [ ] **Step 3:** tsc clean (filtered); full suite green.
- [ ] **Step 4:** Commit `git add src/sections/campaigns/campaign-card.tsx` + test; `git commit -m "feat(campaign-card): scenario name as a chip"`.

---

## Task 8: End-to-end verification
- [ ] **Step 1:** `cd /tmp/afina-wt && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 13; `... | grep -vE "ai-elements|campaign-cost" | grep "error TS"` → empty. `npx vitest run 2>&1 | grep -E "Tests " | tail -1` → all pass.
- [ ] **Step 2 (manual smoke, dev on :3000):** catalog («Свернуть» above search; curated chip colored) → budget (contacts under Сигналы; per-channel lines with amounts; buffer amount) → payment (single «Платежи» card with breakdown under Коммуникация; scoring «уже оплачено») → campaign card («Статус кампании»; two-line budget) → artifacts (date under title; actions top-right) → templates (colored chip own line; component fields) → campaigns list (scenario chip).
- [ ] **Step 3:** Report branch + commit list. Do not merge.

---

## Self-Review notes
- **Spec coverage:** A(#1/#2)→T1; B(#3/#4/#5)→T2; C(#8/#9)→T3; D(#10/#11)→T4; E(#12/#13)→T5; F(#14/#16/#17)→T6; G(#18)→T7. #6/#7/#15 excluded (backlog).
- **No state changes** — all read existing fields/cost. T2/T3 read the batch-2 graph `cost`; T6/T17 reuse `node-visuals` color source.
- **Judgment points:** T3 #8 scoring «уже оплачено» rule (own→бесплатно, else→уже оплачено) — flagged for the implementer to express cleanly from in-scope data; T2 #4 fallback when no graph cost.
