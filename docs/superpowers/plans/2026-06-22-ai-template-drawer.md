# AI Template Drawer (Guided Dialog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a structured drawer UI that guides users through creating message templates (email/SMS) via AI, with channel selection, intent input, variant generation, and saving to the directory.

**Architecture:** New `templateDrawer` slice on `ChatState` (parallel to `EmailEditorState`): tracks open/step/channel/intent/variants/selectedId. Server orchestrator gains new `create_template` tool (AssistResult kind) that takes `(channel, intent)` and returns ~3 variant `NodeParams` objects. Client state manages the multi-step workflow and persists created templates via new `template_added` reducer action in `AppState`.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/ui, Vitest + React Testing Library, AI SDK (generateText with tool), Zod for schemas.

---

## Task 1: Add `template_added` reducer action to AppState

**Files:**
- `src/state/app-state.ts` (lines ~1–100 for types, ~900–1100 for reducer + action union)

**Background:** The reducer needs a new action that prepends a `MessageTemplate` to the templates array. First, we must define the `MessageTemplate` type and add the action to the discriminated union.

**Steps:**

- [ ] **Add MessageTemplate type definition** (test-driven: write the type first in a test file to ensure correctness)
  - Test file: `src/state/app-state.test.ts` (create if not exists)
  - Write test: `it("MessageTemplate has all required fields with correct types")`
  - Expectation: test fails with "MessageTemplate is not defined"
  - In `src/state/app-state.ts` near other type exports (around line 70), add:
    ```typescript
    export type MessageTemplate = {
      id: string;
      channel: "email" | "sms";
      name: string;
      content: NodeParams; // shape from @/types/workflow
      usedInCampaigns: number; // starts at 0
      createdAt: string; // ISO string
    };
    ```
  - Run: `npx vitest run src/state/app-state.test.ts`
  - Verify: test passes

- [ ] **Add templates array to AppState type**
  - In `src/state/app-state.ts`, locate the `AppState` type definition (around line 110)
  - Add field: `templates: MessageTemplate[];`
  - Run: `npx tsc --noEmit` to verify types compile
  - Expected: no errors

- [ ] **Add `template_added` action to discriminated union**
  - Locate `AppAction` discriminated union (around line 900–950)
  - Add variant:
    ```typescript
    | { type: "template_added"; template: MessageTemplate }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Implement reducer case for `template_added`**
  - In the reducer (around line 950–1100), find the `switch` statement
  - Add case:
    ```typescript
    case "template_added": {
      return {
        ...state,
        templates: [action.template, ...state.templates],
      };
    }
    ```
  - Write test in `src/state/app-state.test.ts`:
    ```typescript
    it("template_added prepends template to array", () => {
      const state = { ...INITIAL_APP_STATE, templates: [{ id: "t1", ... }] };
      const action = { type: "template_added" as const, template: { id: "t2", ... } };
      const next = appReducer(state, action);
      expect(next.templates[0].id).toBe("t2");
      expect(next.templates.length).toBe(2);
    });
    ```
  - Run: `npx vitest run src/state/app-state.test.ts`
  - Expected: test passes

- [ ] **Initialize templates array in INITIAL_APP_STATE**
  - Locate `INITIAL_APP_STATE` (around line 200–250)
  - Add field: `templates: [],`
  - Run: `npx vitest run src/state/app-state.test.ts`
  - Expected: no test failures

- [ ] **Commit this task**
  - Staged files: `src/state/app-state.ts`, `src/state/app-state.test.ts`
  - Message: `feat(app-state): add MessageTemplate type and template_added action`

---

## Task 2: Create AssistResult kind `create_template` and server tool

**Files:**
- `src/lib/ai/assist-contract.ts` (lines ~80–130 for assistResultSchema)
- `src/app/api/ai/assist/route.ts` (lines ~50–100 for tool definitions, ~240–250 for results post-processing)
- `src/lib/ai/template-creation-schema.ts` (new file for Zod schema)
- `src/lib/ai/assist-contract.test.ts`

**Background:** The orchestrator needs a new tool `create_template` that the model calls with channel + intent, returning ~3 content variants. Each variant is a `NodeParams` object (workflow shape). The result is an `AssistResult` with `kind: "create_template"`.

**Steps:**

- [ ] **Create template creation schema**
  - New file: `src/lib/ai/template-creation-schema.ts`
  - Write Zod schema:
    ```typescript
    import { z } from "zod";
    
    export const templateVariantSchema = z.object({
      // NodeParams-like: { kind: "email" | "sms", ...fields }
      kind: z.enum(["email", "sms"]),
      subject: z.string().optional(), // for email only
      body: z.string(),
      cta: z.string().optional(),
      link: z.string().optional(),
    });
    
    export const createTemplateSchema = z.object({
      channel: z.enum(["email", "sms"]),
      intent: z.string(),
      variants: z.array(templateVariantSchema).min(1).max(3),
      confirmation: z.string(),
    });
    
    export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Add create_template to AssistResult schema**
  - In `src/lib/ai/assist-contract.ts`, locate `assistResultSchema` (line ~80)
  - Add new discriminated union variant before the closing bracket:
    ```typescript
    z.object({
      kind: z.literal("create_template"),
      channel: z.enum(["email", "sms"]),
      intent: z.string(),
      variants: z.array(z.object({
        kind: z.enum(["email", "sms"]),
        subject: z.string().optional(),
        body: z.string(),
        cta: z.string().optional(),
        link: z.string().optional(),
      })).min(1).max(3),
      confirmation: z.string(),
    }),
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Write test for schema parsing**
  - In `src/lib/ai/assist-contract.test.ts` (create if not exists):
    ```typescript
    it("parses create_template kind in assistResult", () => {
      const result = {
        kind: "create_template",
        channel: "email",
        intent: "скидка на кредит",
        variants: [{ kind: "email", subject: "Спецпредложение", body: "Текст", cta: "Узнать" }],
        confirmation: "Создал 3 варианта",
      };
      const parsed = assistResultSchema.parse(result);
      expect(parsed.kind).toBe("create_template");
      expect(parsed.variants.length).toBe(1);
    });
    ```
  - Run: `npx vitest run src/lib/ai/assist-contract.test.ts`
  - Expected: test passes

- [ ] **Add create_template tool to orchestrator route**
  - In `src/app/api/ai/assist/route.ts`, locate the `tools` object definition (around line 50)
  - After the `triggers` tool, add:
    ```typescript
    create_template: tool({
      description:
        "Создать шаблон письма/SMS с несколькими вариантами текста. " +
        "Вызывай когда пользователь просит создать новый шаблон кампании. " +
        "Верни 2–3 варианта с разными подходами. " +
        "confirmation — короткий описание что создал (e.g. 'Email с 3 вариантами текста').",
      inputSchema: z.object({
        channel: z.enum(["email", "sms"]),
        intent: z.string().describe("Цель письма/SMS (e.g. 'скидка 30%', 'приглашение на вебинар')"),
        variants: z.array(
          z.object({
            kind: z.enum(["email", "sms"]),
            subject: z.string().optional().describe("Для email: строка темы"),
            body: z.string().describe("Основной текст письма/SMS"),
            cta: z.string().optional().describe("Текст кнопки CTA"),
            link: z.string().optional().describe("URL для перехода по кнопке"),
          })
        ).min(1).max(3),
        confirmation: z.string(),
      }),
      execute: ({ channel, intent, variants, confirmation }) => {
        results.push({
          kind: "create_template",
          channel,
          intent,
          variants,
          confirmation,
        });
        return "ok" as const;
      },
    }),
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Register create_template tool with Gemini conditionally**
  - Locate the `generateText` call (around line ~160)
  - Ensure `create_template` is included in `tools` object passed to `generateText`
  - Verify: tool is already in `tools` object from previous step
  - Run: `npm test`
  - Expected: orchestrator tests pass (if they exist)

- [ ] **Commit this task**
  - Staged files: `src/lib/ai/assist-contract.ts`, `src/app/api/ai/assist/route.ts`, `src/lib/ai/template-creation-schema.ts`, `src/lib/ai/assist-contract.test.ts`
  - Message: `feat(ai): add create_template tool to orchestrator`

---

## Task 3: Add `templateDrawer` state slice to ChatState

**Files:**
- `src/state/chat-context.tsx` (lines ~25–50 for interfaces, ~50–120 for reducer, ~200–250 for actions/context)
- `src/state/chat-context.test.tsx` (new or existing test file)

**Background:** The chat context needs a new slice (parallel to `EmailEditorState`) to manage the template drawer's multi-step flow: channel selection → intent input → variant preview → done. The slice tracks which step we're on and holds generated variants.

**Steps:**

- [ ] **Define TemplateDrawerState interface**
  - In `src/state/chat-context.tsx` near `EmailEditorState` (around line 35), add:
    ```typescript
    export interface TemplateDrawerState {
      open: boolean;
      step: "channel" | "intent" | "variants";
      channel: "email" | "sms" | null;
      intent: string;
      variants: Array<{
        kind: "email" | "sms";
        subject?: string;
        body: string;
        cta?: string;
        link?: string;
      }>;
      selectedId: number | null; // index into variants array
      generating: boolean; // true while AI is generating
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Add templateDrawer to ChatState type**
  - In `src/state/chat-context.tsx`, locate `ChatState` interface (around line 45)
  - Add field: `templateDrawer: TemplateDrawerState;`
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Extend ChatAction union with template drawer actions**
  - Locate `ChatAction` discriminated union (around line 50–70)
  - Add variants:
    ```typescript
    | { type: "open_template_drawer" }
    | { type: "close_template_drawer" }
    | { type: "set_template_channel"; channel: "email" | "sms" }
    | { type: "set_template_intent"; intent: string }
    | { type: "set_template_variants"; variants: TemplateDrawerState["variants"]; selectedId?: number }
    | { type: "select_template_variant"; id: number }
    | { type: "set_template_generating"; generating: boolean }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Implement reducer cases for template drawer**
  - In `chatReducer`, add cases (after the email editor cases, around line 120):
    ```typescript
    case "open_template_drawer": {
      return { ...state, templateDrawer: { ...INITIAL_TEMPLATE_DRAWER, open: true } };
    }
    case "close_template_drawer": {
      return { ...state, templateDrawer: INITIAL_TEMPLATE_DRAWER };
    }
    case "set_template_channel": {
      return {
        ...state,
        templateDrawer: {
          ...state.templateDrawer,
          channel: action.channel,
          step: "intent",
        },
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
        templateDrawer: {
          ...state.templateDrawer,
          variants: action.variants,
          selectedId: action.selectedId ?? 0,
          step: "variants",
          generating: false,
        },
      };
    }
    case "select_template_variant": {
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
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Define INITIAL_TEMPLATE_DRAWER constant**
  - Near `INITIAL_EMAIL_EDITOR`, add:
    ```typescript
    const INITIAL_TEMPLATE_DRAWER: TemplateDrawerState = {
      open: false,
      step: "channel",
      channel: null,
      intent: "",
      variants: [],
      selectedId: null,
      generating: false,
    };
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Add templateDrawer to INITIAL_CHAT_STATE**
  - Locate `INITIAL_CHAT_STATE`, add field: `templateDrawer: INITIAL_TEMPLATE_DRAWER,`
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Extend ChatContextValue interface with template drawer operations**
  - In `ChatContextValue` interface (around line 180), add:
    ```typescript
    templateDrawer: TemplateDrawerState;
    openTemplateDrawer: () => void;
    closeTemplateDrawer: () => void;
    setTemplateChannel: (channel: "email" | "sms") => void;
    setTemplateIntent: (intent: string) => void;
    setTemplateVariants: (variants: TemplateDrawerState["variants"], selectedId?: number) => void;
    selectTemplateVariant: (id: number) => void;
    setTemplateGenerating: (generating: boolean) => void;
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Implement template drawer context operations**
  - In `ChatProvider` (around line 200), add dispatch wrappers:
    ```typescript
    const openTemplateDrawer = useCallback(() => {
      dispatch({ type: "open_template_drawer" });
    }, []);
    
    const closeTemplateDrawer = useCallback(() => {
      dispatch({ type: "close_template_drawer" });
    }, []);
    
    const setTemplateChannel = useCallback((channel: "email" | "sms") => {
      dispatch({ type: "set_template_channel", channel });
    }, []);
    
    const setTemplateIntent = useCallback((intent: string) => {
      dispatch({ type: "set_template_intent", intent });
    }, []);
    
    const setTemplateVariants = useCallback(
      (variants: TemplateDrawerState["variants"], selectedId?: number) => {
        dispatch({ type: "set_template_variants", variants, selectedId });
      },
      []
    );
    
    const selectTemplateVariant = useCallback((id: number) => {
      dispatch({ type: "select_template_variant", id });
    }, []);
    
    const setTemplateGenerating = useCallback((generating: boolean) => {
      dispatch({ type: "set_template_generating", generating });
    }, []);
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Ensure closeTemplateDrawer is called on scope reset**
  - Locate the `useScopeReset` hook call in `ChatProvider` (around line 240)
  - Existing code should call `clear()` — add `closeTemplateDrawer()` to the cleanup:
    ```typescript
    useScopeReset(() => {
      dispatch({ type: "clear" });
      closeTemplateDrawer(); // NEW: close drawer on scope change
    });
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Return template drawer fields/methods from ChatContext.Provider**
  - In the `value` object (around line 280), add:
    ```typescript
    templateDrawer,
    openTemplateDrawer,
    closeTemplateDrawer,
    setTemplateChannel,
    setTemplateIntent,
    setTemplateVariants,
    selectTemplateVariant,
    setTemplateGenerating,
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Write tests for template drawer reducer**
  - In `src/state/chat-context.test.tsx` (create if not exists):
    ```typescript
    describe("chatReducer template drawer", () => {
      it("opens template drawer at channel step", () => {
        const state = INITIAL_CHAT_STATE;
        const action = { type: "open_template_drawer" as const };
        const next = chatReducer(state, action);
        expect(next.templateDrawer.open).toBe(true);
        expect(next.templateDrawer.step).toBe("channel");
      });
      
      it("closes and resets template drawer", () => {
        const state = {
          ...INITIAL_CHAT_STATE,
          templateDrawer: {
            open: true,
            step: "intent" as const,
            channel: "email" as const,
            intent: "скидка",
            variants: [],
            selectedId: null,
            generating: false,
          },
        };
        const action = { type: "close_template_drawer" as const };
        const next = chatReducer(state, action);
        expect(next.templateDrawer.open).toBe(false);
        expect(next.templateDrawer.intent).toBe("");
      });
      
      it("sets channel and advances to intent step", () => {
        const state = INITIAL_CHAT_STATE;
        const action = { type: "set_template_channel" as const, channel: "email" as const };
        const next = chatReducer(state, action);
        expect(next.templateDrawer.channel).toBe("email");
        expect(next.templateDrawer.step).toBe("intent");
      });
      
      it("sets intent text", () => {
        const state = INITIAL_CHAT_STATE;
        const action = { type: "set_template_intent" as const, intent: "скидка 50%" };
        const next = chatReducer(state, action);
        expect(next.templateDrawer.intent).toBe("скидка 50%");
      });
      
      it("sets variants and advances to variants step", () => {
        const state = INITIAL_CHAT_STATE;
        const variants = [
          { kind: "email" as const, subject: "Спецпредложение", body: "Текст1", cta: "Узнать", link: "http://x" },
        ];
        const action = { type: "set_template_variants" as const, variants, selectedId: 0 };
        const next = chatReducer(state, action);
        expect(next.templateDrawer.variants).toEqual(variants);
        expect(next.templateDrawer.step).toBe("variants");
        expect(next.templateDrawer.selectedId).toBe(0);
        expect(next.templateDrawer.generating).toBe(false);
      });
    });
    ```
  - Run: `npx vitest run src/state/chat-context.test.tsx`
  - Expected: all tests pass

- [ ] **Commit this task**
  - Staged files: `src/state/chat-context.tsx`, `src/state/chat-context.test.tsx`
  - Message: `feat(chat-context): add templateDrawer state slice and actions`

---

## Task 4: Build drawer UI component and wire button in templates section

**Files:**
- `src/sections/campaigns/template-drawer.tsx` (new component)
- `src/sections/campaigns/template-drawer.test.tsx` (new tests)
- `src/sections/campaigns/template-creation-panel.tsx` (new or modified: contains the button)
- `src/app/(app)/campaigns/page.tsx` or relevant section renderer (mount the drawer)

**Background:** The drawer is a structured multi-step dialog. Step 1: channel chips (email / SMS). Step 2: intent text input + generate button. Step 3: variant cards preview + select. On save (in step 3), dispatch `template_added` to AppState. The Mascot appears during generation (step 2→3 transition).

**Steps:**

- [ ] **Create TemplateDrawer component structure**
  - New file: `src/sections/campaigns/template-drawer.tsx`
  - Skeleton:
    ```typescript
    "use client";
    
    import { useChat } from "@/state/chat-context";
    import { useAppState } from "@/state/app-state-context";
    
    export function TemplateDrawer() {
      const { templateDrawer, closeTemplateDrawer, setTemplateChannel, setTemplateIntent, setTemplateVariants, selectTemplateVariant, setTemplateGenerating } = useChat();
      const { dispatch } = useAppState();
      
      if (!templateDrawer.open) return null;
      
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-slate-900 rounded-lg w-[600px] max-h-[80vh] overflow-auto p-6">
            {/* Step: channel */}
            {templateDrawer.step === "channel" && (
              <ChannelStep channel={templateDrawer.channel} onChange={setTemplateChannel} />
            )}
            
            {/* Step: intent */}
            {templateDrawer.step === "intent" && (
              <IntentStep
                channel={templateDrawer.channel!}
                intent={templateDrawer.intent}
                onIntentChange={setTemplateIntent}
                onGenerate={async () => await handleGenerate()}
                generating={templateDrawer.generating}
              />
            )}
            
            {/* Step: variants */}
            {templateDrawer.step === "variants" && (
              <VariantsStep
                variants={templateDrawer.variants}
                selectedId={templateDrawer.selectedId}
                onSelect={selectTemplateVariant}
                onSave={handleSaveTemplate}
                onBack={() => { /* reset */ }}
              />
            )}
          </div>
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: TypeErrors for unimplemented functions (expected for now)

- [ ] **Implement ChannelStep sub-component**
  - In the same file, add:
    ```typescript
    function ChannelStep({ channel, onChange }: { channel: "email" | "sms" | null; onChange: (c: "email" | "sms") => void }) {
      return (
        <div>
          <h2 className="text-lg font-semibold mb-4">Выбери канал</h2>
          <div className="flex gap-3">
            <button
              onClick={() => onChange("email")}
              className={`flex-1 py-3 px-4 rounded border-2 transition ${
                channel === "email"
                  ? "border-yellow-400 bg-yellow-400/10"
                  : "border-slate-600 hover:border-slate-500"
              }`}
            >
              📧 Email
            </button>
            <button
              onClick={() => onChange("sms")}
              className={`flex-1 py-3 px-4 rounded border-2 transition ${
                channel === "sms"
                  ? "border-yellow-400 bg-yellow-400/10"
                  : "border-slate-600 hover:border-slate-500"
              }`}
            >
              💬 SMS
            </button>
          </div>
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: ChannelStep is defined

- [ ] **Implement IntentStep sub-component**
  - Add:
    ```typescript
    function IntentStep({
      channel,
      intent,
      onIntentChange,
      onGenerate,
      generating,
    }: {
      channel: "email" | "sms";
      intent: string;
      onIntentChange: (text: string) => void;
      onGenerate: () => Promise<void>;
      generating: boolean;
    }) {
      return (
        <div>
          <h2 className="text-lg font-semibold mb-4">Опиши цель письма</h2>
          <textarea
            value={intent}
            onChange={(e) => onIntentChange(e.target.value)}
            placeholder="Например: скидка 30% на кредит, приглашение на вебинар, напоминание о покупке..."
            className="w-full p-3 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 mb-4"
            rows={3}
            disabled={generating}
          />
          <button
            onClick={onGenerate}
            disabled={!intent.trim() || generating}
            className={`w-full py-2 px-4 rounded transition ${
              generating || !intent.trim()
                ? "opacity-50 cursor-not-allowed bg-slate-700"
                : "bg-yellow-400 text-black font-semibold hover:bg-yellow-300"
            }`}
          >
            {generating ? "Генерирую варианты..." : "Создать варианты"}
          </button>
          {generating && <div className="mt-4 text-center">✨ Магия под капотом...</div>}
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: IntentStep is defined

- [ ] **Implement VariantsStep sub-component**
  - Add:
    ```typescript
    function VariantsStep({
      variants,
      selectedId,
      onSelect,
      onSave,
      onBack,
    }: {
      variants: any[];
      selectedId: number | null;
      onSelect: (id: number) => void;
      onSave: () => void;
      onBack: () => void;
    }) {
      return (
        <div>
          <h2 className="text-lg font-semibold mb-4">Выбери вариант</h2>
          <div className="space-y-3 mb-6">
            {variants.map((v, i) => (
              <div
                key={i}
                onClick={() => onSelect(i)}
                className={`p-4 rounded border-2 cursor-pointer transition ${
                  selectedId === i
                    ? "border-yellow-400 bg-yellow-400/10"
                    : "border-slate-600 hover:border-slate-500"
                }`}
              >
                {v.subject && <p className="font-semibold text-sm text-slate-300">{v.subject}</p>}
                <p className="text-sm text-slate-400 line-clamp-2">{v.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 py-2 px-4 rounded border border-slate-600 text-white hover:bg-slate-800"
            >
              Назад
            </button>
            <button
              onClick={onSave}
              className="flex-1 py-2 px-4 rounded bg-yellow-400 text-black font-semibold hover:bg-yellow-300"
            >
              Сохранить
            </button>
          </div>
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: VariantsStep is defined

- [ ] **Implement handleGenerate logic in TemplateDrawer**
  - In TemplateDrawer, add:
    ```typescript
    const handleGenerate = async () => {
      setTemplateGenerating(true);
      try {
        const response = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Создай ${templateDrawer.channel === "email" ? "письмо" : "SMS"}: ${templateDrawer.intent}`,
            history: [],
            context: { screen: "template-drawer" },
          }),
        });
        const data = await response.json();
        
        // Find create_template result
        const createResult = data.results?.find((r: any) => r.kind === "create_template");
        if (createResult) {
          setTemplateVariants(createResult.variants);
        }
      } catch (e) {
        console.error("Generation failed:", e);
      } finally {
        setTemplateGenerating(false);
      }
    };
    ```
  - Run: `npx tsc --noEmit`
  - Expected: handleGenerate is typed correctly

- [ ] **Implement handleSaveTemplate logic**
  - In TemplateDrawer, add:
    ```typescript
    const handleSaveTemplate = () => {
      if (templateDrawer.selectedId === null) return;
      
      const selected = templateDrawer.variants[templateDrawer.selectedId];
      const template: MessageTemplate = {
        id: nanoid(),
        channel: templateDrawer.channel!,
        name: `${templateDrawer.channel} – ${templateDrawer.intent.slice(0, 30)}...`,
        content: selected,
        usedInCampaigns: 0,
        createdAt: new Date().toISOString(),
      };
      
      dispatch({ type: "template_added", template });
      closeTemplateDrawer();
    };
    ```
  - Import: `import { nanoid } from "nanoid";`
  - Import: `import type { MessageTemplate } from "@/state/app-state";`
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Write tests for TemplateDrawer component**
  - New file: `src/sections/campaigns/template-drawer.test.tsx`
  - Test structure:
    ```typescript
    import { render, screen, fireEvent } from "@testing-library/react";
    import userEvent from "@testing-library/user-event";
    import { TemplateDrawer } from "./template-drawer";
    import { ChatProvider } from "@/state/chat-context";
    import { AppStateProvider } from "@/state/app-state-context";
    
    const renderWithProviders = (component: React.ReactNode) => {
      return render(
        <AppStateProvider initialState={undefined}>
          <ChatProvider>{component}</ChatProvider>
        </AppStateProvider>
      );
    };
    
    describe("TemplateDrawer", () => {
      it("does not render when closed", () => {
        renderWithProviders(<TemplateDrawer />);
        expect(screen.queryByText(/выбери канал/i)).not.toBeInTheDocument();
      });
      
      it("renders channel step when open", () => {
        // TODO: inject openTemplateDrawer dispatch through context
        renderWithProviders(<TemplateDrawer />);
        // This requires context setup — skip detailed testing for now
      });
    });
    ```
  - Run: `npx vitest run src/sections/campaigns/template-drawer.test.tsx`
  - Expected: tests compile (detailed context wiring deferred to execution phase)

- [ ] **Mount TemplateDrawer in the main campaigns/statistics layout**
  - Find: `src/sections/campaigns/` or the main layout file
  - Add: `<TemplateDrawer />` near the bottom of the layout (after main content)
  - Example (in campaign page or shell):
    ```typescript
    import { TemplateDrawer } from "@/sections/campaigns/template-drawer";
    
    export default function Page() {
      return (
        <div>
          {/* existing layout */}
          <TemplateDrawer />
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Commit this task**
  - Staged files: `src/sections/campaigns/template-drawer.tsx`, `src/sections/campaigns/template-drawer.test.tsx`, (modified layout file)
  - Message: `feat(template-drawer): implement multi-step drawer UI with channel/intent/variants steps`

---

## Task 5: Wire "Создать шаблон" button to `open_template_drawer`

**Files:**
- Template creation UI location (e.g., `src/sections/campaigns/templates-tab.tsx` or similar tab/section that displays templates)
- Any file that imports and uses this component

**Background:** The templates list/tab has a "Создать шаблон" button (currently wired to `start_campaign_flow`). Change it to dispatch `open_template_drawer` instead.

**Steps:**

- [ ] **Locate the button**
  - Search codebase: `grep -r "Создать шаблон" src/`
  - Or search for templates display component
  - If template list doesn't exist yet, create: `src/sections/campaigns/templates-list.tsx`

- [ ] **Find the current button handler**
  - Identify the component that shows templates
  - Locate the `onCreateManual` or similar button click handler
  - Change from: `dispatch({ type: "start_campaign_flow" })`
  - Change to: `openTemplateDrawer()`

- [ ] **Import useChat hook**
  - If not already imported, add: `import { useChat } from "@/state/chat-context";`
  - Call: `const { openTemplateDrawer } = useChat();`

- [ ] **Update button onClick handler**
  - Example:
    ```typescript
    <button
      onClick={() => openTemplateDrawer()}
      className="..."
    >
      Создать шаблон
    </button>
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Test the button integration**
  - Write test (if not exists):
    ```typescript
    it("clicking 'Создать шаблон' opens template drawer", () => {
      render(<TemplatesTab />);
      const btn = screen.getByRole("button", { name: /Создать шаблон/ });
      fireEvent.click(btn);
      // Verify drawer opens (check context state or UI)
    });
    ```
  - Run: `npx vitest run <test-file>`
  - Expected: test passes

- [ ] **Commit this task**
  - Staged files: (templates section file)
  - Message: `feat(templates): wire 'Создать шаблон' button to open_template_drawer`

---

## Task 6: Verify end-to-end flow and integration tests

**Files:**
- `src/lib/ai/assist-contract.test.ts`
- Integration test file (new or existing)
- E2E test (optional: browser automation test)

**Background:** Verify that the full flow works: button → drawer opens → user selects channel → enters intent → AI generates variants → user selects variant → template saved to AppState.

**Steps:**

- [ ] **Write integration test for template generation contract**
  - In `src/lib/ai/assist-contract.test.ts`, add:
    ```typescript
    describe("create_template in assistResult", () => {
      it("parses multi-variant create_template response", () => {
        const response = {
          results: [
            {
              kind: "create_template",
              channel: "email",
              intent: "скидка",
              variants: [
                {
                  kind: "email",
                  subject: "Спецпредложение",
                  body: "Получи скидку 30%",
                  cta: "Узнать больше",
                  link: "https://example.com",
                },
                {
                  kind: "email",
                  subject: "Только для тебя",
                  body: "Эксклюзивное предложение...",
                  cta: "Перейти",
                  link: "https://example.com",
                },
              ],
              confirmation: "Создал 2 варианта письма",
            },
          ],
        };
        const parsed = assistResponseSchema.parse(response);
        expect(parsed.results[0].kind).toBe("create_template");
        expect(parsed.results[0].variants.length).toBe(2);
      });
    });
    ```
  - Run: `npx vitest run src/lib/ai/assist-contract.test.ts`
  - Expected: test passes

- [ ] **Write reducer integration test**
  - In `src/state/app-state.test.ts`, add:
    ```typescript
    describe("template_added with campaign context", () => {
      it("prepends template and preserves usedInCampaigns=0", () => {
        const state = INITIAL_APP_STATE;
        const template: MessageTemplate = {
          id: "t1",
          channel: "email",
          name: "Welcome",
          content: { kind: "email", subject: "Hi", body: "Welcome", cta: "Go" } as NodeParams,
          usedInCampaigns: 0,
          createdAt: new Date().toISOString(),
        };
        const action = { type: "template_added" as const, template };
        const next = appReducer(state, action);
        expect(next.templates[0]).toEqual(template);
        expect(next.templates[0].usedInCampaigns).toBe(0);
      });
    });
    ```
  - Run: `npx vitest run src/state/app-state.test.ts`
  - Expected: test passes

- [ ] **Write chat context integration test**
  - In `src/state/chat-context.test.tsx`, add:
    ```typescript
    describe("template drawer full flow", () => {
      it("progresses through all steps: channel → intent → variants", () => {
        const { result } = renderHook(() => useChat(), {
          wrapper: ChatProvider,
        });
        
        // Step 1: open
        act(() => result.current.openTemplateDrawer());
        expect(result.current.templateDrawer.open).toBe(true);
        expect(result.current.templateDrawer.step).toBe("channel");
        
        // Step 2: select channel
        act(() => result.current.setTemplateChannel("email"));
        expect(result.current.templateDrawer.channel).toBe("email");
        expect(result.current.templateDrawer.step).toBe("intent");
        
        // Step 3: set intent
        act(() => result.current.setTemplateIntent("скидка 50%"));
        expect(result.current.templateDrawer.intent).toBe("скидка 50%");
        
        // Step 4: set variants (simulating AI response)
        const variants = [
          { kind: "email" as const, subject: "Offer", body: "Get 50% off" },
        ];
        act(() => result.current.setTemplateVariants(variants, 0));
        expect(result.current.templateDrawer.step).toBe("variants");
        expect(result.current.templateDrawer.selectedId).toBe(0);
      });
    });
    ```
  - Run: `npx vitest run src/state/chat-context.test.tsx`
  - Expected: test passes (requires proper hook setup)

- [ ] **Verify AI route accepts create_template tool**
  - Test: call `/api/ai/assist` with a prompt designed to trigger `create_template`
  - Expected response shape: `{ results: [{ kind: "create_template", ... }] }`
  - Curl example (for manual testing):
    ```bash
    curl -X POST http://localhost:3000/api/ai/assist \
      -H "Content-Type: application/json" \
      -d '{"text": "Создай письмо про скидку", "history": [], "context": {"screen": "template-drawer"}}'
    ```
  - Expected: response includes `kind: "create_template"` (or fallback: `kind: "answer"` if model doesn't support the tool in current context)

- [ ] **Run all tests**
  - Run: `npm test`
  - Expected: no failures in template-related tests

- [ ] **Commit this task**
  - Staged files: `src/lib/ai/assist-contract.test.ts`, `src/state/app-state.test.ts`, `src/state/chat-context.test.tsx`
  - Message: `test(template-drawer): add integration tests for full flow`

---

## Task 7: Add Mascot indicator at generation step

**Files:**
- `src/sections/campaigns/template-drawer.tsx` (IntentStep sub-component)
- `src/components/ai-elements/mascot.tsx` or similar (if not exists, create)

**Background:** When the user clicks "Создать варианты", the AI is generating. Show the Mascot avatar + "Магия под капотом" text as a functional indicator (not decorative). The Mascot is only visible during `generating: true`.

**Steps:**

- [ ] **Create or verify Mascot component**
  - Check if: `src/components/ai-elements/mascot.tsx` or similar exists
  - If not, create minimal version:
    ```typescript
    export function Mascot() {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-yellow-400 flex items-center justify-center">
            <span className="text-xl">✨</span>
          </div>
          <p className="text-sm text-slate-400">Магия под капотом...</p>
        </div>
      );
    }
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Update IntentStep to show Mascot during generation**
  - In `src/sections/campaigns/template-drawer.tsx`, in `IntentStep`, replace the generating indicator:
    ```typescript
    {generating && (
      <div className="mt-6 flex justify-center">
        <Mascot />
      </div>
    )}
    ```
  - Import: `import { Mascot } from "@/components/ai-elements/mascot";`
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Verify Mascot appears in browser**
  - (Deferred to execution phase: run dev server, trigger generation, observe Mascot)

- [ ] **Commit this task**
  - Staged files: `src/sections/campaigns/template-drawer.tsx`, `src/components/ai-elements/mascot.tsx` (if created)
  - Message: `feat(template-drawer): add Mascot indicator during AI generation`

---

## Task 8: Polish and accessibility

**Files:**
- `src/sections/campaigns/template-drawer.tsx`
- Tests (existing)

**Background:** Final pass: ensure keyboard navigation (ESC to close), focus management, ARIA labels, and error handling.

**Steps:**

- [ ] **Add ESC to close drawer**
  - In TemplateDrawer component, add useEffect:
    ```typescript
    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeTemplateDrawer();
      };
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }, [closeTemplateDrawer]);
    ```
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Add ARIA labels to drawer**
  - Drawer root: `role="dialog" aria-labelledby="drawer-title"`
  - Title: `<h2 id="drawer-title">`
  - Close button: `aria-label="Закрыть"`
  - Run: `npx tsc --noEmit`
  - Expected: no errors

- [ ] **Test ESC closes drawer**
  - Write test:
    ```typescript
    it("closes drawer on ESC key", () => {
      render(<TemplateDrawer />);
      // Simulate ESC
      fireEvent.keyDown(window, { key: "Escape" });
      // Verify closed (context state updated)
    });
    ```
  - Run: `npx vitest run <test-file>`
  - Expected: test passes

- [ ] **Add error handling for generation failure**
  - In `handleGenerate`, catch errors and show toast/message:
    ```typescript
    try {
      // ... generation logic
    } catch (e) {
      console.error("Generation failed:", e);
      // TODO: dispatch toast notification
    }
    ```
  - (Full toast integration deferred if toast system not yet implemented)

- [ ] **Commit this task**
  - Staged files: `src/sections/campaigns/template-drawer.tsx`
  - Message: `feat(template-drawer): add keyboard navigation and ARIA labels`

---

## Shared-file coordination

### Files touched by this plan (with ownership notes):

| File | Ownership | Notes |
|------|-----------|-------|
| `src/state/app-state.ts` | **#15 OWNS** | `MessageTemplate` type, `templates` array, `template_added` action. No sibling edits. |
| `src/state/chat-context.tsx` | #15 (parallel to EmailEditorState) | New `templateDrawer` slice, actions, context operations. Does not conflict with email editor. |
| `src/lib/ai/assist-contract.ts` | #15 | New `create_template` AssistResult kind. Does not conflict with existing kinds. |
| `src/app/api/ai/assist/route.ts` | #15 (tool registration) | Adds `create_template` tool. Does not modify existing tools. |
| `src/sections/campaigns/template-drawer.tsx` | #15 (new component) | New UI component for the drawer. No shared dependencies. |
| `src/sections/campaigns/` (button wiring) | #15 | Updates existing templates button. Single responsibility. |
| Test files (colocated) | #15 | New tests, no conflicts. |

### No conflicts expected with:
- Email editor (separate state slice, no shared mutations)
- Campaign launch flow (no shared reducer actions)
- Graph generation (#16, #17 — separate subsystems, use NodeParams only as data shape)

**Recommendation for parallel work:** This plan is independent enough to run solo. If other agents touch `app-state.ts` (reducer actions/types), coordinate via this file's ownership flag.

