# Workflow Screen Design

## Goal

Add a universal campaign workflow visualization screen that opens after selecting any campaign type from `CampaignTypeView`. Users see a node-graph of the base reactivation pipeline, can edit it via the shared chat input, and launch the campaign — which transitions to a live status screen.

## Entry Point

```
Welcome → Шаг 1 → CampaignTypeView → click any campaign card → WorkflowView
```

`CampaignTypeView.onSelect` currently calls `console.log`. It must be wired to navigate to `WorkflowView`, passing the campaign `id` and `name`.

In `page.tsx`, a new `activeNav` state value `"Workflow"` (or a separate `selectedCampaign` state) triggers rendering `WorkflowView`.

## Layout

- **Full canvas** — workflow graph fills the main content area
- **Floating bottom bar** — shared `PromptInput` + step badges, same as other views. Placeholder: `"Опишите изменение сценария..."`
- **Launch button** — sits above the `PromptInput`, right-aligned: `"Начать кампанию →"`

## Graph Rendering — React Flow (`@xyflow/react`)

Use `@xyflow/react` for the node graph. Custom node components styled to match the app's dark theme.

### Node types and colors

| Type | Border | Background | Text |
|------|--------|------------|------|
| Default (neutral) | `#2a2a2a` | `#111` | `#e5e5e5` |
| Split | `#4c1d95` | `#0d0819` | `#a78bfa` |
| Channel | `#134e4a` | `#030f0e` | `#5eead4` |
| Retarget | `#7f1d1d` | `#110505` | `#f87171` |
| Result | `#14532d` | `#030d06` | `#4ade80` |
| New/changed (amber) | `#78350f` | `#0f0a03` | `#fbbf24` |

Nodes have a `label` (font-weight 500, 11px) and optional `sublabel` (10px, `#555`).

### Graph orientation and layout

- **Direction**: left-to-right (`dagre` or manual `x/y` positions)
- **Centering**: when the graph fits within the viewport, it is centered horizontally. React Flow's `fitView` with `padding` handles this.
- **Overflow**: horizontal scroll only. `ReactFlow` prop `panOnScroll` with `panOnScrollMode="horizontal"`. Vertical pan disabled.

### Fade gradients on overflow

Two absolutely-positioned divs overlay the canvas:
- Left: `background: linear-gradient(to right, #0a0a0a, transparent)` — visible when `scrollLeft > 0`
- Right: `background: linear-gradient(to left, #0a0a0a, transparent)` — visible when not scrolled to end

Fade visibility is toggled by listening to React Flow's `onMoveEnd` / `onMove` events or by observing the viewport transform.

### No minimap, no dot-grid background

- `miniMapStyle` not used, no `<MiniMap>` component
- React Flow background: use `<Background variant="lines" color="transparent" />` or omit `<Background>` entirely. Canvas background: plain `#0a0a0a`.

### Controls

Zoom buttons (`+`, `−`, `Fit`) in top-right corner using React Flow's `<Controls>` component, styled to match the app.

## Base Graph — Reactivation Pipeline

Initial node/edge data rendered on load:

```
Сигналы → Сплит (HL/L/M) → [Push, Email, SMS] → Проверка отклика → [Engaged (YES), Retarget (NO)] → Результат
```

Node positions (approximate, left-to-right):

| Node | Type |
|------|------|
| Сигналы | default |
| Сплит | split |
| Push | channel |
| Email | channel |
| SMS | channel |
| Проверка | default |
| Engaged | result |
| Retarget | retarget |
| Результат | result |

Edges are plain arrows (no label), color `#2a2a2a`.

## Text-Command Editing

The shared `PromptInput` at the bottom accepts natural-language commands. On submit, the command is processed and the graph state is updated. For the prototype, implement a small command parser that handles the 4 known changes from the document:

1. `убери SMS` → remove SMS node and its edges
2. `добавь фильтр` → insert Filter node (type: amber/new) between Сигналы and Сплит
3. `добавь задержку` → insert Delay node (type: amber/new) before Retarget
4. `добавь условие email` → insert "Email открыт?" condition node inside Engaged branch

Unknown commands show a toast or update a status line: `"Команда не распознана"`.

## Launch Flow

### Step 1 — WorkflowView (graph editing)

User sees the base graph. Can edit via chat. When ready, clicks **"Начать кампанию →"**.

### Step 2 — Status screen

On click:
- Transition: graph fades out, status screen fades in (same container, `motion/react` opacity transition)
- Tab indicator switches from "Workflow" to "Статус"
- The `PromptInput` + launch button are hidden
- Step badge "Шаг 3 — Статистика кампании" becomes active

Status screen contents:
- **Badge**: pulsing green dot + "Кампания запущена"
- **3 stat cards**: Отправлено / Доставлено / Открыто — all start at `0`
- After **3 seconds**: counters animate from 0 to demo values (e.g. 847 / 791 / 214) using eased animation over ~4 seconds
- **Button**: "Посмотреть статистику →" → navigates to `StatisticsView` (`setActiveNav("Статистика")`)

## Navigation Wiring in page.tsx

New state: `selectedCampaign: { id: string; name: string } | null`

```
activeNav === "Кампании" && selectedCampaign === null  → CampaignTypeView
activeNav === "Кампании" && selectedCampaign !== null  → WorkflowView
activeNav === "Статистика"                             → StatisticsView
activeNav === null                                     → WelcomeView
```

`CampaignTypeView.onSelect` sets both `selectedCampaign` and keeps `activeNav === "Кампании"`.

When navigating away from campaigns (sidebar), reset `selectedCampaign` to `null`.

## New Files

- `src/components/workflow-view.tsx` — main component (graph + launch button + status screen)
- `src/components/workflow-graph.tsx` — React Flow graph with custom nodes
- `src/types/workflow.ts` — node/edge type definitions

## Dependencies

- Add `@xyflow/react` to `package.json`
