import { nanoid } from "nanoid";
import type { StructuralOp } from "./structural-commands";
import type { CampaignSort } from "./parse-campaign-filter";
import type { Survey, SurveyStatus } from "@/types/survey";
import { EMPTY_SURVEY, DEMO_SURVEY } from "@/types/survey";
import type { SignalStatus } from "@/types/signal-status";
import type { StepData, Channel, SourceType } from "@/types/campaign";
import type { NodeParams, WorkflowNode, WorkflowEdge } from "@/types/workflow";
import { scenarioNameForSignal, defaultCampaignName } from "./scenario-display";
import {
  DEFAULT_DIRECTION_ID,
  businessDirectionFromSurvey,
} from "@/data/business-directions";
import type { AccountSettings } from "@/types/account-settings";
import { DEMO_ACCOUNT_SETTINGS } from "@/types/account-settings";
import {
  DEFAULT_FILTERS,
  statisticsReducer,
  type StatisticsFilters,
  type Period,
  type CalcMethod,
  type Currency,
  type RowKind,
  type ColumnKey,
  type SortState,
} from "@/sections/statistics/statistics-state";

export type SignalType =
  | "Регистрация"
  | "Первая сделка"
  | "Апсейл"
  | "Реактивация"
  | "Возврат"
  | "Удержание";

export const SIGNAL_TYPES = [
  "Регистрация",
  "Первая сделка",
  "Апсейл",
  "Реактивация",
  "Возврат",
  "Удержание",
] as const satisfies readonly SignalType[];

export type Signal = {
  id: string;
  type: SignalType;
  // User-editable display name; falls back to `type` when absent.
  name?: string;
  count: number;
  segments: {
    max: number;
    high: number;
    mid: number;
    low: number;
  };
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
  // Owned by feature/signal-flow worktree (E). Defaults to "ready" when
  // omitted — preserves behaviour of existing presets that don't set status.
  status?: SignalStatus;
  /**
   * Snapshot of the wizard form at the moment this signal was launched.
   * Lets `Открыть и редактировать` re-hydrate the wizard at step-6 with
   * every field intact. Optional — older signals or seeded presets won't
   * carry it.
   */
  wizardData?: StepData;
};

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed";

export type Campaign = {
  id: string;
  name: string;
  /** @deprecated removed by campaign-first inversion (Task 6). Optional during migration. */
  signalId?: string;
  status: CampaignStatus;
  createdAt: string;
  launchedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  /**
   * Set by `campaign_launched` from the payment screen. Older preset
   * campaigns and never-launched drafts may not carry it. Display fallbacks
   * (campaign-screen) keep working when the field is absent.
   */
  budget?: number;
  sourceType?: SourceType;
  channels?: Channel[];
  interests?: string[];
  file?: { name: string; rowCount: number };
  dailyBudget?: number;
  /**
   * Distinguishes "scoring running" from "communication started" — `status`
   * alone ("active") cannot. Drives the in-card progress block (design §4).
   */
  phase?: "scoring" | "communicating";
  scenario?: { id: string; name: string };
};

/**
 * Output of a campaign (formerly the top-level `Signal`). Campaign-scoped:
 * keyed by `campaignId` rather than the campaign referencing it. Per-contact
 * score lives in the file these represent — not modelled here for the prototype.
 */
export type Artifact = {
  id: string;
  campaignId: string;
  kind: "signals" | "signals_conversions";
  count: number;
  createdAt: string;
};

/**
 * A reusable, channel-typed message set assigned to a communication node.
 * Flat by design (no variants): `content` is the field set of one channel.
 */
export type MessageTemplate = {
  id: string;
  channel: Channel;
  name: string;
  content: NodeParams;
  usedInCampaigns: number;
};

export type Preset = {
  key: "empty" | "mid" | "full";
  label: string;
  signals: Signal[];
  campaigns: Campaign[];
};

export type SectionName = "Статистика" | "Сигналы" | "Артефакты" | "Кампании" | "Настройки";

export type View =
  | { kind: "welcome" }
  | { kind: "survey" }
  | { kind: "guided-signal"; initialScenario?: { id: string; name: string } }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  | { kind: "workflow"; campaign: { id: string; name: string }; launched: boolean }
  | { kind: "campaign-payment"; campaign: { id: string; name: string } }
  | { kind: "campaign"; campaign: { id: string; name: string } }
  | { kind: "signal"; signal: { id: string } }
  | { kind: "section"; name: SectionName; campaignId?: string };

// A "browser-history address" — what we persist to history.state so back/forward
// can restore a section. Intentionally coarser than View: no launched flag, no
// selectedWorkflowNode, no in-flight commands. On popstate we rehydrate the
// full View from this address + current campaigns[].
export type ViewAddress =
  | { kind: "welcome" }
  | { kind: "guided-signal"; scenarioId?: string; scenarioName?: string }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  | { kind: "workflow"; campaignId: string }
  | { kind: "campaign-payment"; campaignId: string }
  | { kind: "campaign"; campaignId: string }
  | { kind: "signal"; signalId: string }
  | { kind: "section"; name: SectionName; campaignId?: string };

export type AppState = {
  view: View;
  signals: Signal[];
  artifacts: Artifact[];
  campaigns: Campaign[];
  workflowCommand: string | null;
  workflowNodeCommand: { commands: Array<{ nodeLabel?: string; nodeId?: string; text: string }> } | null;
  workflowStructuralCommands: { ops: StructuralOp[] } | null;
  selectedWorkflowNode: { id: string; label: string; nodeType?: string } | null;
  aiReply: string | null;
  launchFlyoutOpen: boolean;
  activeSection: SectionName | null;
  campaignFilter: CampaignStatus[];
  campaignSort: CampaignSort;
  clientDirection: string;
  // ----- shared state slices added by data-foundations -----
  // Owned by feature/anketa worktree (B):
  survey: Survey;
  surveyStatus: SurveyStatus;
  // Owned by feature/m4-settings-section worktree:
  accountSettings: AccountSettings;
  // Owned by feature/signal-flow worktree (E):
  balance: number;
  notifications: { signalsBadge: boolean };
  /**
   * Set when the user picks "Открыть и редактировать" on an awaiting-payment
   * signal. The wizard reads this on mount, hydrates step-6 from the
   * signal's `wizardData`, and clears the field. Only one signal can be
   * "resumed" at a time — entering the wizard from any other path clears it.
   */
  resumingSignalId?: string;
  /**
   * Bumped on every `start_signal_flow` so consumers (the wizard) can use it
   * as a React `key` to force a fresh mount. Without it, hopping out of the
   * wizard mid-flight (e.g. to a section) and re-entering via "Создать
   * сигнал" would resume the previous session — `currentStep` and `maxStep`
   * stick around in the wizard's internal state and downstream steps get
   * skipped on the second pass.
   */
  wizardSessionId: number;
  /**
   * Currently visible step in the signal wizard (1–8) — `null` when the
   * wizard isn't mounted. Lets the shared prompt-bar render step-specific
   * helpers like the budget-help chip on step 5.
   */
  wizardCurrentStep: number | null;
  /**
   * Whether the user clicked the budget-help chip on step 5; flips the
   * prompt-bar from "show chip" to "show mascot answer". Auto-resets when
   * the wizard moves off step 5 or unmounts.
   */
  budgetHelpShown: boolean;
  /**
   * Monotonic counter bumped on every `wizard_random_remix` action.
   * Step-2 subscribes to this token and re-rolls its random selection
   * whenever it increments. Starts at 0; increments unconditionally
   * regardless of current view.
   */
  wizardRemixToken: number;
  /** Pending inline field edit dispatched from NodeCardBody; cleared by workflow-view after application. */
  workflowNodeFieldPatch: { nodeId: string; patch: Partial<NodeParams> } | null;
  // Owned by stats-promptbar-queries: filters for the Statistics view
  stats: StatisticsFilters;
  /**
   * Whether the first-run «Знакомство с ИИ афина» overlay has been seen
   * (completed or skipped). Drives the IntroOverlay on the welcome screen:
   * it renders only while this is `false`. Prototype state isn't persisted,
   * so a fresh load re-shows the overlay — acceptable per the spec.
   */
  introSeen: boolean;
  /** Pending full-graph rebuild dispatched by the AI orchestrator (kind: rebuild). */
  workflowRebuild: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; assumptions: string } | null;
  /** Set when the user requests AI undo; cleared by workflow-view after applying the snapshot. */
  workflowAiUndoRequested: boolean;
  /**
   * id pending-пузыря чата, который раннер просит переиспользовать для графовой
   * анимации (вместо создания нового). null — workflow-view создаёт свой пузырь.
   */
  workflowReplyId: string | null;
  /** True once a rebuild/structural command has been applied — enables the undo action. */
  aiUndoAvailable: boolean;
};

export type Action =
  | { type: "start_signal_flow"; initialScenario?: { id: string; name: string } }
  | { type: "start_campaign_flow"; initialScenario?: { id: string; name: string } }
  | { type: "signal_added"; signal: Signal }
  | { type: "signal_complete" }
  | { type: "step2_clicked" }
  | { type: "campaign_selected"; campaign: { id: string; name: string } }
  | { type: "campaign_from_signal"; signalId: string }
  | { type: "campaign_artifact_ready"; campaignId: string; kind: Artifact["kind"]; count: number }
  | { type: "campaign_opened"; id: string }
  | { type: "campaign_renamed"; id: string; name: string }
  | { type: "campaign_saved_draft"; id: string }
  | { type: "campaign_created"; campaign: Campaign }
  | { type: "campaign_status_changed"; id: string; status: CampaignStatus; timestamp: string }
  | { type: "campaign_duplicated"; id: string }
  | { type: "campaigns_query_set"; statuses: CampaignStatus[]; sort: CampaignSort }
  | { type: "campaigns_filter_remove"; status: CampaignStatus }
  | { type: "campaigns_filter_clear" }
  | { type: "preset_applied"; preset: Preset }
  | { type: "workflow_command_submit"; text: string }
  | { type: "workflow_command_handled" }
  | { type: "workflow_node_selected"; id: string; label: string; nodeType?: string }
  | { type: "workflow_node_deselected" }
  | { type: "workflow_node_command_submit"; commands: Array<{ nodeLabel?: string; nodeId?: string; text: string }> }
  | { type: "workflow_node_command_handled" }
  | { type: "workflow_node_field_set"; nodeId: string; patch: Partial<NodeParams> }
  | { type: "workflow_node_field_set_handled" }
  | { type: "workflow_structural_commands_submit"; ops: StructuralOp[]; replyId?: string }
  | { type: "workflow_structural_commands_handled" }
  | { type: "workflow_reply_id_clear" }
  | { type: "ai_reply_shown"; text: string }
  | { type: "ai_reply_dismissed" }
  | { type: "goto_stats"; campaignId?: string }
  | { type: "sidebar_nav"; section: SectionName }
  | { type: "flyout_open" }
  | { type: "flyout_close" }
  | { type: "flyout_signal_select"; id: string; name: string }
  | { type: "flyout_campaign_select" }
  | { type: "go_welcome" }
  | { type: "restore_address"; address: ViewAddress }
  | { type: "client_direction_set"; direction: string }
  | { type: "survey_updated"; patch: Partial<Survey> }
  | { type: "survey_completed"; survey: Survey }
  | { type: "open_survey" }
  | { type: "survey_reset" }
  | { type: "settings_updated"; patch: Partial<AccountSettings> }
  | { type: "dev_survey_force_complete" }
  | { type: "balance_topup"; amount: number }
  | { type: "signal_status_changed"; id: string; status: SignalStatus }
  | { type: "signal_deleted"; id: string }
  | { type: "signal_opened"; id: string }
  | { type: "signal_renamed"; id: string; name: string }
  | { type: "signals_badge_set"; value: boolean }
  | { type: "resume_signal_in_wizard"; signalId: string }
  | { type: "resume_signal_in_wizard_handled" }
  | { type: "wizard_step_changed"; step: number | null }
  | { type: "budget_help_shown" }
  | { type: "wizard_random_remix" }
  | { type: "campaign_launched"; id: string; timestamp: string; budget: number }
  | { type: "open_workflow"; campaign: { id: string; name: string }; launched: boolean }
  | { type: "open_campaign_payment"; campaignId: string }
  | { type: "stats_set_period"; period: Period }
  | { type: "stats_set_calc_method"; method: CalcMethod }
  | { type: "stats_set_currency"; currency: Currency }
  | { type: "stats_set_rows"; rows: RowKind }
  | { type: "stats_set_row_count"; count: number }
  | { type: "stats_set_sub_rows"; subRows: RowKind | "none" }
  | { type: "stats_toggle_column"; column: ColumnKey }
  | { type: "stats_reorder_columns"; columns: ColumnKey[] }
  | { type: "stats_set_condition"; scope: "include" | "exclude"; entity: string; values: string[] }
  | { type: "stats_set_sort"; sort: SortState | null }
  | { type: "stats_reset"; filters: StatisticsFilters }
  | { type: "stats_apply_patch"; patch: Partial<StatisticsFilters> }
  | { type: "intro_dismissed" }
  | { type: "workflow_rebuild_submit"; nodes: WorkflowNode[]; edges: WorkflowEdge[]; assumptions: string; replyId?: string }
  | { type: "workflow_rebuild_handled" }
  | { type: "workflow_ai_undo_request"; replyId?: string }
  | { type: "workflow_ai_undo_handled" }
  | { type: "workflow_ai_undo_availability"; available: boolean };
// PARALLEL-WORKTREE INSERTION POINT — survey actions (B), billing/signal-status actions (E).
// Each worktree appends its own action variants to the union above; resolve merges by
// keeping every appended line and adding the matching reducer case at the end of appReducer.

export const initialState: AppState = {
  view: { kind: "welcome" },
  signals: [],
  artifacts: [],
  campaigns: [],
  workflowCommand: null,
  workflowNodeCommand: null,
  workflowStructuralCommands: null,
  selectedWorkflowNode: null,
  aiReply: null,
  launchFlyoutOpen: false,
  activeSection: null,
  campaignFilter: [],
  campaignSort: "default",
  clientDirection: "finance",
  survey: EMPTY_SURVEY,
  surveyStatus: "not_started",
  accountSettings: DEMO_ACCOUNT_SETTINGS,
  balance: 0,
  notifications: { signalsBadge: false },
  wizardSessionId: 0,
  wizardCurrentStep: null,
  budgetHelpShown: false,
  wizardRemixToken: 0,
  workflowNodeFieldPatch: null,
  stats: DEFAULT_FILTERS,
  introSeen: false,
  workflowRebuild: null,
  workflowAiUndoRequested: false,
  workflowReplyId: null,
  aiUndoAvailable: false,
};

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "start_signal_flow":
    case "start_campaign_flow":
      // Анкета не пройдена — ведём пользователя сначала в survey-view
      // (fullscreen без sidebar/bottom-bar). После `survey_completed`
      // SurveySection повторно диспатчит `start_signal_flow`, и тогда
      // условие ниже даст ему мастер. initialScenario при гейте теряется —
      // в прототипе его никто из пользовательских путей не передаёт.
      if (state.surveyStatus !== "completed") {
        return {
          ...state,
          view: { kind: "survey" },
          launchFlyoutOpen: false,
          activeSection: null,
          resumingSignalId: undefined,
        };
      }
      return {
        ...state,
        view: { kind: "guided-signal", initialScenario: action.initialScenario },
        launchFlyoutOpen: false,
        activeSection: null,
        resumingSignalId: undefined,
        wizardSessionId: state.wizardSessionId + 1,
      };

    case "signal_added":
      return {
        ...state,
        signals: [...state.signals, action.signal],
        view: { kind: "awaiting-campaign" },
      };

    case "signal_complete":
    case "step2_clicked": {
      // Скип CampaignTypeView: кампания собирается по сценарию из сигнала.
      // Если для сигнала уже есть черновой кампейн — открываем его, иначе
      // создаём новый с именем сценария и роутим в workflow-редактор.
      const latestSignal = state.signals[state.signals.length - 1];
      if (!latestSignal) {
        return appReducer(state, { type: "start_campaign_flow" });
      }
      const existingDraft = state.campaigns.find(
        (c) =>
          c.status === "draft" &&
          c.scenario?.id === (latestSignal.wizardData?.scenario ?? "")
      );
      if (existingDraft) {
        return {
          ...state,
          view: {
            kind: "workflow",
            campaign: { id: existingDraft.id, name: existingDraft.name },
            launched: false,
          },
          activeSection: null,
        };
      }
      const scenarioName = scenarioNameForSignal(latestSignal);
      const scenarioId = latestSignal.wizardData?.scenario ?? "";
      const n =
        state.campaigns.filter((c) => c.scenario?.id === scenarioId).length + 1;
      const campaignName = defaultCampaignName(scenarioName, n);
      const campaignId = `cmp_${nanoid(6)}`;
      const newCampaign: Campaign = {
        id: campaignId,
        name: campaignName,
        status: "draft",
        createdAt: new Date().toISOString(),
        sourceType: "new",
        channels: [],
        scenario: { id: scenarioId, name: scenarioName },
      };
      return {
        ...state,
        campaigns: [...state.campaigns, newCampaign],
        view: {
          kind: "workflow",
          campaign: { id: campaignId, name: campaignName },
          launched: false,
        },
        activeSection: null,
      };
    }

    case "campaign_selected": {
      const existing = state.campaigns.find((c) => c.id === action.campaign.id);
      if (existing) {
        return {
          ...state,
          view: {
            kind: "workflow",
            campaign: action.campaign,
            launched:
              existing.status === "active" ||
              existing.status === "paused" ||
              existing.status === "completed",
          },
          activeSection: null,
          campaignFilter: [],
          campaignSort: "default",
        };
      }
      const latestSignal = state.signals[state.signals.length - 1];
      const newCampaign: Campaign | null = latestSignal
        ? {
            id: action.campaign.id,
            name: action.campaign.name,
            status: "draft",
            createdAt: new Date().toISOString(),
            sourceType: "new",
            channels: [],
          }
        : null;
      return {
        ...state,
        campaigns: newCampaign
          ? [...state.campaigns, newCampaign]
          : state.campaigns,
        view: { kind: "workflow", campaign: action.campaign, launched: false },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "campaign_from_signal": {
      const signal = state.signals.find((s) => s.id === action.signalId);
      if (!signal) return state;
      const scenarioName = scenarioNameForSignal(signal);
      const scenarioId = signal.wizardData?.scenario ?? "";
      const n =
        state.campaigns.filter((c) => c.scenario?.id === scenarioId).length + 1;
      const newCampaign: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: defaultCampaignName(scenarioName, n),
        status: "draft",
        createdAt: new Date().toISOString(),
        sourceType: "new",
        channels: [],
        scenario: { id: scenarioId, name: scenarioName },
      };
      return {
        ...state,
        campaigns: [...state.campaigns, newCampaign],
        view: {
          kind: "workflow",
          campaign: { id: newCampaign.id, name: newCampaign.name },
          launched: false,
        },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "campaign_artifact_ready": {
      const artifact: Artifact = {
        id: `art_${nanoid(8)}`,
        campaignId: action.campaignId,
        kind: action.kind,
        count: action.count,
        createdAt: new Date().toISOString(),
      };
      return { ...state, artifacts: [...state.artifacts, artifact] };
    }

    case "campaign_opened": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;
      // Every status now lands on the campaign card; the card decides the
      // next step (workflow, payment, stats, duplicate).
      return {
        ...state,
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "campaign_renamed": {
      const name = action.name.trim();
      if (!name) return state;
      if (!state.campaigns.some((c) => c.id === action.id)) return state;
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.id ? { ...c, name } : c
        ),
        view:
          state.view.kind === "workflow" && state.view.campaign.id === action.id
            ? { ...state.view, campaign: { ...state.view.campaign, name } }
            : state.view,
      };
    }

    case "campaign_saved_draft":
      // Сохранение черновика workflow. Уровень «несохранённости» отслеживается
      // в WorkflowSection (подпись графа с момента последнего сохранения), а сам
      // граф живёт в локальном стейте редактора — поэтому глобальный стейт здесь
      // не меняется. Экшен сохраняем как точку синхронизации/возможный хук.
      return state;

    case "campaign_created":
      return {
        ...state,
        campaigns: [...state.campaigns, action.campaign],
        view:
          state.view.kind === "workflow" &&
          state.view.campaign.id === action.campaign.id &&
          action.campaign.status === "active"
            ? { ...state.view, launched: true }
            : state.view,
      };

    case "campaign_status_changed":
      return {
        ...state,
        campaigns: state.campaigns.map((c) => {
          if (c.id !== action.id) return c;
          const next: Campaign = { ...c, status: action.status };
          if (action.status === "active") {
            // transition from paused → active clears pausedAt but must NOT
            // overwrite launchedAt. Fresh launch (from draft) sets launchedAt.
            next.pausedAt = undefined;
            if (!c.launchedAt) next.launchedAt = action.timestamp;
          }
          if (action.status === "paused") {
            next.pausedAt = action.timestamp ?? new Date().toISOString();
          }
          if (action.status === "completed") next.completedAt = action.timestamp;
          return next;
        }),
        view:
          state.view.kind === "workflow" && state.view.campaign.id === action.id && action.status === "active"
            ? { ...state.view, launched: true }
            : state.view,
      };

    case "campaign_duplicated": {
      const original = state.campaigns.find((c) => c.id === action.id);
      if (!original) return state;
      const dup: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: `Копия — ${original.name}`,
        signalId: original.signalId,
        status: "draft",
        createdAt: new Date().toISOString(),
        scenario: original.scenario,
      };
      return {
        ...state,
        campaigns: [...state.campaigns, dup],
        view: {
          kind: "workflow",
          campaign: { id: dup.id, name: dup.name },
          launched: false,
        },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "campaigns_query_set": {
      const seen = new Set<CampaignStatus>();
      const dedup: CampaignStatus[] = [];
      for (const s of action.statuses) {
        if (!seen.has(s)) {
          seen.add(s);
          dedup.push(s);
        }
      }
      return { ...state, campaignFilter: dedup, campaignSort: action.sort };
    }

    case "campaigns_filter_remove":
      return {
        ...state,
        campaignFilter: state.campaignFilter.filter((s) => s !== action.status),
      };

    case "campaigns_filter_clear":
      return { ...state, campaignFilter: [], campaignSort: "default" };

    case "preset_applied": {
      const workflowCampaignId =
        state.view.kind === "workflow" ? state.view.campaign.id : null;
      const keepWorkflow =
        workflowCampaignId !== null &&
        action.preset.campaigns.some((c) => c.id === workflowCampaignId);
      // Preset campaign dates span the last 30–90 days. Reset the stats period
      // to cover them (last 90 days) and clear any stale conditions, so the
      // preset's campaigns are immediately visible in the report.
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 89);
      const stats: StatisticsFilters = {
        ...DEFAULT_FILTERS,
        period: {
          preset: "custom",
          from: from.toISOString().slice(0, 10),
          to: now.toISOString().slice(0, 10),
        },
      };
      // Непустой пресет автоматически заполняет анкету (демо-данные) и
      // подтягивает сайт в настройки — чтобы тестировать без прохождения формы;
      // empty — сбрасывает анкету обратно.
      const isEmptyPreset = action.preset.key === "empty";
      const survey = isEmptyPreset ? EMPTY_SURVEY : DEMO_SURVEY;
      const surveyStatus: SurveyStatus = isEmptyPreset
        ? "not_started"
        : "completed";
      const clientDirection = isEmptyPreset
        ? DEFAULT_DIRECTION_ID
        : businessDirectionFromSurvey(DEMO_SURVEY.directionId);
      const accountSettings = isEmptyPreset
        ? state.accountSettings
        : {
            ...state.accountSettings,
            companyWebsite: DEMO_SURVEY.companyWebsite,
            companyName: DEMO_SURVEY.companyName,
            directionId: DEMO_SURVEY.directionId,
          };
      return {
        ...state,
        signals: action.preset.signals,
        campaigns: action.preset.campaigns,
        stats,
        survey,
        surveyStatus,
        clientDirection,
        accountSettings,
        view:
          state.view.kind === "workflow" && !keepWorkflow
            ? { kind: "section", name: "Кампании" }
            : state.view,
        activeSection:
          state.view.kind === "workflow" && !keepWorkflow ? "Кампании" : state.activeSection,
      };
    }

    case "workflow_command_submit":
      return { ...state, workflowCommand: action.text };

    case "workflow_command_handled":
      return { ...state, workflowCommand: null };

    case "workflow_node_selected":
      return {
        ...state,
        selectedWorkflowNode: { id: action.id, label: action.label, nodeType: action.nodeType },
      };

    case "workflow_node_deselected":
      return { ...state, selectedWorkflowNode: null };

    case "workflow_node_command_submit":
      // Keep the edited node selected/open so the user can keep tweaking it —
      // только применяем команду. (Снятие выделения происходит по клику на
      // полотно/крестик или при структурных операциях, меняющих граф.)
      return {
        ...state,
        workflowNodeCommand: { commands: action.commands },
      };

    case "workflow_node_command_handled":
      return { ...state, workflowNodeCommand: null };

    case "workflow_node_field_set":
      return {
        ...state,
        workflowNodeFieldPatch: { nodeId: action.nodeId, patch: action.patch },
      };

    case "workflow_node_field_set_handled":
      return { ...state, workflowNodeFieldPatch: null };

    case "workflow_structural_commands_submit":
      return {
        ...state,
        workflowStructuralCommands: { ops: action.ops },
        workflowReplyId: action.replyId ?? null,
        selectedWorkflowNode: null,
      };

    case "workflow_structural_commands_handled":
      return { ...state, workflowStructuralCommands: null };

    case "workflow_reply_id_clear":
      return { ...state, workflowReplyId: null };

    case "ai_reply_shown":
      return { ...state, aiReply: action.text };

    case "ai_reply_dismissed":
      return { ...state, aiReply: null };

    case "goto_stats":
      return {
        ...state,
        view: { kind: "section", name: "Статистика", campaignId: action.campaignId },
        workflowCommand: null,
        selectedWorkflowNode: null,
        // Открытие статистики из карточки кампании выставляет ЖИВОЕ условие
        // поиска — оно и фильтрует куб, и видно в «Условиях поиска». Ключ
        // совпадает с ключом измерения campaigns в кубе (`cmp-<id>`).
        stats: action.campaignId
          ? {
              ...state.stats,
              conditions: {
                include: { campaigns: [`cmp-${action.campaignId}`] },
                exclude: {},
              },
            }
          : state.stats,
        activeSection: "Статистика",
        campaignFilter: [],
        campaignSort: "default",
      };

    case "sidebar_nav":
      return {
        ...state,
        view: { kind: "section", name: action.section },
        workflowCommand: null,
        selectedWorkflowNode: null,
        activeSection: action.section,
        campaignFilter: [],
        campaignSort: "default",
      };

    case "flyout_open":
      return { ...state, launchFlyoutOpen: true };

    case "flyout_close":
      return { ...state, launchFlyoutOpen: false };

    case "flyout_signal_select":
      return {
        ...state,
        view: {
          kind: "guided-signal",
          initialScenario: { id: action.id, name: action.name },
        },
        launchFlyoutOpen: false,
        activeSection: null,
        resumingSignalId: undefined,
      };

    case "flyout_campaign_select":
      return appReducer(state, { type: "start_campaign_flow" });

    case "go_welcome":
      return {
        ...state,
        view: { kind: "welcome" },
        activeSection: null,
        launchFlyoutOpen: false,
        selectedWorkflowNode: null,
        workflowCommand: null,
        workflowNodeCommand: null,
        workflowNodeFieldPatch: null,
        workflowStructuralCommands: null,
        aiReply: null,
        campaignFilter: [],
        campaignSort: "default",
      };

    case "restore_address": {
      const addr = action.address;
      const rebuilt = rebuildViewFromAddress(addr, state.campaigns);
      return {
        ...state,
        view: rebuilt,
        activeSection: addr.kind === "section" ? addr.name : null,
        launchFlyoutOpen: false,
        selectedWorkflowNode: null,
        workflowCommand: null,
        workflowNodeCommand: null,
        workflowNodeFieldPatch: null,
        workflowStructuralCommands: null,
        aiReply: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "client_direction_set":
      return { ...state, clientDirection: action.direction };

    case "survey_updated":
      return { ...state, survey: { ...state.survey, ...action.patch } };

    case "survey_completed":
      return {
        ...state,
        survey: action.survey,
        surveyStatus: "completed",
        // Анкета — единственный источник «направления клиента» для пользователя.
        // Дев-панель просто отражает это значение и позволяет тестово переопределить.
        clientDirection: businessDirectionFromSurvey(action.survey.directionId),
        // Сайт (и название/направление), введённые в анкете, подтягиваются в
        // «Настройки» — это первичный источник данных аккаунта.
        accountSettings: {
          ...state.accountSettings,
          companyWebsite:
            action.survey.companyWebsite || state.accountSettings.companyWebsite,
          companyName:
            action.survey.companyName || state.accountSettings.companyName,
          directionId:
            action.survey.directionId ?? state.accountSettings.directionId,
        },
      };

    case "open_survey":
      return { ...state, view: { kind: "survey" } };

    case "survey_reset":
      return {
        ...state,
        survey: EMPTY_SURVEY,
        surveyStatus: "not_started",
        clientDirection: DEFAULT_DIRECTION_ID,
      };

    case "dev_survey_force_complete":
      // Dev-panel-only override: lets a tester bypass the survey gate without
      // filling the form. Keeps existing survey data and clientDirection so the
      // dev can pick direction independently from the panel.
      return { ...state, surveyStatus: "completed" };

    case "balance_topup":
      return { ...state, balance: state.balance + Math.max(0, action.amount) };

    case "signal_status_changed": {
      const exists = state.signals.some((s) => s.id === action.id);
      if (!exists) return state;
      return {
        ...state,
        signals: state.signals.map((s) =>
          s.id === action.id
            ? { ...s, status: action.status, updatedAt: new Date().toISOString() }
            : s
        ),
        notifications:
          action.status === "ready" || action.status === "error" || action.status === "expired"
            ? { ...state.notifications, signalsBadge: true }
            : state.notifications,
      };
    }

    case "signal_deleted":
      return {
        ...state,
        signals: state.signals.filter((s) => s.id !== action.id),
      };

    case "signal_opened": {
      const s = state.signals.find((ss) => ss.id === action.id);
      if (!s) return state;
      return {
        ...state,
        view: { kind: "signal", signal: { id: s.id } },
        activeSection: null,
      };
    }

    case "signal_renamed": {
      const name = action.name.trim();
      if (!name) return state;
      if (!state.signals.some((s) => s.id === action.id)) return state;
      return {
        ...state,
        signals: state.signals.map((s) =>
          s.id === action.id ? { ...s, name } : s
        ),
      };
    }

    case "signals_badge_set":
      return {
        ...state,
        notifications: { ...state.notifications, signalsBadge: action.value },
      };

    case "resume_signal_in_wizard":
      return {
        ...state,
        view: { kind: "guided-signal" },
        resumingSignalId: action.signalId,
        launchFlyoutOpen: false,
        activeSection: null,
        wizardSessionId: state.wizardSessionId + 1,
      };

    case "resume_signal_in_wizard_handled":
      return {
        ...state,
        resumingSignalId: undefined,
      };

    case "wizard_step_changed":
      return {
        ...state,
        wizardCurrentStep: action.step,
        // Auto-hide the budget help answer when leaving step 5 (or the
        // wizard altogether) — re-entering should start fresh.
        budgetHelpShown:
          action.step === 5 ? state.budgetHelpShown : false,
      };

    case "budget_help_shown":
      return { ...state, budgetHelpShown: true };

    case "wizard_random_remix":
      return { ...state, wizardRemixToken: state.wizardRemixToken + 1 };

    case "settings_updated":
      return {
        ...state,
        accountSettings: { ...state.accountSettings, ...action.patch },
      };

    case "campaign_launched": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;
      return {
        ...state,
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id
            ? {
                ...cc,
                status: "active",
                launchedAt: cc.launchedAt ?? action.timestamp,
                // A real budget overwrites; a 0 (e.g. weird re-dispatch) keeps
                // the previously-stored value.
                budget: action.budget > 0 ? action.budget : cc.budget,
              }
            : cc
        ),
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
      };
    }

    case "open_workflow":
      return {
        ...state,
        view: {
          kind: "workflow",
          campaign: action.campaign,
          launched: action.launched,
        },
      };

    case "open_campaign_payment": {
      const c = state.campaigns.find((cc) => cc.id === action.campaignId);
      if (!c) return state;
      return {
        ...state,
        view: {
          kind: "campaign-payment",
          campaign: { id: c.id, name: c.name },
        },
      };
    }

    case "stats_set_period":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_PERIOD", period: action.period }) };
    case "stats_set_calc_method":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CALC_METHOD", method: action.method }) };
    case "stats_set_currency":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CURRENCY", currency: action.currency }) };
    case "stats_set_rows":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_ROWS", rows: action.rows }) };
    case "stats_set_row_count":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_ROW_COUNT", count: action.count }) };
    case "stats_set_sub_rows":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_SUB_ROWS", subRows: action.subRows }) };
    case "stats_toggle_column":
      return { ...state, stats: statisticsReducer(state.stats, { type: "TOGGLE_COLUMN", column: action.column }) };
    case "stats_reorder_columns":
      return { ...state, stats: statisticsReducer(state.stats, { type: "REORDER_COLUMNS", columns: action.columns }) };
    case "stats_set_condition":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_CONDITION", scope: action.scope, entity: action.entity, values: action.values }) };
    case "stats_set_sort":
      return { ...state, stats: statisticsReducer(state.stats, { type: "SET_SORT", sort: action.sort }) };
    case "stats_reset":
      return { ...state, stats: statisticsReducer(state.stats, { type: "RESET", filters: action.filters }) };
    case "stats_apply_patch":
      return { ...state, stats: { ...state.stats, ...action.patch } };

    case "intro_dismissed":
      return { ...state, introSeen: true };

    case "workflow_rebuild_submit":
      return { ...state, workflowRebuild: { nodes: action.nodes, edges: action.edges, assumptions: action.assumptions }, workflowReplyId: action.replyId ?? null };
    case "workflow_rebuild_handled":
      return { ...state, workflowRebuild: null };
    case "workflow_ai_undo_request":
      return { ...state, workflowAiUndoRequested: true, workflowReplyId: action.replyId ?? null };
    case "workflow_ai_undo_handled":
      return { ...state, workflowAiUndoRequested: false };
    case "workflow_ai_undo_availability":
      return { ...state, aiUndoAvailable: action.available };
    // PARALLEL-WORTREE INSERTION POINT — append survey/billing/signal-status cases
    // immediately above this comment to keep merges trivial.
  }
}

function rebuildViewFromAddress(addr: ViewAddress, campaigns: Campaign[]): View {
  switch (addr.kind) {
    case "welcome":
      return { kind: "welcome" };
    case "guided-signal":
      return {
        kind: "guided-signal",
        initialScenario:
          addr.scenarioId && addr.scenarioName
            ? { id: addr.scenarioId, name: addr.scenarioName }
            : undefined,
      };
    case "awaiting-campaign":
      return { kind: "awaiting-campaign" };
    case "campaign-select":
      return { kind: "campaign-select" };
    case "workflow": {
      const c = campaigns.find((cc) => cc.id === addr.campaignId);
      // If the campaign no longer exists, fall back to campaign list rather than
      // rendering an empty workflow.
      if (!c) return { kind: "section", name: "Кампании" };
      return {
        kind: "workflow",
        campaign: { id: c.id, name: c.name },
        launched:
          c.status === "active" ||
          c.status === "paused" ||
          c.status === "completed",
      };
    }
    case "campaign-payment": {
      const c = campaigns.find((cc) => cc.id === addr.campaignId);
      // Mirror the existing "workflow"/"campaign" fallback: if the campaign
      // disappeared (e.g. preset was reapplied), drop to the campaigns list
      // rather than rendering an empty payment screen.
      if (!c) return { kind: "section", name: "Кампании" };
      return {
        kind: "campaign-payment",
        campaign: { id: c.id, name: c.name },
      };
    }
    case "campaign": {
      const c = campaigns.find((cc) => cc.id === addr.campaignId);
      if (!c) return { kind: "section", name: "Кампании" };
      return { kind: "campaign", campaign: { id: c.id, name: c.name } };
    }
    case "signal":
      return { kind: "signal", signal: { id: addr.signalId } };
    case "section":
      return { kind: "section", name: addr.name, campaignId: addr.campaignId };
  }
}

export function viewToAddress(view: View): ViewAddress {
  switch (view.kind) {
    case "welcome":
    case "survey":
      // Survey — транзиентный fullscreen-стейт; back/forward не должен
      // возвращать пользователя в survey как отдельный URL — мапим в welcome.
      return { kind: "welcome" };
    case "guided-signal":
      return {
        kind: "guided-signal",
        scenarioId: view.initialScenario?.id,
        scenarioName: view.initialScenario?.name,
      };
    case "awaiting-campaign":
      return { kind: "awaiting-campaign" };
    case "campaign-select":
      return { kind: "campaign-select" };
    case "workflow":
      return { kind: "workflow", campaignId: view.campaign.id };
    case "campaign-payment":
      return { kind: "campaign-payment", campaignId: view.campaign.id };
    case "campaign":
      return { kind: "campaign", campaignId: view.campaign.id };
    case "signal":
      return { kind: "signal", signalId: view.signal.id };
    case "section":
      return { kind: "section", name: view.name, campaignId: view.campaignId };
  }
}

export const isSignalDone = (s: AppState) => s.signals.length > 0;
export const isCampaignDone = (s: AppState) =>
  s.campaigns.some(
    (c) =>
      c.status === "active" ||
      c.status === "paused" ||
      c.status === "completed"
  );
export const isStep1Active = (s: AppState) => !isSignalDone(s);
export const isStep2Active = (s: AppState) => isSignalDone(s) && !isCampaignDone(s);
export const isStep3Active = (s: AppState) => isCampaignDone(s);
export const isWorkflowView = (s: AppState) => s.view.kind === "workflow";
export const isOnWelcome = (s: AppState) => s.view.kind === "welcome";
export const isOnStatisticsSection = (s: AppState): boolean =>
  s.view.kind === "section" && s.view.name === "Статистика";

/**
 * Канонический ключ «разговорного контекста» текущего экрана — единственное
 * определение того, что считать сменой раздела для эфемерного ввода (чат,
 * чипы, очередь черновиков). Все драйверы подписаны на него через
 * `useScopeReset`, поэтому очищаются синхронно и предсказуемо.
 *
 * Секции различаем по имени (переход Сигналы→Статистика — смена scope), прочие
 * экраны — по kind. `awaiting-campaign` сворачиваем в `guided-signal`: это
 * продолжение того же signal-флоу (как и в page.tsx viewKey), а не новый scope,
 * иначе ввод стирался бы в середине создания сигнала.
 */
export function navigationScopeKey(view: View): string {
  if (view.kind === "section") return `section:${view.name}`;
  const kind = view.kind === "awaiting-campaign" ? "guided-signal" : view.kind;
  return `view:${kind}`;
}

/**
 * Какой пункт левого меню подсвечен. Выводится из текущего view, чтобы пункт
 * не гас при заполнении визарда / работе с кампанией (там activeSection
 * занулён):
 *  - guided-signal / awaiting-campaign → «Сигналы» (поток создания сигнала);
 *  - campaign-select / workflow / campaign / campaign-payment → «Кампании»
 *    (выбор типа, воркфлоу, карточка, оплата);
 *  - section → имя раздела;
 *  - иначе (welcome / survey) → activeSection (обычно null).
 */
export function activeNavSection(s: AppState): SectionName | null {
  switch (s.view.kind) {
    case "section":
      return s.view.name;
    case "guided-signal":
    case "awaiting-campaign":
      return "Сигналы";
    case "campaign-select":
    case "workflow":
    case "campaign":
    case "campaign-payment":
      return "Кампании";
    default:
      return s.activeSection;
  }
}
