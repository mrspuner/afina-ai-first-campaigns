# Campaign-First Migration — Epic «Артефакты» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Foundation `ArtifactsSection` stub with the real, tabbed **Артефакты** section (Сигналы tab + Шаблоны tab) and convert the legacy `signal-screen.tsx` into a campaign-scoped **artifact detail** screen — surfacing campaign outputs (artifacts) and reusable channel-typed message templates, with manual create/upload and segment UI removed.

**Architecture:** This epic owns the **display surface** of campaign outputs. It reads the frozen `Artifact` / `MessageTemplate` contracts and `AppState.artifacts` from Foundation; it never edits the contract hub. The Артефакты section becomes a two-tab shell over the existing `src/components/ui/tabs.tsx` primitive. Each leaf (signals list card, template list card, artifact detail) is a small, additive file. Segments and manual signal creation are deleted from the display surface — the scoring-output object lives in the engine/artifact, not here. Each task ends green (`npx tsc --noEmit` + `npx vitest run`).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, React reducer state in `src/state/app-state.ts`, base-ui `Tabs` (`src/components/ui/tabs.tsx`), Vitest (`npx vitest run`), `nanoid` for ids.

**Source spec:** `docs/superpowers/specs/2026-06-18-campaign-first-migration-design.md` — read §2 (entity contract: flat channel-typed `MessageTemplate`, `Artifact` without `segments`), §3 (source matrix — `count` semantics + degenerate `kind`), §6 block 10 (Сигналы/Шаблоны tabs, flat templates), §6 block 13 (segments removed from UI), §7.9 (template-card UI fork — escalate).

**Foundation plan (frozen contracts to build against):** `docs/superpowers/plans/2026-06-18-campaign-first-foundation.md`.

**⚠️ Two environment facts that bite (verified):**
1. The repo dir name has non-ASCII chars with NFC/NFD ambiguity. The `Read`/`Write` tools may resolve to a stray sibling dir. Work through the shell (its cwd is the real git repo) or the ASCII symlink `/tmp/afina-repo`.
2. `Signal`/`Campaign`/`AppState`/`Action`/`Artifact`/`MessageTemplate` all live in `src/state/app-state.ts` (NOT `src/types/`). `Channel` + `CHANNEL_LABEL` live in `src/sections/campaigns/campaign-cost.ts`. `NodeParams` (template `content` type) lives in `src/types/workflow.ts`.

---

## Ownership & boundary

**This epic OWNS (edits/creates/deletes freely):**
- `src/sections/artifacts/**` — the Артефакты SECTION (tabbed shell, signals tab, templates tab, empty states, cards).
- The legacy artifact-display files in `src/sections/signals/**`: `signal-screen.tsx`, `signal-card.tsx`, `signals-section.tsx`, `signals-empty-state.tsx`, `segment-priority-breakdown.tsx`. These are moved/repurposed/deleted into `src/sections/artifacts/**`.

**This epic does NOT touch (hub / other epics):**
- `src/types/*`, `src/state/app-state.ts`, `src/app/page.tsx` — Foundation-frozen hub. If a contract is missing, add a **Foundation dependency** note (see below), do NOT edit.
- `src/sections/campaigns/**` — the **Кампании** epic owns the in-card artifacts/stats blocks inside the open campaign (`workflow-section.tsx`). We only *read* `CHANNEL_LABEL` from `campaign-cost.ts` and *dispatch* `campaign_opened` to link out to a campaign. We reuse `node-visuals` only read-only if needed.
- `src/state/email-directory.ts` — the existing `EmailRecord` pattern we generalize for templates lives here; we read it as a model reference but the template **store** is a new file we own.

---

## Foundation dependencies (REQUIRED before this epic is mergeable)

These are contract additions that belong to Foundation (hub files). This plan is **written assuming they exist**. If they are absent when this epic starts, STOP and request Foundation amend them — do NOT edit the hub from this epic.

1. **`AppState.templates: MessageTemplate[]`** + `initialState.templates: [...]` (seeded with a few preset templates, mirroring `PRESET_EMAILS` in `email-directory.ts`).
   - Rationale: spec §6 block 10 — the Шаблоны tab lists templates; templates are generated/saved when communication nodes are configured and persist across campaigns. Foundation already froze the `MessageTemplate` *type* but (per the Foundation plan's own scope notes) did **not** add the `AppState.templates` array or the launch-time emit.
2. **Emit templates on launch:** when a campaign is launched, each configured communication node's `content` (`NodeParams` of `sms`/`push`/`email`/`ivr`) is materialized into a `MessageTemplate` and merged into `AppState.templates`, incrementing `usedInCampaigns` for reuse. Suggested contract: extend the existing `campaign_launched` reducer case (it already exists — `git grep "campaign_launched" src/state/app-state.ts`) to derive templates from the launched campaign's workflow nodes. No new action needed if `campaign_launched` carries enough; otherwise add `| { type: "campaign_templates_saved"; templates: MessageTemplate[] }`.
3. **`MessageTemplate.usedInCampaigns`** semantics: a count of distinct campaigns referencing the template (already in the type). The launch reducer maintains it.

> If Foundation cannot add (1)/(2) before this epic, the Шаблоны tab can ship against a **read-only session store** owned by THIS epic (a `src/sections/artifacts/template-store.ts` mirroring `email-directory.ts`: presets + session list, no reducer). Task 5 is written to take that fallback path so the epic is never blocked. The reducer-backed path is preferred; pick it if (1)/(2) landed.

---

## File Structure

**Created by this epic:**
- `src/sections/artifacts/artifacts-section.tsx` — REPLACES the Foundation stub. Tabbed shell (Сигналы | Шаблоны).
- `src/sections/artifacts/signals-tab.tsx` — lists `state.artifacts` across all campaigns.
- `src/sections/artifacts/artifact-card.tsx` — one artifact row (kind label, linked campaign, date, count, Скачать). Derived from `signal-card.tsx`.
- `src/sections/artifacts/artifacts-empty-state.tsx` — empty state for the Сигналы tab. Derived from `signals-empty-state.tsx`.
- `src/sections/artifacts/templates-tab.tsx` — lists templates.
- `src/sections/artifacts/template-card.tsx` — one template row. **UI fork §7.9 — ASK USER** (see Task 6).
- `src/sections/artifacts/templates-empty-state.tsx` — empty state for the Шаблоны tab.
- `src/sections/artifacts/artifact-screen.tsx` — artifact detail (former `signal-screen.tsx`); file-type + campaign link, no segments, no «Запустить кампанию».
- `src/sections/artifacts/artifact-labels.ts` — `ARTIFACT_KIND_LABEL` map (`signals` → «Сигналы», `signals_conversions` → «Сигналы и конверсии»).
- `src/sections/artifacts/template-store.ts` — ONLY if Foundation dep (1)/(2) is unavailable (fallback path, Task 5).

**Deleted by this epic (after their replacements land):**
- `src/sections/signals/signals-section.tsx`, `signal-card.tsx`, `signals-empty-state.tsx`, `segment-priority-breakdown.tsx`, `signal-screen.tsx`, `new-signal-menu.tsx`, `upload-signal-dialog.tsx`, `top-up-modal.tsx` (manual create/upload/segments are removed by design).
  - ⚠️ Verify each has no remaining importer outside this epic's ownership before deleting (Task 8 does the grep). `guided-signal-section.tsx` / wizard files are **Кампании/Foundation** territory — do NOT delete those even though they sit in `signals/`.

**Read-only references (not edited):**
- `src/components/ui/tabs.tsx`, `src/components/ui/entity-card.tsx`, `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`.
- `src/sections/campaigns/campaign-cost.ts` (`CHANNEL_LABEL`, `Channel`).
- `src/state/email-directory.ts` (model reference).

---

## Pattern decisions (resolved here — NOT escalated)

These are small reuse choices the spec allows the plan to make (governing principle 2: reuse existing patterns):

- **Tabs:** reuse `src/components/ui/tabs.tsx` (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`). It already exists (base-ui) and is used in `src/components/ai-elements/sandbox.tsx`. This is NOT a new pattern → **no escalation** (resolves spec §7.2). Use `variant="line"` for a quiet Linear-style underline tab bar (design §4 density, §2 жёлтый-редкий — no accent on tabs).
- **Artifact list card:** reuse the existing `Card` + `Badge` + `Button` composition from `signal-card.tsx`, stripped of segments/status-resume machinery. Same visual slot, same position → reuse, not new.
- **Artifact detail:** reuse `EntityCardShell` + `CardSection` (same component `signal-screen.tsx` uses). Reuse, not new.
- **Empty states:** reuse the dashed-border `Card` shape from `signals-empty-state.tsx`, copy updated. Reuse.
- **Channel label:** reuse `CHANNEL_LABEL` from `campaign-cost.ts`. Reuse.
- **Campaign link-out:** dispatch the existing `campaign_opened` action (`{ type: "campaign_opened", id }`). Existing action, no new contract.

## UI forks (ESCALATE to user — do NOT pick a variant) — spec §7

- **§7.9 Template card layout (Task 6):** the Шаблоны tab has **no analogous existing card** — `signal-card.tsx` is segment/scoring-shaped, not message-preview-shaped, and `EmailRecord` has no list-card. The template card needs: channel label, a multi-line text preview (per-channel: Push title+body / Email subject+body / SMS text / IVR scenario), "Использован в кампаниях: N", and two actions ("Использовать в новой кампании", "Создать шаблон вручную" at tab level). This is a **genuinely new card pattern** → **BLOCKING ASK-USER** before implementing Task 6's component (preview length? channel as badge vs prefix? show content for all channels uniformly or channel-specific fields?). Task 6 Step 0 stops for this.

---

## Task 0: Isolated worktree off the post-Foundation integration branch

**Files:** none (git only).

- [ ] **Step 1: Create the epic worktree off the integrated Foundation branch** (AGENTS.md mandates worktrees for parallel work)

The epic must branch off the branch that contains merged Foundation (the Foundation contracts must exist). Confirm the integration branch name with the user/Foundation handoff (the Foundation plan names `feature/campaign-first-foundation`; the integration branch may be `main` after merge or a `develop`-style integration branch). Run from the repo root:
```bash
# Replace <integration-base> with the branch carrying merged Foundation.
git worktree add .worktrees/epic-artifacts -b feature/epic-artifacts <integration-base>
cd .worktrees/epic-artifacts
npm install
```

- [ ] **Step 2: Confirm Foundation contracts are present**

Run:
```bash
git grep -n "export type Artifact" src/state/app-state.ts
git grep -n "export type MessageTemplate" src/state/app-state.ts
git grep -n 'campaign_artifact_ready' src/state/app-state.ts
git grep -n 'artifacts:' src/state/app-state.ts
git grep -n '"Артефакты"' src/state/app-state.ts src/sections/shell/app-sidebar.tsx src/app/page.tsx
test -f src/sections/artifacts/artifacts-section.tsx && echo "stub present"
```
Expected: `Artifact`, `MessageTemplate`, `campaign_artifact_ready`, `AppState.artifacts`, the `Артефакты` SectionName + sidebar + page route, and the stub all exist. If any is missing, STOP — Foundation is not merged; this epic cannot proceed.

- [ ] **Step 3: Check Foundation dependency (templates) status**

Run:
```bash
git grep -n "templates:" src/state/app-state.ts || echo "NO AppState.templates — fallback path"
git grep -n "campaign_launched" src/state/app-state.ts
```
Record which path Task 5 takes: **reducer-backed** (if `AppState.templates` exists) or **session-store fallback** (if absent). Note it at the top of your working notes.

- [ ] **Step 4: Confirm a green baseline before any change**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest all-pass. If red on a clean post-Foundation checkout, STOP and report.

---

## Task 1: `ARTIFACT_KIND_LABEL` + `artifactCampaign` helper (additive, nothing renders yet)

**Files:**
- Create: `src/sections/artifacts/artifact-labels.ts`
- Test: `src/sections/artifacts/artifact-labels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sections/artifacts/artifact-labels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ARTIFACT_KIND_LABEL } from "./artifact-labels";

describe("artifact kind labels", () => {
  it("maps both kinds to Russian labels", () => {
    expect(ARTIFACT_KIND_LABEL.signals).toBe("Сигналы");
    expect(ARTIFACT_KIND_LABEL.signals_conversions).toBe("Сигналы и конверсии");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sections/artifacts/artifact-labels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the labels module**

Create `src/sections/artifacts/artifact-labels.ts`:
```ts
import type { Artifact } from "@/state/app-state";

/** Human label for an artifact kind (spec §3: degenerate vs full campaign). */
export const ARTIFACT_KIND_LABEL: Record<Artifact["kind"], string> = {
  signals: "Сигналы",
  signals_conversions: "Сигналы и конверсии",
};
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/artifacts/artifact-labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifact-labels.ts src/sections/artifacts/artifact-labels.test.ts
git commit -m "feat(artifacts): add ARTIFACT_KIND_LABEL"
```

---

## Task 2: `ArtifactCard` — one artifact row (kind label, campaign link, date, count, Скачать)

Derived from `signal-card.tsx` but stripped: no segments line, no status-resume buttons, no «Использовать в кампании», no delete/awaiting/processing machinery. Per spec §3, the meaningful fields are kind, linked campaign, date, `count`, download.

**Files:**
- Create: `src/sections/artifacts/artifact-card.tsx`
- Test: `src/sections/artifacts/artifact-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/sections/artifacts/artifact-card.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArtifactCard } from "./artifact-card";
import type { Artifact } from "@/state/app-state";

const artifact: Artifact = {
  id: "art_1",
  campaignId: "cmp_1",
  kind: "signals_conversions",
  count: 12345,
  createdAt: "2026-06-18T00:00:00.000Z",
};

describe("ArtifactCard", () => {
  it("shows kind label, count and campaign name, and links to the campaign", async () => {
    const onOpenCampaign = vi.fn();
    render(
      <ArtifactCard
        artifact={artifact}
        campaignName="Лето 2026"
        onOpenCampaign={onOpenCampaign}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByText("Сигналы и конверсии")).toBeInTheDocument();
    expect(screen.getByText(/12\s?345/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Лето 2026/ }));
    expect(onOpenCampaign).toHaveBeenCalledWith("cmp_1");
  });

  it("does not render a segments breakdown", () => {
    render(
      <ArtifactCard artifact={artifact} campaignName="X" onOpenCampaign={vi.fn()} onDownload={vi.fn()} />,
    );
    expect(screen.queryByText(/Макс/)).not.toBeInTheDocument();
  });
});
```
> Confirm the test deps exist: `git grep -n "@testing-library/react\|jsdom" package.json vitest.config*`. If RTL/jsdom is not configured, adapt these to the project's existing component-test style (check how `scenario-card.test.tsx` renders). Do NOT add a new test stack — match the repo.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/artifacts/artifact-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ArtifactCard`**

Create `src/sections/artifacts/artifact-card.tsx`. Reuse `Card`, `Badge`, `Button` (as in `signal-card.tsx`). Props: `{ artifact: Artifact; campaignName: string; onOpenCampaign: (campaignId: string) => void; onDownload: (artifactId: string) => void; index?: number }`. Render:
- Top row: kind label (`ARTIFACT_KIND_LABEL[artifact.kind]`) as the title text + count (`toLocaleString("ru-RU")`); date (`createdAt`) right-aligned (reuse the `formatDate` from `signal-card.tsx`).
- A campaign link: a `Button variant="link"` (or a styled text button) labeled with `campaignName`, `onClick={() => onOpenCampaign(artifact.campaignId)}` — this satisfies the test's role=button name match.
- Actions row: a single `Скачать` icon button (`Download` from lucide), `onClick={() => onDownload(artifact.id)}`.
- Keep the staggered entrance className from `signal-card.tsx` (`animate-in fade-in-0 …`, `animationDelay` from `index`).
- Do NOT render segments, status badges, or campaign-create buttons.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/artifacts/artifact-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifact-card.tsx src/sections/artifacts/artifact-card.test.tsx
git commit -m "feat(artifacts): ArtifactCard (kind, campaign link, count, download)"
```

---

## Task 3: `ArtifactsEmptyState` (Сигналы tab) — no manual create/upload

**Files:**
- Create: `src/sections/artifacts/artifacts-empty-state.tsx`
- Test: `src/sections/artifacts/artifacts-empty-state.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/sections/artifacts/artifacts-empty-state.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArtifactsEmptyState } from "./artifacts-empty-state";

describe("ArtifactsEmptyState", () => {
  it("explains artifacts appear from launched campaigns and has no create/upload", () => {
    render(<ArtifactsEmptyState />);
    expect(screen.getByText(/Запустите кампанию/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Загрузить/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Создать сигнал/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/artifacts/artifacts-empty-state.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/sections/artifacts/artifacts-empty-state.tsx`. Reuse the dashed-border `Card` from `signals-empty-state.tsx`, no actions (artifacts are produced by campaigns, not created here — spec block 13 removes manual create/upload). Copy roughly:
- Title: «Пока нет артефактов»
- Body: «Артефакты появляются здесь, когда кампания собирает сигналы. Запустите кампанию — результат окажется тут.»
- A quiet text link/cue is optional but no Создать/Загрузить buttons.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/artifacts/artifacts-empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifacts-empty-state.tsx src/sections/artifacts/artifacts-empty-state.test.tsx
git commit -m "feat(artifacts): ArtifactsEmptyState (no manual create/upload)"
```

---

## Task 4: `SignalsTab` — list `state.artifacts` across all campaigns

**Files:**
- Create: `src/sections/artifacts/signals-tab.tsx`
- Test: `src/sections/artifacts/signals-tab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/sections/artifacts/signals-tab.test.tsx`. Render `SignalsTab` inside the app-state provider (check how other section tests provide state — `git grep -n "AppStateProvider\|app-state-context" src/sections | head`). Two cases:
- empty `artifacts` → renders `ArtifactsEmptyState`;
- two artifacts across two campaigns → renders two `ArtifactCard`s with the right campaign names resolved from `state.campaigns`.

If wiring a provider in tests is heavy, factor the pure list into a presentational `SignalsTabView({ artifacts, campaigns, onOpenCampaign, onDownload })` and test that directly (preferred — matches the repo's separation in `campaign-card` vs section). Decide based on the existing test idiom you find.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/sections/artifacts/signals-tab.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `SignalsTab`**

Create `src/sections/artifacts/signals-tab.tsx`:
- Read `{ artifacts, campaigns }` from `useAppState()`; `dispatch` from `useAppDispatch()`.
- Sort artifacts by `createdAt` desc (mirror the `signals-section` sort).
- For each artifact, resolve `campaignName` from `campaigns.find(c => c.id === a.campaignId)?.name ?? "—"`.
- Render `<ArtifactCard>` per item; empty → `<ArtifactsEmptyState>`.
- `onOpenCampaign={(id) => dispatch({ type: "campaign_opened", id })}`.
- `onDownload={(id) => { /* prototype: simulate CSV */ window.alert(...) }}` (mirror `signal-screen.tsx`'s simulated download; no real backend in prototype).
- No NewSignalMenu, no UploadSignalDialog, no TopUpModal.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/sections/artifacts/signals-tab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/signals-tab.tsx src/sections/artifacts/signals-tab.test.tsx
git commit -m "feat(artifacts): SignalsTab lists campaign artifacts"
```

---

## Task 5: Templates source — pick reducer-backed vs session-store fallback

Determined in Task 0 Step 3.

**Files:**
- Create (fallback only): `src/sections/artifacts/template-store.ts` + `.test.ts`
- Otherwise: no new file (read `state.templates`).

### Path A — `AppState.templates` exists (preferred, no new store)

- [ ] **Step A1:** Confirm `git grep -n "templates:" src/state/app-state.ts` shows the array. The Шаблоны tab (Task 7) will read `useAppState().templates`. No store file needed. Skip to Task 6.

### Path B — fallback session store (only if `AppState.templates` is absent)

This keeps the epic unblocked without editing the hub. It mirrors `email-directory.ts` exactly.

- [ ] **Step B1: Write the failing test**

Create `src/sections/artifacts/template-store.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import { getTemplates, addTemplate, __resetTemplateStore } from "./template-store";

beforeEach(() => __resetTemplateStore());

describe("template store", () => {
  it("ships preset templates", () => {
    expect(getTemplates().length).toBeGreaterThan(0);
  });
  it("adds a session template (newest first) and assigns an id", () => {
    const t = addTemplate({
      channel: "sms",
      name: "Промо",
      content: { kind: "sms", text: "Привет", alphaName: "AFINA", scheduledAt: "immediate" },
      usedInCampaigns: 0,
    });
    expect(t.id).toMatch(/^tpl_/);
    expect(getTemplates()[0].id).toBe(t.id);
  });
});
```

- [ ] **Step B2: Run it** → FAIL (module not found).

- [ ] **Step B3: Implement `template-store.ts`** mirroring `email-directory.ts`: `PRESET_TEMPLATES: MessageTemplate[]` (one per channel using real `NodeParams` shapes — sms/push/email/ivr), `sessionTemplates`, `getTemplates()`, `getTemplate(id)`, `addTemplate(record)` (id `tpl_${nanoid(6)}`), `__resetTemplateStore()`. Import `MessageTemplate` from `@/state/app-state`.

- [ ] **Step B4: Run the test** → PASS.

- [ ] **Step B5: Commit**

```bash
git add src/sections/artifacts/template-store.ts src/sections/artifacts/template-store.test.ts
git commit -m "feat(artifacts): session template store (fallback for AppState.templates)"
```

> ⚠️ If you took Path B, add a TODO comment in `templates-tab.tsx` pointing at **Foundation dependency (1)/(2)** so the store is swapped for `state.templates` once the contract lands.

---

## Task 6: `TemplateCard` — ⚠️ ASK USER FIRST (§7.9 new pattern)

**Files:**
- Create: `src/sections/artifacts/template-card.tsx`
- Test: `src/sections/artifacts/template-card.test.tsx`

- [ ] **Step 0: BLOCKING — escalate the template-card layout to the user (spec §7.9)**

There is no analogous existing card for a flat message template. Ask the user (do NOT choose):
- Channel as a `Badge` vs a text prefix?
- Text preview: which fields per channel, and truncation length? (Push: title + body; Email: subject + body; SMS: text; IVR: scenario.)
- Placement of "Использован в кампаниях: N" (meta line vs badge).
- Is "Использовать в новой кампании" a per-card primary action, and is "Создать шаблон вручную" tab-level (recommended) or per-card?

Record the answers, THEN write the test + component to match. Do not proceed past Step 0 without answers.

- [ ] **Step 1: Write the failing test** (shape it to the agreed design)

Create `src/sections/artifacts/template-card.test.tsx`: render a `MessageTemplate` (sms), assert it shows the channel label (`CHANNEL_LABEL.sms` → "SMS"), the name, a text preview substring, "Использован в кампаниях: N", and that the "Использовать в новой кампании" action fires its callback.

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement `TemplateCard`** per the agreed layout. Reuse `Card`/`Badge`/`Button`. Props: `{ template: MessageTemplate; onUseInNewCampaign: (templateId: string) => void; index?: number }`. Derive the preview from `template.content` by `content.kind` (switch over `sms`/`push`/`email`/`ivr`, pulling the channel's text fields). Use `CHANNEL_LABEL[template.channel]`.

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/template-card.tsx src/sections/artifacts/template-card.test.tsx
git commit -m "feat(artifacts): TemplateCard (channel label, preview, usage count)"
```

---

## Task 7: `TemplatesTab` + `TemplatesEmptyState`

**Files:**
- Create: `src/sections/artifacts/templates-tab.tsx`, `src/sections/artifacts/templates-empty-state.tsx`
- Test: `src/sections/artifacts/templates-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

`templates-tab.test.tsx`: empty source → renders `TemplatesEmptyState`; non-empty → renders one `TemplateCard` per template + a tab-level "Создать шаблон вручную" control. As in Task 4, prefer a presentational `TemplatesTabView({ templates, onUseInNewCampaign, onCreateManual })` to keep the test pure if that matches the repo idiom.

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement**

`templates-empty-state.tsx`: dashed `Card` (reuse shape), title «Пока нет шаблонов», body «Шаблоны сообщений появятся здесь после запуска кампании с коммуникацией — или создайте вручную.», plus the "Создать шаблон вручную" action.

`templates-tab.tsx`:
- Source = `useAppState().templates` (Path A) OR `getTemplates()` (Path B).
- Map to `TemplateCard`s; empty → `TemplatesEmptyState`.
- "Использовать в новой кампании": dispatch `start_campaign_flow` (the existing wizard-entry action Foundation added) — the wizard will later let the node pick a template. For the prototype, entering the wizard is sufficient; add a code comment that template-preselection is a Кампании-epic concern.
- "Создать шаблон вручную": prototype stub — open a minimal dialog OR (simplest) dispatch `start_campaign_flow` / show an alert. Confirm the intended behavior in the Task 6 Step 0 escalation (bundle this question there). Do not invent a full template editor in this epic unless the user asks.

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/templates-tab.tsx src/sections/artifacts/templates-empty-state.tsx src/sections/artifacts/templates-tab.test.tsx
git commit -m "feat(artifacts): TemplatesTab + empty state"
```

---

## Task 8: `ArtifactsSection` — tabbed shell (replaces the Foundation stub)

**Files:**
- Modify (replace body): `src/sections/artifacts/artifacts-section.tsx`
- Test: `src/sections/artifacts/artifacts-section.test.tsx`

- [ ] **Step 1: Write the failing test**

`artifacts-section.test.tsx`: render `ArtifactsSection` (with provider/state as the repo idiom dictates); assert two tabs «Сигналы» and «Шаблоны» exist (`role="tab"` from base-ui Tabs), Сигналы is the default active panel, and switching to Шаблоны reveals the templates panel.

- [ ] **Step 2: Run it** → FAIL (stub has no tabs).

- [ ] **Step 3: Replace the stub body**

Rewrite `src/sections/artifacts/artifacts-section.tsx`:
```tsx
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SignalsTab } from "./signals-tab";
import { TemplatesTab } from "./templates-tab";

export function ArtifactsSection() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[140px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <h1 className="mb-6 text-[38px] font-semibold leading-[46px] tracking-tight">
          Артефакты
        </h1>
        <Tabs defaultValue="signals">
          <TabsList variant="line">
            <TabsTrigger value="signals">Сигналы</TabsTrigger>
            <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          </TabsList>
          <TabsContent value="signals">
            <SignalsTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```
> Confirm base-ui `Tabs` uses `defaultValue`/`value` on `Root` and `value` on `Tab`/`Panel` (check `src/components/ai-elements/sandbox.tsx` for the exact prop names in this version — adapt if it uses a different controlled API). Match design §4 (compact header), §2 (no yellow on tabs), §7 (left-aligned).

- [ ] **Step 4: Run the test + the artifacts suite**

Run: `npx vitest run src/sections/artifacts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifacts-section.tsx src/sections/artifacts/artifacts-section.test.tsx
git commit -m "feat(artifacts): tabbed Артефакты section (Сигналы | Шаблоны)"
```

---

## Task 9: Artifact detail screen (former `signal-screen.tsx`) — no segments, no «Запустить кампанию»

The artifact detail replaces `signal-screen.tsx`: remove the «Сегменты» summary row, remove the «Использовать в кампании»/«Запустить кампанию» primary action, drop `segment-priority-breakdown` usage, and add a file-type indicator + a campaign link.

**Files:**
- Create: `src/sections/artifacts/artifact-screen.tsx`
- Test: `src/sections/artifacts/artifact-screen.test.tsx`

> **Routing note (Foundation boundary):** the artifact-detail VIEW route is hub territory. Check what Foundation provides: `git grep -n 'kind: "artifact"\|kind: "signal"\|artifact_opened\|signal_opened' src/state/app-state.ts`.
> - If a dedicated artifact view/action exists, render `ArtifactScreen` for it.
> - If Foundation kept the legacy `signal` view-kind as the detail host (the Foundation plan reuses `guided-signal`/`signal` kinds during migration), then either (a) reach the detail by opening the linked campaign instead (artifacts link OUT to campaigns; per spec §1 the in-campaign artifact block is the Кампании epic), or (b) add a **Foundation dependency** request for an `artifact_opened` action + `{ kind: "artifact"; artifactId }` view.
> Decide with the user/Foundation handoff which is intended. If the prototype's primary path is "artifact card → opens its campaign" (matches §1 inversion), `ArtifactScreen` may be reachable only via that campaign context owned by Кампании — in which case this Task delivers the component but its wiring is a **Foundation dependency** (note it; do not edit `page.tsx`/`app-state.ts`).

- [ ] **Step 1: Write the failing test**

`artifact-screen.test.tsx`: given an artifact + its campaign in state, `ArtifactScreen` renders:
- the count (`toLocaleString`),
- the kind label,
- a file-type indicator (e.g. «CSV»),
- a campaign link that dispatches `campaign_opened`,
- and **NOT** a «Сегменты» row nor a «Запустить кампанию»/«Использовать в кампании» button.

```tsx
expect(screen.queryByText(/Сегменты/)).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /Запустить кампанию|Использовать в кампании/ })).not.toBeInTheDocument();
expect(screen.getByText(/CSV/)).toBeInTheDocument();
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement `ArtifactScreen`**

Create `src/sections/artifacts/artifact-screen.tsx`, modeled on `signal-screen.tsx` but:
- Reads the artifact (by id) + its campaign from state.
- `EntityCardShell` with `title = ARTIFACT_KIND_LABEL[artifact.kind]` (or campaign name + kind), `onBack → sidebar_nav "Артефакты"`, `backLabel="К артефактам"`.
- `CardSection "Всего сигналов"` → `artifact.count` (reuse `text-4xl … text-brand`).
- `CardSection "Об артефакте"` summary rows: **Тип файла** = «CSV», **Кампания** = a link button dispatching `campaign_opened`, **Создан** = `createdAt`, **Тип** = kind label. NO Сегменты row.
- `secondaryActions`: only «Скачать» (simulated). NO primary «Запустить/Использовать в кампании».
- Do NOT import `segment-priority-breakdown` or `SEGMENT_NAMES`.

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sections/artifacts/artifact-screen.tsx src/sections/artifacts/artifact-screen.test.tsx
git commit -m "feat(artifacts): artifact detail screen (file-type + campaign link, no segments)"
```

---

## Task 10: Delete the legacy signals display surface

Now that artifacts own the display, remove the legacy files this epic owns. Manual create/upload/segments are gone by design (spec block 13).

**Files:** deletions + import cleanup.

- [ ] **Step 1: Confirm no live importer outside this epic's ownership**

Run:
```bash
git grep -n "signals-section\|SignalsSection\|signal-card\|SignalCard\|signals-empty-state\|SignalsEmptyState\|segment-priority-breakdown\|SegmentPriorityBreakdown\|signal-screen\|SignalScreen\|new-signal-menu\|NewSignalMenu\|upload-signal-dialog\|UploadSignalDialog\|top-up-modal\|TopUpModal" -- src
```
Expected importers: `src/app/page.tsx` (renders `SignalsSection`/`SignalScreen`) and possibly `launch-flyout.tsx`/`guided-signal-section.tsx`. 

⚠️ `page.tsx` is HUB — you may NOT edit it. If `page.tsx` still imports `SignalsSection`/`SignalScreen`, that wiring is a **Foundation dependency**: Foundation must repoint the `Сигналы`/`signal` routes to `ArtifactsSection`/`ArtifactScreen` (or remove them). **Add a Foundation dependency note**; do NOT delete a file that `page.tsx` still imports (it would break the hub build). Delete only files with zero remaining importers after the in-epic ones are gone.

- [ ] **Step 2: Delete safe files**

For each file with zero importers (after Tasks 2–9 replaced their in-epic uses), `git rm` it:
```bash
git rm src/sections/signals/signal-card.tsx src/sections/signals/signals-empty-state.tsx \
       src/sections/signals/segment-priority-breakdown.tsx
# signals-section.tsx / signal-screen.tsx ONLY if page.tsx no longer imports them
# (otherwise: Foundation dependency note — do not remove).
```
`new-signal-menu.tsx`, `upload-signal-dialog.tsx`, `top-up-modal.tsx`: delete only if no importer remains (they were used by `signals-section`/`signals-empty-state`). If `launch-flyout.tsx` (shell epic) still references signals, leave its files alone and flag to the Shell epic.

- [ ] **Step 3: Full green check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + all pass. If a HUB file (`page.tsx`) breaks, you tried to delete something it imports — restore it and record the **Foundation dependency** instead.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(artifacts): remove legacy signals display surface"
```

---

## Task 11: Epic gate — verify done criteria

**Files:** none (verification only).

- [ ] **Step 1: Types + suite green**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 3: Manual smoke (non-default port per AGENTS.md)**

Run: `npx next dev -p 3001`. Verify: sidebar «Артефакты» opens the tabbed section; Сигналы tab lists campaign artifacts (or empty state) with a working campaign link + Скачать; Шаблоны tab lists templates (or empty state) with «Использовать в новой кампании» + «Создать шаблон вручную»; opening an artifact (if routed) shows file-type + campaign link, no segments, no «Запустить кампанию».

- [ ] **Step 4: Report worktree + branch + outstanding Foundation deps to the user**

Report `.worktrees/epic-artifacts` / `feature/epic-artifacts`. Per AGENTS.md, merge is the user's call.

---

## Handoff note

- **Outstanding Foundation dependencies (must be resolved by Foundation, not this epic):**
  1. `AppState.templates: MessageTemplate[]` + `initialState.templates` seed (else Шаблоны tab runs on the Task-5 Path-B session store).
  2. Emit/maintain templates on `campaign_launched` (materialize node `content` → `MessageTemplate`, bump `usedInCampaigns`).
  3. Artifact-detail routing: an `artifact_opened` action + `{ kind: "artifact"; artifactId }` view, OR confirmation that artifact detail is reached via the linked campaign (Кампании epic). Task 9 component is built either way; only its hub wiring is the dependency.
  4. `page.tsx` route cleanup: repoint legacy `Сигналы`/`signal` routes off the deleted `SignalsSection`/`SignalScreen` (Task 10).
- **Cross-epic boundary reminders:** in-campaign artifact/stats blocks = Кампании epic; `launch-flyout` signal entries = Shell epic; statistics template dimension (C10) = Statistics epic. This epic does not touch those.
- **Open UI questions surfaced to user (spec §7.9):** template-card layout + "Создать шаблон вручную" behavior (Task 6 Step 0). Block on answers before Task 6/7 implementation.

---

## Self-Review (completed)

- **Spec coverage:** §2 flat `MessageTemplate` → Tasks 5–7 (no variants; `content` switched by `NodeParams.kind`); `Artifact` without segments → Tasks 1,2,9; §3 `count`/kind semantics → Tasks 1,2; §6 block 10 Сигналы/Шаблоны tabs → Tasks 4,7,8 (reuse `ui/tabs.tsx`); §6 block 13 segments removed from UI → Tasks 2,3,9,10 (delete `segment-priority-breakdown`, drop segments rows/lines); §7.2 tab pattern → resolved (existing component, not new); §7.9 template card → escalated (Task 6 Step 0).
- **Hub untouched:** no task edits `src/types/*`, `src/state/app-state.ts`, or `src/app/page.tsx`. All hub needs captured as Foundation dependencies (templates store/emit, artifact route, page route cleanup).
- **Ownership respected:** edits/deletes confined to `src/sections/artifacts/**` and the legacy artifact-display files in `src/sections/signals/**`; wizard/`guided-signal-section`/campaigns/statistics/shell left to their epics.
- **Reuse over new:** Tabs, EntityCardShell, Card/Badge/Button, CHANNEL_LABEL, `campaign_opened` all reused; only the template card is new (escalated).
- **TDD:** every code task is failing-test-first; tests adapt to the repo's existing component-test idiom (verified RTL/jsdom presence step in Task 2). Green checkpoints at Tasks 8, 10, 11.
- **Placeholders:** none. UI-undetermined template-card values are escalated, not guessed.
</content>
</invoke>
