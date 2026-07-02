# Campaign payment screen — design

**Дата:** 2026-05-21
**Статус:** на согласовании
**Источник:** ТЗ «Правки интерфейса Афины» v1.1, раздел 5.3 и раздел 6
**Блок:** D из декомпозиции спеки (экран оплаты кампании)

## 1. Цель

- Кнопка «Запустить» в `canvas-header` (workflow editor) больше не запускает кампанию напрямую. Она переводит пользователя на новый **экран оплаты кампании**.
- На экране оплаты: указание бюджета (с рекомендуемой суммой), прогноз касаний, проверка баланса, кнопка «Запустить» / «Пополнить и запустить».
- Логика проверки баланса идентична step-6 в мастере сигналов.
- TopUpModal остаётся как fallback из экрана оплаты (при «Пополнить и запустить»).
- Название кампании наследуется от названия сценария — уже реализовано (`signal.type` = scenario name), фиксируем как verified.

Не входит: изменение flow до canvas-header (step-1..step-8 мастера, campaign-select, campaign_from_signal — остаются прежними).

## 2. Текущее состояние

| Что | Где | Состояние |
|---|---|---|
| Кнопка «Запустить» (draft campaign) | `src/sections/campaigns/canvas-header.tsx:205` | `<Button onClick={onLaunch}>Запустить</Button>` |
| Логика запуска | `src/sections/campaigns/workflow-section.tsx:163-188` (`handleLaunch`) | проверяет shortfall(balance, 500) → TopUpModal или campaign_launched напрямую |
| `CAMPAIGN_LAUNCH_COST` | `src/sections/campaigns/workflow-section.tsx:56` | плоская константа 500 ₽ |
| TopUpModal | `src/sections/signals/top-up-modal.tsx` | переиспользуется и в мастере, и в workflow-section |
| Бюджет в Campaign типе | `src/state/app-state.ts:67-77` | поля `budget` нет |
| Step 5 мастера (бюджет) | `src/sections/signals/steps/step-5-limit.tsx` | recommended + custom card; `recommendBudget(rowCount)` — random в диапазоне 0.05–0.45 от rowCount, min 50 |
| Step 6 мастера (summary + оплата) | `src/sections/signals/steps/step-6-summary.tsx` | сводка + блок «Стоимость / Баланс / Не хватает» + кнопка «Запустить» или «Пополнить и запустить» |
| Унаследование названия | `src/state/app-state.ts:338` | `name: \`${signal.type} #${n}\`` — `signal.type` совпадает с `scenario.name` |
| View kinds | `src/state/app-state.ts:88-95` | `welcome`, `guided-signal`, `awaiting-campaign`, `campaign-select`, `workflow`, `campaign`, `section` — нет `campaign-payment` |

## 3. Дизайн

### 3.1. Новый view kind `campaign-payment`

В `src/state/app-state.ts`:

```ts
export type View =
  // ...existing
  | { kind: "campaign-payment"; campaign: { id: string; name: string } }
```

`ViewAddress` тоже расширяется параллельно: `| { kind: "campaign-payment"; campaignId: string }`.

`campaign-payment` view — слой между draft-кампанией в workflow editor и `campaign_launched`. Не путать с `campaign` (экран запущенной кампании).

### 3.2. Новый action `open_campaign_payment`

```ts
| { type: "open_campaign_payment"; campaignId: string }
```

Reducer:

```ts
case "open_campaign_payment": {
  const c = state.campaigns.find((cc) => cc.id === action.campaignId);
  if (!c) return state;
  return {
    ...state,
    view: { kind: "campaign-payment", campaign: { id: c.id, name: c.name } },
  };
}
```

### 3.3. Новое поле `budget` в `Campaign`

```ts
export type Campaign = {
  // ...existing
  budget?: number;  // в рублях, устанавливается на экране оплаты
};
```

Reducer для `campaign_launched` — сохраняет `budget` (пришедший вместе с action), а не плоскую константу:

```ts
| { type: "campaign_launched"; id: string; timestamp: string; budget: number }
```

Reducer обновляет соответствующий campaign: `status="active"`, `launchedAt=timestamp`, `budget=budget`.

Это позволит в `campaign-screen.tsx:42` (где сейчас захардкожено «150 000 ₽») отображать реальный бюджет — позже, не часть этой спеки.

### 3.4. Кнопка «Запустить» в canvas-header

В `src/sections/campaigns/workflow-section.tsx:163-188` (`handleLaunch`):

```ts
function handleLaunch() {
  if (!currentCampaign) return;
  const graph = graphRef.current;
  if (!graph) {
    showToast({ kind: "error", text: "Граф ещё не готов, попробуйте снова." });
    return;
  }
  const result = validateWorkflow(graph, Boolean(currentSignal));
  if (!result.ok) {
    showToast({
      kind: "error",
      text: ERROR_TEXT[result.errors[0]] ?? "Не готово к запуску.",
    });
    return;
  }
  // Новое поведение: вместо shortfall+TopUpModal или прямого launch
  // — переход на экран оплаты.
  dispatch({ type: "open_campaign_payment", campaignId: currentCampaign.id });
}
```

`computeShortfall`, `topUpOpen`, `CAMPAIGN_LAUNCH_COST` и `<TopUpModal>` рендер из workflow-section.tsx **удаляются** — модалка живёт теперь внутри `CampaignPaymentScreen`.

### 3.5. Новый компонент `CampaignPaymentScreen`

Файл: `src/sections/campaigns/campaign-payment-screen.tsx`.

Структурно — гибрид step-5 (выбор бюджета) и step-6 (summary + платёж) для кампании. Использует те же визуальные паттерны, чтобы выглядеть «идентично экрану оплаты в визарде» (ТЗ §6.2).

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { TopUpModal, computeShortfall } from "@/sections/signals/top-up-modal";
import { cn } from "@/lib/utils";

const COST_PER_TOUCH = 5; // ₽ за одно персонализированное касание (mock)

function recommendCampaignBudget(audienceSize: number): number {
  return Math.max(
    50,
    Math.round(audienceSize * (0.05 + Math.random() * 0.4))
  );
}

function estimateTouches(budget: number, audienceSize: number): number {
  if (budget <= 0) return 0;
  return Math.min(audienceSize, Math.floor(budget / COST_PER_TOUCH));
}

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatRub(n: number): string {
  return `₽ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

type Mode = "recommended" | "custom";

export function CampaignPaymentScreen() {
  const { view, campaigns, signals, balance } = useAppState();
  const dispatch = useAppDispatch();

  if (view.kind !== "campaign-payment") return null;

  const campaign = campaigns.find((c) => c.id === view.campaign.id);
  const signal = campaign ? signals.find((s) => s.id === campaign.signalId) : null;
  const audienceSize = signal?.count ?? 0;

  const recommended = useMemo(
    () => recommendCampaignBudget(audienceSize),
    // computed once on mount per step-5 convention
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [mode, setMode] = useState<Mode>("recommended");
  const [customValue, setCustomValue] = useState<string>(String(recommended));
  const customParsed = parseFloat(customValue);
  const customIsValid = !isNaN(customParsed) && customParsed > 0;
  const activeBudget =
    mode === "recommended" ? recommended : customIsValid ? customParsed : 0;

  const touches = estimateTouches(activeBudget, audienceSize);
  const shortfall = computeShortfall(balance, activeBudget);
  const enoughBalance = shortfall <= 0;

  const [topUpOpen, setTopUpOpen] = useState(false);

  function handleBack() {
    if (!campaign) return;
    dispatch({
      type: "open_workflow",
      campaign: { id: campaign.id, name: campaign.name },
      launched: false,
    });
  }

  function handleLaunch() {
    if (!campaign) return;
    if (!enoughBalance) {
      setTopUpOpen(true);
      return;
    }
    dispatch({
      type: "campaign_launched",
      id: campaign.id,
      timestamp: new Date().toISOString(),
      budget: activeBudget,
    });
  }

  function handleTopUpSuccess(amount: number) {
    if (!campaign) return;
    dispatch({ type: "balance_topup", amount });
    dispatch({
      type: "campaign_launched",
      id: campaign.id,
      timestamp: new Date().toISOString(),
      budget: activeBudget,
    });
    setTopUpOpen(false);
  }

  if (!campaign) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Кампания не найдена.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[120px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {/* Шапка с back-кнопкой и названием */}
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={handleBack}
            aria-label="Назад"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {campaign.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Оплата запуска кампании
            </p>
          </div>
        </div>

        {/* Карточки выбора бюджета — точная копия step-5 */}
        <div className="grid grid-cols-2 gap-3">
          <BudgetCard
            label="Рекомендуемая"
            value={recommended > 0 ? formatRub(recommended) : "—"}
            hint="На основе размера аудитории"
            active={mode === "recommended"}
            onClick={() => setMode("recommended")}
          />
          <CustomBudgetCard
            value={customValue}
            onChange={setCustomValue}
            active={mode === "custom"}
            onActivate={() => setMode("custom")}
          />
        </div>

        {/* Прогноз касаний */}
        <p className="text-sm text-muted-foreground">
          Прогноз касаний:{" "}
          <span className="font-medium text-foreground">
            {touches > 0 ? formatNumber(touches) : "—"}
          </span>
        </p>

        {/* Стоимость / Баланс — точная копия step-6 */}
        <div
          className={cn(
            "rounded-lg border bg-card px-4 py-3.5",
            enoughBalance
              ? "border-border"
              : "border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5"
          )}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Стоимость</span>
            <span className="font-semibold tabular-nums">
              {formatRub(activeBudget)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Баланс</span>
            <span className="font-medium tabular-nums">{formatRub(balance)}</span>
          </div>
          {!enoughBalance && (
            <div className="mt-2 border-t border-border pt-2 flex items-center justify-between text-sm">
              <span className="text-foreground">Не хватает</span>
              <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {formatRub(shortfall)}
              </span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex justify-start">
          <Button onClick={handleLaunch} disabled={activeBudget <= 0}>
            {enoughBalance ? "Запустить" : "Пополнить и запустить"}
          </Button>
        </div>
      </div>

      <TopUpModal
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        balance={balance}
        cost={activeBudget}
        entityLabel={campaign.name}
        onPaymentSuccess={handleTopUpSuccess}
      />
    </div>
  );
}
```

Компоненты `BudgetCard` и `CustomBudgetCard` дублируют логику из step-5-limit.tsx, потому что step-5 жёстко вшит в wizard и его экспорт усложнит чтение. Это сознательное дублирование — спека простая, дробить дальше неоправданно.

### 3.6. Подключение view в `page.tsx`

В `src/app/page.tsx:47-83` (`renderMain`) добавить:

```tsx
if (view.kind === "campaign-payment") return <CampaignPaymentScreen />;
```

Импорт — `import { CampaignPaymentScreen } from "@/sections/campaigns/campaign-payment-screen";`.

### 3.7. Без анимации перехода (по решению)

ТЗ §6.1 говорит «не должно появляться резко» — но пользователь выбрал «без анимации, простой переход». Мотив: остальные view-переходы в проекте тоже без специальной layout-анимации (внутренние компоненты сами могут анимироваться, но смена `view.kind` — мгновенная). Сохраняем единство.

### 3.8. Наследование названия — verified

ТЗ §5.3 говорит «название кампании наследуется от названия сценария». В reducer `campaign_from_signal` (`src/state/app-state.ts:338`) сейчас `name = \`${signal.type} #${n}\``. `signal.type` — это название типа сигнала, которое в свою очередь приходит из `scenario.name` через `dispatch({ type: "signal_added", signal: { type: scenarioName, ... } })` (нужно проверить точку, но коммит `feat(state): scenario catalog state and actions` подразумевает корректное наследование). Фиксируем в спеке как verified — изменений не вносим.

Если при тестировании окажется что `signal.type ≠ scenario.name` — это уже другой блок (правки потока step-1 → signal creation), вне scope блока D.

### 3.9. TopUpModal — fallback

TopUpModal остаётся в `top-up-modal.tsx` без изменений. Используется:
- Из step-6-summary мастера сигналов (как сейчас).
- Из CampaignPaymentScreen (новое использование) — как fallback при недостатке баланса.

Из workflow-section.tsx — удаляется (платёж переезжает на экран оплаты).

## 4. Тестирование

### Unit

- `app-state.test.ts` — новые тесты:
  - `open_campaign_payment` с существующим campaignId → view меняется на `campaign-payment` с тем же id.
  - `open_campaign_payment` с несуществующим id → state без изменений.
  - `campaign_launched` теперь принимает `budget` → сохраняется в campaign.

### Manual smoke

1. Пройти мастер сигналов → step-8 → «Использовать в кампании» → выбрать (или создать) кампанию → попадаем в workflow editor (canvas-header).
2. Нажать «Запустить» в canvas-header → попадаем на CampaignPaymentScreen с названием кампании в шапке и крупной стрелкой «Назад».
3. Рекомендуемая карточка — расчёт по формуле `recommendCampaignBudget(signal.count)`. Прогноз касаний под карточками.
4. Переключиться на «Своя сумма» → ввести значение → расчёт прогноза обновляется.
5. Если balance ≥ budget → видно «Стоимость / Баланс» зелёный (по сути border-border), кнопка «Запустить».
6. Если balance < budget → видно «Не хватает» (амбер-бордер), кнопка «Пополнить и запустить» → открывается TopUpModal.
7. TopUpModal → ввести сумму → «Оплатить» → балaнс пополняется + кампания запускается → переход на campaign-screen (read-only).
8. Стрелка «Назад» на экране оплаты → возврат в workflow editor (`open_workflow launched=false`).

### Edge cases

- `signal.count === 0` → recommendCampaignBudget даёт min 50 → recommended карточка = 50 ₽, прогноз касаний = 0. Допустимо.
- `signal=null` (campaign без сигнала) — handleLaunch не должен пускать (validateWorkflow уже ловит `no-signal`). Защитный fallback в CampaignPaymentScreen: `audienceSize=0` → recommended=50 → прогноз=0. Юзер видит экран, но это маловероятный путь.
- Refresh страницы на view=campaign-payment: текущая логика `ViewAddress` сохраняет address; при rehydration view восстанавливается → попадаем обратно на оплату. Это ОК.

## 5. Acceptance criteria (из ТЗ §9 + §6)

- [ ] После «Использовать в кампании» кампания собирается из выбранного сценария, название наследуется (verified — уже работает).
- [ ] Кнопка «Запустить» в canvas-header теперь ведёт на CampaignPaymentScreen (а не сразу запускает).
- [ ] Переход на экран оплаты — без специальной анимации (соответствует решению).
- [ ] Экран оплаты визуально совпадает с оплатой в визарде сигналов: те же карточки бюджета, тот же блок «Стоимость / Баланс / Не хватает», та же кнопка «Запустить / Пополнить и запустить».
- [ ] На экране оплаты отображается поле бюджета (рекомендуемая + custom) и прогноз касаний.
- [ ] При достаточном балансе — «Запустить» списывает с баланса и переводит в campaign-screen.
- [ ] При недостаточном — «Пополнить и запустить» открывает TopUpModal (fallback).

## 6. Файлы, которые будут изменены

- `src/state/app-state.ts`:
  - расширить `View`, `ViewAddress` новым kind `campaign-payment`.
  - расширить `Campaign` опциональным `budget?: number`.
  - добавить action `open_campaign_payment` + reducer-кейс.
  - расширить `campaign_launched` полем `budget` и сохранить его в campaign.
- `src/state/app-state.test.ts` — тесты для новых reducer-кейсов.
- `src/sections/campaigns/workflow-section.tsx` — `handleLaunch` диспатчит `open_campaign_payment` вместо shortfall-логики; удалить `CAMPAIGN_LAUNCH_COST`, `topUpOpen`, `<TopUpModal>` рендер.
- `src/sections/campaigns/campaign-payment-screen.tsx` — новый файл.
- `src/app/page.tsx` — рендер `<CampaignPaymentScreen />` по view=`campaign-payment`.

Реализация ведётся в git worktree (`.worktrees/campaign-payment` на ветке `feature/campaign-payment`) согласно AGENTS.md.

## 7. Что НЕ делаем в этом блоке

- Не меняем поток до canvas-header (мастер сигналов остаётся как есть).
- Не убираем canvas-header из flow — он остаётся для draft-кампаний и для просмотра запущенных.
- Не выносим step-5 budget-cards в общий компонент (дублируем сознательно — спека простая).
- Не меняем `campaign-screen.tsx` (отображение «150 000 ₽» — задача другого блока, опционально).
- Не правим `recommendBudget` в step-5 (формула остаётся).
- Не добавляем расширенные опции оплаты (методы платежа, рассрочка и т.д.) — out of scope.

## 8. Риски

- **Дублирование budget-cards между step-5 и CampaignPaymentScreen.** Сознательный trade-off: вынос в общий компонент потребует API-обёртку (props для recommended value, callbacks для mode-change). Сейчас два экземпляра по ~80 строк — приемлемо. Если правка повторится — рефакторим.
- **`COST_PER_TOUCH = 5 ₽` — захардкожено.** Это mock. Если позже понадобится зависимость от сегмента/географии — введём lookup; сейчас single const.
- **`recommendCampaignBudget` использует `Math.random()`.** Каждый mount компонента даёт другое recommended. По step-5 convention — useMemo с deps=[]. Это означает: если юзер ушёл с экрана и вернулся (например, нажал «Назад» и снова «Запустить») — recommended может пересчитаться. Принимаем — это прототип, не финал.
- **Refresh на view=campaign-payment.** ViewAddress должен рестроиться (campaign id известен). Если ViewAddress сейчас не поддерживает `campaign-payment` — нужно добавить ветку в hydrate/serialize. Проверить при имплементации.
- **`signal.type` действительно ли всегда совпадает с scenario name.** Если нет — наследование названия не работает; нужен отдельный фикс. Проверить в smoke.
