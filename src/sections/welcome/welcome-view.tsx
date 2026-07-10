"use client";

import { Button } from "@/components/ui/button";
import { isCampaignDone } from "@/state/app-state";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { curatedScenarioCount } from "@/data/scenarios";
import { pluralRu } from "@/lib/plural-ru";
import { OnboardingStepCards } from "./onboarding-step-cards";

const SCENARIOS_PICKED_TITLE = `Подобрали ${curatedScenarioCount} ${pluralRu(
  curatedScenarioCount,
  ["сценарий", "сценария", "сценариев"],
)} под ваш бизнес`;

/**
 * Welcome-экран. Статичен: онбординг-вопросы теперь уходят в общий чат/drawer
 * (см. useOnboardingChat), поэтому экран больше не «морфится» при старте
 * диалога — герой остаётся на месте.
 */
export function WelcomeView() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const done = isCampaignDone(state);
  const surveyCompleted = state.surveyStatus === "completed";

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pt-16 pb-promptbar">
      <div className="flex w-full max-w-2xl flex-col items-start gap-8">
        <FirstTimeHero
          surveyCompleted={surveyCompleted || done}
          onOpenSurvey={() => dispatch({ type: "open_survey" })}
          onCreateScenario={() => dispatch({ type: "start_campaign_flow" })}
        />
      </div>
    </div>
  );
}

export function FirstTimeHero({
  surveyCompleted,
  onOpenSurvey,
  onCreateScenario,
}: {
  surveyCompleted: boolean;
  onOpenSurvey: () => void;
  onCreateScenario: () => void;
}) {
  return (
    <>
      <div className="flex w-full flex-col items-start gap-3">
        <h1 className="text-[28px] font-bold leading-8 text-foreground">
          Добро пожаловать в афину
        </h1>
        <p className="text-[18px] leading-[26px] text-muted-foreground">
          В афине вы запускаете кампании. Кампания находит, кому из ваших
          клиентов нужна коммуникация прямо сейчас, и может сама отправить
          сообщения — или работать по загруженной базе. Платите только за то,
          что используете: сигналы, коммуникацию или всё вместе.
        </p>
      </div>

      <div className="flex w-full flex-col items-start gap-7">
        <OnboardingStepCards />

        <div className="flex w-full flex-row items-center gap-4 rounded-lg border border-brand/30 bg-brand-muted p-6">
          <div className="flex flex-1 flex-col gap-2">
            <h2 className="text-base font-medium text-foreground">
              {surveyCompleted
                ? SCENARIOS_PICKED_TITLE
                : "Расскажите о вашей задаче — подберём сценарии"}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/70">
              {surveyCompleted
                ? "Создайте кампанию по одному из них или выберите свой сценарий из каталога."
                : "За минуту афина предложит подходящие варианты."}
            </p>
          </div>
          {surveyCompleted ? (
            <Button onClick={onCreateScenario} className="shrink-0">
              Создать кампанию
            </Button>
          ) : (
            <Button onClick={onOpenSurvey} className="shrink-0">
              Подобрать сценарии
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
