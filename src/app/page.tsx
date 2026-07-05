"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import { TriggerEditRegistryProvider } from "@/state/trigger-edit-context";
import { DraftQueueProvider } from "@/state/draft-queue-context";
import { ChatPanel } from "@/sections/shell/chat-panel";
import { ChatDrawer } from "@/sections/shell/chat-drawer";
import { EmailEditorPanel } from "@/sections/campaigns/email-editor-panel";
import { TemplatePreviewDrawer } from "@/sections/campaigns/template-preview-drawer";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { activeNavSection } from "@/state/app-state";
import { useChat } from "@/state/chat-context";
import { AppSidebar } from "@/sections/shell/app-sidebar";
import { LaunchFlyout } from "@/sections/shell/launch-flyout";
import { ShellBottomBar } from "@/sections/shell/shell-bottom-bar";
import { PromptInputScopeReset } from "@/sections/shell/prompt-composer";
import { WelcomeSection } from "@/sections/welcome/welcome-section";
import { IntroOverlay } from "@/sections/welcome/intro-overlay";
import { SurveySection } from "@/sections/survey/survey-section";
import { WelcomeChatProvider } from "@/sections/welcome/welcome-chat-context";
import { useOnboardingChat } from "@/sections/welcome/use-onboarding-chat";
import { GuidedCampaignSection } from "@/sections/campaigns/wizard/guided-campaign-section";
import { CampaignsSection } from "@/sections/campaigns/campaigns-section";
import { ArtifactsSection } from "@/sections/artifacts/artifacts-section";
import { ArtifactScreen } from "@/sections/artifacts/artifact-screen";
import { StreamDigestDriver } from "@/sections/artifacts/stream-digest-driver";
import { WorkflowSection } from "@/sections/campaigns/workflow-section";
import { CampaignPaymentScreen } from "@/sections/campaigns/campaign-payment-screen";
import { CampaignScreen } from "@/sections/campaigns/campaign-screen";
import { StatisticsSection } from "@/sections/statistics/statistics-section";
import { SettingsSection } from "@/sections/settings/settings-section";
import { DevPanel } from "@/components/dev/dev-panel";
import { useSeedFromWindow } from "@/components/dev/use-seed-from-window";

const SHELL_EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Инстанцирует онбординг-чат welcome ВНУТРИ ChatProvider — так хук может
 * писать в общий чат и открывать drawer (унификация поведения welcome со всем
 * интерфейсом). Раньше welcomeChat создавался выше ChatProvider и держал свою
 * историю, из-за чего welcome-экран морфился.
 */
function WelcomeChatBridge({ children }: { children: ReactNode }) {
  const welcomeChat = useOnboardingChat();
  return <WelcomeChatProvider value={welcomeChat}>{children}</WelcomeChatProvider>;
}

function BottomBarSlot() {
  const { view } = useAppState();
  const { mode } = useChat();
  // При открытом drawer нижний бар скрыт — у drawer свой композер.
  if (mode === "sidebar") return null;
  return view.kind === "guided-campaign" ? (
    <ChatPanel placeholder="Введите ваши параметры или задайте вопрос" />
  ) : (
    <ShellBottomBar />
  );
}

export default function Home() {
  const state = useAppState();
  const { view, launchFlyoutOpen, surveyStatus } = state;
  const dispatch = useAppDispatch();

  // Dev/test-only: apply a Playwright-injected state seed (no-op in production).
  useSeedFromWindow(dispatch);

  // Спека #3 — первый вход в «Настройки» (анкета ещё не пройдена) монтирует тот
  // же канонический Survey вместо настроек. Тот же fullscreen-режим, что и у
  // обычного входа в анкету.
  const settingsSurvey =
    view.kind === "section" &&
    view.name === "Настройки" &&
    surveyStatus !== "completed";

  const isFullscreen = view.kind === "survey" || settingsSurvey;

  // Routing key for the renderMain animation.
  const viewKey = view.kind;

  function renderMain() {
    if (view.kind === "welcome") {
      return <WelcomeSection />;
    }
    if (view.kind === "survey") {
      return (
        <SurveySection
          withOnboardingScreens
          onComplete={() => dispatch({ type: "start_campaign_flow" })}
        />
      );
    }
    if (view.kind === "guided-campaign") return <GuidedCampaignSection />;
    if (view.kind === "workflow") return <WorkflowSection />;
    if (view.kind === "campaign-payment") return <CampaignPaymentScreen />;
    if (view.kind === "campaign") return <CampaignScreen />;
    if (view.kind === "artifact") return <ArtifactScreen />;
    if (view.kind === "section") {
      if (view.name === "Статистика") return <StatisticsSection />;
      if (view.name === "Кампании") return <CampaignsSection />;
      if (view.name === "Артефакты") return <ArtifactsSection />;
      if (view.name === "Настройки") {
        // Первый вход — прогоняем канонический Survey (тот же флоу, без развилок).
        // По завершении surveyStatus → "completed", ветка перерисует настройки,
        // уже заполненные проверенными данными.
        if (settingsSurvey) {
          return (
            <SurveySection
              withOnboardingScreens
              onComplete={() => {
                /* surveyStatus flips to "completed" → re-render shows Настройки */
              }}
            />
          );
        }
        return <SettingsSection />;
      }
    }
    return null;
  }

  return (
    <PromptInputProvider>
      <StreamDigestDriver />
      <PromptChipsProvider>
      <ChatProvider>
      <WelcomeChatBridge>
        <DraftQueueProvider>
        <TriggerEditRegistryProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <PromptInputScopeReset />
          <AnimatePresence initial={false}>
            {!isFullscreen && (
              <motion.div
                key="sidebar"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.28, ease: SHELL_EASE }}
              >
                <AppSidebar
                  activeNav={activeNavSection(state) ?? undefined}
                  onNavChange={(nav) => dispatch({ type: "sidebar_nav", section: nav })}
                  onLaunchOpen={() => dispatch({ type: "flyout_open" })}
                  onLogoClick={() => dispatch({ type: "go_welcome" })}
                  flyoutOpen={launchFlyoutOpen}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!isFullscreen && (
            <LaunchFlyout
              open={launchFlyoutOpen}
              onClose={() => dispatch({ type: "flyout_close" })}
            />
          )}
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.26, ease: SHELL_EASE }}
                className="flex flex-1 flex-col overflow-hidden"
              >
                {renderMain()}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {!isFullscreen && (
                <motion.div
                  key="bottom-bar"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.28, ease: SHELL_EASE }}
                >
                  <BottomBarSlot />
                </motion.div>
              )}
            </AnimatePresence>
            <ChatDrawer placeholder="Введите ваши параметры или задайте вопрос" />
            <EmailEditorPanel />
            <TemplatePreviewDrawer />
            <DevPanel />
          </div>
        </div>
        <AnimatePresence>
          {view.kind === "welcome" && !state.introSeen && (
            <IntroOverlay onDismiss={() => dispatch({ type: "intro_dismissed" })} />
          )}
        </AnimatePresence>
        </TriggerEditRegistryProvider>
        </DraftQueueProvider>
      </WelcomeChatBridge>
      </ChatProvider>
      </PromptChipsProvider>
    </PromptInputProvider>
  );
}
