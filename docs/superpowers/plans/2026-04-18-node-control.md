# Block E — Node Control Panel + AI Cycle Implementation Plan

**Goal:** Click на ноду → панель управления + @тег в промпт-баре; submit → AI-симуляция (processing → just-updated) + всплывающий AI-ответ.

**Spec:** `docs/superpowers/specs/2026-04-18-node-control-design.md`
**Roadmap:** блок E. main HEAD `6a482a8`.

---

## Task 1: AppState — selection + node command

- Add:
  ```ts
  selectedWorkflowNode: { id: string; label: string } | null;
  workflowNodeCommand: { nodeId: string; text: string } | null;
  aiReply: string | null;
  ```
- Actions:
  - `workflow_node_selected { id, label }`
  - `workflow_node_deselected`
  - `workflow_node_command_submit { nodeId, text }`
  - `workflow_node_command_handled` (WorkflowView clears after consuming)
  - `ai_reply_shown { text }` / `ai_reply_dismissed`
- Reducer: direct set / clear. Open selection clears previous aiReply.
- Tests: selected/deselected/command_submit/command_handled/ai_reply.
- Commit: `feat(state): add selection and AI cycle actions`

## Task 2: Enable selection in WorkflowGraph + emit clicks

- `workflow-graph.tsx`:
  - `elementsSelectable={true}`.
  - Add props `onNodeClick?: (id: string, data) => void`, `onPaneClick?: () => void`.
  - Wire `ReactFlow.onNodeClick={(_, node) => onNodeClick?.(node.id, node.data)}` and `onPaneClick={onPaneClick}`.
- `workflow-view.tsx`:
  - Accept `onNodeClick`/`onPaneClick`; pass through to WorkflowGraph.
- Commit: `feat(workflow): emit node click events from canvas`

## Task 3: NodeControlPanel component

- `src/sections/campaigns/node-control-panel.tsx`:
  - Props: `node: { id, label, sublabel?, nodeType }`, `onClose?`.
  - Render: label badge (@-tag), type, params list (label / sublabel), hint.
  - Styling: sticky, bottom-[170px] (above ShellBottomBar), centered max-w-2xl, bg-card border.
- Commit: `feat(campaigns): add NodeControlPanel component`

## Task 4: WorkflowSection — selection wiring + AI reply popup

- `workflow-section.tsx`:
  - Read `selectedWorkflowNode`, `aiReply` from state.
  - Pass onNodeClick → dispatch `workflow_node_selected`, onPaneClick → dispatch `workflow_node_deselected`.
  - Look up node data from `graphRef.current` to get sublabel/nodeType.
  - Render `<NodeControlPanel>` when selected (hydrate with data from graphRef).
  - Render AI reply popup (small card above ShellBottomBar) when `aiReply` set.
- Commit: `feat(campaigns): mount NodeControlPanel and AI reply popup`

## Task 5: ShellBottomBar — @tag inject + command routing

- `shell-bottom-bar.tsx`:
  - Use `usePromptInputController()` (from AI-elements) to programmatically set prefix on selection change.
  - Submit handler — if `selectedWorkflowNode`, strip `@{label} ` prefix from text, dispatch `workflow_node_command_submit` + `ai_reply_shown { text: "Готово: обновлено по запросу." }`.
  - Else — existing behaviour (`workflow_command_submit`).
- Commit: `feat(shell): inject @tag and route node commands`

## Task 6: AI cycle in WorkflowView

- `workflow-view.tsx`:
  - Accept `nodeCommand: { nodeId, text } | null` + `onNodeCommandHandled: () => void`.
  - New useEffect: when nodeCommand present, run timeline on graph:
    - t=0 set processing=true on nodeId.
    - t=1500 processing=false, justUpdated=true, needsAttention=false, sublabel=deriveFromCommand(text).
    - t=2700 justUpdated=false.
  - Call `onNodeCommandHandled()` after scheduling (similar to workflowCommand path).
- `deriveFromCommand(text)` — helper: if match `/(\d+)\s?ч/i` → `Задержка {m1}ч`; if match `/email|push|sms|ivr/i` → `Обновлено: {matched channel}`; else `Обновлено по запросу`.
- Commit: `feat(workflow): simulate AI cycle on node commands`

## Task 7: Playwright Block E

- `tests/e2e/block-e.spec.ts`:
  - Open mid-preset Апсейл campaign → click SMS node → NodeControlPanel visible → submit prompt «Задержка 2 часа» → see AI reply text → sublabel eventually updates.
  - Click on canvas pane → panel closes.
- Commit: `test(e2e): cover Block E selection and AI cycle`

## Task 8: Verify + roadmap

- Full lint + vitest + Playwright.
- Memory roadmap update — E → ✅, next = F.
