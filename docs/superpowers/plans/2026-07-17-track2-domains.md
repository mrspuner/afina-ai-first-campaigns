# Track 2 — Домены — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести доменную модель на группы `root + subdomains`, сделать пользовательские правки доменов durable на сессию, добавить статусы/модерацию/реестр и судьбу доменов в описании.

**Architecture:** Данные доменов становятся `Record<TriggerId, DomainGroup[]>`. Пользовательский слой (`TriggerDelta`) расширяется до записей, читающих статус из **единого источника** — реестра аккаунт-уровня в `AccountSettings`. `Campaign.triggerConfig` хранит только ссылки домен↔триггер (durable на сессию, in-memory). Модерация — симулируемый таймер на реестре. Описание сценария получает статусы как чистый вход.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/base-ui, motion v12, TypeScript, Vitest, Playwright.

## Global Constraints

- Персист — **in-memory на сессию** (переживает навигацию, НЕ reload). Никакого localStorage.
- Единый источник статуса домена — **реестр в `AccountSettings`**; `Campaign.triggerConfig` статус не дублирует.
- Датасет — **все 62 триггера ≥10 `root`**; пути (`host/path`) в карте отсутствуют; один `root` в пределах триггера не дублируется.
- pending-чип — жёлто-оранжевый с иконкой часов, без текстовой подписи; rejected в карточке триггера не показывается.
- Лейблы статусов (RU): «На проверке» / «Одобрен» / «Отклонён».
- Строка судьбы (RU): «Домены `<...>` отправлены на модерацию — в кампанию войдут только одобренные; не прошедшие проверку не подключаются, отклонённые удаляются из кампании».
- Работать ТОЛЬКО в своём worktree; НИКОГДА `git stash`; dev-сервер только `-p 3001`; перед framework-кодом читать `node_modules/next/dist/docs/`.
- Тесты: unit `npx vitest run <path>`; typecheck `npx tsc --noEmit`; smoke `npm run test:screens`; visual `npm run test:visual` (обновление baseline `--update-snapshots` только против своего порта).
- Спеки-первоисточники: `docs/superpowers/specs/2026-07-17-domains-model-and-dataset-design.md` (3), `...-domains-registry-moderation-design.md` (4).

---

## File Structure

| Файл | Ответственность | Действие |
|---|---|---|
| `src/data/trigger-domains.ts` | `DomainGroup`, `TRIGGER_DOMAINS: Record<TriggerId,DomainGroup[]>`, `getTriggerDomains`, `knownTriggerDomains` (roots) | Modify |
| `src/lib/trigger-domain-view.ts` | `splitSystemDomains`/`previewDomains` на `DomainGroup[]` | Modify |
| `src/lib/trigger-edit-parser.ts` | `TriggerDelta` со статус-готовой записью | Modify |
| `src/types/campaign.ts` | `TriggerConfig`/`StepData` — прокинуть triggerConfig | Modify |
| `src/state/app-state.ts` | `Campaign.triggerConfig`, `campaign_created_from_wizard`/`campaign_scoring_set`, moderation-action | Modify |
| `src/types/account-settings.ts` | реестр доменов со статусом | Modify |
| `src/sections/settings/domains-block.tsx` | «Собственные домены и исключения» | Modify |
| `src/sections/campaigns/wizard/steps/interests-triggers-editor.tsx` | чип-группа, tooltip, 10→«+N», комбобокс, pending-чип, `initialDeltas` | Modify |
| `src/sections/campaigns/wizard/steps/step-2-interests.tsx`, `scoring-interests-panel.tsx` | прокинуть triggerConfig/initialDeltas | Modify |
| `src/state/graph-description.ts` | строка судьбы доменов | Modify |

---

## Task 1: Модель `DomainGroup` + view-логика на группах

**Files:**
- Modify: `src/data/trigger-domains.ts` (добавить тип `DomainGroup`)
- Modify: `src/lib/trigger-domain-view.ts`
- Test: `src/lib/trigger-domain-view.test.ts` (создать, если нет)

**Interfaces:**
- Produces: `type DomainGroup = { root: string; subdomains: string[] }`; `splitSystemDomains(groups: DomainGroup[], delta: TriggerDelta): { active: DomainGroup[]; excluded: DomainGroup[] }`; `previewDomains(groups: DomainGroup[], visibleCount: number): { visible: DomainGroup[]; overflowCount: number }`; `subdomainCount(g: DomainGroup): number`.

- [ ] **Step 1: Написать падающий тест** — `src/lib/trigger-domain-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitSystemDomains, previewDomains, PREVIEW_VISIBLE_COUNT } from "./trigger-domain-view";
import type { DomainGroup } from "@/data/trigger-domains";

const g = (root: string, ...subs: string[]): DomainGroup => ({ root, subdomains: subs });

describe("splitSystemDomains (groups)", () => {
  it("partitions by root, case-insensitive, keeps order", () => {
    const groups = [g("sberbank.ru", "online.sberbank.ru"), g("vtb.ru"), g("alfabank.ru")];
    const res = splitSystemDomains(groups, { added: [], excluded: ["VTB.ru"] });
    expect(res.active.map((x) => x.root)).toEqual(["sberbank.ru", "alfabank.ru"]);
    expect(res.excluded.map((x) => x.root)).toEqual(["vtb.ru"]);
  });
});

describe("previewDomains (groups)", () => {
  it("returns first N groups + overflow", () => {
    const groups = [g("a.ru"), g("b.ru"), g("c.ru"), g("d.ru"), g("e.ru")];
    const res = previewDomains(groups, PREVIEW_VISIBLE_COUNT);
    expect(res.visible.map((x) => x.root)).toEqual(["a.ru", "b.ru", "c.ru"]);
    expect(res.overflowCount).toBe(2);
  });
});
```

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/lib/trigger-domain-view.test.ts`. Ожидание: FAIL (типы/сигнатуры не совпадают).

- [ ] **Step 3: Реализовать** — в `trigger-domains.ts` добавить `export interface DomainGroup { root: string; subdomains: string[] }`. В `trigger-domain-view.ts` переписать `splitSystemDomains`/`previewDomains` на `DomainGroup[]`, сравнивая по `group.root.toLowerCase()`; добавить `export const subdomainCount = (g: DomainGroup) => g.subdomains.length;`.

- [ ] **Step 4: Прогнать — проходит** — `npx vitest run src/lib/trigger-domain-view.test.ts`. Ожидание: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domains): DomainGroup model + group-aware view logic"`.

---

## Task 2: Датасет `TRIGGER_DOMAINS` → `DomainGroup[]`, все 62 триггера ≥10 root

**Files:**
- Modify: `src/data/trigger-domains.ts` (`TRIGGER_DOMAINS`, `FALLBACK_DOMAINS`, `getTriggerDomains`, `knownTriggerDomains`)
- Test: `src/data/trigger-domains.test.ts` (создать)

**Interfaces:**
- Produces: `TRIGGER_DOMAINS: Record<TriggerId, DomainGroup[]>`; `getTriggerDomains(id): DomainGroup[]`; `knownTriggerDomains(): { id: string; label: string }[]` (по `root`).

**Правило трансформации:** плоский 2-й уровень → `{root, subdomains:[]}`; путь `host/path` → `{root: host, subdomains:[<path>.<host>]}` (пути не остаются); поддомен `sub.host` → `{root: host, subdomains:["sub.host"]}`; один root в триггере не дублируется — куски бренда сливаются. Добор до ≥10 root — прототипные моки того же рынка. Три эталонные вертикали — дословно из B3 (см. спеку 3).

- [ ] **Step 1: Написать падающий тест** — `src/data/trigger-domains.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TRIGGER_DOMAINS, getTriggerDomains, knownTriggerDomains } from "./trigger-domains";

describe("TRIGGER_DOMAINS dataset", () => {
  const entries = Object.entries(TRIGGER_DOMAINS);

  it("every trigger has >= 10 root groups", () => {
    for (const [id, groups] of entries) {
      expect(groups.length, `${id}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("no paths in root or subdomains", () => {
    for (const [id, groups] of entries) {
      for (const grp of groups) {
        expect(grp.root, `${id}/${grp.root}`).not.toContain("/");
        for (const s of grp.subdomains) expect(s, `${id}/${s}`).not.toContain("/");
      }
    }
  });

  it("root is unique within a trigger", () => {
    for (const [id, groups] of entries) {
      const roots = groups.map((g) => g.root.toLowerCase());
      expect(new Set(roots).size, `${id}`).toBe(roots.length);
    }
  });

  it("credit-banks matches the B3 reference (roots + key subdomains)", () => {
    const byRoot = Object.fromEntries(getTriggerDomains("credit-banks").map((g) => [g.root, g.subdomains]));
    expect(Object.keys(byRoot)).toEqual(expect.arrayContaining([
      "sberbank.ru", "vtb.ru", "alfabank.ru", "gazprombank.ru", "tinkoff.ru",
      "raiffeisen.ru", "otkritie.ru", "rshb.ru", "sovcombank.ru", "pochtabank.ru", "mkb.ru", "uralsib.ru",
    ]));
    expect(byRoot["sberbank.ru"]).toEqual(expect.arrayContaining([
      "online.sberbank.ru", "kredit.sberbank.ru", "ipoteka.sberbank.ru",
    ]));
    expect(byRoot["sovcombank.ru"]).toContain("halva.sovcombank.ru");
  });

  it("knownTriggerDomains returns unique roots as {id,label}", () => {
    const known = knownTriggerDomains();
    expect(known.every((k) => !k.id.includes("/"))).toBe(true);
    expect(new Set(known.map((k) => k.id)).size).toBe(known.length);
  });
});
```

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/data/trigger-domains.test.ts`. Ожидание: FAIL.

- [ ] **Step 3: Реализовать** — переписать `TRIGGER_DOMAINS` в новый тип по правилу трансформации. Три эталонные вертикали — дословно B3. Остальные 59 — конвертировать текущие строки + добить до ≥10 root моками рынка (для банков — реальные банки РФ; для маркетплейсов — существующие площадки; и т.п.). `FALLBACK_DOMAINS: DomainGroup[]`. `getTriggerDomains` → `DomainGroup[]`. `knownTriggerDomains` → дедуп по `root`.
  > Генерация ~620 записей: делать по вертикалям (финансы/авто/телеком/недвижимость/… — блоки уже размечены комментариями в файле), сверяясь с тестом Step 1 после каждого блока.

- [ ] **Step 4: Прогнать — проходит** + typecheck — `npx vitest run src/data/trigger-domains.test.ts && npx tsc --noEmit`. Ожидание: PASS, 0 ошибок типов.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domains): expand TRIGGER_DOMAINS to root+subdomains for all 62 triggers"`.

---

## Task 3: Чип-группа — счётчик `·N` + tooltip поддоменов

**Files:**
- Modify: `src/sections/campaigns/wizard/steps/interests-triggers-editor.tsx` (`SystemDomainChip`, рендер группы)

**Interfaces:**
- Consumes: `DomainGroup`, `subdomainCount`, `splitSystemDomains` (Task 1).

- [ ] **Step 1: Реализовать чип** — `SystemDomainChip` принимает `DomainGroup`; подпись = `root`; при `subdomains.length > 0` добавить счётчик «` ·N`» (тонкий muted-текст, не жёлтый). Клик по чипу → tooltip (shadcn/base-ui `Tooltip` уже в проекте) со списком `subdomains` (просмотр). ✕ исключает всю группу (пишет `root` в `delta.excluded`).

- [ ] **Step 2: Smoke** — `npm run test:screens`. Ожидание: экран с раскрытой карточкой триггера монтируется без ошибок консоли.

- [ ] **Step 3: Визуальная проверка** — запустить `-p 3001`, открыть панель «Интересы и триггеры», убедиться: чип показывает `sberbank.ru ·3`, tooltip раскрывает поддомены, ✕ вычёркивает группу. (Скилл visual-review / скриншот.)

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(domains): domain chip shows root + subdomain counter with tooltip"`.

---

## Task 4: Овэрфлоу раскрытой карточки — 10 → «+N» → «Добавить свой домен»

**Files:**
- Modify: `interests-triggers-editor.tsx` (раскрытая карточка триггера)

- [ ] **Step 1: Реализовать** — в раскрытой карточке показывать первые **10** групп, затем чип **«+N»** (`groups.length - 10`, скрытый → раскрывающий остаток по клику), затем чип **«Добавить свой домен»**. Свёрнутое превью остаётся на `PREVIEW_VISIBLE_COUNT = 3` (не менять).

- [ ] **Step 2: Smoke** — `npm run test:screens`. Ожидание: PASS.

- [ ] **Step 3: Визуальная проверка** — триггер с >10 root показывает 10 + «+N» + «Добавить свой домен»; клик по «+N» доразворачивает.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(domains): expanded trigger card shows 10 + overflow + add-domain"`.

---

## Task 5: Персист `triggerConfig` на кампании + `initialDeltas`

**Files:**
- Modify: `src/lib/trigger-edit-parser.ts` (запись со статус-готовой формой)
- Modify: `src/types/campaign.ts`, `src/state/app-state.ts` (`Campaign.triggerConfig`, reducer)
- Modify: `interests-triggers-editor.tsx` (проп `initialDeltas`), `step-2-interests.tsx`, `scoring-interests-panel.tsx`
- Test: `src/lib/trigger-edit-parser.test.ts`, `src/state/app-state.test.ts` (расширить/создать)

**Interfaces:**
- Produces: `Campaign.triggerConfig?: Record<string, TriggerDelta>` (ключ — trigger **id**); `TriggerDelta.added` остаётся `string[]` — это **ссылки** на домены (статус НЕ хранится здесь, читается из реестра в Task 6, единый источник); проп `initialDeltas?: Record<string, TriggerDelta>` у `InterestsTriggersEditor`.

- [ ] **Step 1: Тест редьюсера** — в `app-state.test.ts`: `campaign_created_from_wizard` со `stepData.triggerConfig` кладёт его в `Campaign.triggerConfig`; `campaign_scoring_set` с `triggerConfig` сохраняет его.

```ts
it("persists triggerConfig from wizard onto the campaign", () => {
  const sd = makeStepData({ triggerConfig: { "credit-banks": { added: ["my.ru"], excluded: [] } } });
  const s = appReducer(initialState, { type: "campaign_created_from_wizard", stepData: sd });
  const c = s.campaigns.at(-1)!;
  expect(c.triggerConfig?.["credit-banks"]).toEqual({ added: ["my.ru"], excluded: [] });
});
```

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/app-state.test.ts`. Ожидание: FAIL.

- [ ] **Step 3: Реализовать** — добавить `Campaign.triggerConfig`; в `campaign_created_from_wizard` читать `sd.triggerConfig`; в `campaign_scoring_set` сохранять; `StepData.triggerConfig` привести к `Record<string, TriggerDelta>` по id (единый ключ — id; маппинг label↔id в одной точке). В `InterestsTriggersEditor` добавить `initialDeltas` и засеивать `useState(() => initialDeltas ?? {})`. Прокинуть `initialDeltas` из `scoring-interests-panel.tsx` (из `campaign.triggerConfig`) и `step-2-interests.tsx`.

- [ ] **Step 4: Прогнать — проходит** + typecheck — `npx vitest run src/state/app-state.test.ts src/lib/trigger-edit-parser.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Визуальная проверка durability** — добавить домен в панели, закрыть/переоткрыть панель, уйти на граф и назад — правки на месте.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(domains): persist triggerConfig on Campaign + seed editor via initialDeltas"`.

---

## Task 6: Реестр статусов доменов в `AccountSettings` (единый источник)

**Files:**
- Modify: `src/types/account-settings.ts`
- Modify: `src/state/app-state.ts` (reducer-actions)
- Test: `src/state/app-state.test.ts`

**Interfaces:**
- Produces: `type DomainStatus = "pending" | "approved" | "rejected"`; `interface RegisteredDomain { domain: string; status: DomainStatus; addedAt: string }`; `AccountSettings.ownDomains: RegisteredDomain[]` (реестр); действия `domain_registered` (add → pending/approved), `domain_moderation_resolved` (Task 7). `domainBlocklist` сохраняется как есть (глобальные исключения).

- [ ] **Step 1: Тест** — `domain_registered` неизвестного домена создаёт `{status:"pending"}` в `ownDomains`; известного (в `knownTriggerDomains`) — `{status:"approved"}`.

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/app-state.test.ts`.

- [ ] **Step 3: Реализовать** — типы + reducer-кейс `domain_registered` (проверка против `knownTriggerDomains()` для мгновенного approved). `EMPTY_ACCOUNT_SETTINGS`/`DEMO_ACCOUNT_SETTINGS` дополнить `ownDomains: []`.

- [ ] **Step 4: Прогнать — проходит** — `npx vitest run src/state/app-state.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domains): account-level domain registry with statuses"`.

---

## Task 7: Таймер модерации (pending → смешанный исход)

**Files:**
- Modify: `src/state/app-state.ts` (`domain_moderation_resolved`)
- Create: `src/sections/settings/use-domain-moderation.ts` (хук-таймер по паттерну `campaign-screen.tsx:54-64`)
- Test: `src/state/app-state.test.ts`

**Interfaces:**
- Consumes: `RegisteredDomain` (Task 6).
- Produces: action `domain_moderation_resolved` (переводит указанные pending → approved/rejected); хук `useDomainModeration()` — `setTimeout` на каждый pending, по срабатыванию диспатчит смешанный исход (детерминированно-псевдослучайно, как `checkDomainAvailability`).

- [ ] **Step 1: Тест редьюсера** — `domain_moderation_resolved` с `{ approved:["a.ru"], rejected:["b.ru"] }` меняет статусы соответствующих записей, не трогая остальные.

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/app-state.test.ts`.

- [ ] **Step 3: Реализовать** — reducer-кейс + хук. Хук монтируется там, где живёт реестр (настройки) или глобально; на добавление pending стартует таймер (константа задержки, как `EDIT_DELAY_MS`), по срабатыванию делит текущие pending на approved/rejected (смешанный, ≥1 в каждую сторону если pending≥2).

- [ ] **Step 4: Прогнать — проходит** — `npx vitest run src/state/app-state.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domains): moderation timer resolves pending to mixed outcome"`.

---

## Task 8: Комбобокс «Добавить свой домен»

**Files:**
- Modify: `interests-triggers-editor.tsx` (заменить текстовый флоу `:774-810` комбобоксом)

**Interfaces:**
- Consumes: `knownTriggerDomains` (Task 2), `ownDomains` реестра (Task 6), `domain_registered` (Task 6).

- [ ] **Step 1: Реализовать** — кнопка «Добавить свой домен» открывает комбобокс (shadcn/base-ui combobox): опции = ранее занесённые (`ownDomains`) + свободный ввод. Выбор занесённого → активный чип, модерация не нужна. Новый: известный (`knownTriggerDomains`) → сразу активный (зелёный); неизвестный → `domain_registered` (pending) + pending-чип. Пишет в `delta.added` кампании (Task 5).

- [ ] **Step 2: Smoke** — `npm run test:screens`.

- [ ] **Step 3: Визуальная проверка** — известный домен → зелёный; неизвестный → жёлто-оранжевый pending; ранее занесённый из списка → сразу активный.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(domains): add-domain combobox (known active / new pending)"`.

---

## Task 9: pending-чип + скрытие rejected в карточке

**Files:**
- Modify: `interests-triggers-editor.tsx` (`DeltaChip`)

- [ ] **Step 1: Реализовать** — `DeltaChip` читает статус из реестра (Task 6): approved → зелёный (как сейчас), pending → жёлто-оранжевый с иконкой часов (`lucide` `Clock`), без текстовой подписи; rejected → **не рендерится** в карточке триггера. (Жёлто-оранжевый — не брендовый жёлтый CTA; отдельный warning-тон.)

- [ ] **Step 2: Smoke + визуальная проверка** — `npm run test:screens`; pending-домен рисуется с часами, rejected исчезает из карточки.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(domains): pending chip (clock) + hide rejected in trigger card"`.

---

## Task 10: Реестр в настройках — «Собственные домены и исключения»

**Files:**
- Modify: `src/sections/settings/domains-block.tsx`

- [ ] **Step 1: Реализовать** — заголовок блока → «Собственные домены и исключения». Секция пользовательских доменов из `ownDomains` со статусами (лейблы «На проверке»/«Одобрен»/«Отклонён»). Существующие глобальные исключения (`domainBlocklist`) — отдельная секция, не терять. Добавление/удаление через существующие/новые действия.

- [ ] **Step 2: Smoke** — `npm run test:screens` (экран настроек).

- [ ] **Step 3: Визуальная проверка** — реестр показывает pending/approved/rejected; по таймеру статусы меняются; глобальные исключения на месте.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(domains): settings registry 'own domains & exclusions' with statuses"`.

---

## Task 11: Судьба доменов в описании сценария

**Files:**
- Modify: `src/state/graph-description.ts` (`describeWorkflow` сигнатура + стадия `start`)
- Modify: `src/sections/campaigns/campaign-screen.tsx:82` (вызов)
- Test: `src/state/graph-description.test.ts` (создать/расширить)

**Interfaces:**
- Consumes: `RegisteredDomain[]` (Task 6), `Campaign.triggerConfig` (Task 5).
- Produces: `describeWorkflow(graph, templates, domainStatuses?): DescriptionStage[]` — доп. вход `domainStatuses` (список pending-доменов ноды скоринга). Чистая функция.

- [ ] **Step 1: Тест** — при непустом списке pending на этапе `start` `body` содержит формулировку судьбы (из Global Constraints); при пустом — не содержит.

```ts
it("appends the domain-fate line when there are pending domains", () => {
  const stages = describeWorkflow(graphWithScoring, [], { pending: ["my.ru"] });
  const start = stages.find((s) => s.id === "start")!;
  expect(start.body).toContain("отправлены на модерацию");
});
```

- [ ] **Step 2: Прогнать — падает** — `npx vitest run src/state/graph-description.test.ts`.

- [ ] **Step 3: Реализовать** — добавить опциональный вход `domainStatuses`; в стадии `start` при наличии pending дописать детерминированную строку. Обновить вызов в `campaign-screen.tsx:82`, собрав pending из `campaign.triggerConfig` + реестра. Чистоту функции сохранить (статусы — вход).

- [ ] **Step 4: Прогнать — проходит** + typecheck — `npx vitest run src/state/graph-description.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domains): deterministic domain-fate line in scenario description"`.

---

## Финальная проверка трека

- [ ] `npx tsc --noEmit` — 0 ошибок.
- [ ] `npm test` — зелёно.
- [ ] `npm run test:screens` — зелёно.
- [ ] `npm run test:visual` — просмотреть диффы; обновить baseline только осознанно (`--update-snapshots`, свой порт).
- [ ] Все критерии приёмки спек 3 (1–5) и 4 (1–6) отмечены.
- [ ] Основной чекаут не тронут (`git -C <main> status` чист).
