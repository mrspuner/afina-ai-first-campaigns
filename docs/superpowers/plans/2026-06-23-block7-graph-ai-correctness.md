# Корректность AI-правок графа — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Когда ИИ заменяет ноду на разветвляющий тип (сплиттер по сегментам), граф должен реально разветвляться — N исходящих веток с подписями и собственным каналом на каждой — а терминальные ноды («Конец») должны стоять в концах веток, а не вклиниваться в середину потока.

**Architecture:** Чистая TS-логика мутаций графа в `src/state/structural-commands.ts`. Чиним три места: (1) `applyReplace` — при замене на fan-out-тип (`split`/`condition`) перепроволачиваем рёбра по образцу `applyAddCondition`, создавая N веток вместо наследования одного ребра; (2) wire-схема `ops-wire-schema.ts` — расширяем `replace` полем `branches` (метка + канал на ветку), чтобы намерение модели пережило конвертацию; (3) `relayoutGraph` + инвариант размещения терминалов — `end`-нода не может иметь исходящих рёбер и не размещается в середине. Системный промпт `orchestrator-prompt.ts` правится минимально (SEAM с блоком 5).

**Tech Stack:** TypeScript, Zod (wire-схема), Vitest (юнит-тесты, co-located `*.test.ts`). Без UI-изменений в этом блоке.

---

## Seams / dependencies

- **`src/lib/ai/orchestrator-prompt.ts` делится с блоком 5.** Блок 5 («Селект шаблонов в нодах») снижает bias модели к правке node-params (строки ~38–42, область `selectedNode`). Блок 7 добавляет инструкции по корректному ветвлению. **Координация:**
  - Блок 7 вносит ТОЛЬКО один новый, чётко отграниченный блок текста — константу `BRANCHING_RULES` (см. Task 12) — и подмешивает её в `buildSystemPrompt` для `context.graph`. Не трогать область `selectedNode`/node-params (это территория блока 5).
  - Перед стартом согласовать владельца файла. Рекомендация: блок 5 — владелец `orchestrator-prompt.ts`; блок 7 отдаёт diff Task 12 как патч (новая константа + одна строка в массиве `.join`). Изменения не пересекаются по строкам.
  - Если блоки идут последовательно — блок 7 ребейзится поверх блока 5 и проверяет, что `orchestrator-prompt.test.ts` обоих блоков зелёный.
- **`src/lib/ai/ops-wire-schema.ts`** — единоличная территория блока 7 (блок 5 его не трогает). Расширение `replace`-ветки безопасно.
- **`src/state/structural-commands.ts`** — единоличная территория блока 7.
- **`src/state/channel-nodes.ts`** — читаем как образец fan-out (`buildChannelBlock`: split → канал на ветку → merge) и переиспользуем `CHANNEL_NODE_MAP`, `CHANNEL_LABEL`. НЕ модифицируем.
- **Все строки UI/подписи — только на русском** (метки веток, attentionReason). Канальные подписи берём из `CHANNEL_LABEL` (`src/state/channel-nodes.ts`).

---

## Worktree setup

```bash
git worktree add .worktrees/block7-graph-ai-fix -b feature/block7-graph-ai-fix main
cd .worktrees/block7-graph-ai-fix
npm install
```

Все команды ниже выполняются ИЗ `.worktrees/block7-graph-ai-fix`. Dev-сервер (если понадобится) — `npm run dev -- -p 3001` (порт 3000 занят основным чекаутом). Этот блок — чистая логика; dev-сервер не нужен, гоняем `npm test` и `npm run lint`.

Тестовый раннер: **Vitest**, тесты co-located рядом с исходником (`src/state/structural-commands.test.ts`, `src/lib/ai/ops-wire-schema.test.ts`). Запуск одного файла: `npm test -- src/state/structural-commands.test.ts`. Полный прогон: `npm test`.

---

## File map

| Файл | Ответственность | Действие |
|------|------------------|----------|
| `src/state/structural-commands.ts` | движок мутаций графа (`applyReplace` 639, `applyAddCondition` 686, `relayoutGraph` 744, `defaultParamsFor` 337, `StructuralOp` 16) | модификация |
| `src/state/structural-commands.test.ts` | юнит-тесты движка | расширение (регрессия) |
| `src/lib/ai/ops-wire-schema.ts` | wire ↔ StructuralOp (`wireOpSchema` 11, `toStructuralOp` 50) | модификация |
| `src/lib/ai/ops-wire-schema.test.ts` | тесты wire-конвертации | расширение |
| `src/lib/ai/orchestrator-prompt.ts` | system prompt (`buildSystemPrompt` 15) | минимальная вставка (SEAM) |
| `src/lib/ai/orchestrator-prompt.test.ts` | тесты промпта | расширение |
| `src/state/ai-graph-validation.ts` | `validateAiGraph` (читаем, переиспользуем в тестах) | не модифицируем |
| `src/state/channel-nodes.ts` | `CHANNEL_NODE_MAP`, `CHANNEL_LABEL`, образец fan-out | не модифицируем, импортируем |

---

## Background: что именно сломано (root-cause)

Сценарий пользователя: «замени ноду задержка на сплиттер по сегментам, дели на высокий и средний, разные каналы каждому».

1. **Терминал в середине потока.** `relayoutGraph` (744) расставляет ноды столбцами по BFS-глубине, но не проверяет инвариант: нода `end` не должна иметь исходящих рёбер и не должна стоять в середине. Если op-логика по ошибке провела ребро ИЗ `end`, терминал «уезжает» в середину. Инвариант надо определить и защищать.
2. **Split не ветвится.** `applyReplace` (639) на строке 680 сохраняет `edges: graph.edges` без изменений. Старая нода `wait` имела один вход и один выход → новый `split` наследует ту же топологию → плоская цепочка `Лендинг → Сплиттер → СМС 2 → Звонок 2` вместо разветвления.

Эталон правильного fan-out — **`applyAddCondition` (686)**: берёт единственное исходящее ребро `succEdge`, удаляет его (`.filter((e) => e.id !== succEdge.id)`) и создаёт N новых исходящих рёбер с метками + свежие leaf-ноды на ветках. То же надо сделать в `applyReplace`, когда `newType` — fan-out-тип.

Канальный fan-out из шаблонов — **`buildChannelBlock` (channel-nodes.ts:190)**: `split → [нода-канал на ветку] → merge`. Это образец того, как сплит раздаёт по каналу на ветку.

---

## Tasks

### Task 0 — Запустить существующие тесты (baseline, всё зелёное)

- [ ] `npm test -- src/state/structural-commands.test.ts src/lib/ai/ops-wire-schema.test.ts src/lib/ai/orchestrator-prompt.test.ts`
  - **Ожидание: PASS** (baseline до правок). Если что-то падает — это не наш регресс, разобраться до старта.

---

### Task 1 — Failing-тест: replace wait → split НЕ наследует одно ребро (дефект 2, ядро)

Добавить в конец `src/state/structural-commands.test.ts` новый describe-блок. Используем существующий хелпер `makeGraph()` (`signal → sms1 → success`).

- [ ] Дописать тест:

```ts
// ── Block 7: replace на разветвляющий тип создаёт N веток ──────────────────────
describe("applyOps — replace на split разветвляет (block7, дефект 2)", () => {
  it("replace wait→split с 2 ветками: split имеет 2 исходящих ребра, не одно", () => {
    // graph: signal → wait → success
    const g: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("ok-src-placeholder".slice(0, 0) || "w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    expect(res.skipped).toHaveLength(0);
    const split = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    expect(split).toBeDefined();
    const out = res.graph.edges.filter((e) => e.source === split.id);
    // ДЕФЕКТ 2: до фикса out.length === 1 (наследует одно ребро) → тест падает.
    expect(out).toHaveLength(2);
  });
});
```

> Примечание для исполнителя: тип `StructuralOp.replace` ещё НЕ имеет поля `branches` — TypeScript будет ругаться. Это ожидаемо: тип расширяем в Task 4. Сейчас тест должен **компилироваться и падать по существу** (out.length), а не по типам — поэтому Task 4 (тип) делаем ДО запуска этого теста. Порядок: написать Task 1 + Task 4 (тип), потом запускать. Чтобы соблюсти TDD-гранулярность, формально: коммитим тест (red), затем расширяем тип, затем фиксим логику.

- [ ] **Не запускать ещё** — сначала Task 4 расширит тип. Перейти к Task 4.

---

### Task 2 — Failing-тест: каждая ветка split получает свою ноду-канал (дефект 2, каналы)

- [ ] Дописать в тот же describe:

```ts
  it("каждая ветка получает ноду своего канала (Высокий→СМС, Средний→Звонок)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const split = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const out = res.graph.edges.filter((e) => e.source === split.id);
    // Метки веток — на рёбрах
    expect(out.map((e) => e.label).sort()).toEqual(["Высокий", "Средний"]);
    // Цели рёбер — ноды-каналы нужного типа
    const targetTypes = out
      .map((e) => res.graph.nodes.find((n) => n.id === e.target)!.data.nodeType)
      .sort();
    expect(targetTypes).toEqual(["ivr", "sms"]);
  });
```

- [ ] **Не запускать ещё** (см. Task 1).

---

### Task 3 — Failing-тест: терминал не вклинивается в середину; ветки заканчиваются терминалом (дефект 1)

- [ ] Дописать:

```ts
  it("ни один end не имеет исходящих рёбер (терминал не в середине, дефект 1)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    const endIds = new Set(
      res.graph.nodes.filter((n) => n.data.nodeType === "end").map((n) => n.id)
    );
    for (const e of res.graph.edges) {
      expect(endIds.has(e.source), `end ${e.source} имеет исходящее ребро`).toBe(false);
    }
  });

  it("результирующий граф валиден (validateAiGraph.ok)", () => {
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "w"), edge("w", "ok")],
    };
    const res = applyOps(g, [
      {
        kind: "replace",
        ref: "w",
        newType: "split",
        branches: [
          { label: "Высокий", channel: "sms" },
          { label: "Средний", channel: "ivr" },
        ],
      },
    ]);
    expect(validateAiGraph(res.graph).ok).toBe(true);
  });
```

> `node`, `edge`, `validateAiGraph` уже импортированы/определены в файле (строки 479–497). `WorkflowNode`/`WorkflowEdge` импортированы сверху.

- [ ] Коммит red-тестов:
  ```bash
  git add src/state/structural-commands.test.ts
  git commit -m "test(block7): failing tests for replace→split fan-out + terminal placement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4 — Расширить тип `StructuralOp.replace` ветвлением

В `src/state/structural-commands.ts`, тип `StructuralOp` (16–35). Добавить опциональное поле `branches` в ветку `replace`. Метка + опциональный канал на каждую ветку.

- [ ] Заменить ветку `replace`:

```ts
  | {
      kind: "replace";
      ref: string;
      newType: WorkflowNodeType;
      inlineParams?: string;
      /**
       * Block 7: для замены на разветвляющий тип (split/condition) — описание
       * исходящих веток. Каждая ветка: подпись ребра (label) + опциональный
       * канал (создаётся нода-канал в конце ветки). Если не задано — поведение
       * деградирует к дефолтному ветвлению (см. applyReplace).
       */
      branches?: BranchSpec[];
    }
```

- [ ] Добавить экспортируемый тип рядом (после `Placement`, до `StructuralOp`):

```ts
import type { Channel } from "@/types/campaign";

/** Описание одной исходящей ветки fan-out-ноды (split/condition). */
export type BranchSpec = {
  /** Подпись ребра (RU), напр. «Высокий». */
  label: string;
  /** Канал на конце ветки — создаётся нода-канал (sms/email/push/ivr). */
  channel?: Channel;
};
```

> `Channel` импортируется из `@/types/campaign` (тот же тип, что использует `channel-nodes.ts`).

- [ ] `npm test -- src/state/structural-commands.test.ts`
  - **Ожидание: компилируется, новые тесты Task 1–3 ПАДАЮТ** (логика ещё старая — `edges: graph.edges`). Старые тесты PASS. Это нужный red.

---

### Task 5 — Хелпер `buildFanOut`: рёбра + ноды веток (по образцу applyAddCondition + buildChannelBlock)

В `src/state/structural-commands.ts` добавить чистую функцию перед `applyReplace` (≈ строка 638). Она строит исходящие ветки fan-out-ноды: на каждую ветку — либо ноду-канал, либо терминал `end` в конце.

- [ ] Добавить импорт сверху файла (рядом с `CHANNEL_NODE_MAP`):

```ts
import { CHANNEL_NODE_MAP, CHANNEL_LABEL } from "./channel-nodes";
```

> `CHANNEL_NODE_MAP` уже импортирован (строка 8) — дополнить именованным импортом `CHANNEL_LABEL`.

- [ ] Добавить хелпер:

```ts
/**
 * Block 7: строит исходящие ветки разветвляющей ноды (split/condition).
 * Образец — applyAddCondition (фан-аут с метками) + buildChannelBlock
 * (нода-канал на ветку). Возвращает добавочные ноды и рёбра ОТ fanOutId.
 *
 * Для каждой ветки:
 *   - если задан channel → создаём ноду-канал, ребро fanOut →[label] channel,
 *     и ребро channel → terminal(end) (терминал в КОНЦЕ ветки, не в середине).
 *   - если channel не задан → ребро fanOut →[label] terminal(end).
 *
 * keepTarget (опционально): id ноды-наследника старого выхода. Первая ветка
 * подключается к нему вместо нового терминала (сохраняем «happy path»).
 */
function buildFanOut(
  existingNodes: WorkflowNode[],
  fanOutId: string,
  branches: BranchSpec[],
  keepTarget: string | null
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const newNodes: WorkflowNode[] = [];
  const newEdges: WorkflowEdge[] = [];
  let pool = existingNodes; // для uniqueLabel — растёт по мере добавления

  branches.forEach((br, i) => {
    let branchTailId: string;

    if (br.channel) {
      // Нода-канал (sms/email/push/ivr) с дефолтными params, needsAttention.
      const chId = `n_${nanoId()}`;
      const chEntry = CHANNEL_NODE_MAP[br.channel];
      const chNode: WorkflowNode = {
        id: chId,
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: {
          label: uniqueLabel(pool, br.channel),
          nodeType: br.channel,
          ...(chEntry.defaultParams ? { params: chEntry.defaultParams } : {}),
          needsAttention: true,
          attentionReason: `Заполните ${CHANNEL_LABEL[br.channel]} для ветки «${br.label}»`,
        } as WorkflowNode["data"],
      };
      newNodes.push(chNode);
      pool = [...pool, chNode];
      newEdges.push({
        id: `e_${nanoId()}`,
        source: fanOutId,
        target: chId,
        type: "default",
        label: br.label,
      });
      branchTailId = chId;
    } else {
      // Ветка без канала ведёт прямо в терминал.
      branchTailId = fanOutId; // ребро рисуем ниже на терминал
    }

    // Конец ветки — терминал. Первую ветку можно подключить к keepTarget.
    if (i === 0 && keepTarget) {
      if (br.channel) {
        newEdges.push({ id: `e_${nanoId()}`, source: branchTailId, target: keepTarget, type: "default" });
      } else {
        newEdges.push({ id: `e_${nanoId()}`, source: fanOutId, target: keepTarget, type: "default", label: br.label });
      }
      return;
    }

    const endId = `n_${nanoId()}`;
    const endNode: WorkflowNode = {
      id: endId,
      type: "workflowNode",
      position: { x: 0, y: 0 },
      data: {
        label: uniqueLabel(pool, "end"),
        nodeType: "end",
        ...(defaultParamsFor("end") ? { params: defaultParamsFor("end") } : {}),
      } as WorkflowNode["data"],
    };
    newNodes.push(endNode);
    pool = [...pool, endNode];

    if (br.channel) {
      newEdges.push({ id: `e_${nanoId()}`, source: branchTailId, target: endId, type: "default" });
    } else {
      newEdges.push({ id: `e_${nanoId()}`, source: fanOutId, target: endId, type: "default", label: br.label });
    }
  });

  return { nodes: newNodes, edges: newEdges };
}
```

> Замечание: `keepTarget` сохраняет старый «следующий» узел (напр. `Успех`) на первой ветке — иначе он стал бы сиротой. Терминалы (`end`) всегда листья → дефект 1 структурно невозможен (у `end` нет исходящих рёбер по построению).

- [ ] `npm test -- src/state/structural-commands.test.ts`
  - **Ожидание: тесты всё ещё ПАДАЮТ** (хелпер не подключён к `applyReplace`). Хелпер должен компилироваться. Если есть unused-warning — ок, подключим в Task 6.

---

### Task 6 — `applyReplace`: ветвление при fan-out-типе (фикс дефекта 2)

В `src/state/structural-commands.ts`, `applyReplace` (639). Сейчас возвращает `edges: graph.edges` (680). Добавить ветку: если `newType` — `split` или `condition`, перепроволочить выход по образцу `applyAddCondition`.

- [ ] Добавить константу рядом с хелперами (до `applyReplace`):

```ts
const FAN_OUT_TYPES: ReadonlySet<WorkflowNodeType> = new Set(["split", "condition"]);
```

- [ ] В `applyReplace`, ПОСЛЕ создания `newNode` (≈ строка 675) и ПЕРЕД `return`, вставить блок ветвления. Заменить финальный `return { graph: { nodes: ..., edges: graph.edges }, ... }` на:

```ts
  // Block 7: при замене на разветвляющий тип старая топология (один вход/
  // один выход) не годится — нужно создать N исходящих веток. Образец —
  // applyAddCondition (удаляем единственное исходящее ребро, рисуем ветки).
  if (FAN_OUT_TYPES.has(op.newType)) {
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    // keepTarget — наследник старого единственного выхода (сохраняем happy path).
    const keepTarget = outgoing.length === 1 ? outgoing[0].target : null;

    // branches: из op.branches, иначе дефолт по числу split-веток (A6: 2).
    const branchCount =
      op.branches?.length ??
      (params && params.kind === "split" ? params.branches : 2);
    const branches: BranchSpec[] =
      op.branches && op.branches.length > 0
        ? op.branches
        : Array.from({ length: Math.max(2, branchCount) }, (_, i) => ({
            label: `Ветка ${i + 1}`,
          }));

    // Если задано op.branches — синхронизируем split.branches с их числом.
    let fanParams = params;
    if (fanParams && fanParams.kind === "split") {
      fanParams = { ...fanParams, branches: branches.length } as NodeParams;
    }
    const fanNode: WorkflowNode = {
      ...newNode,
      data: { ...newNode.data, ...(fanParams ? { params: fanParams } : {}) } as WorkflowNode["data"],
    };

    // Удаляем старые исходящие рёбра заменяемой ноды (как succEdge в addCondition).
    const baseEdges = graph.edges.filter((e) => e.source !== node.id);
    const fan = buildFanOut(
      graph.nodes.filter((n) => n.id !== node.id),
      node.id,
      branches,
      keepTarget
    );

    return {
      graph: {
        nodes: [
          ...graph.nodes.map((n) => (n.id === node.id ? fanNode : n)),
          ...fan.nodes,
        ],
        edges: [...baseEdges, ...fan.edges],
      },
      description: `Заменил ${op.ref} на ${TYPE_LABEL[op.newType]} (${branches.length} ${branches.length === 2 ? "ветки" : "веток"})`,
    };
  }

  return {
    graph: {
      nodes: graph.nodes.map((n) => (n.id === node.id ? newNode : n)),
      edges: graph.edges,
    },
    description: `Заменил ${op.ref} на ${TYPE_LABEL[op.newType]}`,
  };
```

> Не-fan-out замена (напр. `sms → email`) идёт по старому пути (`edges: graph.edges`) — это корректно и сохраняет существующий тест «REPLACE keeps id and edges».

- [ ] `npm test -- src/state/structural-commands.test.ts`
  - **Ожидание: тесты Task 1–3 PASS.** Старые тесты (включая «REPLACE keeps id and edges», «REPLACE with inline params») PASS — не-fan-out путь не тронут.

- [ ] Коммит:
  ```bash
  git add src/state/structural-commands.ts
  git commit -m "fix(block7): applyReplace ветвит при замене на split/condition (дефект 2)

Образец фан-аута — applyAddCondition + buildChannelBlock. Удаляем единственное
исходящее ребро заменяемой ноды и строим N веток с метками и нодой-каналом.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 7 — Инвариант размещения терминалов в `relayoutGraph` (защита дефекта 1)

Дефект 1 («Конец» в середине) структурно предотвращён в Task 5 (терминалы — листья). Добавляем второй рубеж: тест + явная защита в `relayoutGraph`, чтобы орфан-терминал не «уезжал» в случайную колонку и любой будущий баг ловился.

- [ ] Failing-тест в `structural-commands.test.ts` (в блок relayout):

```ts
describe("relayoutGraph — терминалы (block7, дефект 1)", () => {
  it("end-нода в конце ветки лежит правее своего предка, не в первых колонках", () => {
    // signal → split →[A] sms → end ; split →[B] end2
    const g = {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("sp", "split", "Сплиттер"),
        node("ch", "sms", "СМС"),
        node("e1", "end", "Конец"),
        node("e2", "end", "Конец 2"),
      ],
      edges: [
        edge("signal", "sp"),
        edge("sp", "ch", "A"),
        edge("ch", "e1"),
        edge("sp", "e2", "B"),
      ],
    };
    const out = relayoutGraph(g);
    const x = (id: string) => out.nodes.find((n) => n.id === id)!.position.x;
    // Терминал e1 правее своего предка ch; ни один end не в колонке signal(0).
    expect(x("e1")).toBeGreaterThan(x("ch"));
    expect(x("e1")).toBeGreaterThan(x("signal"));
    expect(x("e2")).toBeGreaterThan(x("signal"));
  });
});
```

> `relayoutGraph` уже импортирован в тесте? Проверить импорт сверху — добавить `relayoutGraph` в импорт из `./structural-commands`, если отсутствует.

- [ ] `npm test -- src/state/structural-commands.test.ts`
  - **Ожидание:** скорее всего УЖЕ PASS (BFS-глубина и так кладёт `end` правее предка, раз у `end` есть входящее ребро). Если PASS — это подтверждающий регресс-тест, фикс не требуется, переходим к коммиту. Если FAIL — добавить в `relayoutGraph` правило: терминальная нода получает глубину `max(deps)+1`, никогда не остаётся в колонке 0 (см. ниже).

- [ ] (Только если FAIL) В `relayoutGraph`, после BFS-заполнения `depth`, перед формированием `byDepth`, добавить пост-проход для терминалов без расчётной глубины:

```ts
  // Block 7 инвариант: терминал (end) не может стоять в колонке 0/в середине.
  // Если терминал недостижим из signal, ставим его за предками (max depth входящих + 1).
  for (const n of graph.nodes) {
    const t = (n.data as { nodeType: WorkflowNodeType }).nodeType;
    if (t !== "end") continue;
    if (depth.has(n.id) && depth.get(n.id)! > 0) continue;
    const preds = graph.edges.filter((e) => e.target === n.id).map((e) => e.source);
    const predDepths = preds.map((p) => depth.get(p) ?? -1).filter((d) => d >= 0);
    if (predDepths.length > 0) depth.set(n.id, Math.max(...predDepths) + 1);
  }
```

- [ ] Коммит:
  ```bash
  git add src/state/structural-commands.ts src/state/structural-commands.test.ts
  git commit -m "test(block7): инвариант — терминал в конце ветки, не в середине (дефект 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 8 — Полный сценарий пользователя (интеграционный регресс)

Воспроизводим точный кейс: реалистичный граф `... → Лендинг → Задержка → Успех`, заменяем Задержку на сплиттер с 2 сегментами и разными каналами. Проверяем все 4 свойства из спеки.

- [ ] Failing/regression-тест в `structural-commands.test.ts`:

```ts
describe("applyOps — сценарий пользователя «замени задержку на сплиттер» (block7 e2e)", () => {
  function flowWithLandingWait() {
    return {
      nodes: [
        node("signal", "signal", "Сигнал"),
        node("land", "landing", "Лендинг"),
        node("w", "wait", "Задержка"),
        node("ok", "success", "Успех"),
      ],
      edges: [edge("signal", "land"), edge("land", "w"), edge("w", "ok")],
    };
  }

  it("(a) split имеет 2 различные исходящие ветки", () => {
    const res = applyOps(flowWithLandingWait(), [
      { kind: "replace", ref: "w", newType: "split",
        branches: [{ label: "Высокий", channel: "sms" }, { label: "Средний", channel: "ivr" }] },
    ]);
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const out = res.graph.edges.filter((e) => e.source === sp.id);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((e) => e.target)).size).toBe(2); // различные цели
  });

  it("(b) каждая ветка — нода своего канала", () => {
    const res = applyOps(flowWithLandingWait(), [
      { kind: "replace", ref: "w", newType: "split",
        branches: [{ label: "Высокий", channel: "sms" }, { label: "Средний", channel: "ivr" }] },
    ]);
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    const targets = res.graph.edges
      .filter((e) => e.source === sp.id)
      .map((e) => res.graph.nodes.find((n) => n.id === e.target)!.data.nodeType)
      .sort();
    expect(targets).toEqual(["ivr", "sms"]);
  });

  it("(c) ни один терминал не в середине (у end нет исходящих)", () => {
    const res = applyOps(flowWithLandingWait(), [
      { kind: "replace", ref: "w", newType: "split",
        branches: [{ label: "Высокий", channel: "sms" }, { label: "Средний", channel: "ivr" }] },
    ]);
    const ends = new Set(res.graph.nodes.filter((n) => n.data.nodeType === "end").map((n) => n.id));
    expect(res.graph.edges.every((e) => !ends.has(e.source))).toBe(true);
    // Лендинг по-прежнему ведёт в split, не в Успех/Конец напрямую
    const sp = res.graph.nodes.find((n) => n.data.nodeType === "split")!;
    expect(res.graph.edges.some((e) => e.source === "land" && e.target === sp.id)).toBe(true);
  });

  it("(d) граф валиден и Успех не осиротел (keepTarget)", () => {
    const res = applyOps(flowWithLandingWait(), [
      { kind: "replace", ref: "w", newType: "split",
        branches: [{ label: "Высокий", channel: "sms" }, { label: "Средний", channel: "ivr" }] },
    ]);
    expect(validateAiGraph(res.graph).ok).toBe(true);
    // success достижим (первая ветка подключена к нему через keepTarget)
    const reachableTargets = new Set(res.graph.edges.map((e) => e.target));
    expect(reachableTargets.has("ok")).toBe(true);
  });
});
```

- [ ] `npm test -- src/state/structural-commands.test.ts`
  - **Ожидание: PASS** (логика из Task 5–7 закрывает кейс). Если (d) падает на `validateAiGraph` из-за `condition-degree` (когда `newType === "condition"` и веток ≠ 2) — для `split` это неприменимо; тест использует `split`, должно пройти.

- [ ] Коммит:
  ```bash
  git add src/state/structural-commands.test.ts
  git commit -m "test(block7): e2e регресс пользовательского сценария replace задержка→сплиттер

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 9 — Failing-тест: wire-схема несёт branches в replace

В `src/lib/ai/ops-wire-schema.test.ts`, новый describe.

- [ ] Дописать:

```ts
describe("toStructuralOp — replace с branches (block7)", () => {
  it("replace c branches → StructuralOp.replace.branches", () => {
    const op = toStructuralOp({
      kind: "replace",
      ref: "n_wait",
      nodeType: "split",
      branches: [
        { label: "Высокий", channel: "sms" },
        { label: "Средний", channel: "ivr" },
      ],
    });
    expect(op).toEqual({
      kind: "replace",
      ref: "n_wait",
      newType: "split",
      branches: [
        { label: "Высокий", channel: "sms" },
        { label: "Средний", channel: "ivr" },
      ],
    });
  });

  it("replace без branches → branches не присутствует (как раньше)", () => {
    const op = toStructuralOp({ kind: "replace", ref: "n1", nodeType: "email" });
    expect(op).toEqual({ kind: "replace", ref: "n1", newType: "email" });
  });

  it("wireOpSchema принимает branches в replace", () => {
    const r = wireOpSchema.safeParse({
      kind: "replace",
      ref: "n1",
      nodeType: "split",
      branches: [{ label: "A", channel: "push" }],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] `npm test -- src/lib/ai/ops-wire-schema.test.ts`
  - **Ожидание: FAIL** (схема не знает `branches`; `toStructuralOp` его не переносит).

---

### Task 10 — Расширить `wireOpSchema` + `toStructuralOp` (фикс провода)

В `src/lib/ai/ops-wire-schema.ts`.

- [ ] Добавить поле `branches` в `wireOpSchema` (после `noLabel`, до закрытия `z.object`):

```ts
  branches: z
    .array(
      z.object({
        label: z.string().describe("Подпись ветки (RU), напр. «Высокий»"),
        channel: rebuildNodeTypeSchema
          .extract(["sms", "email", "push", "ivr"])
          .optional()
          .describe("Канал на конце ветки: sms/email/push/ivr"),
      })
    )
    .optional()
    .describe(
      "Для replace на split/condition: исходящие ветки. По ветке — подпись и опциональный канал (создаётся нода-канал). Так модель задаёт разные каналы разным сегментам."
    ),
```

> `rebuildNodeTypeSchema.extract([...])` сужает enum до каналов. Если `.extract` недоступен в текущей версии Zod — заменить на `z.enum(["sms","email","push","ivr"])`.

- [ ] В `toStructuralOp`, ветка `replace` (54–63), пробросить `branches`:

```ts
  if (w.kind === "replace") {
    return w.ref && w.nodeType
      ? {
          kind: "replace",
          ref: w.ref,
          newType: w.nodeType,
          ...(w.inlineParams ? { inlineParams: w.inlineParams } : {}),
          ...(w.branches && w.branches.length > 0 ? { branches: w.branches } : {}),
        }
      : null;
  }
```

- [ ] `npm test -- src/lib/ai/ops-wire-schema.test.ts`
  - **Ожидание: PASS** (новые + все старые тесты wire-конвертации).

- [ ] Коммит:
  ```bash
  git add src/lib/ai/ops-wire-schema.ts src/lib/ai/ops-wire-schema.test.ts
  git commit -m "feat(block7): wire-схема несёт branches (метка+канал) в replace

Намерение модели «разные каналы сегментам» переживает конвертацию wire→StructuralOp.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 11 — Failing-тест: системный промпт содержит правила ветвления

В `src/lib/ai/orchestrator-prompt.test.ts`.

- [ ] Дописать:

```ts
describe("buildSystemPrompt — правила ветвления (block7)", () => {
  it("при наличии graph содержит инструкцию о branches для split", () => {
    const p = buildSystemPrompt({
      screen: "workflow",
      dataSummary: "",
      graph: {
        nodes: [{ id: "w", label: "Задержка", nodeType: "wait" }],
        edges: [],
      },
    });
    // Ключевые сигналы: split ветвится, на ветку канал.
    expect(p).toContain("branches");
    expect(p.toLowerCase()).toContain("сегмент");
  });

  it("без graph не содержит правил ветвления (не засоряем не-граф контекст)", () => {
    const p = buildSystemPrompt({ screen: "campaigns", dataSummary: "" });
    expect(p).not.toContain("branches");
  });
});
```

- [ ] `npm test -- src/lib/ai/orchestrator-prompt.test.ts`
  - **Ожидание: FAIL** (правил ещё нет).

---

### Task 12 — Минимальная вставка правил ветвления в промпт (SEAM с блоком 5)

В `src/lib/ai/orchestrator-prompt.ts`. **Изменения строго отграничены**: одна новая константа + одна строка в массиве `buildSystemPrompt`, только в ветке `context.graph`. Область `selectedNode` НЕ трогаем (блок 5).

- [ ] Добавить константу после `ROLE_AND_VOICE` (≈ строка 13):

```ts
/**
 * Block 7: правила ветвления графа. Подмешивается ТОЛЬКО когда есть context.graph.
 * SEAM: блок 5 владеет node-params частью этого файла — здесь только про fan-out.
 */
const BRANCHING_RULES = `# Правила правок графа
Когда заменяешь ноду на «Сплиттер» (split) или «Условие» (condition) — это РАЗВЕТВЛЕНИЕ.
- Передавай поле branches: массив веток. У каждой ветки label (подпись, по-русски) и channel (sms/email/push/ivr), если на ветку нужен свой канал.
- «Дели по сегментам, разные каналы каждому» → branches с разными channel: напр. [{label:"Высокий",channel:"sms"},{label:"Средний",channel:"ivr"}].
- Терминальные ноды («Конец») ставятся ТОЛЬКО в конец ветки, никогда в середину потока.
- Альтернатива replace — последовательность: убери задержку → добавь split → по ноде-каналу на каждую ветку.`;
```

- [ ] В `buildSystemPrompt`, внутри `...(context.graph ? [ ... ] : [])`, добавить `BRANCHING_RULES` ПЕРВЫМ элементом массива (до строки «Текущий граф воркфлоу…»):

```ts
    ...(context.graph
      ? [
          BRANCHING_RULES,
          "Текущий граф воркфлоу (ноды и связи):",
          // ... без изменений ...
        ]
      : []),
```

- [ ] `npm test -- src/lib/ai/orchestrator-prompt.test.ts`
  - **Ожидание: PASS** (новые + все старые: порядок «роль→знания→контекст» сохранён, т.к. вставка внутри блока графа после `# Контекст момента`).

- [ ] Коммит:
  ```bash
  git add src/lib/ai/orchestrator-prompt.ts src/lib/ai/orchestrator-prompt.test.ts
  git commit -m "feat(block7): правила ветвления в system prompt (только при graph-контексте)

SEAM: изолированная константа BRANCHING_RULES + одна строка вставки. Область
selectedNode/node-params не тронута (территория блока 5).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 13 — Полный прогон тестов и линт

- [ ] `npm test`
  - **Ожидание: PASS** весь сьют. Особое внимание: `structural-commands.test.ts`, `ops-wire-schema.test.ts`, `orchestrator-prompt.test.ts`, `ai-graph-validation.test.ts`, `campaign-graph-consistency.test.ts`.
- [ ] `npm run lint`
  - **Ожидание: чисто.** Если unused-import `CHANNEL_LABEL` или `BranchSpec` — проверить, что они используются (Task 5/4).
- [ ] Если всё зелёное — финальный отчёт пользователю: путь worktree `.worktrees/block7-graph-ai-fix`, ветка `feature/block7-graph-ai-fix`. Merge/cleanup — на усмотрение пользователя (НЕ пушить в main).

---

## Self-review vs spec

- **Дефект 1 (терминал в середине):** Task 3 (тест: у `end` нет исходящих), Task 5 (терминалы — листья по построению), Task 7 (инвариант в relayout + тест), Task 8c. ✅
- **Дефект 2 (split не ветвится):** Task 1/2 (тесты fan-out + каналы), Task 5 (`buildFanOut`), Task 6 (`applyReplace` ветвление), Task 8a/8b. ✅
- **Wire-схема несёт branches:** Task 9 (тест), Task 10 (`wireOpSchema` + `toStructuralOp`). ✅
- **Промпт:** Task 11 (тест), Task 12 (`BRANCHING_RULES`, минимальная отграниченная вставка). ✅
- **Регресс-тесты на гарнитуре commit 725d9d1:** все новые тесты используют существующие хелперы (`makeGraph`, `node`, `edge`, `validateAiGraph`) и тот же стиль co-located vitest. ✅
- **SEAM с блоком 5:** раздел «Seams / dependencies» + Task 12 ограничивает правки `orchestrator-prompt.ts` одной константой и одной строкой, не пересекаясь со строками блока 5. ✅
- **RU-only user-facing:** метки веток, attentionReason, `BRANCHING_RULES` — на русском; каналы через `CHANNEL_LABEL`. ✅
- **`keepTarget` (не оставить наследника сиротой):** Task 5/6/8d покрывают. ✅
- **Деградация без branches:** Task 6 — дефолт `Ветка N` × max(2, split.branches); сохраняет существующий тест «REPLACE keeps id and edges» для не-fan-out типов. ✅
