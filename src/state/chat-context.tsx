"use client";

import type { EmailDraft } from "./email-directory";
import type { Channel } from "@/types/campaign";
import type { NodeParams } from "@/types/workflow";

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
}

/**
 * Состояние структурированного drawer'а создания шаблона (#15).
 * Зеркалит паттерн EmailEditorState.
 */
export interface TemplateDrawerState {
  open: boolean;
  step: "channel" | "intent" | "variants";
  channel: Channel | null;
  intent: string;
  variants: TemplateDrawerVariant[];
  selectedId: string | null;
  generating: boolean;
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
  draft: EmailDraft | null;
}

export interface ChatState {
  messages: ChatMessage[];
  mode: ChatPanelMode;
  emailEditor: EmailEditorState;
  templateDrawer: TemplateDrawerState;
}

export type ChatAction =
  | { type: "append"; message: ChatMessage }
  | { type: "update_pending"; id: string; text: string }
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
      draft: EmailDraft | null;
    }
  | { type: "close_email_editor" }
  | { type: "set_email_draft"; patch: Partial<EmailDraft> }
  | { type: "open_template_drawer" }
  | { type: "close_template_drawer" }
  | { type: "set_template_channel"; channel: Channel }
  | { type: "set_template_intent"; intent: string }
  | { type: "set_template_variants"; variants: TemplateDrawerVariant[] }
  | { type: "set_template_selected"; id: string }
  | { type: "set_template_generating"; generating: boolean };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "append": {
      return { ...state, messages: [...state.messages, action.message] };
    }
    case "update_pending": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, text: action.text, pending: undefined } : m
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
      return state.mode === "collapsed" ? state : { ...state, mode: "collapsed" };
    }
    case "open_email_editor": {
      return {
        ...state,
        emailEditor: {
          open: true,
          nodeId: action.nodeId,
          emailId: action.emailId,
          isNew: action.isNew,
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
  step: "channel",
  channel: null,
  intent: "",
  variants: [],
  selectedId: null,
  generating: false,
};

export const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  mode: "collapsed",
  emailEditor: INITIAL_EMAIL_EDITOR,
  templateDrawer: INITIAL_TEMPLATE_DRAWER,
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
  updatePending: (id: string, text: string) => void;
  /** Push the current reasoning steps into an existing reasoning message. */
  updateReasoning: (id: string, steps: string[], streaming: boolean) => void;
  clear: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Email-редактор (A5): текущее состояние + операции. */
  emailEditor: EmailEditorState;
  openEmailEditor: (
    nodeId: string,
    opts: { emailId?: string; isNew?: boolean; draft: EmailDraft | null }
  ) => void;
  closeEmailEditor: () => void;
  setEmailDraft: (patch: Partial<EmailDraft>) => void;
  /** Template-drawer (#15): состояние и операции. */
  templateDrawer: TemplateDrawerState;
  openTemplateDrawer: () => void;
  closeTemplateDrawer: () => void;
  setTemplateChannel: (channel: Channel) => void;
  setTemplateIntent: (intent: string) => void;
  setTemplateVariants: (variants: TemplateDrawerVariant[]) => void;
  setTemplateSelected: (id: string) => void;
  setTemplateGenerating: (generating: boolean) => void;
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

  const updatePending = useCallback((id: string, text: string) => {
    dispatch({ type: "update_pending", id, text });
  }, []);

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
      opts: { emailId?: string; isNew?: boolean; draft: EmailDraft | null }
    ) =>
      dispatch({
        type: "open_email_editor",
        nodeId,
        emailId: opts.emailId,
        isNew: opts.isNew,
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
      closeTemplateDrawer,
      setTemplateChannel,
      setTemplateIntent,
      setTemplateVariants,
      setTemplateSelected,
      setTemplateGenerating,
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
      closeTemplateDrawer,
      setTemplateChannel,
      setTemplateIntent,
      setTemplateVariants,
      setTemplateSelected,
      setTemplateGenerating,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
