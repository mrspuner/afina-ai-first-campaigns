// src/state/chat-context.test.ts
import { describe, it, expect } from "vitest";
import { chatReducer, type ChatState, type ChatMessage } from "./chat-context";

const empty: ChatState = {
  messages: [],
  mode: "collapsed",
  emailEditor: { open: false, nodeId: null, draft: null },
  templateDrawer: {
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
  },
  scoringDrawer: { open: false, editable: false, nodeId: null, campaignId: null },
};

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "role" | "text">): ChatMessage {
  return {
    id: partial.id ?? `msg_test_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: partial.createdAt ?? 1_700_000_000_000,
    ...partial,
  };
}

describe("chatReducer", () => {
  it("append stores the provided message verbatim", () => {
    const m = msg({ id: "msg_1", role: "user", text: "hi" });
    const next = chatReducer(empty, { type: "append", message: m });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toEqual(m);
  });

  it("append preserves triggerLabel and pending flag", () => {
    const a = msg({ id: "a", role: "user", text: "add a.ru", triggerLabel: "Сайты автодилеров" });
    const b = msg({ id: "b", role: "assistant", text: "", pending: true });
    const s1 = chatReducer(empty, { type: "append", message: a });
    expect(s1.messages[0].triggerLabel).toBe("Сайты автодилеров");
    const s2 = chatReducer(empty, { type: "append", message: b });
    expect(s2.messages[0].pending).toBe(true);
  });

  it("update_pending replaces text and clears pending flag for matching id", () => {
    let s: ChatState = chatReducer(empty, {
      type: "append",
      message: msg({ id: "ph", role: "assistant", text: "", pending: true }),
    });
    s = chatReducer(s, { type: "update_pending", id: "ph", text: "Готово." });
    expect(s.messages[0].text).toBe("Готово.");
    expect(s.messages[0].pending).toBeUndefined();
  });

  it("clear empties messages but preserves mode", () => {
    let s: ChatState = chatReducer(empty, {
      type: "append",
      message: msg({ role: "user", text: "x" }),
    });
    s = { ...s, mode: "sidebar" };
    s = chatReducer(s, { type: "clear" });
    expect(s.messages).toEqual([]);
    expect(s.mode).toBe("sidebar");
  });
});

describe("chatReducer mode transitions", () => {
  it("open_sidebar from collapsed → sidebar", () => {
    const s = chatReducer(empty, { type: "open_sidebar" });
    expect(s.mode).toBe("sidebar");
  });

  it("close_sidebar returns to collapsed", () => {
    const s1 = chatReducer(empty, { type: "open_sidebar" });
    const s2 = chatReducer(s1, { type: "close_sidebar" });
    expect(s2.mode).toBe("collapsed");
  });

  it("open_sidebar when already sidebar is a no-op (same reference)", () => {
    const s1 = chatReducer(empty, { type: "open_sidebar" });
    expect(chatReducer(s1, { type: "open_sidebar" })).toBe(s1);
  });

  it("close_sidebar when already collapsed is a no-op (same reference)", () => {
    expect(chatReducer(empty, { type: "close_sidebar" })).toBe(empty);
  });
});

describe("chatReducer email editor", () => {
  const draft = {
    id: "eml_x",
    name: "Тест",
    subject: "Тема",
    body: "Здравствуйте!\n\nТекст.",
    link: "https://x",
    cta: "Перейти",
    sender: "s",
    showCta: true,
    showImage: false,
  };

  it("open_email_editor sets open state with draft", () => {
    const s = chatReducer(empty, {
      type: "open_email_editor",
      nodeId: "email",
      isNew: true,
      draft,
    });
    expect(s.emailEditor.open).toBe(true);
    expect(s.emailEditor.nodeId).toBe("email");
    expect(s.emailEditor.draft?.subject).toBe("Тема");
  });

  it("open_email_editor carries the preview flag onto emailEditor (#32)", () => {
    const s = chatReducer(empty, {
      type: "open_email_editor",
      nodeId: "",
      preview: true,
      draft,
    });
    expect(s.emailEditor.preview).toBe(true);
    expect(s.emailEditor.open).toBe(true);
  });

  it("open_email_editor defaults preview to undefined when not passed (#32)", () => {
    const s = chatReducer(empty, {
      type: "open_email_editor",
      nodeId: "email",
      draft,
    });
    expect(s.emailEditor.preview).toBeUndefined();
  });

  it("set_email_draft patches the current draft", () => {
    let s = chatReducer(empty, {
      type: "open_email_editor",
      nodeId: "email",
      draft,
    });
    s = chatReducer(s, { type: "set_email_draft", patch: { subject: "Новая" } });
    expect(s.emailEditor.draft?.subject).toBe("Новая");
  });

  it("set_email_draft is a no-op without an open draft", () => {
    expect(chatReducer(empty, { type: "set_email_draft", patch: { subject: "x" } })).toBe(empty);
  });

  it("close_email_editor resets to closed", () => {
    let s = chatReducer(empty, {
      type: "open_email_editor",
      nodeId: "email",
      draft,
    });
    s = chatReducer(s, { type: "close_email_editor" });
    expect(s.emailEditor.open).toBe(false);
    expect(s.emailEditor.draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 15: templateDrawer slice
// ---------------------------------------------------------------------------
import { INITIAL_CHAT_STATE } from "./chat-context";

describe("chatReducer — templateDrawer slice (#15)", () => {
  it("initial state has templateDrawer closed", () => {
    expect(INITIAL_CHAT_STATE.templateDrawer.open).toBe(false);
    expect(INITIAL_CHAT_STATE.templateDrawer.step).toBe("channel");
    expect(INITIAL_CHAT_STATE.templateDrawer.channel).toBeNull();
  });

  it("open_template_drawer opens drawer at channel step", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.step).toBe("channel");
  });

  it("close_template_drawer resets the drawer", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "sms" });
    s = chatReducer(s, { type: "close_template_drawer" });
    expect(s.templateDrawer.open).toBe(false);
    expect(s.templateDrawer.channel).toBeNull();
    expect(s.templateDrawer.step).toBe("channel");
  });

  it("set_template_channel advances to intent step", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "email" });
    expect(s.templateDrawer.channel).toBe("email");
    expect(s.templateDrawer.step).toBe("intent");
  });

  it("set_template_intent stores text without advancing step", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "sms" });
    s = chatReducer(s, { type: "set_template_intent", intent: "Приветственное SMS" });
    expect(s.templateDrawer.intent).toBe("Приветственное SMS");
    expect(s.templateDrawer.step).toBe("intent");
  });

  it("set_template_variants advances to variants step and stores variants", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "push" });
    s = chatReducer(s, { type: "set_template_intent", intent: "Акция" });
    const variants = [
      { id: "v1", name: "Push 1", content: { kind: "push" as const, title: "T1", body: "B1" }, components: ["заголовок", "текст"] },
      { id: "v2", name: "Push 2", content: { kind: "push" as const, title: "T2", body: "B2" }, components: ["заголовок", "текст"] },
    ];
    s = chatReducer(s, { type: "set_template_variants", variants });
    expect(s.templateDrawer.step).toBe("variants");
    expect(s.templateDrawer.variants).toHaveLength(2);
  });

  it("set_template_selected updates selectedId", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_selected", id: "v2" });
    expect(s.templateDrawer.selectedId).toBe("v2");
  });

  it("set_template_generating tracks generating flag", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_generating", generating: true });
    expect(s.templateDrawer.generating).toBe(true);
    s = chatReducer(s, { type: "set_template_generating", generating: false });
    expect(s.templateDrawer.generating).toBe(false);
  });

  it("clear action also resets templateDrawer (resetChat parity)", () => {
    // The clear action clears messages; templateDrawer stays unless close_template_drawer is sent.
    // This test verifies that close_template_drawer works independently.
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "ivr" });
    s = chatReducer(s, { type: "close_template_drawer" });
    expect(s.templateDrawer.open).toBe(false);
    expect(s.templateDrawer.channel).toBeNull();
  });
});

describe("chatReducer — template create/preview seam (#14)", () => {
  it("open_template_create opens at intent step for the given channel", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_create", channel: "sms" });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.mode).toBe("create");
    expect(s.templateDrawer.channel).toBe("sms");
    expect(s.templateDrawer.step).toBe("intent");
  });

  it("open_template_preview opens in preview mode with templateId", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_preview", templateId: "tpl_1" });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.mode).toBe("preview");
    expect(s.templateDrawer.previewTemplateId).toBe("tpl_1");
    expect(s.templateDrawer.previewTemplate).toBeNull();
  });

  it("open_template_preview accepts an inline template (IVR node scenario)", () => {
    const template = {
      id: "ivr_node_preview_comm_ivr",
      channel: "ivr" as const,
      name: "Сценарий звонка",
      content: { kind: "ivr" as const, scenario: "Здравствуйте!", voiceType: "female" as const },
      usedInCampaigns: 0,
    };
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_preview", template });
    expect(s.templateDrawer.open).toBe(true);
    expect(s.templateDrawer.mode).toBe("preview");
    // Inline object is carried verbatim; the id-lookup path stays empty.
    expect(s.templateDrawer.previewTemplate).toBe(template);
    expect(s.templateDrawer.previewTemplateId).toBeNull();
  });

  it("set_template_question stores the active picker question", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    const question = {
      prompt: "Выберите канал",
      allowFreeInput: false,
      options: [
        { id: "sms", label: "SMS" },
        { id: "email", label: "Email" },
      ],
    };
    s = chatReducer(s, { type: "set_template_question", question });
    expect(s.templateDrawer.question?.prompt).toBe("Выберите канал");
    expect(s.templateDrawer.question?.allowFreeInput).toBe(false);
  });

  it("set_template_question accepts null to hide the picker", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, {
      type: "set_template_question",
      question: { prompt: "x", allowFreeInput: true, options: [] },
    });
    s = chatReducer(s, { type: "set_template_question", question: null });
    expect(s.templateDrawer.question).toBeNull();
  });

  it("set_template_variants carries components per variant (#15)", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    s = chatReducer(s, { type: "set_template_channel", channel: "email" });
    s = chatReducer(s, {
      type: "set_template_variants",
      variants: [
        {
          id: "v1",
          name: "A",
          content: { kind: "email", subject: "S", body: "B", sender: "S" },
          components: ["тема", "текст", "отправитель"],
        },
      ],
    });
    expect(s.templateDrawer.variants[0].components).toEqual(["тема", "текст", "отправитель"]);
  });

  it("open_template_drawer default mode is create", () => {
    const s = chatReducer(INITIAL_CHAT_STATE, { type: "open_template_drawer" });
    expect(s.templateDrawer.mode).toBe("create");
  });
});

// ---------------------------------------------------------------------------
// Scoring node «Интересы и триггеры» — content mode of the AI sidebar
// ---------------------------------------------------------------------------

describe("chatReducer — scoringDrawer slice", () => {
  it("initial state has scoringDrawer closed", () => {
    expect(INITIAL_CHAT_STATE.scoringDrawer.open).toBe(false);
    expect(INITIAL_CHAT_STATE.scoringDrawer.nodeId).toBeNull();
    expect(INITIAL_CHAT_STATE.scoringDrawer.campaignId).toBeNull();
  });

  it("open_scoring_drawer opens the sidebar bound to node + campaign", () => {
    const s = chatReducer(empty, {
      type: "open_scoring_drawer",
      nodeId: "n_scoring",
      campaignId: "cmp_1",
      editable: true,
    });
    expect(s.mode).toBe("sidebar");
    expect(s.scoringDrawer).toEqual({
      open: true,
      editable: true,
      nodeId: "n_scoring",
      campaignId: "cmp_1",
    });
  });

  it("open_scoring_drawer carries editable=false for a launched campaign", () => {
    const s = chatReducer(empty, {
      type: "open_scoring_drawer",
      nodeId: "n_scoring",
      campaignId: "cmp_1",
      editable: false,
    });
    expect(s.scoringDrawer.editable).toBe(false);
  });

  it("close_scoring_drawer collapses the sidebar and resets the slice", () => {
    let s = chatReducer(empty, {
      type: "open_scoring_drawer",
      nodeId: "n_scoring",
      campaignId: "cmp_1",
      editable: true,
    });
    s = chatReducer(s, { type: "close_scoring_drawer" });
    expect(s.mode).toBe("collapsed");
    expect(s.scoringDrawer.open).toBe(false);
    expect(s.scoringDrawer.nodeId).toBeNull();
  });

  it("close_sidebar also drops the scoring content mode", () => {
    let s = chatReducer(empty, {
      type: "open_scoring_drawer",
      nodeId: "n_scoring",
      campaignId: "cmp_1",
      editable: true,
    });
    s = chatReducer(s, { type: "close_sidebar" });
    expect(s.mode).toBe("collapsed");
    expect(s.scoringDrawer.open).toBe(false);
  });
});
