# Signal File Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After signal collection the chat input shows a pre-attached signal file; when a campaign type is selected the file disappears and its name appears in the first workflow node; the Campaigns sidebar section shows an empty state when no signal exists.

**Architecture:** `CampaignWorkspace.onStep8Reached` starts passing `scenarioId`. `page.tsx` stores it in `signalScenarioId` state and renders an `AttachmentEffect` child (inside `PromptInputProvider`) that programmatically manages the attachment. `createBaseNodes` gains an optional `signalName` param; `WorkflowView` accepts `signalName` and passes it through. The Campaigns sidebar branch checks `signalDone`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, React context (`usePromptInputController`)

---

## File Map

| File | Change |
|---|---|
| `src/components/campaign-workspace.tsx` | `onStep8Reached` callback gains `scenarioId: string` argument |
| `src/types/workflow.ts` | `createBaseNodes(signalName?: string)` |
| `src/components/workflow-view.tsx` | Accepts `signalName?: string`, passes to `createBaseNodes` |
| `src/app/page.tsx` | New `signalScenarioId` state; `AttachmentEffect` component; Campaigns gate; pass `signalName` to `WorkflowView` |

---

## Task 1 — CampaignWorkspace passes scenarioId to onStep8Reached

**Files:**
- Modify: `src/components/campaign-workspace.tsx:22,57,142`

- [ ] **Step 1: Update WorkspaceInner prop type**

Find lines 20-23:
```tsx
{
  onSignalComplete?: () => void;
  onStep8Reached?: () => void;
  initialScenario?: { id: string; name: string };
}
```

Replace with:
```tsx
{
  onSignalComplete?: () => void;
  onStep8Reached?: (scenarioId: string) => void;
  initialScenario?: { id: string; name: string };
}
```

- [ ] **Step 2: Pass scenarioId when step 8 fires**

Find line 57:
```tsx
if (next === 8) onStep8Reached?.();
```

Replace with:
```tsx
if (next === 8) onStep8Reached?.(stepData.scenario ?? "");
```

- [ ] **Step 3: Update CampaignWorkspace export prop type**

Find lines 140-143:
```tsx
{
  onSignalComplete?: () => void;
  onStep8Reached?: () => void;
  initialScenario?: { id: string; name: string };
}
```

Replace with:
```tsx
{
  onSignalComplete?: () => void;
  onStep8Reached?: (scenarioId: string) => void;
  initialScenario?: { id: string; name: string };
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/macintosh/Documents/work/afina-ai-first && npx tsc --noEmit 2>&1 | grep "campaign-workspace" | head -10
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaign-workspace.tsx
git commit -m "feat: pass scenarioId to onStep8Reached callback"
```

---

## Task 2 — createBaseNodes accepts optional signalName

**Files:**
- Modify: `src/types/workflow.ts:62-64`

- [ ] **Step 1: Update createBaseNodes signature and first node**

Find lines 62-64:
```ts
export function createBaseNodes(): WorkflowNode[] {
  return [
    makeNode("signals",  "Сигналы + сегменты", "default",   0,    0,  "Вход из предыдущего шага"),
```

Replace with:
```ts
export function createBaseNodes(signalName?: string): WorkflowNode[] {
  return [
    makeNode("signals",  "Сигналы + сегменты", "default",   0,    0,  signalName ?? "Вход из предыдущего шага"),
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "workflow" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/types/workflow.ts
git commit -m "feat: createBaseNodes accepts optional signalName for first node sublabel"
```

---

## Task 3 — WorkflowView accepts and uses signalName

**Files:**
- Modify: `src/components/workflow-view.tsx:20-25,33-36`

- [ ] **Step 1: Add signalName to WorkflowViewProps interface**

Find lines 20-25:
```tsx
interface WorkflowViewProps {
  launched: boolean;
  pendingCommand: string | null;
  onCommandHandled: () => void;
  onGoToStats: () => void;
}
```

Replace with:
```tsx
interface WorkflowViewProps {
  launched: boolean;
  pendingCommand: string | null;
  onCommandHandled: () => void;
  onGoToStats: () => void;
  signalName?: string;
}
```

- [ ] **Step 2: Destructure signalName and pass to createBaseNodes**

Find lines 27-36:
```tsx
export function WorkflowView({
  launched,
  pendingCommand,
  onCommandHandled,
  onGoToStats,
}: WorkflowViewProps) {
  const [graph, setGraph] = useState<GraphState>({
    nodes: createBaseNodes(),
    edges: createBaseEdges(),
  });
```

Replace with:
```tsx
export function WorkflowView({
  launched,
  pendingCommand,
  onCommandHandled,
  onGoToStats,
  signalName,
}: WorkflowViewProps) {
  const [graph, setGraph] = useState<GraphState>({
    nodes: createBaseNodes(signalName),
    edges: createBaseEdges(),
  });
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "workflow-view" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/workflow-view.tsx
git commit -m "feat: WorkflowView accepts signalName prop for first node sublabel"
```

---

## Task 4 — page.tsx: signalScenarioId state + AttachmentEffect + Campaigns gate + WorkflowView wiring

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add signalScenarioId state**

Find line 47 (after existing state declarations):
```tsx
const [initialScenario,  setInitialScenario]  = useState<{ id: string; name: string } | null>(null);
```

Add after it:
```tsx
const [signalScenarioId, setSignalScenarioId] = useState<string>("");
```

- [ ] **Step 2: Update handleStep8Reached to accept and store scenarioId**

Find lines 65-69:
```tsx
// Step 8 activates (counter shows) → animate Step 2 badge
function handleStep8Reached() {
  setSignalDone(true);
  setFlowPhase("awaiting-campaign");
}
```

Replace with:
```tsx
// Step 8 activates (counter shows) → animate Step 2 badge
function handleStep8Reached(scenarioId: string) {
  setSignalDone(true);
  setSignalScenarioId(scenarioId);
  setFlowPhase("awaiting-campaign");
}
```

- [ ] **Step 3: Add AttachmentEffect component**

Add this component definition directly before the `export default function Home()` line:

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

Also add `usePromptInputController` to the import from `@/components/ai-elements/prompt-input`. Find:
```tsx
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
```

Replace with:
```tsx
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
```

- [ ] **Step 4: Render AttachmentEffect inside PromptInputProvider**

Find inside the JSX (line ~196-201):
```tsx
        <LaunchFlyout
          open={launchOpen}
          onClose={() => setLaunchOpen(false)}
          onSignalSelect={handleLaunchSignal}
          onCampaignSelect={handleLaunchCampaign}
        />
```

Add `<AttachmentEffect>` right after it:
```tsx
        <LaunchFlyout
          open={launchOpen}
          onClose={() => setLaunchOpen(false)}
          onSignalSelect={handleLaunchSignal}
          onCampaignSelect={handleLaunchCampaign}
        />
        <AttachmentEffect
          flowPhase={flowPhase}
          selectedCampaign={selectedCampaign}
          signalScenarioId={signalScenarioId}
        />
```

- [ ] **Step 5: Gate Campaigns section behind signalDone**

Find line 173:
```tsx
    if (activeNav === "Кампании")   return <CampaignTypeView onSelect={handleCampaignSelect} />;
```

Replace with:
```tsx
    if (activeNav === "Кампании") {
      if (!signalDone) return <SignalTypeView onCreateSignal={handleStep1Click} />;
      return <CampaignTypeView onSelect={handleCampaignSelect} />;
    }
```

- [ ] **Step 6: Derive signalFileName and pass to WorkflowView**

Find in `renderMain` the WorkflowView render (lines 161-168):
```tsx
      return (
        <WorkflowView
          launched={workflowLaunched}
          pendingCommand={workflowCommand}
          onCommandHandled={handleCommandHandled}
          onGoToStats={handleGoToStats}
        />
      );
```

Replace with:
```tsx
      const signalFileName = signalScenarioId ? `сигнал_${signalScenarioId}.json` : undefined;
      return (
        <WorkflowView
          launched={workflowLaunched}
          pendingCommand={workflowCommand}
          onCommandHandled={handleCommandHandled}
          onGoToStats={handleGoToStats}
          signalName={signalFileName}
        />
      );
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "page.tsx" | head -20
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: signal file attaches to input on campaign selection, Campaigns section gated"
```

---

## Task 5 — Push

- [ ] **Step 1: Push all commits**

```bash
git push
```
