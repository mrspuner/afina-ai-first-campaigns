"use client";

import type { EmailDraft } from "./email-directory";
import type { Channel } from "@/types/campaign";
import type { NodeParams } from "@/types/workflow";
import type { MessageTemplate } from "./app-state";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** When set, the user bubble renders a chip with this label before the text. */
  triggerLabel?: string;
  /** Placeholder while the simulated AI tick runs. Replaced by update_pending. */
  pending?: boolean;
  /**
   * Chain-of-thought шаги, стримящиеся в ОДИН сворачиваемый reasoning-блок.
   * Наличие массива помечает сообщение как reasoning-блок (рендерится через
   * components/ai-elements/reasoning вместо обычного пузыря).
   */
  reasoningSteps?: string[];
  /** true пока шаги ещё стримятся; по завершении → false, блок сворачивается. */
  reasoningStreaming?: boolean;
  /**
   * Рендерить текст ассистента как markdown (Streamdown) вместо plain-span.
   * Ставится точечно (напр. сообщение с вариантами шаблона, #8) — обычные
   * сообщения остаются plain.
   */
  format?: "markdown";
  createdAt: number;
}

export type ChatPanelMode = "collapsed" | "sidebar";

/**
 * Один вариант шаблона, сгенерированный моделью (#15 template-drawer).
 */
export interface TemplateDrawerVariant {
  id: string;
  name: string;
  content: NodeParams;
  /** Состав компонентов шаблона (#15) — человекочитаемые имена полей. */
  components: string[];
}

/** Опция вопроса пикера вариантов (#14). */
export interface TemplateQuestionOption {
  id: string;
  label: string;
  /** Состав компонентов варианта (#15). */
  components?: string[];
}

/** Активный вопрос пикера вариантов (#14). */
export interface TemplateQuestion {
  /** Текст вопроса = заголовок пикера и текст assistant-сообщения. */
  prompt: string;
  options: TemplateQuestionOption[];
  /** false для закрытых множеств (канал) → нет строки «Другой вариант»/«Пропустить». */
  allowFreeInput: boolean;
}

/**
 * Состояние структурированного drawer'а создания/предпросмотра шаблона
 * (#14, #15). Поток переехал в боковой чат-дровер: вопросы — отдельные
 * assistant-сообщения, варианты ответа рендерятся в VariantPicker над
 * промпт-баром.
 */
export interface TemplateDrawerState {
  open: boolean;
  /** create — пошаговое создание; preview — read-only показ готового шаблона (#14, шов для блока 5). */
  mode: "create" | "preview";
  step: "channel" | "intent" | "variants";
  channel: Channel | null;
  intent: string;
  variants: TemplateDrawerVariant[];
  selectedId: string | null;
  generating: boolean;
  /** Активный вопрос пикера (#14). null → пикер не рендерим. */
  question: TemplateQuestion | null;
  /** id шаблона в режиме preview (#14, шов для блока 5). */
  previewTemplateId: string | null;
  /**
   * Инлайновый шаблон для предпросмотра, когда контент НЕ лежит в библиотеке
   * `app-state.templates`. Используется IVR-нодой: её сценарий/голос живут внутри
   * ноды, поэтому «глаз» передаёт готовый {@link MessageTemplate} напрямую. Если
   * задан — дровер рендерит его, минуя поиск по `previewTemplateId`.
   */
  previewTemplate: MessageTemplate | null;
}

/**
 * Состояние редактора письма email-ноды (спека A5). Когда `open` — справа
 * висит панель предпросмотра ~600px, а AI-дровер смещается влево.
 * `draft` — редактируемый черновик письма (живёт здесь, чтобы и панель, и
 * обработчик чата могли его читать/править).
 */
export interface EmailEditorState {
  open: boolean;
  nodeId: string | null;
  /** id письма из справочника (при открытии готового). */
  emailId?: string;
  /** true — письмо создаётся с нуля через ИИ. */
  isNew?: boolean;
  /**
   * true — панель открыта только на просмотр (#32): без тулбара блоков и без
   * «Сохранить». Используется при открытии письма из карточки шаблона
   * (раздел «Артефакты»), где сохранять некуда (нет nodeId).
   */
  preview?: boolean;
  draft: EmailDraft | null;
}

/**
 * «Интересы и триггеры» content mode of the AI sidebar (chat-drawer). When
 * `open`, the sidebar renders the shared interests/triggers editor (the SAME one
 * the wizard uses) above its composer, instead of the chat history — so the
 * scoring node reuses the drawer that ALREADY has «Афина ИИ» + the prompt bar
 * (single-composer invariant already solved by sidebar mode). Bound to the
 * scoring node + campaign so edits persist to the campaign's scoring params.
 */
export interface ScoringDrawerState {
  open: boolean;
  /** Draft (not launched) → editable; launched → read-only. */
  editable: boolean;
  /** Scoring node whose params mirror the edit (card updates immediately). */
  nodeId: string | null;
  /** Campaign that durably owns the interests/triggers (source of truth). */
  campaignId: string | null;
}

/**
 * Слой «правка кампании текстом» поверх ИИ-дровера. Независим от
 * `templateDrawer` намеренно: там выбор варианта сохраняет ШАБЛОН
 * (`template_added`), а здесь ответы ничего не мутируют — на этой итерации они
 * только собираются, чтобы ассистент честно ответил заглушкой.
 *
 * Очередь `questions` приходит от модели; `index` — сколько уже отвечено, то
 * есть текущий вопрос это `questions[index]` (undefined → пикер гаснет).
 */
export interface CampaignEditDrawerState {
  open: boolean;
  campaignId: string | null;
  questions: TemplateQuestion[];
  index: number;
  answers: string[];
}

export interface ChatState {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  emailEditor: EmailEditorState;
  templateDrawer: TemplateDrawerState;
  scoringDrawer: ScoringDrawerState;
  campaignEditDrawer: CampaignEditDrawerState;
}

export type ChatAction =
  | { type: "append"; message: ChatMessage }
  | { type: "update_pending"; id: string; text: string; format?: "markdown" }
  | {
      type: "update_reasoning";
      id: string;
      steps: string[];
      streaming: boolean;
    }
  | { type: "clear" }
  | { type: "open_sidebar" }
  | { type: "close_sidebar" }
  | {
      type: "open_email_editor";
      nodeId: string;
      emailId?: string;
      isNew?: boolean;
      /** #32: открыть панель в режиме просмотра (read-only). */
      preview?: boolean;
      draft: EmailDraft | null;
    }
  | { type: "close_email_editor" }
  | { type: "set_email_draft"; patch: Partial<EmailDraft> }
  | { type: "open_template_drawer" }
  | { type: "open_template_create"; channel: Channel }
  | { type: "open_template_preview"; templateId?: string; template?: MessageTemplate }
  | { type: "close_template_drawer" }
  | { type: "set_template_channel"; channel: Channel }
  | { type: "set_template_intent"; intent: string }
  | { type: "set_template_variants"; variants: TemplateDrawerVariant[] }
  | { type: "set_template_selected"; id: string }
  | { type: "set_template_generating"; generating: boolean }
  | { type: "set_template_question"; question: TemplateQuestion | null }
  | {
      type: "open_scoring_drawer";
      nodeId: string;
      campaignId: string;
      editable: boolean;
    }
  | { type: "close_scoring_drawer" }
  | {
      type: "open_campaign_edit";
      campaignId: string;
      questions: TemplateQuestion[];
    }
  | { type: "answer_campaign_edit"; answer: string }
  | { type: "close_campaign_edit" };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "append": {
      return { ...state, messages: [...state.messages, action.message] };
    }
    case "update_pending": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, text: action.text, pending: undefined, format: action.format }
            : m
        ),
      };
    }
    case "update_reasoning": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? {
                ...m,
                reasoningSteps: action.steps,
                reasoningStreaming: action.streaming,
                pending: undefined,
              }
            : m
        ),
      };
    }
    case "clear": {
      return { ...state, messages: [] };
    }
    case "open_sidebar": {
      return state.mode === "sidebar" ? state : { ...state, mode: "sidebar" };
    }
    case "close_sidebar": {
      // Слой «Интересы и триггеры» независим от ИИ-дровера (см.
      // open_scoring_drawer) — закрытие сайдбара его НЕ трогает; он
      // закрывается своим крестиком через close_scoring_drawer.
      if (state.mode === "collapsed") return state;
      return { ...state, mode: "collapsed" };
    }
    case "open_scoring_drawer": {
      // НЕ трогаем mode: слой «Интересы и триггеры» независим от ИИ-дровера/
      // нижнего бара — они остаются на своих местах (два независимых слоя).
      return {
        ...state,
        scoringDrawer: {
          open: true,
          editable: action.editable,
          nodeId: action.nodeId,
          campaignId: action.campaignId,
        },
      };
    }
    case "close_scoring_drawer": {
      return {
        ...state,
        scoringDrawer: INITIAL_SCORING_DRAWER,
      };
    }
    case "open_campaign_edit": {
      return {
        ...state,
        campaignEditDrawer: {
          open: true,
          campaignId: action.campaignId,
          questions: action.questions,
          index: 0,
          answers: [],
        },
      };
    }
    case "answer_campaign_edit": {
      const d = state.campaignEditDrawer;
      // Очередь исчерпана — лишний ответ игнорируем, а не пишем в никуда.
      if (d.index >= d.questions.length) return state;
      return {
        ...state,
        campaignEditDrawer: {
          ...d,
          index: d.index + 1,
          answers: [...d.answers, action.answer],
        },
      };
    }
    case "close_campaign_edit": {
      return { ...state, campaignEditDrawer: INITIAL_CAMPAIGN_EDIT_DRAWER };
    }
    case "open_email_editor": {
      return {
        ...state,
        emailEditor: {
          open: true,
          nodeId: action.nodeId,
          emailId: action.emailId,
          isNew: action.isNew,
          preview: action.preview, // #32
          draft: action.draft,
        },
      };
    }
    case "close_email_editor": {
      return { ...state, emailEditor: INITIAL_EMAIL_EDITOR };
    }
    case "set_email_draft": {
      if (!state.emailEditor.draft) return state;
      return {
        ...state,
        emailEditor: {
          ...state.emailEditor,
          draft: { ...state.emailEditor.draft, ...action.patch },
        },
      };
    }
    case "open_template_drawer": {
      return {
        ...state,
        templateDrawer: { ...INITIAL_TEMPLATE_DRAWER, open: true },
      };
    }
    case "open_template_create": {
      return {
        ...state,
        templateDrawer: {
          ...INITIAL_TEMPLATE_DRAWER,
          open: true,
          mode: "create",
          channel: action.channel,
          step: "intent",
        },
      };
    }
    case "open_template_preview": {
      return {
        ...state,
        templateDrawer: {
          ...INITIAL_TEMPLATE_DRAWER,
          open: true,
          mode: "preview",
          previewTemplateId: action.templateId ?? null,
          previewTemplate: action.template ?? null,
        },
      };
    }
    case "set_template_question": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, question: action.question },
      };
    }
    case "close_template_drawer": {
      return { ...state, templateDrawer: INITIAL_TEMPLATE_DRAWER };
    }
    case "set_template_channel": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, channel: action.channel, step: "intent" },
      };
    }
    case "set_template_intent": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, intent: action.intent },
      };
    }
    case "set_template_variants": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, variants: action.variants, step: "variants" },
      };
    }
    case "set_template_selected": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, selectedId: action.id },
      };
    }
    case "set_template_generating": {
      return {
        ...state,
        templateDrawer: { ...state.templateDrawer, generating: action.generating },
      };
    }
  }
}

const INITIAL_EMAIL_EDITOR: EmailEditorState = {
  open: false,
  nodeId: null,
  draft: null,
};

const INITIAL_TEMPLATE_DRAWER: TemplateDrawerState = {
  open: false,
  mode: "create",
  step: "channel",
  channel: null,
  intent: "",
  variants: [],
  selectedId: null,
  generating: false,
  question: null,
  previewTemplateId: null,
  previewTemplate: null,
};

const INITIAL_SCORING_DRAWER: ScoringDrawerState = {
  open: false,
  editable: false,
  nodeId: null,
  campaignId: null,
};

const INITIAL_CAMPAIGN_EDIT_DRAWER: CampaignEditDrawerState = {
  open: false,
  campaignId: null,
  questions: [],
  index: 0,
  answers: [],
};

export const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  mode: "collapsed",
  emailEditor: INITIAL_EMAIL_EDITOR,
  templateDrawer: INITIAL_TEMPLATE_DRAWER,
  scoringDrawer: INITIAL_SCORING_DRAWER,
  campaignEditDrawer: INITIAL_CAMPAIGN_EDIT_DRAWER,
};

let messageCounter = 0;
export function nextMessageId(): string {
  messageCounter += 1;
  return `msg_${messageCounter}`;
}

// ---------------------------------------------------------------------------
// ChatProvider + useChat
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useAppState } from "./app-state-context";
import { useScopeReset } from "./use-scope-reset";

interface ChatContextValue {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  /** Returns the id of the new message so the caller can update_pending later. */
  append: (input: Omit<ChatMessage, "id" | "createdAt">) => string;
  updatePending: (id: string, text: string, format?: "markdown") => void;
  /** Push the current reasoning steps into an existing reasoning message. */
  updateReasoning: (id: string, steps: string[], streaming: boolean) => void;
  clear: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Email-редактор (A5): текущее состояние + операции. */
  emailEditor: EmailEditorState;
  openEmailEditor: (
    nodeId: string,
    opts: {
      emailId?: string;
      isNew?: boolean;
      /** #32: открыть на просмотр (read-only). */
      preview?: boolean;
      draft: EmailDraft | null;
    }
  ) => void;
  closeEmailEditor: () => void;
  setEmailDraft: (patch: Partial<EmailDraft>) => void;
  /** Template-drawer (#15): состояние и операции. */
  templateDrawer: TemplateDrawerState;
  openTemplateDrawer: () => void;
  /** Шов для блока 5: открыть дровер сразу на шаге намерения для канала (#14). */
  openTemplateCreate: (channel: Channel) => void;
  /**
   * Шов для блока 5: открыть дровер в режиме предпросмотра.
   * - строка → шаблон ищется по id в `app-state.templates` (sms/email/push);
   * - объект → инлайновый шаблон рендерится напрямую (IVR-нода, чей сценарий
   *   живёт внутри ноды, а не в библиотеке).
   */
  openTemplatePreview: (target: string | MessageTemplate) => void;
  closeTemplateDrawer: () => void;
  setTemplateChannel: (channel: Channel) => void;
  setTemplateIntent: (intent: string) => void;
  setTemplateVariants: (variants: TemplateDrawerVariant[]) => void;
  setTemplateSelected: (id: string) => void;
  setTemplateGenerating: (generating: boolean) => void;
  /** Активный вопрос пикера (#14). null скрывает пикер. */
  setTemplateQuestion: (question: TemplateQuestion | null) => void;
  /** «Интересы и триггеры» content mode of the AI sidebar (scoring node). */
  scoringDrawer: ScoringDrawerState;
  openScoringDrawer: (opts: {
    nodeId: string;
    campaignId: string;
    editable: boolean;
  }) => void;
  closeScoringDrawer: () => void;
  /** Слой правки кампании текстом: очередь вопросов модели + ответы. */
  campaignEditDrawer: CampaignEditDrawerState;
  openCampaignEdit: (campaignId: string, questions: TemplateQuestion[]) => void;
  answerCampaignEdit: (answer: string) => void;
  closeCampaignEdit: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const { wizardSessionId } = useAppState();

  // Reset the chat when the navigation scope changes (section→section or
  // view→view). Ask-чипы используют чат как локальную историю раздела; при
  // переходе между разделами она не должна тянуться. Смена шагов wizard'а и
  // изменения внутри одного workflow/campaign-feed scope не меняют. Единое
  // правило очистки разделяется с чипами и очередью черновиков (useScopeReset).
  // Заодно закрываем боковой драйвер: при переходе в другой раздел открытый
  // AI-drawer не должен оставаться висеть.
  const resetChat = useCallback(() => {
    dispatch({ type: "clear" });
    dispatch({ type: "close_sidebar" });
    dispatch({ type: "close_email_editor" });
    dispatch({ type: "close_template_drawer" });
    dispatch({ type: "close_campaign_edit" });
  }, []);
  useScopeReset(resetChat);

  // Reset the chat when the wizard session id changes (new campaign flow started).
  useEffect(() => {
    dispatch({ type: "clear" });
  }, [wizardSessionId]);

  const append = useCallback(
    (input: Omit<ChatMessage, "id" | "createdAt">) => {
      const message: ChatMessage = {
        ...input,
        id: nextMessageId(),
        createdAt: Date.now(),
      };
      dispatch({ type: "append", message });
      return message.id;
    },
    []
  );

  const updatePending = useCallback(
    (id: string, text: string, format?: "markdown") => {
      dispatch({ type: "update_pending", id, text, format });
    },
    []
  );

  const updateReasoning = useCallback(
    (id: string, steps: string[], streaming: boolean) => {
      dispatch({ type: "update_reasoning", id, steps, streaming });
    },
    []
  );

  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const openSidebar = useCallback(() => dispatch({ type: "open_sidebar" }), []);
  const closeSidebar = useCallback(() => dispatch({ type: "close_sidebar" }), []);

  const openEmailEditor = useCallback(
    (
      nodeId: string,
      opts: {
        emailId?: string;
        isNew?: boolean;
        preview?: boolean;
        draft: EmailDraft | null;
      }
    ) =>
      dispatch({
        type: "open_email_editor",
        nodeId,
        emailId: opts.emailId,
        isNew: opts.isNew,
        preview: opts.preview, // #32
        draft: opts.draft,
      }),
    []
  );
  const closeEmailEditor = useCallback(
    () => dispatch({ type: "close_email_editor" }),
    []
  );
  const setEmailDraft = useCallback(
    (patch: Partial<EmailDraft>) => dispatch({ type: "set_email_draft", patch }),
    []
  );

  const openTemplateDrawer = useCallback(() => dispatch({ type: "open_template_drawer" }), []);
  const openTemplateCreate = useCallback(
    (channel: Channel) => dispatch({ type: "open_template_create", channel }),
    []
  );
  const openTemplatePreview = useCallback(
    (target: string | MessageTemplate) =>
      dispatch(
        typeof target === "string"
          ? { type: "open_template_preview", templateId: target }
          : { type: "open_template_preview", template: target }
      ),
    []
  );
  const closeTemplateDrawer = useCallback(() => dispatch({ type: "close_template_drawer" }), []);
  const setTemplateChannel = useCallback(
    (channel: Channel) => dispatch({ type: "set_template_channel", channel }),
    []
  );
  const setTemplateIntent = useCallback(
    (intent: string) => dispatch({ type: "set_template_intent", intent }),
    []
  );
  const setTemplateVariants = useCallback(
    (variants: TemplateDrawerVariant[]) => dispatch({ type: "set_template_variants", variants }),
    []
  );
  const setTemplateSelected = useCallback(
    (id: string) => dispatch({ type: "set_template_selected", id }),
    []
  );
  const setTemplateGenerating = useCallback(
    (generating: boolean) => dispatch({ type: "set_template_generating", generating }),
    []
  );
  const setTemplateQuestion = useCallback(
    (question: TemplateQuestion | null) => dispatch({ type: "set_template_question", question }),
    []
  );

  const openScoringDrawer = useCallback(
    (opts: { nodeId: string; campaignId: string; editable: boolean }) =>
      dispatch({
        type: "open_scoring_drawer",
        nodeId: opts.nodeId,
        campaignId: opts.campaignId,
        editable: opts.editable,
      }),
    []
  );
  const closeScoringDrawer = useCallback(
    () => dispatch({ type: "close_scoring_drawer" }),
    []
  );

  const openCampaignEdit = useCallback(
    (campaignId: string, questions: TemplateQuestion[]) =>
      dispatch({ type: "open_campaign_edit", campaignId, questions }),
    []
  );
  const answerCampaignEdit = useCallback(
    (answer: string) => dispatch({ type: "answer_campaign_edit", answer }),
    []
  );
  const closeCampaignEdit = useCallback(
    () => dispatch({ type: "close_campaign_edit" }),
    []
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      messages: state.messages,
      mode: state.mode,
      append,
      updatePending,
      updateReasoning,
      clear,
      openSidebar,
      closeSidebar,
      emailEditor: state.emailEditor,
      openEmailEditor,
      closeEmailEditor,
      setEmailDraft,
      templateDrawer: state.templateDrawer,
      openTemplateDrawer,
      openTemplateCreate,
      openTemplatePreview,
      closeTemplateDrawer,
      setTemplateChannel,
      setTemplateIntent,
      setTemplateVariants,
      setTemplateSelected,
      setTemplateGenerating,
      setTemplateQuestion,
      scoringDrawer: state.scoringDrawer,
      openScoringDrawer,
      closeScoringDrawer,
      campaignEditDrawer: state.campaignEditDrawer,
      openCampaignEdit,
      answerCampaignEdit,
      closeCampaignEdit,
    }),
    [
      state.messages,
      state.mode,
      append,
      updatePending,
      updateReasoning,
      clear,
      openSidebar,
      closeSidebar,
      state.emailEditor,
      openEmailEditor,
      closeEmailEditor,
      setEmailDraft,
      state.templateDrawer,
      openTemplateDrawer,
      openTemplateCreate,
      openTemplatePreview,
      closeTemplateDrawer,
      setTemplateChannel,
      setTemplateIntent,
      setTemplateVariants,
      setTemplateSelected,
      setTemplateGenerating,
      setTemplateQuestion,
      state.scoringDrawer,
      openScoringDrawer,
      closeScoringDrawer,
      state.campaignEditDrawer,
      openCampaignEdit,
      answerCampaignEdit,
      closeCampaignEdit,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
