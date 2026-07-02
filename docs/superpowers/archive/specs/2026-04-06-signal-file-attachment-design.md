# Signal File Attachment Design

## Goal

Three linked UX improvements: attach a signal file to the chat input after signal collection, show the signal name in the first workflow node, and gate the Campaigns section behind signal completion.

## Architecture

All changes live in existing files. `campaign-workspace.tsx` passes `scenarioId` up via `onStep8Reached`. `page.tsx` stores `signalScenarioId` state, adds an `AttachmentEffect` child inside `PromptInputProvider`, and gates the Campaigns section. `workflow-view.tsx` and `workflow.ts` accept a `signalName` prop to label the first node.

## Tech Stack

Next.js 16 App Router, TypeScript, Tailwind CSS v4, React context (`usePromptInputController`)

---

## Task 1 — Pass scenarioId up from CampaignWorkspace

**File:** `src/components/campaign-workspace.tsx`

**Current behaviour:** `onStep8Reached?.()` fires with no arguments when step 8 is reached.

**New behaviour:** `onStep8Reached?.(scenarioId: string)` fires with the selected scenario ID.

**Interface change:**
```ts
interface WorkspaceInner {
  onStep8Reached?: (scenarioId: string) => void;
}
export function CampaignWorkspace({
  onStep8Reached,
}: {
  onStep8Reached?: (scenarioId: string) => void;
})
```

In `handleNext`, where step 8 fires:
```ts
if (next === 8) onStep8Reached?.(stepData.scenario ?? "");
```

---

## Task 2 — Store signalScenarioId in page.tsx + AttachmentEffect

**File:** `src/app/page.tsx`

### New state

```ts
const [signalScenarioId, setSignalScenarioId] = useState<string>("");
```

### Updated handleStep8Reached

```ts
function handleStep8Reached(scenarioId: string) {
  setSignalDone(true);
  setSignalScenarioId(scenarioId);
  setFlowPhase("awaiting-campaign");
}
```

### AttachmentEffect component (defined in same file, rendered inside PromptInputProvider)

```tsx
function AttachmentEffect({
  flowPhase,
  selectedCampaign,
  signalScenarioId,
}: {
  flowPhase: FlowPhase;
  selectedCampaign: { id: string; name: string } | null;
  signalScenarioId: string;
}) {
  const { attachments } = usePromptInputController();

  useEffect(() => {
    if (flowPhase === "campaign" && !selectedCampaign && signalScenarioId) {
      const content = JSON.stringify({ scenario: signalScenarioId });
      const file = new File(
        [content],
        `сигнал_${signalScenarioId}.json`,
        { type: "application/json" }
      );
      attachments.add([file]);
    } else {
      attachments.clear();
    }
  }, [flowPhase, selectedCampaign, signalScenarioId]);

  return null;
}
```

Render inside `<PromptInputProvider>` (before `<AppSidebar>`):
```tsx
<AttachmentEffect
  flowPhase={flowPhase}
  selectedCampaign={selectedCampaign}
  signalScenarioId={signalScenarioId}
/>
```

### Campaigns section gate

Change line:
```ts
if (activeNav === "Кампании") return <CampaignTypeView onSelect={handleCampaignSelect} />;
```

To:
```ts
if (activeNav === "Кампании") {
  if (!signalDone) return <SignalTypeView onCreateSignal={handleStep1Click} />;
  return <CampaignTypeView onSelect={handleCampaignSelect} />;
}
```

---

## Task 3 — Signal name in first workflow node

**Files:** `src/types/workflow.ts`, `src/components/workflow-view.tsx`, `src/app/page.tsx`

### workflow.ts — parameterise createBaseNodes

```ts
export function createBaseNodes(signalName?: string): WorkflowNode[] {
  return [
    makeNode(
      "signals",
      "Сигналы + сегменты",
      "default",
      0, 0,
      signalName ?? "Вход из предыдущего шага"
    ),
    // … rest unchanged
  ];
}
```

### WorkflowView — accept signalName prop

```ts
interface WorkflowViewProps {
  launched: boolean;
  pendingCommand: string | null;
  onCommandHandled: () => void;
  onGoToStats: () => void;
  signalName?: string;
}
```

Pass `signalName` to initial graph state:
```ts
const [graph, setGraph] = useState<GraphState>({
  nodes: createBaseNodes(signalName),
  edges: createBaseEdges(),
});
```

### page.tsx — derive signalName and pass to WorkflowView

```ts
const SCENARIO_NAMES: Record<string, string> = {
  registration: "Регистрация",
  "first-deal":  "Первая сделка",
  upsell:        "Апсейл",
  retention:     "Удержание",
  return:        "Возврат",
  reactivation:  "Реактивация",
};

const signalFileName = signalScenarioId
  ? `сигнал_${signalScenarioId}.json`
  : undefined;
```

Pass to WorkflowView:
```tsx
<WorkflowView
  launched={workflowLaunched}
  pendingCommand={workflowCommand}
  onCommandHandled={handleCommandHandled}
  onGoToStats={handleGoToStats}
  signalName={signalFileName}
/>
```
