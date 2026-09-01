import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuidedCampaignSection } from "./guided-campaign-section";
import { AppStateProvider, useAppDispatch } from "@/state/app-state-context";
import { PromptChipsProvider } from "@/state/prompt-chips-context";
import { ChatProvider } from "@/state/chat-context";
import type { Campaign, Preset } from "@/state/app-state";
import { initialStepData, type StepData } from "@/types/campaign";
import { getScenario } from "@/data/scenarios";
import { createTemplate, applyCampaignContext } from "@/state/workflow-templates";
import { computeNeedsAttention } from "@/state/workflow-validation";
import { computeSublabels } from "@/state/node-sublabel";
import { getCachedGraph, setCachedGraph } from "@/sections/campaigns/workflow-graph-cache";
import type { WorkflowNode } from "@/types/workflow";

// StepContent печатает заголовок через setInterval — тот же синхронный шим,
// что и в campaign-workspace.test.tsx.
vi.mock("@/sections/campaigns/wizard/steps/step-content", () => ({
  StepContent: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

/** Собирает граф ровно тем же путём, что и `initialGraph` в workflow-view.tsx
 *  (applyCampaignContext → computeNeedsAttention → computeSublabels) — так
 *  прайм-кэш в тестах не расходится с тем, что реально пишет живой граф-таб
 *  при первом открытии. */
function primeGraph(campaign: Campaign) {
  const scenario = getScenario(campaign.scenario!.id)!;
  const template = createTemplate(scenario.signalType, campaign.sourceType, campaign.channels ?? []);
  const withContext = applyCampaignContext(template, {
    files: campaign.files,
    interests: campaign.interests,
    triggers: campaign.triggers,
  });
  const primed = {
    nodes: computeSublabels(computeNeedsAttention(withContext.nodes)),
    edges: withContext.edges,
  };
  setCachedGraph(campaign.id, primed);
  return primed;
}

/** Ищет по `nodeType`, а не `id` — `withSignalPath` перевыпускает узел
 *  сигнала под id'ом `signal_result` (сохраняя `nodeType: "signal"`), так что
 *  тип остаётся единственным стабильным ориентиром. */
function findNode(nodes: WorkflowNode[], nodeType: string): WorkflowNode {
  const found = nodes.find((n) => n.data.nodeType === nodeType);
  if (!found) throw new Error(`node of type ${nodeType} not found`);
  return found;
}

function Harness({ campaign, step }: { campaign: Campaign; step: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const preset: Preset = { key: "full", label: "test", campaigns: [campaign], artifacts: [] };
    dispatch({ type: "preset_applied", preset });
    dispatch({
      type: "campaign_step_edit_requested",
      campaignId: campaign.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      step: step as any,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, dispatch]);
  return <GuidedCampaignSection />;
}

function renderEditing(campaign: Campaign, step: string) {
  return render(
    <AppStateProvider>
      <PromptChipsProvider>
        <ChatProvider>
          <Harness campaign={campaign} step={step} />
        </ChatProvider>
      </PromptChipsProvider>
    </AppStateProvider>,
  );
}

describe("GuidedCampaignSection — пересборка кэша графа на КАЖДОМ коммите (Item 1, финальное ревью)", () => {
  afterEach(cleanup);

  it("смена сценария: интересы/триггеры/база пережили полную пересборку графа", () => {
    const wizardData: StepData = {
      ...initialStepData,
      scenario: "cur-abandoned-cart",
      channels: ["sms", "email"],
      interests: ["Кредитование"],
      triggers: ["Посещение сайтов банков с предложениями кредитов"],
      files: [{ name: "test-base.csv", rowCount: 39164 }],
      fileRowCount: 39164,
      budget: 42000,
      budgetMode: "recommended",
    };
    const campaign: Campaign = {
      id: "cmp_scn",
      name: "Тест",
      status: "draft",
      createdAt: "2026-06-01T00:00:00.000Z",
      scenario: { id: "cur-abandoned-cart", name: "Брошенная корзина" },
      sourceType: "new",
      channels: ["sms", "email"],
      interests: wizardData.interests,
      triggers: wizardData.triggers,
      files: wizardData.files,
      budget: 42000,
      wizardData,
    };
    const before = primeGraph(campaign);
    const scoringBefore = findNode(before.nodes, "scoring");
    const signalBefore = findNode(before.nodes, "signal");
    // BEFORE — реальный контекст кампании отражён на графе.
    expect(scoringBefore.data.sublabel).toBe("1 интерес · 1 триггер");
    expect(signalBefore.data.params).toMatchObject({ count: 39164 });

    renderEditing(campaign, "scenario");
    fireEvent.click(screen.getByRole("button", { name: "Спящий клиент" }));
    fireEvent.click(screen.getByRole("button", { name: "Сменить сценарий" }));
    // Каскад завёл на «Бюджет» (Item 2) — довести сессию до конца. Ввода своей
    // суммы там больше нет: шаг коммитит рекомендуемый бюджет по кнопке.
    fireEvent.click(screen.getByRole("button", { name: "Применить и вернуться" }));

    const after = getCachedGraph("cmp_scn");
    expect(after).toBeDefined();
    const scoringAfter = findNode(after!.nodes, "scoring");
    const signalAfter = findNode(after!.nodes, "signal");
    // AFTER (текущий баг) — createTemplate голый: интересы/триггеры/файлы
    // стёрты, подзаголовка нет вовсе. AFTER (фикс) — контекст пережил
    // пересборку тем же путём, что и initialGraph.
    expect(scoringAfter.data.sublabel).toBe("1 интерес · 1 триггер");
    expect(scoringAfter.data.params).toMatchObject({
      interests: ["Кредитование"],
      triggers: ["Посещение сайтов банков с предложениями кредитов"],
      files: [{ name: "test-base.csv", rowCount: 39164 }],
    });
    expect(signalAfter.data.params).toMatchObject({ count: 39164 });
  });

  it("правка ТОЛЬКО интересов: подзаголовок «Скоринга» в кэше обновился, а не остался прежним", () => {
    const wizardData: StepData = {
      ...initialStepData,
      scenario: "base-registration",
      channels: ["sms"],
      interests: ["Кредитование"],
      triggers: ["Посещение сайтов банков с предложениями кредитов"],
      triggerConfig: { "credit-banks": { added: ["example.ru"], excluded: [] } },
      files: [],
      budget: 15000,
    };
    const campaign: Campaign = {
      id: "cmp_int",
      name: "Тест",
      status: "draft",
      createdAt: "2026-06-01T00:00:00.000Z",
      scenario: { id: "base-registration", name: "Регистрация" },
      sourceType: "new",
      channels: ["sms"],
      interests: wizardData.interests,
      triggers: wizardData.triggers,
      triggerConfig: wizardData.triggerConfig,
      budget: 15000,
      wizardData,
    };
    const before = primeGraph(campaign);
    const scoringBefore = findNode(before.nodes, "scoring");
    expect(scoringBefore.data.sublabel).toBe("1 интерес · 1 триггер");

    renderEditing(campaign, "interests");
    // Добавляем ВТОРОЙ интерес — не трогая канал/сценарий/базу.
    fireEvent.click(screen.getByRole("button", { name: "Рассрочка и BNPL" }));
    fireEvent.click(screen.getByRole("button", { name: "Применить и вернуться" }));

    const after = getCachedGraph("cmp_int");
    expect(after).toBeDefined();
    const scoringAfter = findNode(after!.nodes, "scoring");
    // AFTER (текущий баг) — ветка "ничего структурного не изменилось" вообще
    // не пишет кэш: подзаголовок остаётся "1 интерес · 1 триггер", хотя
    // интересов теперь два. AFTER (фикс) — "2 интереса · 1 триггер".
    expect(scoringAfter.data.sublabel).toBe("2 интереса · 1 триггер");
  });

  it("смена каналов: новый сплиттер несёт подзаголовок «Поровну · N веток», а не пустой", () => {
    const wizardData: StepData = {
      ...initialStepData,
      scenario: "base-registration",
      channels: ["sms"],
      budget: 10000,
    };
    const campaign: Campaign = {
      id: "cmp_ch",
      name: "Тест",
      status: "draft",
      createdAt: "2026-06-01T00:00:00.000Z",
      scenario: { id: "base-registration", name: "Регистрация" },
      sourceType: "new",
      channels: ["sms"],
      budget: 10000,
      wizardData,
    };
    primeGraph(campaign); // единственный канал — сплиттера в графе ещё нет

    renderEditing(campaign, "channels");
    fireEvent.click(screen.getByRole("checkbox", { name: /Email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Применить и вернуться" }));

    const after = getCachedGraph("cmp_ch");
    expect(after).toBeDefined();
    const splitNode = after!.nodes.find((n) => n.data.nodeType === "split");
    expect(splitNode).toBeDefined();
    expect(splitNode!.data.sublabel).toBe("Поровну · 2 ветки");
  });
});
