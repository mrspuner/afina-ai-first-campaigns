"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { TopUpModal, computeShortfall } from "@/sections/signals/top-up-modal";
import { cn } from "@/lib/utils";
import { formatRubPlain } from "@/lib/format-rub";
import { createTemplate } from "@/state/workflow-templates";
import { getScenario } from "@/data/scenarios";
import { splitCampaignPayments } from "./campaign-payments";
import { STREAM_DAYS } from "./campaign-budget-estimate";
import { paymentSplitDisplay } from "@/sections/campaigns/payment-split-display";
import { groupCommunicationLines } from "@/sections/campaigns/communication-breakdown";
import { BudgetBreakdown } from "@/sections/campaigns/budget-breakdown";
import { campaignBaseRows } from "@/sections/campaigns/campaign-metrics";
import { getCachedGraph } from "./workflow-graph-cache";
import {
  estimateTouches,
  computeCampaignCost,
  type CampaignCost,
} from "./campaign-cost";

/** Fallback audience base when neither a file nor an artifact is available. */
const FALLBACK_BASE = 10_000;

type Mode = "recommended" | "custom";

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatRub(n: number): string {
  return `₽ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

/**
 * Scoring («Сигналы») payment line text. Own bases score for free («бесплатно»).
 * For new/stream the scoring cost is a normal contributing line, shown as its
 * rouble amount — it is part of «Итого», paid together with communications.
 */
export function scoringLineDisplay(args: {
  sourceType: "own" | "new" | "stream";
  scoring: number;
}): string {
  if (args.sourceType === "own" || args.scoring <= 0) return "бесплатно";
  return formatRubPlain(args.scoring);
}

export function CampaignPaymentScreen() {
  const { view, campaigns, artifacts, balance } = useAppState();
  const dispatch = useAppDispatch();

  // Hook order is fixed across renders: we always call hooks unconditionally
  // and bail to a fallback render below if view/campaign aren't right.
  const campaignFromView =
    view.kind === "campaign-payment" ? view.campaign : null;

  const campaign = campaignFromView
    ? campaigns.find((c) => c.id === campaignFromView.id) ?? null
    : null;

  // Campaign-first audience size: uploaded base, else the campaign's artifact
  // count, else a sensible fallback. No signal join.
  const campaignArtifact = campaign
    ? artifacts
        .filter((a) => a.campaignId === campaign.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
    : undefined;
  const audienceSize =
    (campaign ? campaignBaseRows(campaign) : undefined) ??
    campaignArtifact?.count ??
    FALLBACK_BASE;

  // The signal type the cost model needs comes from the campaign's scenario.
  const scenarioSignalType = campaign?.scenario
    ? getScenario(campaign.scenario.id)?.signalType
    : undefined;

  // Расчётная стоимость кампании из её workflow (тот же модуль, что в шапке).
  // Граф берём из durable-кэша (учитывает ручные правки) либо строим из шаблона
  // по сценарию + источнику кампании; N = размер аудитории кампании.
  const cost = useMemo<CampaignCost | null>(() => {
    if (!campaign) return null;
    const graph =
      getCachedGraph(campaign.id) ??
      (scenarioSignalType
        ? createTemplate(scenarioSignalType, campaign.sourceType, campaign.channels ?? [])
        : null);
    if (!graph) return null;
    return computeCampaignCost(graph.nodes, graph.edges, audienceSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, scenarioSignalType, audienceSize, campaign?.sourceType]);

  // Two-payment split (scoring + communication), source-aware. The COMMUNICATION
  // figure comes from the SAME graph cost model as the headline (`cost.total`)
  // and the wizard Budget step, so all three converge. Scoring + the stream
  // dailyBudget still come from the source rule (the graph doesn't price
  // scoring). Free lines render «бесплатно»; degenerate own bases yield none.
  const paymentSplit = useMemo(() => {
    if (!campaign) return null;
    const flat = splitCampaignPayments({
      sourceType: campaign.sourceType ?? "new",
      channels: campaign.channels ?? [],
      baseSize: audienceSize,
    });
    const communication = cost ? cost.total : flat.communication;
    // Stream dailyBudget tracks the graph communication total (total / STREAM_DAYS)
    // so it matches the wizard, which derives it the same way.
    const dailyBudget =
      flat.dailyBudget !== undefined
        ? cost
          ? Math.round(communication / STREAM_DAYS)
          : flat.dailyBudget
        : undefined;
    return {
      ...flat,
      communication,
      total: flat.scoring + communication,
      ...(dailyBudget !== undefined ? { dailyBudget } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.sourceType, campaign?.channels, audienceSize, cost]);
  const streamDailyBudget = paymentSplit?.dailyBudget;

  // «Рекомендуемая» / the amount asked to pay = the GRAND total (Сигналы +
  // Коммуникации). Signals and communications are paid together — the prototype
  // gates the launch on balance but never deducts, so there is no double-charge.
  const recommended = paymentSplit?.total ?? 0;

  const [mode, setMode] = useState<Mode>("recommended");
  const [customValue, setCustomValue] = useState<string>(
    recommended > 0 ? String(recommended) : ""
  );
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const customParsed = parseFloat(customValue.replace(",", "."));
  const customIsValid = !isNaN(customParsed) && customParsed > 0;
  const activeBudget =
    mode === "recommended" ? recommended : customIsValid ? customParsed : 0;

  // In custom mode the breakdown blocks rescale proportionally to the chosen
  // sum so the displayed numbers reflect what the user actually pays; in
  // recommended mode they show the original computed values.
  const displayLines = useMemo(() => {
    if (!cost) return [];
    const scaling = mode === "custom" && recommended > 0;
    const factor = scaling ? customParsed / recommended : 0;
    if (!scaling) return cost.lines;
    return cost.lines.map((line) => {
      const scaledReach = Math.round(line.reach * factor);
      // Recompute sum from unit × scaledReach so the equation stays honest.
      return { ...line, reach: scaledReach, sum: Math.round(line.unit * scaledReach) };
    });
  }, [cost, mode, customParsed, recommended]);

  // «Коммуникация» breakdown grouped into «Первичные» / «Повторные», each
  // channel deduped + summed and shown once per group (aim #23). Built from the
  // already-scaled displayLines so custom-mode amounts carry through.
  const commGroups = useMemo(
    () => groupCommunicationLines(displayLines),
    [displayLines]
  );

  // Signals + communications are paid together, so «своя сумма» rescales the
  // whole grand total: both the scoring and communication lines scale
  // proportionally to the chosen sum. Recommended mode leaves the split intact.
  const displaySplit = useMemo(() => {
    if (!paymentSplit) return null;
    return paymentSplitDisplay({
      split: paymentSplit,
      mode,
      customTotal: customParsed,
      recommendedTotal: recommended,
    });
  }, [paymentSplit, mode, customParsed, recommended]);

  const touches = estimateTouches(activeBudget, audienceSize);
  const shortfall = computeShortfall(balance, activeBudget);
  const enoughBalance = shortfall <= 0;

  const [topUpOpen, setTopUpOpen] = useState(false);
  // Local "launching" state: when set, swap form for the launch animation.
  // The actual campaign_launched dispatch fires after the animation completes,
  // so the user sees feedback before being navigated to CampaignScreen.
  const [launching, setLaunching] = useState(false);
  const launchPayloadRef = useRef<{
    id: string;
    budget: number;
    dailyBudget?: number;
  } | null>(null);

  function handleBack() {
    if (!campaign) return;
    dispatch({
      type: "open_workflow",
      campaign: { id: campaign.id, name: campaign.name },
      launched: false,
    });
  }

  function startLaunchAnimation(campaignId: string, budget: number) {
    launchPayloadRef.current = {
      id: campaignId,
      budget,
      // Stream campaigns launch with a per-day budget alongside the cap (FD-5).
      ...(streamDailyBudget !== undefined ? { dailyBudget: streamDailyBudget } : {}),
    };
    setLaunching(true);
  }

  function handleLaunch() {
    if (!campaign) return;
    if (activeBudget <= 0) return;
    if (!enoughBalance) {
      setTopUpOpen(true);
      return;
    }
    startLaunchAnimation(campaign.id, activeBudget);
  }

  function handleTopUpSuccess(amount: number) {
    if (!campaign) return;
    dispatch({ type: "balance_topup", amount });
    setTopUpOpen(false);
    startLaunchAnimation(campaign.id, activeBudget);
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    setCustomValue(raw);
  }

  function selectCustom() {
    setMode("custom");
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  }

  // Fallback render (view mismatch or campaign vanished). Keeps hooks order
  // stable — early return must not skip any hook.
  if (view.kind !== "campaign-payment" || !campaign) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Кампания не найдена.
      </div>
    );
  }

  if (launching) {
    return (
      <LaunchAnimation
        onDone={() => {
          const payload = launchPayloadRef.current;
          if (!payload) return;
          dispatch({
            type: "campaign_launched",
            id: payload.id,
            timestamp: new Date().toISOString(),
            budget: payload.budget,
            ...(payload.dailyBudget !== undefined
              ? { dailyBudget: payload.dailyBudget }
              : {}),
          });
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[120px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {/* Header — back button + campaign name */}
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

        {/* Two-payment split — scoring + communication (source-aware, §5) */}
        {/* Breakdown detail («Из чего складывается») is merged inline after «Коммуникация». */}
        {displaySplit && (
          <div className="rounded-lg border border-border bg-card px-4 py-3.5">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Платежи
            </h2>
            <div className="mt-2.5">
              <BudgetBreakdown
                signalsDisplay={scoringLineDisplay({
                  sourceType: campaign.sourceType ?? "new",
                  scoring: displaySplit.scoring,
                })}
                communicationDisplay={formatRubPlain(displaySplit.communication)}
                totalDisplay={formatRubPlain(displaySplit.total)}
                commGroups={commGroups}
                formatCell={formatRubPlain}
                footer={
                  streamDailyBudget !== undefined ? (
                    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 text-sm">
                      <span className="text-muted-foreground">
                        Дневной бюджет · потолок
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatRubPlain(streamDailyBudget)} ·{" "}
                        {formatRubPlain(displaySplit.total)}
                      </span>
                    </div>
                  ) : undefined
                }
              />
            </div>
          </div>
        )}

        {/* Budget cards — mirror of the wizard budget step */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("recommended")}
            disabled={recommended <= 0}
            className={cn(
              "relative flex h-[140px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === "recommended"
                ? "border-brand/60 bg-brand-muted"
                : "border-border bg-card hover:bg-accent/50",
              recommended <= 0 && "cursor-not-allowed opacity-50"
            )}
          >
            <RadioDot active={mode === "recommended"} />
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-widest",
                mode === "recommended"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Рекомендуемая
            </span>
            <span
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                mode === "recommended"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {recommended > 0 ? formatRub(recommended) : "—"}
            </span>
            <span className="mt-auto text-xs text-muted-foreground">
              {cost
                ? paymentSplit && paymentSplit.scoring > 0
                  ? `Сигналы ${formatNumber(paymentSplit.scoring)} ₽ + коммуникации ${formatNumber(paymentSplit.communication)} ₽`
                  : `Первичные ${formatNumber(cost.primary)} ₽ + повторные ${formatNumber(cost.repeat)} ₽`
                : "На основе размера аудитории"}
            </span>
          </button>

          <button
            type="button"
            onClick={selectCustom}
            className={cn(
              "relative flex h-[140px] flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === "custom"
                ? "border-brand/60 bg-brand-muted"
                : "border-border bg-card hover:bg-accent/50"
            )}
          >
            <RadioDot active={mode === "custom"} />
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-widest",
                mode === "custom"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Своя сумма
            </span>
            <div
              className="relative mt-1 w-full"
              onClick={(e) => {
                if (mode === "custom") e.stopPropagation();
              }}
            >
              <Input
                ref={customInputRef}
                type="text"
                inputMode="decimal"
                placeholder="Например, 500"
                value={customValue}
                onChange={handleCustomChange}
                disabled={mode !== "custom"}
                className={cn(
                  "pr-8 text-lg tabular-nums",
                  mode !== "custom" && "cursor-pointer"
                )}
                aria-label="Своя сумма"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                ₽
              </span>
            </div>
            <span className="mt-auto text-xs text-muted-foreground">
              Введите свою сумму
            </span>
          </button>
        </div>

        {/* Touches forecast */}
        <p className="text-sm text-muted-foreground">
          Прогноз касаний:{" "}
          <span className="font-medium text-foreground">
            {touches > 0 ? formatNumber(touches) : "—"}
          </span>
        </p>

        {/* Inline shortfall hint — only when balance falls short */}
        {!enoughBalance && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Не хватает ₽{formatNumber(shortfall)}
          </p>
        )}

        <Separator />

        <div className="flex justify-start">
          <Button
            onClick={handleLaunch}
            disabled={activeBudget <= 0}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
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

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 top-3 h-3 w-3 rounded-full border-2 transition-colors",
        active
          ? "border-foreground bg-foreground"
          : "border-border bg-transparent"
      )}
    />
  );
}

const LAUNCH_DURATION = 1600;

function LaunchAnimation({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), LAUNCH_DURATION);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-promptbar pt-[120px]">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Запускаем кампанию
        </h1>
      </div>
    </div>
  );
}
