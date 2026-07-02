# Block D — Workflow Nodes + Visual States Implementation Plan

**Goal:** Canvas показывает каталог из 13 новых типов нод, 6 шаблонов workflow по `signal.type` и визуальные состояния (selected / needs-attention / processing / just-updated / ready).

**Spec:** `docs/superpowers/specs/2026-04-18-workflow-nodes-design.md`
**Roadmap:** блок D. HEAD main `9d2c125` (после C).

---

## File Structure

**Create:**
- `src/state/workflow-templates.ts` — `createTemplate(signalType)` + 6 функций-шаблонов.
- `src/state/workflow-templates.test.ts` — sanity checks.
- `tests/e2e/block-d.spec.ts` — integration.

**Modify:**
- `src/types/workflow.ts` — extended `WorkflowNodeType`, extra data flags, NODE_CATEGORY, isCommunicationNode.
- `src/sections/campaigns/workflow-node.tsx` — расширенная палитра + иконки + оверлеи состояний + CSS.
- `src/sections/campaigns/workflow-view.tsx` — использовать createTemplate по signalType.
- `src/sections/campaigns/workflow-section.tsx` — прокинуть signalType.

---

## Task 1: Extend workflow type system

- [ ] Add new union members to `WorkflowNodeType` (signal, success, end, wait, condition, merge, sms, email, push, ivr, storefront, landing).
- [ ] Add `processing?: boolean`, `justUpdated?: boolean` to `WorkflowNodeData`.
- [ ] Add `NODE_CATEGORY` map and `isCommunicationNode` helper.
- [ ] Run `npx tsc --noEmit` — verify no errors. Existing code paths using legacy types remain valid.
- [ ] Run `npm test` — 50 tests PASS.
- [ ] Commit: `feat(workflow): extend node type union and data flags`

---

## Task 2: Add workflow templates

- [ ] Create `src/state/workflow-templates.ts`:

Helper similar to legacy makeNode/makeEdge but typed для новых kinds. Either reuse helpers из `src/types/workflow.ts` (expose them) or inline minimal copies.

Implement 6 templates per §6 of the spec. Each template returns `{ nodes, edges }`. `success` node carries `isSuccess: true`.

```ts
import type { SignalType } from "./app-state";
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from "@/types/workflow";

function n(
  id: string,
  label: string,
  nodeType: WorkflowNodeType,
  x: number,
  y: number,
  sublabel?: string,
  extras?: { isSuccess?: boolean }
): WorkflowNode {
  return {
    id,
    type: "workflowNode",
    position: { x, y },
    data: { label, nodeType, sublabel, ...extras },
  };
}

function e(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "default",
    style: { stroke: "#2a2a2a", strokeWidth: 1.5 },
    ...(label ? { label, labelStyle: { fill: "rgba(255,255,255,0.65)", fontSize: 10 } } : {}),
  };
}

function registrationTemplate(): Template { ... }
// (6 templates total)

export const TEMPLATE_BY_TYPE: Record<SignalType, () => Template> = { ... };

export function createTemplate(signalType: SignalType): Template {
  return TEMPLATE_BY_TYPE[signalType]();
}
```

Actual template payloads — держим ≤10 нод каждый, строка сигнала тянется из signal.type названия.

- [ ] Create `src/state/workflow-templates.test.ts` with:
  - For each `SignalType`: `createTemplate(t)` → nodes.length > 2, at least one node has `isSuccess`, all edge endpoints reference existing nodes, all node ids unique.
  - `validateWorkflow(template, true).ok === true` for each.
- [ ] Run `npm test` — new tests green.
- [ ] Commit: `feat(workflow): add 6 signal-type templates`

---

## Task 3: Rewrite `WorkflowNodeComponent`

- [ ] Replace current STYLES map with extended palette per §4 spec. Add legacy-fallback mapping (channel→sms, retarget→condition, result→success, new→(highlight)).
- [ ] Add icon support: lookup `iconFor(nodeType)` that returns a Lucide icon. Use a `const ICON: Record<WorkflowNodeType, LucideIcon>` map.
- [ ] Render: top-left 12px icon beside label. Keep existing label + sublabel.
- [ ] Visual states: read `selected` from `NodeProps` + `processing`, `justUpdated`, `needsAttention`, `isSuccess` from `data`.
  - Add local `<style>` with keyframes per spec §5.
  - Apply classes conditionally: `wf-node-needs-attention`, `wf-node-processing`, `wf-node-just-updated`, `wf-node-selected`.
  - Ready dot (small `span`) top-right when `!needsAttention && !processing && !justUpdated`.
- [ ] Run `npx tsc --noEmit` — clean.
- [ ] Commit: `feat(workflow): render new node types with icons and state overlays`

---

## Task 4: Wire templates into WorkflowView

- [ ] Modify `src/sections/campaigns/workflow-view.tsx`:
  - Add optional `signalType?: SignalType` prop (import type).
  - At graph init, use `createTemplate(signalType)` when provided; otherwise fall back to `createBaseNodes(signalName)` + `createBaseEdges()`.
  - The `graph` state is initialized once — don't reset when props change (existing behaviour) — to avoid losing AI edits.
- [ ] Modify `src/sections/campaigns/workflow-section.tsx`:
  - Pass `signalType={currentSignal?.type}` into `<WorkflowView>`.
- [ ] Run `npm test` + quick dev sanity.
- [ ] Commit: `feat(workflow): load signal-type template in WorkflowView`

---

## Task 5: Playwright Block D integration

- [ ] Create `tests/e2e/block-d.spec.ts`:
  - Upsell campaign (open draft-upsell from mid preset) → Canvas shows labels `Storefront` / `Email` / `SMS` / `Успех` (or their RU equivalents).
  - Retention campaign → Canvas shows `IVR` label.
  - Happy-path and block-c tests unaffected.

To reliably find an Апсейл draft from `mid` preset we need the title to contain "Апсейл". `NewSignalMenu`/reducer-generated names use `${signal.type} #N` for campaigns born via `campaign_from_signal`. Preset-generated campaigns pick from PRETTY_NAMES — a mix. We'll rely on preset generator producing a mix and filter the first draft campaign whose parent signal is of the required type. Simpler: use dev panel → mid preset → Сигналы → find an Апсейл signal → click «Создать кампанию» on it → hits Canvas with Апсейл template.

- [ ] Run `npx playwright test tests/e2e/block-d.spec.ts` — green.
- [ ] Run full suite — happy-path + b + c + d PASS.
- [ ] Commit: `test(e2e): cover Block D templates on canvas`

---

## Task 6: Verify + roadmap update

- [ ] Lint + vitest + Playwright.
- [ ] `MEMORY.md → project_afina_18_04_roadmap.md` — D → `✅ implemented`, HEAD, files list. Next block = E.
- [ ] Commit memory file (outside repo root — memory lives outside, so no git commit required here).

---

## Self-Review Notes

- Spec coverage: §3 / §4 / §5 → Tasks 1 + 3. §6 → Task 2. §7 → Task 4. §9 → Tasks 2 + 5.
- Backward compat: legacy node types preserved in union; existing base graph and `parseWorkflowCommand` untouched; happy-path stays green because it goes through `CampaignTypeView → campaign_selected` where `currentCampaign.signalId` resolves to a real signal (created by step 5 upload). `currentSignal.type` becomes `Регистрация` (default) so Canvas uses registration template. Validation passes (template has success node + signal bound).
- Risks:
  - If registration template doesn't produce a reachable success node, happy-path fails on launch. Spec-guided BFS assertion in Task 2 tests catches this early.
  - Node color palette — if some colors clash with ReactFlow default edge/background, adjust per-template sublabel clarity.
  - Lucide icons bundle size — negligible (already imported elsewhere).
