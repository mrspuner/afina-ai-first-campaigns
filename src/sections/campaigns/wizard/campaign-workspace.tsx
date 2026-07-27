"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CampaignStepper } from "@/sections/campaigns/wizard/campaign-stepper";
import { useAppDispatch } from "@/state/app-state-context";
import { StepData, initialStepData, type Channel } from "@/types/campaign";
import { Step1Scenario } from "@/sections/campaigns/wizard/steps/step-1-scenario";
import { StepIntent } from "@/sections/campaigns/wizard/steps/step-intent";
import { Step2Interests } from "@/sections/campaigns/wizard/steps/step-2-interests";
import { StepAnalysis } from "@/sections/campaigns/wizard/steps/step-analysis";
import { StepFile, sameFileSet } from "@/sections/campaigns/wizard/steps/step-file";
import { StepIntegration } from "@/sections/campaigns/wizard/steps/step-integration";
import { StepChannels } from "@/sections/campaigns/wizard/steps/step-channels";
import { StepBudget } from "@/sections/campaigns/wizard/steps/step-budget";
import {
  computeStepTransition,
  invalidatedBy,
  resetFieldsFor,
} from "@/sections/campaigns/wizard/wizard-navigation";
import { stepsForIntent, type WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";

/** Fallback audience base when no file row-count is known (mirrors estimator). */
const FALLBACK_BASE = 10_000;

export interface LaunchRequest {
  scenarioId: string;
  cost: number;
  count: number;
  /** Snapshot of the wizard's StepData at launch — used by `Открыть и
   *  редактировать` to re-hydrate the wizard later. */
  stepData: StepData;
  proceed: () => void;
}

function WorkspaceInner({
  onLaunchRequested,
  initialScenario,
  initialStepDataOverride,
  initialStep,
}: {
  onLaunchRequested?: (req: LaunchRequest) => void;
  initialScenario?: { id: string; name: string };
  /** Hydrate the wizard with a previously captured StepData snapshot —
   *  used by the "Открыть и редактировать" path. */
  initialStepDataOverride?: StepData;
  /** Override the starting step. Defaults to 2 when `initialScenario` is set. */
  initialStep?: number;
}) {
  const defaultStartStep = initialScenario ? 2 : 1;
  const startStep = initialStep ?? defaultStartStep;
  const [currentStep, setCurrentStep] = useState(startStep);
  const [maxStep, setMaxStep] = useState(startStep);
  const [animatingStep, setAnimatingStep] = useState<number | null>(startStep);
  const [stepData, setStepData] = useState<StepData>(
    initialStepDataOverride
      ? initialStepDataOverride
      : initialScenario
      ? { ...initialStepData, scenario: initialScenario.id }
      : initialStepData
  );
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Seed the scroll target on initial mount so resume entries (`initialStep`
  // > 1) land directly on the latest available step instead of opening at
  // the top and forcing the user to scroll. The post-commit effect below
  // consumes the pending scroll on the very first render.
  const pendingScroll = useRef<{ step: number; behavior: ScrollBehavior } | null>(
    startStep > 1 ? { step: startStep, behavior: "instant" } : null
  );
  const dispatch = useAppDispatch();

  // Publish the visible step into shared state so the prompt-bar can render
  // step-specific helpers (budget-help chip on step 5). Cleared on unmount
  // so navigating away kills the chip immediately.
  useEffect(() => {
    dispatch({ type: "wizard_step_changed", step: currentStep });
  }, [currentStep, dispatch]);
  useEffect(
    () => () => {
      dispatch({ type: "wizard_step_changed", step: null });
    },
    [dispatch]
  );

  function scrollToStep(step: number, behavior: ScrollBehavior = "smooth") {
    stepRefs.current[step]?.scrollIntoView({ behavior, block: "start" });
  }

  // Runs after every commit — guaranteed the new step's DOM node exists
  useEffect(() => {
    if (!pendingScroll.current) return;
    const { step, behavior } = pendingScroll.current;
    pendingScroll.current = null;
    scrollToStep(step, behavior);
  });

  const advanceTo = useCallback((next: number) => {
    setMaxStep((m) => Math.max(m, next));
    setAnimatingStep(next);
    setCurrentStep(next);
    pendingScroll.current = { step: next, behavior: "smooth" };
  }, []);

  const handleNext = useCallback(
    (partial: Partial<StepData>) => {
      const scenarioChanged =
        partial.scenario !== undefined &&
        partial.scenario !== stepData.scenario;
      const intentChanged =
        partial.intent !== undefined &&
        partial.intent !== stepData.intent;

      const { step: next, resetData } = computeStepTransition({
        currentStep,
        maxStep,
        scenarioChanged,
        intentChanged,
      });

      // Changing scenario still rewinds progress to the step right after the
      // scenario picker (`next` is anchored to the scenario step, not
      // `currentStep`, so re-picking after scrolling back to the rendered
      // step-1 panel lands on step 2 instead of overshooting), but it no
      // longer wipes everything downstream: interests/triggers/base/channels
      // don't depend on the scenario (the interests catalogue is keyed off
      // the account's business direction), only the budget does. See
      // `STEP_INVALIDATES` in wizard-navigation.ts for the full dependency
      // table.
      //
      // Changing the intent still reshapes the tail of the step list itself
      // (interests / analysis / file / channels differ per intent), so its
      // full downstream reset is unchanged. When only the intent changed
      // (scenario takes priority), reset downstream data but keep scenario +
      // the new intent, then rewind to the step right after the intent
      // picker.
      if (resetData) {
        if (scenarioChanged) {
          // Сценарий больше НЕ стирает интересы, триггеры, базу и каналы: они
          // от него не зависят (каталог интересов определяется направлением
          // бизнеса аккаунта). Обнуляется только то, что перечислено в
          // STEP_INVALIDATES — бюджет.
          setStepData((prev) => ({
            ...prev,
            ...partial,
            ...resetFieldsFor(invalidatedBy("scenario")),
          }));
        } else {
          // intentChanged: preserve scenario, apply the new intent, clear the
          // rest (interests/file/fileRowCount/apiKey/channels/budget/…).
          setStepData((prev) => ({
            ...initialStepData,
            scenario: prev.scenario,
            ...partial,
          }));
        }
        setMaxStep(next);
        setAnimatingStep(next);
        setCurrentStep(next);
        pendingScroll.current = { step: next, behavior: "smooth" };
        return;
      }

      setStepData((prev) => ({ ...prev, ...partial }));
      // Revisited earlier step (other than scenario): keep filled progress,
      // jump back to the furthest reached step instead of advancing linearly.
      if (currentStep < maxStep) {
        setAnimatingStep(null);
        setCurrentStep(next);
        pendingScroll.current = { step: next, behavior: "smooth" };
        return;
      }
      advanceTo(next);
    },
    [advanceTo, currentStep, maxStep, stepData.scenario, stepData.intent]
  );

  const handleStepperClick = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    pendingScroll.current = { step, behavior: "instant" };
  }, []);

  const handleGoToStep = useCallback((step: number) => {
    setAnimatingStep(null);
    setCurrentStep(step);
    pendingScroll.current = { step, behavior: "smooth" };
  }, []);

  // Launch handoff from the Бюджет step (no summary step). Builds the
  // LaunchRequest the section consumer expects. Post-segments the audience
  // count is derived from the uploaded base size (own/new) or a scenario
  // fallback (stream). `proceed` is a no-op: open-campaign progress now lives
  // in the campaign card (sub-track D), so there is no step-7 to advance to —
  // the reducer routes the view after the signal/campaign is created.
  //
  // Fix round 2 (Task 12): StepBudget's own footer calls `onNext(partial)`
  // exactly like every other step — the wrapper below used to be
  // `() => handleLaunchFromBudget()`, silently DROPPING that partial. `cost`/
  // `stepData` were then built from the OUTER `stepData` state, which still
  // held whatever the user had BEFORE submitting Budget (`null` on a fresh
  // wizard run), so `campaign_created_from_wizard` snapshot a campaign whose
  // `budget`/`wizardData.budget` never carried the amount the user actually
  // picked. `stepData` also won't have re-rendered with `partial` yet at this
  // point in the same tick (unlike `handleNext`, which is never the very last
  // call before a snapshot is taken) — so `merged` below, not bare `stepData`,
  // is what `cost`/`stepData` in the LaunchRequest must read.
  const handleLaunchFromBudget = useCallback(
    (partial: Partial<StepData>) => {
      const merged = { ...stepData, ...partial };
      if (!onLaunchRequested) {
        handleNext(partial);
        return;
      }
      onLaunchRequested({
        scenarioId: merged.scenario ?? "",
        cost: merged.budget ?? 0,
        count: merged.fileRowCount ?? FALLBACK_BASE,
        stepData: merged,
        proceed: () => {},
      });
    },
    [handleNext, onLaunchRequested, stepData]
  );

  // The intent-gated step sequence. The numeric currentStep/maxStep are
  // 1-based INDICES into this list; the id at step N is steps[N-1].
  const steps = stepsForIntent(stepData.intent);

  function renderStepContent(step: number) {
    // `active` lets each step publish its own PromptBar hints only while it is
    // the current step (all reached steps stay mounted in the scroll column).
    const props = { data: stepData, onNext: handleNext, active: step === currentStep };
    // «Назад» возвращает на предыдущий шаг (плавный скролл к нему). Шаг 1
    // автопереходит по выбору сценария и футера не имеет, поэтому начинаем
    // прокидывать onBack со 2-го.
    const onBack = () => handleGoToStep(step - 1);
    // Intent-gated flow (spec Часть I): the visible steps depend on the chosen
    // intent. Budget is always the last step and triggers the launch.
    const id = steps[step - 1];
    switch (id) {
      case "scenario": return <Step1Scenario {...props} />;
      case "intent": return <StepIntent {...props} onBack={onBack} />;
      case "interests": return <Step2Interests {...props} onBack={onBack} />;
      case "analysis": return <StepAnalysis {...props} onBack={onBack} />;
      case "file": return <StepFile {...props} onBack={onBack} />;
      case "integration": return <StepIntegration {...props} onBack={onBack} />;
      case "channels": return <StepChannels {...props} onBack={onBack} />;
      case "budget":
        return (
          <StepBudget
            {...props}
            onBack={onBack}
            onNext={handleLaunchFromBudget}
          />
        );
      default: return null;
    }
  }

  const visibleSteps = Array.from({ length: maxStep }, (_, i) => i + 1);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden transition-[padding] duration-300"
      style={{ paddingRight: "var(--chat-sidebar-width, 0px)" }}
    >
      {currentStep >= 1 && (
        <div
          className="absolute top-6 z-10 transition-[right] duration-300"
          style={{ right: "calc(1.5rem + var(--chat-sidebar-width, 0px))" }}
        >
          {/* Пока степпер виден — переход по любому пройденному шагу работает
              всегда, в обе стороны. Шаг 7 («Обработка») неинтерактивен сам по
              себе как активный шаг во время процесса, но не блокирует остальные
              (раньше disabled={currentStep === 7} замораживал весь степпер). */}
          <CampaignStepper
            steps={steps}
            currentStep={currentStep}
            maxStep={maxStep}
            onStepClick={handleStepperClick}
          />
        </div>
      )}

      {/* Scrollable step column — extra bottom padding so content clears the floating input */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {visibleSteps.map((step) => (
          <motion.div
            key={step}
            ref={(el) => { stepRefs.current[step] = el; }}
            initial={step === animatingStep ? { y: 60, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-h-screen shrink-0 flex-col items-center justify-center px-8 pb-promptbar pt-10"
          >
            {renderStepContent(step)}
          </motion.div>
        ))}
      </div>

    </div>
  );
}

/** Каналы совпадают по составу И порядку — `toggleChannel` держит канонический
 *  порядок CHANNELS, так что сравнение по индексу корректно определяет «то же
 *  значение». */
function channelsEqual(a: Channel[], b: Channel[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/**
 * Отличается ли живое значение шага (переданное через `onValueChange`) от
 * снапшота кампании — единственный вопрос, который решает, каскадирует ли
 * правка (см. `STEP_INVALIDATES` в wizard-navigation.ts). Только шаги,
 * которые вообще зовут `onValueChange` (scenario/analysis/file/channels),
 * когда-либо доходят сюда с непустым `partial`.
 */
function stepValueDiffers(
  step: WizardStepId,
  partial: Partial<StepData>,
  snapshot: StepData
): boolean {
  switch (step) {
    case "scenario":
      return partial.scenario !== undefined && partial.scenario !== snapshot.scenario;
    case "analysis":
      return (
        partial.analysisMode !== undefined &&
        partial.analysisMode !== snapshot.analysisMode
      );
    case "file":
      return partial.files !== undefined && !sameFileSet(partial.files, snapshot.files);
    case "channels":
      return (
        partial.channels !== undefined && !channelsEqual(partial.channels, snapshot.channels)
      );
    default:
      return false;
  }
}

/**
 * Изолированная сессия точечной правки одного шага с карточки (Task 12).
 *
 * Колонка начинается с ОДНОГО запрошенного шага и растёт РОВНО на те шаги,
 * которые правка обнулила (`invalidatedBy`/`resetFieldsFor` из Task 10) — та
 * же таблица зависимостей, что обслуживает обычный проход визарда, здесь
 * читается ещё раз, а не задублирована. «Далее» перемещает пользователя
 * ВНУТРИ сессии (правит только ЛОКАЛЬНЫЕ накопленные правки — `edits`, см.
 * `deriveStepData` ниже) и не пишет наружу ничего; «Применить и вернуться»
 * коммитит ОДИН раз, на основной кнопке последнего шага сессии. «Отмена»
 * возвращает на карточку без коммита.
 *
 * Почему это важно конкретно: если бы каждое «Далее» писало наружу, то
 * пользователь, сменивший каналы и бросивший сессию на середине, оставил бы
 * кампанию с новыми каналами и `budget: null` — черновик, который нельзя
 * запустить. Коммит один раз означает, что отмена ничего не меняет.
 */
function IsolatedEditSession({
  editing,
  snapshot,
  onCommit,
  onCancel,
}: {
  editing: { campaignId: string; step: WizardStepId };
  snapshot: StepData;
  onCommit?: (stepData: StepData) => void;
  onCancel?: () => void;
}) {
  // «Отмена» рендерится ВСЕГДА (левая кнопка футера показывается только когда
  // `onBack` truthy) — коллбек опционален для вызывающего кода/тестов, но
  // сама кнопка не должна пропадать только потому, что его не передали.
  const handleCancel = onCancel ?? (() => {});
  // Явные правки пользователя — ТОЛЬКО то, что реально пришло через onNext
  // конкретного шага (клик по его собственной кнопке). Снапшот НИКОГДА не
  // мутируется напрямую, и обнулённые каскадом поля НЕ запоминаются как
  // «сброшено навсегда» — маска (resetFieldsFor) выводится заново на каждый
  // рендер из ЖИВОГО pendingResets (см. `deriveStepData` ниже), а не
  // применяется один раз и не переживает свою причину.
  //
  // Fix round 1 (Task 12): раньше маска накатывалась ДЕСТРУКТИВНО на клике
  // «Далее» и оставалась в состоянии сессии навсегда — стоило пользователю
  // вернуться на «Каналы» и восстановить исходный набор (тот же, что в
  // снапшоте), «Далее» уже необратимо занулило бюджет, и коммит уходил с
  // `budget: undefined` при НЕИЗМЕНИВШИХСЯ каналах — карточка показывала
  // ₽14 580 (фолбэк-оценку) вместо настоящих ₽526 973, вторая цифра «правды»
  // (граф/ЗАПУСК) при этом расходилась. Теперь маска — производная величина:
  // как только живой выбор снова совпал со снапшотом, `pendingResets`
  // пустеет, и обнулять уже нечего — снапшотное значение просвечивает само.
  const [edits, setEdits] = useState<Partial<StepData>>({});
  const [activeStepId, setActiveStepId] = useState<WizardStepId>(editing.step);
  const [animatingStep, setAnimatingStep] = useState<WizardStepId | null>(editing.step);
  // Живое, реактивное «что обнулилось» — обновляется по каждому onValueChange
  // активного шага (см. handleValueChange). НЕ хранит историю: как только
  // очередной live-выбор снова совпадает со снапшотом, обнулять нечего, и
  // предыдущая инвалидация не «залипает».
  const [pendingResets, setPendingResets] = useState<WizardStepId[]>([]);

  // Единственное место, где снапшот, накопленные явные правки и ТЕКУЩАЯ маска
  // сходятся в одно значение — что для рендера, что (плюс свежий partial
  // поверх) для коммита. Порядок спреда решает: `resetFieldsFor` идёт ПОСЛЕ
  // `withEdits` — протухшая правка обнулённого поля не переживает маску;
  // при коммите свежий `partial` активного шага спредится ПОСЛЕ маски (в
  // handleIsolatedNext) — явная правка ВСЕГДА побеждает маску, даже если шаг
  // формально всё ещё числится обнулённым.
  function deriveStepData(withEdits: Partial<StepData>): StepData {
    return { ...snapshot, ...withEdits, ...resetFieldsFor(pendingResets) };
  }

  const effectiveStepData = deriveStepData(edits);

  const orderedSteps = stepsForIntent(effectiveStepData.intent);
  const columnSet = new Set<WizardStepId>([editing.step, ...pendingResets]);
  const visibleStepIds = orderedSteps.filter((id) => columnSet.has(id));
  const activeIndex = visibleStepIds.indexOf(activeStepId);
  const isLastInColumn = activeIndex === visibleStepIds.length - 1;
  const continueLabel =
    pendingResets.length > 0 && !isLastInColumn ? "Далее" : "Применить и вернуться";

  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScroll = useRef<{ step: WizardStepId; behavior: ScrollBehavior } | null>(null);

  function scrollToStep(step: WizardStepId, behavior: ScrollBehavior = "smooth") {
    stepRefs.current[step]?.scrollIntoView({ behavior, block: "start" });
  }

  useEffect(() => {
    if (!pendingScroll.current) return;
    const { step, behavior } = pendingScroll.current;
    pendingScroll.current = null;
    scrollToStep(step, behavior);
  });

  function handleValueChange(stepId: WizardStepId, partial: Partial<StepData>) {
    const differs = stepValueDiffers(stepId, partial, snapshot);
    setPendingResets(differs ? invalidatedBy(stepId) : []);
  }

  function handleIsolatedNext(partial: Partial<StepData>) {
    const nextEdits = { ...edits, ...partial };
    // Ветка выбирается по УЖЕ показанной подписи кнопки — та и есть источник
    // истины: пользователь жмёт то, что видит.
    if (continueLabel === "Далее") {
      setEdits(nextEdits);
      const next = visibleStepIds[activeIndex + 1] ?? activeStepId;
      setAnimatingStep(next);
      setActiveStepId(next);
      pendingScroll.current = { step: next, behavior: "smooth" };
      return;
    }
    setEdits(nextEdits);
    // `partial` спредится ПОСЛЕДНИМ: если активный шаг сам входит в
    // pendingResets (штатно — «Бюджет» коммитит именно так, будучи обнулённым
    // до этого клика), его СВЕЖЕЕ значение обязано победить маску, которую
    // deriveStepData иначе наложила бы поверх.
    onCommit?.({ ...deriveStepData(nextEdits), ...partial });
  }

  function handleStepperClick(step: number) {
    const id = orderedSteps[step - 1];
    if (!id || !columnSet.has(id)) return;
    setAnimatingStep(null);
    setActiveStepId(id);
    pendingScroll.current = { step: id, behavior: "instant" };
  }

  function renderIsolatedStep(id: WizardStepId) {
    const isActive = id === activeStepId;
    const footerOverride = {
      continueLabel,
      backLabel: "Отмена",
      hidden: !isActive,
    };
    switch (id) {
      case "scenario":
        // «Сценарий» автоприменяет выбор и футера не имеет — `editing` включает
        // подтверждающий диалог смены сценария (Task 13): смена на ДРУГОЙ
        // сценарий здесь пересобирает граф кампании с нуля на коммите.
        return (
          <Step1Scenario
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onValueChange={(p) => handleValueChange("scenario", p)}
            editing
          />
        );
      case "interests":
        return (
          <Step2Interests
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onBack={handleCancel}
            footerOverride={footerOverride}
          />
        );
      case "analysis":
        return (
          <StepAnalysis
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onBack={handleCancel}
            onValueChange={(p) => handleValueChange("analysis", p)}
            footerOverride={footerOverride}
          />
        );
      case "file":
        return (
          <StepFile
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onBack={handleCancel}
            onValueChange={(p) => handleValueChange("file", p)}
            footerOverride={footerOverride}
          />
        );
      case "channels":
        return (
          <StepChannels
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onBack={handleCancel}
            onValueChange={(p) => handleValueChange("channels", p)}
            footerOverride={footerOverride}
          />
        );
      case "budget":
        return (
          <StepBudget
            data={effectiveStepData}
            active={isActive}
            onNext={handleIsolatedNext}
            onBack={handleCancel}
            footerOverride={footerOverride}
          />
        );
      default:
        return null;
    }
  }

  const currentStep = orderedSteps.indexOf(activeStepId) + 1;
  const visitedPositions = new Set(
    visibleStepIds.map((id) => orderedSteps.indexOf(id) + 1)
  );
  const maxStep = Math.max(...visitedPositions);

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden transition-[padding] duration-300"
      style={{ paddingRight: "var(--chat-sidebar-width, 0px)" }}
    >
      <div
        className="absolute top-6 z-10 transition-[right] duration-300"
        style={{ right: "calc(1.5rem + var(--chat-sidebar-width, 0px))" }}
      >
        {/* Полный список шагов — кликабельны только попавшие в колонку правки. */}
        <CampaignStepper
          steps={orderedSteps}
          currentStep={currentStep}
          maxStep={maxStep}
          onStepClick={handleStepperClick}
          visitedSteps={visitedPositions}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {visibleStepIds.map((id) => (
          <motion.div
            key={id}
            ref={(el) => { stepRefs.current[id] = el; }}
            initial={id === animatingStep ? { y: 60, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex min-h-screen shrink-0 flex-col items-center justify-center px-8 pb-promptbar pt-10"
          >
            {renderIsolatedStep(id)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function CampaignWorkspace({
  onLaunchRequested,
  initialScenario,
  initialStepDataOverride,
  initialStep,
  editing,
  onCommit,
  onCancel,
}: {
  onLaunchRequested?: (req: LaunchRequest) => void;
  initialScenario?: { id: string; name: string };
  initialStepDataOverride?: StepData;
  initialStep?: number;
  /** Точечная правка с карточки: колонка начинается с одного шага и дорастает
   *  ровно на те шаги, которые обнулила правка. */
  editing?: { campaignId: string; step: WizardStepId };
  /** Коммит правки — вызывается ОДИН раз, на основной кнопке последнего шага
   *  сессии. Промежуточные «Далее» наружу ничего не пишут: брошенная на
   *  полпути правка не должна оставить черновик с обнулённым бюджетом. */
  onCommit?: (stepData: StepData) => void;
  /** «Отмена» — возврат на карточку без коммита (не «Назад»: у изолированной
   *  сессии нет предыдущего шага визарда, есть только выход). */
  onCancel?: () => void;
} = {}) {
  if (editing) {
    // Изолированная правка гидрируется снапшотом кампании
    // (initialStepDataOverride); без него редактировать нечего — вызывающий
    // код (rebuildViewFromAddress / guided-campaign-section.tsx) уже не
    // должен сюда доходить в этом случае, но явный guard лучше падения на
    // undefined-обращениях внутри.
    if (!initialStepDataOverride) return null;
    return (
      <IsolatedEditSession
        editing={editing}
        snapshot={initialStepDataOverride}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }
  return (
    <WorkspaceInner
      onLaunchRequested={onLaunchRequested}
      initialScenario={initialScenario}
      initialStepDataOverride={initialStepDataOverride}
      initialStep={initialStep}
    />
  );
}
