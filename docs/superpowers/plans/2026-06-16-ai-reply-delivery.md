# AI-reply delivery: unification + fixes + debug indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Свести разбор AI-ответов в один раннер с единой оболочкой (реплика+крутилка+фоллбек), починить 6 багов доставки и добавить в дев-панель индикатор «ушёл ли последний запрос».

**Architecture:** Подход A — общий `useAssistRunner` (источник истины для исполнения `results[]`), единая точка входа `useChatSubmit.submit` строит контекст по экрану (включая граф workflow). Графовые правки переиспользуют тот же pending-пузырь через прокинутый `replyId`, сохраняя анимацию `runCycle`.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest, zod, ai-sdk (Gemini).

Spec: `docs/superpowers/specs/2026-06-16-ai-reply-delivery-design.md`

Команда тестов в репо: `npm test -- <path>` (vitest). Линт: `npm run lint`.

---

## File structure

- `src/state/dev-config.ts` — расширить `AiLogEntry` + событие `afina:ai-log` (Task 1)
- `src/lib/ai/assist-client.ts` — таймаут 20с, различение причины сбоя, latency (Task 2)
- `src/state/app-state.ts` — опц. `replyId` в трёх workflow-экшенах (Task 3)
- `src/sections/campaigns/workflow-view.tsx` — `runCycle`/undo используют переданный `replyId` (Task 3)
- `src/sections/shell/use-assist-runner.ts` — **новый** общий раннер (Task 4)
- `src/sections/shell/use-chat-submit.ts` — строит контекст всех экранов + зовёт раннер; удалить `executeAssistResults` (Task 5)
- `src/sections/shell/prompt-composer.tsx` — workflow free-text → `chatSubmit`; «Кампании» #3; удалить инлайн-обработчик (Task 6)
- `src/components/dev/dev-panel.tsx` — строка-индикатор «Последний запрос» (Task 7)

---

## Task 1: расширить журнал AiLogEntry + live-событие

**Files:** Modify `src/state/dev-config.ts`; Test `src/state/dev-config.test.ts` (создать, если нет — проверить `ls`).

- [ ] **Step 1.1: Тест** — новые поля сериализуются, событие диспатчится.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { appendAiLogEntry, readAiLogEntries, setAiLogEnabled } from "./dev-config";

describe("aiLog extended entry", () => {
  beforeEach(() => { window.localStorage.clear(); setAiLogEnabled(true); });

  it("persists route/errorReason/latencyMs/screen", () => {
    appendAiLogEntry({
      at: "2026-06-16T00:00:00.000Z", text: "x", resultKinds: ["answer"],
      outcome: "answer", screen: "workflow", route: "ai", errorReason: null, latencyMs: 1234,
    });
    const e = readAiLogEntries().at(-1)!;
    expect(e.route).toBe("ai");
    expect(e.errorReason).toBeNull();
    expect(e.latencyMs).toBe(1234);
    expect(e.screen).toBe("workflow");
  });

  it("dispatches afina:ai-log event on append", () => {
    const spy = vi.fn();
    window.addEventListener("afina:ai-log", spy);
    appendAiLogEntry({ at: "t", text: "x", resultKinds: [], outcome: "fallback" });
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener("afina:ai-log", spy);
  });
});
```

- [ ] **Step 1.2: Запустить — упадёт.** `npm test -- src/state/dev-config.test.ts` → FAIL (поля/событие отсутствуют).

- [ ] **Step 1.3: Реализация.** В `dev-config.ts` заменить интерфейс и хвост `appendAiLogEntry`:

```ts
export const AI_LOG_EVENT = "afina:ai-log";

export interface AiLogEntry {
  at: string; // ISO
  text: string;
  resultKinds: string[];
  outcome: "applied" | "clarify" | "answer" | "fallback";
  screen?: string;
  route?: "ai" | "offline";
  errorReason?: "timeout" | "no-key" | "rate-limited" | "ai-failed" | null;
  latencyMs?: number;
}
```

В конце `appendAiLogEntry`, после `setItem(...)`, добавить:

```ts
  window.dispatchEvent(new CustomEvent(AI_LOG_EVENT));
```

- [ ] **Step 1.4: Запустить — пройдёт.** `npm test -- src/state/dev-config.test.ts` → PASS.

- [ ] **Step 1.5: Commit.**
```bash
git add src/state/dev-config.ts src/state/dev-config.test.ts
git commit -m "feat(dev): расширить AiLogEntry (route/errorReason/latency) + событие afina:ai-log"
```

---

## Task 2: assist-client — таймаут 20с, причина сбоя, latency

**Files:** Modify `src/lib/ai/assist-client.ts`; Test `src/lib/ai/assist-client.test.ts`.

Изменяем `postAssist`, чтобы возвращать `{ json?, errorReason?, latencyMs }` вместо «json | null», и переносим логирование в раннер (Task 4). `fetchAssist`/`fetchAssistMulti` сохраняют публичную сигнатуру (возвращают данные | null), но дополнительно складывают причину в модульную переменную `lastAssistError`, читаемую раннером.

- [ ] **Step 2.1: Тест** — таймаут даёт `errorReason:"timeout"`, 503 → `"no-key"`, успех → latency>0.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAssistMulti, readLastAssistMeta } from "./assist-client";

const ctx = { screen: "workflow", dataSummary: "" };

beforeEach(() => { vi.restoreAllMocks(); });

it("maps 503 to no-key", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "no-key" }), { status: 503 })));
  const r = await fetchAssistMulti({ text: "hi", history: [], context: ctx });
  expect(r).toBeNull();
  expect(readLastAssistMeta().errorReason).toBe("no-key");
});

it("maps abort to timeout", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { const e = new Error("aborted"); e.name = "TimeoutError"; throw e; }));
  const r = await fetchAssistMulti({ text: "hi", history: [], context: ctx });
  expect(r).toBeNull();
  expect(readLastAssistMeta().errorReason).toBe("timeout");
});

it("records latency on success", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ kind: "answer", text: "ok" }] }), { status: 200 })));
  const r = await fetchAssistMulti({ text: "hi", history: [], context: ctx });
  expect(r?.[0].kind).toBe("answer");
  expect(readLastAssistMeta().latencyMs).toBeGreaterThanOrEqual(0);
  expect(readLastAssistMeta().errorReason).toBeNull();
});
```

- [ ] **Step 2.2: Запустить — упадёт.** `npm test -- src/lib/ai/assist-client.test.ts` → FAIL (`readLastAssistMeta` нет).

- [ ] **Step 2.3: Реализация.** В `assist-client.ts`:

Заменить константу таймаута и `postAssist`, добавить метаданные. (Убрать старый `logExchange`/`outcomeOf`/`appendAiLogEntry` импорт отсюда — логирование уедет в раннер.)

```ts
export const ASSIST_TIMEOUT_MS = 20000;

export type AssistErrorReason = "timeout" | "no-key" | "rate-limited" | "ai-failed";

interface AssistMeta { errorReason: AssistErrorReason | null; latencyMs: number; }
let lastMeta: AssistMeta = { errorReason: null, latencyMs: 0 };
export function readLastAssistMeta(): AssistMeta { return lastMeta; }

async function postAssist(req: AssistRequest): Promise<unknown> {
  const start = Date.now();
  lastMeta = { errorReason: null, latencyMs: 0 };
  try {
    const res = await fetch("/api/ai/assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(ASSIST_TIMEOUT_MS),
    });
    lastMeta.latencyMs = Date.now() - start;
    if (!res.ok) {
      lastMeta.errorReason =
        res.status === 503 ? "no-key" :
        res.status === 502 ? await read502Reason(res) : "ai-failed";
      return null;
    }
    return res.json();
  } catch (err) {
    lastMeta.latencyMs = Date.now() - start;
    lastMeta.errorReason = (err as Error)?.name === "TimeoutError" ? "timeout" : "ai-failed";
    return null;
  }
}

async function read502Reason(res: Response): Promise<AssistErrorReason> {
  try {
    const body = (await res.clone().json()) as { error?: string };
    return body?.error === "rate-limited" ? "rate-limited" : "ai-failed";
  } catch { return "ai-failed"; }
}
```

`fetchAssistMulti` упростить: вызывает `postAssist`, парсит `assistResponseSchema`/`assistResultSchema`, возвращает массив | null. Удалить локальный вызов `logExchange` (логирует раннер). `Date.now()` в браузере допустим (это не workflow-скрипт).

- [ ] **Step 2.4: Запустить — пройдёт.** `npm test -- src/lib/ai/assist-client.test.ts` → PASS. Также прогнать существующие тесты файла.

- [ ] **Step 2.5: Commit.**
```bash
git add src/lib/ai/assist-client.ts src/lib/ai/assist-client.test.ts
git commit -m "feat(ai): таймаут 20с, причина сбоя и latency в assist-client (readLastAssistMeta)"
```

---

## Task 3: прокинуть replyId в workflow-экшены и runCycle

**Files:** Modify `src/state/app-state.ts` (типы экшенов + reducer), `src/sections/campaigns/workflow-view.tsx`.

- [ ] **Step 3.1: Тип-экшены.** В `app-state.ts` добавить опц. `replyId`:
```ts
  | { type: "workflow_structural_commands_submit"; ops: StructuralOp[]; replyId?: string }
  | { type: "workflow_rebuild_submit"; nodes: WorkflowNode[]; edges: WorkflowEdge[]; assumptions: string; replyId?: string }
  | { type: "workflow_ai_undo_request"; replyId?: string }
```
И в стейте хранить переданный id, чтобы эффект `workflow-view` его прочитал:
```ts
// добавить в State:
  workflowReplyId: string | null;
// в initialState:
  workflowReplyId: null,
```
В reducer-кейсах класть `replyId`:
```ts
case "workflow_structural_commands_submit":
  return { ...state, workflowStructuralCommands: { ops: action.ops }, workflowReplyId: action.replyId ?? null, selectedWorkflowNode: null };
case "workflow_rebuild_submit":
  return { ...state, workflowRebuild: { nodes: action.nodes, edges: action.edges, assumptions: action.assumptions }, workflowReplyId: action.replyId ?? null };
case "workflow_ai_undo_request":
  return { ...state, workflowAiUndoRequested: true, workflowReplyId: action.replyId ?? null };
```

- [ ] **Step 3.2: runCycle использует внешний replyId.** В `workflow-view.tsx` `runCycle` принимает опц. `replyId`:
```ts
function runCycle(opts: { durationMs: number; apply: ...; finalReply: string | null; replyId?: string }) {
  ...
  const replyId = opts.replyId ?? chat.append({ role: "assistant", text: "", pending: true });
  pendingReplyIdRef.current = replyId;
  ...
}
```
В эффектах structural/rebuild передавать `replyId: state.workflowReplyId ?? undefined`, в undo-эффекте — если есть `state.workflowReplyId`, закрывать его через `chat.updatePending(state.workflowReplyId, "Вернул граф к состоянию до последней правки.")`, иначе `chat.append` как сейчас. После использования сбрасывать: `dispatch({ type: "workflow_reply_id_clear" })` (добавить тривиальный кейс, обнуляющий `workflowReplyId`). Для structural «всё пропущено» (opCount===0) — если есть внешний replyId, закрыть его текстом, иначе append.

- [ ] **Step 3.3: Тест** `src/state/app-state.test.ts` — `workflow_structural_commands_submit` с `replyId` кладёт `workflowReplyId`.
```ts
it("stores replyId for structural commands", () => {
  const s = reducer(initialState, { type: "workflow_structural_commands_submit", ops: [], replyId: "m1" });
  expect(s.workflowReplyId).toBe("m1");
});
```

- [ ] **Step 3.4: Запустить.** `npm test -- src/state/app-state.test.ts` → PASS. `npm run lint`.

- [ ] **Step 3.5: Commit.**
```bash
git add src/state/app-state.ts src/state/app-state.test.ts src/sections/campaigns/workflow-view.tsx
git commit -m "feat(workflow): прокинуть replyId в графовые экшены — переиспользовать pending-пузырь"
```

---

## Task 4: новый общий раннер useAssistRunner

**Files:** Create `src/sections/shell/use-assist-runner.ts`; Test `src/sections/shell/use-assist-runner.test.ts`.

Раннер — хук, возвращающий `run`. Логика исполнения `results[]` вынесена в чистую функцию `executeAssistResults(results, deps)` для тестируемости без React.

- [ ] **Step 4.1: Тест чистой функции** — все kinds, владение пузырём, фоллбек.
```ts
import { describe, it, expect, vi } from "vitest";
import { executeAssistResults } from "./use-assist-runner";

function makeDeps() {
  return {
    pendingId: "P",
    dispatch: vi.fn(),
    chat: { updatePending: vi.fn(), append: vi.fn(() => "X") },
    triggerEdit: { applyToTrigger: vi.fn() },
    campaigns: [{ id: "c1", name: "C1", status: "active" }],
    signals: [{ id: "s1" }],
    activeTriggerId: "t1",
    fallbackText: "fallback",
    cachedSignalLabel: "Сигнал",
  } as any;
}

it("answer → closes pending bubble with text", () => {
  const d = makeDeps();
  executeAssistResults([{ kind: "answer", text: "Привет" }], d);
  expect(d.chat.updatePending).toHaveBeenCalledWith("P", "Привет");
});

it("workflow-ops → dispatch with replyId=pending, no updatePending", () => {
  const d = makeDeps();
  executeAssistResults([{ kind: "workflow-ops", ops: [{ kind: "remove", targetLabel: "СМС" }] as any }], d);
  expect(d.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_structural_commands_submit", replyId: "P" }));
  expect(d.chat.updatePending).not.toHaveBeenCalled();
});

it("empty/none → fallback into pending", () => {
  const d = makeDeps();
  executeAssistResults([{ kind: "none" }], d);
  expect(d.chat.updatePending).toHaveBeenCalledWith("P", "fallback");
});
```

- [ ] **Step 4.2: Запустить — упадёт.** `npm test -- src/sections/shell/use-assist-runner.test.ts` → FAIL.

- [ ] **Step 4.3: Реализация `executeAssistResults` + `useAssistRunner`.**

Чистая функция (полный switch по всем kinds; текстовые копят `confirmations`, графовые диспатчат с `replyId=pendingId` и ставят `graphReplyOwned=true`):

```ts
import { useCallback } from "react";
import { useChat } from "@/state/chat-context";
import { useTriggerEdit } from "@/state/trigger-edit-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { fetchAssistMulti, readLastAssistMeta } from "@/lib/ai/assist-client";
import { appendAiLogEntry } from "@/state/dev-config";
import { toFiltersPatch } from "@/lib/ai/stats-patch-schema";
import { buildGraphFromSpec } from "@/lib/ai/rebuild-schema";
import { validateAiGraph } from "@/state/ai-graph-validation";
import { lookupInformationalReply, warmFallbackReply } from "@/lib/informational-replies";
import type { AssistResult, AssistRequest } from "@/lib/ai/assist-contract";
import type { NodeParams } from "@/types/workflow";

export interface ExecuteDeps {
  pendingId: string;
  dispatch: (a: any) => void;
  chat: { updatePending: (id: string, t: string) => void; append: (m: any) => string };
  triggerEdit: { applyToTrigger: (id: string, edit: any) => void };
  campaigns: Array<{ id: string; name: string; status: string }>;
  signals: Array<{ id: string }>;
  activeTriggerId?: string;
  fallbackText: string;
  cachedSignalLabel: string;
}

const GRAPH_OWNED = new Set(["workflow-ops", "rebuild", "undo"]);

export function executeAssistResults(results: AssistResult[], d: ExecuteDeps): void {
  const confirmations: string[] = [];
  let graphReplyOwned = false;
  let graphApplied = false;

  for (const r of results) {
    switch (r.kind) {
      case "answer": confirmations.push(r.text); break;
      case "clarify": confirmations.push(r.questions.join(" ")); break;
      case "stats":
        d.dispatch({ type: "stats_apply_patch", patch: toFiltersPatch(r.patch) });
        confirmations.push(r.confirmation); break;
      case "navigate": {
        const t = r.target;
        if (t.kind === "section") { d.dispatch({ type: "sidebar_nav", section: t.name }); confirmations.push(r.confirmation); }
        else if (t.kind === "campaign-workflow") {
          const c = d.campaigns.find((x) => x.id === t.campaignId);
          if (c) { d.dispatch({ type: "open_workflow", campaign: { id: c.id, name: c.name }, launched: c.status !== "draft" }); confirmations.push(r.confirmation); }
        } else if (t.kind === "signal") {
          const s = d.signals.find((x) => x.id === t.signalId);
          if (s) { d.dispatch({ type: "signal_opened", id: s.id }); confirmations.push(r.confirmation); }
        }
        break;
      }
      case "triggers": {
        if (!d.activeTriggerId) break;
        if (r.clearAdded) d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "clear-added" });
        if (r.clearExcluded) d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "clear-excluded" });
        if (r.add.length > 0 || r.exclude.length > 0) d.triggerEdit.applyToTrigger(d.activeTriggerId, { kind: "edit", add: r.add, exclude: r.exclude });
        confirmations.push(r.confirmation); break;
      }
      case "node-params":
        if (!graphApplied) {
          d.dispatch({ type: "workflow_node_field_set", nodeId: r.nodeId, patch: r.patch as Partial<NodeParams> });
          confirmations.push(r.confirmation); graphApplied = true;
        }
        break;
      case "workflow-ops":
        if (!graphApplied && r.ops.length > 0) {
          d.dispatch({ type: "workflow_structural_commands_submit", ops: r.ops, replyId: d.pendingId });
          graphApplied = true; graphReplyOwned = true;
        }
        break;
      case "rebuild":
        if (!graphApplied) {
          const built = buildGraphFromSpec(r.spec, { label: d.cachedSignalLabel });
          const check = validateAiGraph(built);
          if (check.ok) { d.dispatch({ type: "workflow_rebuild_submit", ...built, assumptions: r.spec.assumptions, replyId: d.pendingId }); graphReplyOwned = true; }
          else confirmations.push("Не получилось собрать корректную цепочку — попробуйте описать иначе.");
          graphApplied = true;
        }
        break;
      case "undo":
        if (!graphApplied) { d.dispatch({ type: "workflow_ai_undo_request", replyId: d.pendingId }); graphApplied = true; graphReplyOwned = true; }
        break;
      default: break; // none
    }
  }

  if (confirmations.length > 0) d.chat.updatePending(d.pendingId, confirmations.join(" "));
  else if (!graphReplyOwned) d.chat.updatePending(d.pendingId, d.fallbackText);
  // graphReplyOwned && no confirmations → пузырь закроет runCycle
}
```

Хук `useAssistRunner`:

```ts
export function useAssistRunner() {
  const chat = useChat();
  const triggerEdit = useTriggerEdit();
  const appState = useAppState();
  const dispatch = useAppDispatch();

  const run = useCallback(async (args: {
    request: AssistRequest;
    pendingId: string;
    activeTriggerId?: string;
    cachedSignalLabel?: string;
  }) => {
    const { request, pendingId } = args;
    const results = await fetchAssistMulti(request);
    const meta = readLastAssistMeta();
    const fallbackText = lookupInformationalReply(request.text) ?? warmFallbackReply();

    if (!results) {
      chat.updatePending(pendingId, fallbackText);
      appendAiLogEntry({ at: new Date().toISOString(), text: request.text, resultKinds: [], outcome: "fallback", screen: request.context.screen, route: "ai", errorReason: meta.errorReason, latencyMs: meta.latencyMs });
      return;
    }

    executeAssistResults(results, {
      pendingId, dispatch, chat, triggerEdit,
      campaigns: appState.campaigns, signals: appState.signals,
      activeTriggerId: args.activeTriggerId, fallbackText,
      cachedSignalLabel: args.cachedSignalLabel ?? "Сигнал",
    });
    appendAiLogEntry({ at: new Date().toISOString(), text: request.text, resultKinds: results.map((r) => r.kind), outcome: outcomeOf(results), screen: request.context.screen, route: "ai", errorReason: null, latencyMs: meta.latencyMs });
  }, [chat, triggerEdit, appState, dispatch]);

  return { run };
}

function outcomeOf(results: AssistResult[]) {
  if (results.some((r) => !["answer", "clarify", "none"].includes(r.kind))) return "applied" as const;
  if (results.some((r) => r.kind === "clarify")) return "clarify" as const;
  if (results.some((r) => r.kind === "answer")) return "answer" as const;
  return "fallback" as const;
}
```

- [ ] **Step 4.4: Запустить — пройдёт.** `npm test -- src/sections/shell/use-assist-runner.test.ts` → PASS.

- [ ] **Step 4.5: Commit.**
```bash
git add src/sections/shell/use-assist-runner.ts src/sections/shell/use-assist-runner.test.ts
git commit -m "feat(ai): общий useAssistRunner — единый разбор results[] + владение пузырём"
```

---

## Task 5: use-chat-submit строит контекст всех экранов и зовёт раннер

**Files:** Modify `src/sections/shell/use-chat-submit.ts`; Test `src/sections/shell/use-chat-submit.test.ts` (если есть — обновить).

- [ ] **Step 5.1.** Импортировать `useAssistRunner`, `getCachedGraph`, `summarizeGraph`. Удалить локальный `executeAssistResults` и импорт `fetchAssistMulti` (раннер инкапсулирует).

- [ ] **Step 5.2.** В `submit`, финальный AI-блок заменить: строить контекст по экрану, в т.ч. workflow-граф:
```ts
const { view } = appState;
const isWorkflow = view.kind === "workflow";
const cached = isWorkflow ? getCachedGraph(view.campaign.id) : undefined;
const graph = cached ? summarizeGraph(cached) : undefined;
const cachedSignalLabel = cached?.nodes.find((n) => n.data.nodeType === "signal")?.data.label ?? "Сигнал";
const selectedNode = appState.selectedWorkflowNode
  ? { id: appState.selectedWorkflowNode.id, label: appState.selectedWorkflowNode.label, nodeType: appState.selectedWorkflowNode.nodeType ?? "default" }
  : undefined;
```
Гейт доступности через await (фикс #5):
```ts
const useAi = isAiParserEnabled() && (await fetchAssistAvailability());
```
(сделать тело AI-ветки внутри `void (async () => { ... })()`; реплику пользователя и pendingId создавать ДО await, чтобы крутилка появилась сразу.)

Вызвать раннер:
```ts
await runner.run({
  request: { text, history, context: { screen, dataSummary, ...(graph ? { graph } : {}), ...(selectedNode ? { selectedNode } : {}), ...(isWorkflow ? { undoAvailable: appState.aiUndoAvailable } : {}), ...(wizardCtx), ...(triggerCtx) } },
  pendingId, activeTriggerId, cachedSignalLabel,
});
```
Офлайн-ветка: оставить текстовый фоллбек, но дополнительно залогировать `route:"offline"`:
```ts
appendAiLogEntry({ at: new Date().toISOString(), text, resultKinds: [], outcome: "fallback", screen, route: "offline", errorReason: null, latencyMs: 0 });
```

- [ ] **Step 5.3: Тест** — на экране workflow `run` получает context.graph; офлайн пишет route:"offline". (Мок `useAssistRunner`/`fetchAssistAvailability`.)

- [ ] **Step 5.4: Запустить.** `npm test -- src/sections/shell/` → PASS. `npm run lint`.

- [ ] **Step 5.5: Commit.**
```bash
git add src/sections/shell/use-chat-submit.ts src/sections/shell/use-chat-submit.test.ts
git commit -m "refactor(shell): use-chat-submit строит контекст всех экранов и зовёт useAssistRunner"
```

---

## Task 6: prompt-composer — делегировать workflow free-text + фикс «Кампании»

**Files:** Modify `src/sections/shell/prompt-composer.tsx`; Test `src/sections/shell/prompt-composer.test.tsx` (если есть).

- [ ] **Step 6.1: Кампании (#3).** Ветку `view.name === "Кампании"` заменить:
```ts
if (view.kind === "section" && view.name === "Кампании") {
  const { statuses, sort } = parseCampaignQuery(rawText);
  if (statuses.length > 0 || sort !== "default") {
    dispatch({ type: "campaigns_query_set", statuses, sort });
  } else if (rawText.trim() || segments.length > 0) {
    chatSubmit({ text: rawText, segments });
  }
  resetEditor();
  return;
}
```

- [ ] **Step 6.2: Workflow free-text → chatSubmit.** В блоке editable-workflow заменить весь инлайн AI-обработчик (ветка `structural.ops.length === 0 && nodeCommands.length === 0 && rawText.trim()`) на делегирование:
```ts
if (structural.ops.length === 0 && nodeCommands.length === 0 && rawText.trim()) {
  chatSubmit({ text: rawText, segments });
}
```
Удалить теперь неиспользуемые импорты (`fetchAssistMulti`, `summarizeGraph`, `getCachedGraph`, `buildDataSummary`, `validateAiGraph`, `buildGraphFromSpec`, `toFiltersPatch`, `NodeParams`, `fetchAssistAvailability`, `aiAvailable`-стейт и его эффект) — оставить лишь то, что ещё используется (структурные/нодовые команды).

- [ ] **Step 6.3: Запустить.** `npm test -- src/sections/shell/` → PASS. `npm run lint` (проверит мёртвые импорты).

- [ ] **Step 6.4: Commit.**
```bash
git add src/sections/shell/prompt-composer.tsx src/sections/shell/prompt-composer.test.tsx
git commit -m "refactor(shell): workflow free-text → chatSubmit; Кампании отвечают через ИИ (#3)"
```

---

## Task 7: индикатор «Последний запрос» в дев-панели

**Files:** Modify `src/components/dev/dev-panel.tsx`.

- [ ] **Step 7.1.** Прочитать последнюю запись `readAiLogEntries().at(-1)` в стейт; подписаться на `AI_LOG_EVENT`:
```ts
const [lastAi, setLastAi] = useState<AiLogEntry | null>(null);
useEffect(() => {
  const sync = () => setLastAi(readAiLogEntries().at(-1) ?? null);
  sync();
  window.addEventListener(AI_LOG_EVENT, sync);
  return () => window.removeEventListener(AI_LOG_EVENT, sync);
}, []);
```

- [ ] **Step 7.2.** В секции aiLog отрисовать строку-индикатор:
```tsx
{lastAi && (
  <div className="text-xs text-muted-foreground">
    Последний запрос:{" "}
    {lastAi.route === "offline"
      ? "⚠️ оффлайн"
      : lastAi.errorReason
        ? `⛔ ${lastAi.errorReason}`
        : `✅ ушёл в ИИ (${lastAi.outcome}${lastAi.latencyMs ? `, ${(lastAi.latencyMs / 1000).toFixed(1)}с` : ""})`}
    {lastAi.screen ? ` · ${lastAi.screen}` : ""}
  </div>
)}
```
(Если для индикатора важно видеть запросы — подсказать в UI, что журнал нужно включить тумблером `aiLog`, т.к. `appendAiLogEntry` пишет только при `isAiLogEnabled()`.)

- [ ] **Step 7.3.** Импортировать `readAiLogEntries`, `AI_LOG_EVENT`, тип `AiLogEntry`.

- [ ] **Step 7.4: Запустить.** `npm run lint`. Ручная проверка на localhost:3000: включить aiLog, отправить запрос на разных экранах, увидеть смену индикатора.

- [ ] **Step 7.5: Commit.**
```bash
git add src/components/dev/dev-panel.tsx
git commit -m "feat(dev): индикатор «Последний запрос к ИИ» в дев-панели (live по afina:ai-log)"
```

---

## Финальная верификация

- [ ] `npm test` (весь набор) → PASS.
- [ ] `npm run lint` → чисто.
- [ ] Ручной прогон на localhost:3000 (дев-сервер не перезапускать): промпт-бар на Статистике, Сигналах, Настройках, редактируемом и запущенном workflow, Кампаниях — у каждого видна реплика+крутилка+ответ; индикатор в дев-панели отражает route/outcome/latency; графовая правка даёт один пузырь с анимацией.
- [ ] Финальный коммит при необходимости.

## Self-review notes
- Coverage: #6/#1/#4 → Task 4+5+6; #2 → Task 2; #3 → Task 6.1; #5 → Task 5.2; debug → Task 1+7.
- `workflow_reply_id_clear` (Task 3.2) — добавить кейс-обнулитель в reducer.
- Имена согласованы: `readLastAssistMeta`, `executeAssistResults`, `useAssistRunner`, `AI_LOG_EVENT`, `workflowReplyId`.
