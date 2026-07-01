import { nanoid } from "nanoid";
import type { StructuralOp } from "./structural-commands";
import type { CampaignSort } from "./parse-campaign-filter";
import type { Survey, SurveyStatus } from "@/types/survey";
import { EMPTY_SURVEY, DEMO_SURVEY } from "@/types/survey";
import type { StepData, Channel, SourceType } from "@/types/campaign";
import type { NodeParams, WorkflowNode, WorkflowEdge } from "@/types/workflow";
import type { SuggestionItem } from "@/state/suggestion-registry/types";
import { defaultCampaignName } from "./scenario-display";
import { estimateArtifactCount, artifactKindForCampaign } from "./artifact-metrics";
import { getEmails } from "@/state/email-directory";
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

export const SIGNAL_TYPES = [
  "Регистрация",
  "Первая сделка",
  "Апсейл",
  "Реактивация",
  "Возврат",
  "Удержание",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed";

export type Campaign = {
  id: string;
  name: string;
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
  /** Wizard-selected behavioral triggers (intent signals). Mirrors `interests`;
   *  surfaced read-only in the scoring node's «Интересы и триггеры» drawer. */
  triggers?: string[];
  files?: { name: string; rowCount: number }[];
  dailyBudget?: number;
  /**
   * Distinguishes "scoring running" from "communication started" — `status`
   * alone ("active") cannot. Drives the in-card progress block (design §4).
   */
  phase?: "scoring" | "communicating";
  /**
   * Ids of the `MessageTemplate`s this campaign launched with. Set by
   * `campaign_launched` (Task 15) from node-derived templates the launching
   * UI passes in. Absent on drafts and seeded preset campaigns.
   */
  templateIds?: string[];
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
  /**
   * «Сигналы» — сколько контактов из загруженной базы сматчилось / дали
   * intent-сигнал. Это число, которое скачивается артефактом и идёт в reach
   * статистического куба.
   */
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

/**
 * Seed templates so the Шаблоны tab + statistics have real data before any
 * launch. Email templates are derived 1:1 from the email directory presets
 * (channel "email"); the sms + push entries are hand-authored samples. Each
 * `content` is the channel's NodeParams member; `usedInCampaigns` starts at 0
 * and is bumped by `campaign_launched` (Task 15).
 */
export const PRESET_TEMPLATES: MessageTemplate[] = [
  ...getEmails().map<MessageTemplate>((e) => ({
    id: `tpl_${e.id}`,
    channel: "email",
    name: e.name,
    content: {
      kind: "email",
      subject: e.subject,
      body: e.body,
      sender: e.sender,
      link: e.link,
      emailId: e.id,
    },
    usedInCampaigns: 0,
  })),
  {
    id: "tpl_sms_reminder",
    channel: "sms",
    name: "SMS — напоминание",
    content: {
      kind: "sms",
      text: "Ваше предложение ждёт. Подробности на сайте.",
      alphaName: "AFINA",
      scheduledAt: "immediate",
      link: "https://example.com/offer",
    },
    usedInCampaigns: 0,
  },
  {
    id: "tpl_push_back",
    channel: "push",
    name: "Push — возвращение",
    content: {
      kind: "push",
      title: "Давно вас не видели",
      body: "Загляните — у нас есть кое-что для вас.",
      deeplink: "app://offers",
    },
    usedInCampaigns: 0,
  },
];

export type Preset = {
  key: "empty" | "mid" | "full";
  label: string;
  campaigns: Campaign[];
  artifacts: Artifact[];
};

export type SectionName = "Статистика" | "Артефакты" | "Кампании" | "Настройки";

export type View =
  | { kind: "welcome" }
  | { kind: "survey" }
  | { kind: "guided-campaign"; initialScenario?: { id: string; name: string } }
  | { kind: "workflow"; campaign: { id: string; name: string }; launched: boolean }
  | { kind: "campaign-payment"; campaign: { id: string; name: string } }
  | { kind: "campaign"; campaign: { id: string; name: string } }
  | { kind: "artifact"; artifactId: string }
  | { kind: "section"; name: SectionName; campaignId?: string };

// A "browser-history address" — what we persist to history.state so back/forward
// can restore a section. Intentionally coarser than View: no launched flag, no
// selectedWorkflowNode, no in-flight commands. On popstate we rehydrate the
// full View from this address + current campaigns[].
export type ViewAddress =
  | { kind: "welcome" }
  | { kind: "guided-campaign"; scenarioId?: string; scenarioName?: string }
  | { kind: "workflow"; campaignId: string }
  | { kind: "campaign-payment"; campaignId: string }
  | { kind: "campaign"; campaignId: string }
  | { kind: "artifact"; artifactId: string }
  | { kind: "section"; name: SectionName; campaignId?: string };

export type AppState = {
  view: View;
  artifacts: Artifact[];
  templates: MessageTemplate[];
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
   * Bumped on every `start_campaign_flow` so consumers (the wizard) can use it
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
  /**
   * PromptBar suggestion hints declared by the currently-active screen,
   * co-located via {@link useScreenHints}. The wizard branch of the suggestion
   * selector renders exactly this set, so hints travel with the screen and can
   * no longer drift from a lost wizard snapshot. Empty when no screen has
   * published (the selector then returns `hidden`).
   */
  screenHints: SuggestionItem[];
  /**
   * Stable id of the hook instance that currently owns {@link screenHints}.
   * Several screens can be mounted at once (e.g. the wizard's vertical
   * scroll-column), so only the active one owns the slice: switching active
   * screens reassigns the owner, and a deactivating/unmounting screen clears
   * the slice ONLY if it is still the owner — making publish/clear
   * order-independent (no flicker). `null` when nothing is published.
   */
  screenHintsOwner: string | null;
  /**
   * Dev/test-only: lets the screen-regression harness open the campaign wizard
   * at an arbitrary step with pre-seeded StepData. `null`/absent in every normal
   * flow — only the `__dev_seed__` action (injected by Playwright) ever sets it.
   * GuidedCampaignSection forwards it to CampaignWorkspace as
   * `initialStep` + `initialStepDataOverride`.
   */
  wizardSeed?: { step: number; stepData: StepData } | null;
};

export type Action =
  | { type: "start_campaign_flow"; initialScenario?: { id: string; name: string } }
  | { type: "campaign_selected"; campaign: { id: string; name: string } }
  | { type: "campaign_created_from_wizard"; stepData: StepData; scenarioName: string }
  | { type: "campaign_artifact_ready"; campaignId: string; kind: Artifact["kind"]; count: number }
  | { type: "campaign_opened"; id: string }
  | { type: "campaign_renamed"; id: string; name: string }
  | { type: "campaign_file_added"; campaignId: string; file: { name: string; rowCount: number } }
  | { type: "campaign_scoring_set"; id: string; interests: string[]; triggers: string[] }
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
  | { type: "artifact_opened"; id: string }
  | { type: "artifact_deleted"; id: string }
  | { type: "signals_badge_set"; value: boolean }
  | { type: "wizard_step_changed"; step: number | null }
  | { type: "budget_help_shown" }
  | { type: "wizard_random_remix" }
  | { type: "campaign_launched"; id: string; timestamp: string; budget: number; templates?: MessageTemplate[]; dailyBudget?: number }
  | { type: "campaign_phase_advanced"; id: string }
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
  | { type: "workflow_ai_undo_availability"; available: boolean }
  | { type: "template_added"; template: MessageTemplate }
  | { type: "template_renamed"; id: string; name: string }
  // Co-located PromptBar hints: the active screen publishes its suggestion set
  // (set) and relinquishes it on deactivate/unmount (clear). Clear is
  // owner-guarded — see `screenHintsOwner`.
  | { type: "screen_hints_set"; owner: string; items: SuggestionItem[] }
  | { type: "screen_hints_clear"; owner: string }
  // Dev/test-only: shallow-merge an arbitrary state slice. Used by the screen
  // regression harness (Playwright `addInitScript` → window seed). No-op in
  // production — the only dispatcher is `useSeedFromWindow`, which bails when
  // `NODE_ENV === "production"`.
  | { type: "__dev_seed__"; partial: Partial<AppState> };
// PARALLEL-WORKTREE INSERTION POINT — survey actions (B), billing/signal-status actions (E).
// Each worktree appends its own action variants to the union above; resolve merges by
// keeping every appended line and adding the matching reducer case at the end of appReducer.

export const initialState: AppState = {
  view: { kind: "welcome" },
  artifacts: [],
  templates: PRESET_TEMPLATES,
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
  screenHints: [],
  screenHintsOwner: null,
};

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "start_campaign_flow":
      // Анкета не пройдена — ведём пользователя сначала в survey-view
      // (fullscreen без sidebar/bottom-bar). После `survey_completed`
      // SurveySection повторно диспатчит `start_campaign_flow`, и тогда
      // условие ниже даст ему мастер. initialScenario при гейте теряется —
      // в прототипе его никто из пользовательских путей не передаёт.
      if (state.surveyStatus !== "completed") {
        return {
          ...state,
          view: { kind: "survey" },
          launchFlyoutOpen: false,
          activeSection: null,
        };
      }
      return {
        ...state,
        view: { kind: "guided-campaign", initialScenario: action.initialScenario },
        launchFlyoutOpen: false,
        activeSection: null,
        wizardSessionId: state.wizardSessionId + 1,
      };

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
      const newCampaign: Campaign = {
        id: action.campaign.id,
        name: action.campaign.name,
        status: "draft",
        createdAt: new Date().toISOString(),
        sourceType: "new",
        channels: [],
      };
      return {
        ...state,
        campaigns: [...state.campaigns, newCampaign],
        view: { kind: "workflow", campaign: action.campaign, launched: false },
        activeSection: null,
        campaignFilter: [],
        campaignSort: "default",
      };
    }

    case "campaign_created_from_wizard": {
      const sd = action.stepData;
      const scenarioId = sd.scenario ?? "";
      const n =
        state.campaigns.filter((c) => c.scenario?.id === scenarioId).length + 1;
      // StepData.files are raw browser `File[]`; Campaign.files is the
      // lightweight `{ name; rowCount }[]` snapshot. The upload step computes
      // only the SUMMARY row count (sd.fileRowCount), so distribute it across
      // the files evenly, with the remainder landing on the first file.
      const totalRows = sd.fileRowCount ?? 0;
      const files = sd.files.length
        ? sd.files.map((f, i) => ({
            name: f.name,
            rowCount:
              i === 0
                ? totalRows -
                  Math.floor(totalRows / sd.files.length) * (sd.files.length - 1)
                : Math.floor(totalRows / sd.files.length),
          }))
        : undefined;
      const newCampaign: Campaign = {
        id: `cmp_${nanoid(6)}`,
        name: defaultCampaignName(action.scenarioName, n),
        status: "draft",
        createdAt: new Date().toISOString(),
        sourceType: sd.sourceType,
        channels: sd.channels,
        interests: sd.interests,
        triggers: sd.triggers,
        files,
        budget: sd.budget ?? undefined,
        dailyBudget: sd.dailyBudget,
        // new drafts collect signals pre-launch — start in the scoring phase so
        // the campaign card shows collection progress and gates «Запустить».
        // stream/own launch immediately, so they carry no pre-launch phase.
        phase: sd.sourceType === "new" ? "scoring" : undefined,
        scenario: scenarioId ? { id: scenarioId, name: action.scenarioName } : undefined,
      };
      return {
        ...state,
        campaigns: [...state.campaigns, newCampaign],
        // Wizard finish now opens the workflow graph editor (draft, not launched).
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
      return {
        ...state,
        artifacts: [...state.artifacts, artifact],
        // Reuse the existing badge field (rename to artifactsBadge is optional
        // Wave-1 polish — see task note). Lighting it here makes the Артефакты
        // badge fire for real artifacts.
        notifications: { ...state.notifications, signalsBadge: true },
      };
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

    case "campaign_file_added": {
      // Block C #8 — «Добавить файл» с графа: дописывает базу в Campaign.files.
      if (!state.campaigns.some((c) => c.id === action.campaignId)) return state;
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.campaignId
            ? { ...c, files: [...(c.files ?? []), action.file] }
            : c
        ),
      };
    }

    case "campaign_scoring_set": {
      // 2c — редактируемый дровер «Интересы и триггеры» на скоринг-ноде:
      // черновик кампании может править интересы/триггеры до запуска. Источник
      // правды — сам Campaign (applyCampaignContext накладывает их на ноду при
      // пересборке графа), поэтому дровер пишет именно сюда.
      if (!state.campaigns.some((c) => c.id === action.id)) return state;
      return {
        ...state,
        campaigns: state.campaigns.map((c) =>
          c.id === action.id
            ? { ...c, interests: action.interests, triggers: action.triggers }
            : c
        ),
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
        // Campaign-first presets seed campaigns + artifacts.
        artifacts: action.preset.artifacts,
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

    case "artifact_opened":
      return {
        ...state,
        view: { kind: "artifact", artifactId: action.id },
        activeSection: null,
      };

    case "artifact_deleted":
      return {
        ...state,
        artifacts: state.artifacts.filter((a) => a.id !== action.id),
        view:
          state.view.kind === "artifact" && state.view.artifactId === action.id
            ? { kind: "section", name: "Артефакты" }
            : state.view,
        activeSection:
          state.view.kind === "artifact" && state.view.artifactId === action.id
            ? "Артефакты"
            : state.activeSection,
      };

    case "signals_badge_set":
      return {
        ...state,
        notifications: { ...state.notifications, signalsBadge: action.value },
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

    case "screen_hints_set":
      return { ...state, screenHints: action.items, screenHintsOwner: action.owner };

    case "screen_hints_clear":
      // Owner-guarded: a screen only clears the slice if it still owns it.
      // After another screen took ownership, a late clear from the previous
      // owner is a no-op — so publish/clear ordering across mounted siblings
      // never wipes the active screen's hints.
      return state.screenHintsOwner === action.owner
        ? { ...state, screenHints: [], screenHintsOwner: null }
        : state;

    case "settings_updated":
      return {
        ...state,
        accountSettings: { ...state.accountSettings, ...action.patch },
      };

    case "campaign_launched": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;

      // Merge node-derived templates into the shared library, deduping by id:
      // bump usage for an already-present id, push with usage 1 for a new one.
      const incoming = action.templates ?? [];
      const incomingIds = incoming.map((t) => t.id);
      const present = new Set(state.templates.map((t) => t.id));
      const templates: MessageTemplate[] = state.templates.map((t) =>
        incomingIds.includes(t.id)
          ? { ...t, usedInCampaigns: t.usedInCampaigns + 1 }
          : t
      );
      for (const t of incoming) {
        if (!present.has(t.id)) {
          templates.push({ ...t, usedInCampaigns: 1 });
        }
      }

      // Signal collection now happens PRE-launch (new drafts run scoring on the
      // campaign card before «Запустить» unlocks), so launch always transitions
      // straight to communicating. Artifact is generated only if none exists yet
      // (idempotent): own/stream get theirs here; new already produced its
      // collected-signals artifact during pre-launch `campaign_phase_advanced`.
      const phase: Campaign["phase"] = "communicating";
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const makeArtifact = !alreadyHasArtifact;
      const launchMatched = estimateArtifactCount(c);
      const newArtifacts: Artifact[] = makeArtifact
        ? [{
            id: `art_${nanoid(8)}`,
            campaignId: c.id,
            kind: artifactKindForCampaign(c),
            count: launchMatched,
            createdAt: action.timestamp,
          }]
        : [];

      return {
        ...state,
        templates,
        artifacts: [...state.artifacts, ...newArtifacts],
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id
            ? {
                ...cc,
                status: "active",
                phase,
                launchedAt: cc.launchedAt ?? action.timestamp,
                budget: action.budget > 0 ? action.budget : cc.budget,
                dailyBudget: action.dailyBudget ?? cc.dailyBudget,
                templateIds: incomingIds.length > 0 ? incomingIds : cc.templateIds,
              }
            : cc
        ),
        notifications: makeArtifact
          ? { ...state.notifications, signalsBadge: true }
          : state.notifications,
        view: { kind: "campaign", campaign: { id: c.id, name: c.name } },
        activeSection: null,
      };
    }

    case "campaign_phase_advanced": {
      const c = state.campaigns.find((cc) => cc.id === action.id);
      if (!c) return state;
      const alreadyHasArtifact = state.artifacts.some((a) => a.campaignId === c.id);
      const advanceMatched = estimateArtifactCount(c);
      const newArtifacts: Artifact[] = alreadyHasArtifact
        ? []
        : [{
            id: `art_${nanoid(8)}`,
            campaignId: c.id,
            kind: artifactKindForCampaign(c),
            count: advanceMatched,
            createdAt: new Date().toISOString(),
          }];
      return {
        ...state,
        campaigns: state.campaigns.map((cc) =>
          cc.id === action.id ? { ...cc, phase: "communicating" } : cc
        ),
        artifacts: [...state.artifacts, ...newArtifacts],
        notifications:
          newArtifacts.length > 0
            ? { ...state.notifications, signalsBadge: true }
            : state.notifications,
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
    case "template_added": {
      // Dedup by id — ignore if the template already exists in the library
      if (state.templates.some((t) => t.id === action.template.id)) return state;
      const template = { ...action.template, usedInCampaigns: 0 };
      return { ...state, templates: [template, ...state.templates] };
    }
    case "template_renamed": {
      // Rename a template by id. Trim and ignore empty input so the
      // `name` field stays a non-empty string (contract shared with Block 5,
      // which looks templates up by name).
      const name = action.name.trim();
      if (!name) return state;
      if (!state.templates.some((t) => t.id === action.id)) return state;
      return {
        ...state,
        templates: state.templates.map((t) =>
          t.id === action.id ? { ...t, name } : t,
        ),
      };
    }
    case "__dev_seed__":
      return { ...state, ...action.partial };
    // PARALLEL-WORTREE INSERTION POINT — append survey/billing/signal-status cases
    // immediately above this comment to keep merges trivial.
  }
}

function rebuildViewFromAddress(addr: ViewAddress, campaigns: Campaign[]): View {
  switch (addr.kind) {
    case "welcome":
      return { kind: "welcome" };
    case "guided-campaign":
      return {
        kind: "guided-campaign",
        initialScenario:
          addr.scenarioId && addr.scenarioName
            ? { id: addr.scenarioId, name: addr.scenarioName }
            : undefined,
      };
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
    case "artifact":
      return { kind: "artifact", artifactId: addr.artifactId };
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
    case "guided-campaign":
      return {
        kind: "guided-campaign",
        scenarioId: view.initialScenario?.id,
        scenarioName: view.initialScenario?.name,
      };
    case "workflow":
      return { kind: "workflow", campaignId: view.campaign.id };
    case "campaign-payment":
      return { kind: "campaign-payment", campaignId: view.campaign.id };
    case "campaign":
      return { kind: "campaign", campaignId: view.campaign.id };
    case "artifact":
      return { kind: "artifact", artifactId: view.artifactId };
    case "section":
      return { kind: "section", name: view.name, campaignId: view.campaignId };
  }
}

export const isCampaignDone = (s: AppState) =>
  s.campaigns.some(
    (c) =>
      c.status === "active" ||
      c.status === "paused" ||
      c.status === "completed"
  );
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
 * Секции различаем по имени (переход Кампании→Статистика — смена scope), прочие
 * экраны — по kind.
 */
export function navigationScopeKey(view: View): string {
  if (view.kind === "section") return `section:${view.name}`;
  return `view:${view.kind}`;
}

/**
 * Какой пункт левого меню подсвечен. Выводится из текущего view, чтобы пункт
 * не гас при заполнении визарда / работе с кампанией (там activeSection
 * занулён):
 *  - guided-campaign / workflow / campaign / campaign-payment → «Кампании»
 *    (создание кампании, воркфлоу, карточка, оплата);
 *  - section → имя раздела;
 *  - иначе (welcome / survey) → activeSection (обычно null).
 */
export function activeNavSection(s: AppState): SectionName | null {
  switch (s.view.kind) {
    case "section":
      return s.view.name;
    case "guided-campaign":
    case "workflow":
    case "campaign":
    case "campaign-payment":
      return "Кампании";
    default:
      return s.activeSection;
  }
}
