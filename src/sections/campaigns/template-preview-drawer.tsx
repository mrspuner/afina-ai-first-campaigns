"use client";

import { X, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useChat } from "@/state/chat-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useReserveRightRail } from "@/state/right-rail";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import type { MessageTemplate } from "@/state/app-state";
import type { EmailParams, NodeParams } from "@/types/workflow";
import type { EmailDraft } from "@/state/email-directory";
import { EmailRenderer } from "./email-renderer";
import { EditableText } from "./editable-text";
import { SmsRenderer } from "./sms-renderer";
import { PushRenderer } from "./push-renderer";
import { IvrRenderer } from "./ivr-renderer";

const PREVIEW_WIDTH_PX = 560;

/**
 * #32-mapping: разворачивает плоские EmailParams в EmailDraft, который рисует
 * EmailRenderer. Тема письма показана отдельным полем над письмом, поэтому в
 * самом письме заголовок-тему скрываем (hideSubject).
 */
function emailParamsToDraft(content: EmailParams): EmailDraft {
  const hasLink = Boolean(content.link);
  return {
    id: content.emailId ?? "preview",
    name: content.subject || "Письмо",
    subject: content.subject,
    body: content.body,
    sender: content.sender,
    link: content.link ?? "",
    cta: "Перейти",
    showCta: hasLink,
    showImage: false,
  };
}

/** Правки письма приходят как Partial<EmailDraft>; в content шаблона пишем
 *  только релевантные поля EmailParams (cta/showCta/showImage — не хранятся). */
function emailDraftPatchToParams(patch: Partial<EmailDraft>): Partial<EmailParams> {
  const out: Partial<EmailParams> = {};
  if (patch.subject !== undefined) out.subject = patch.subject;
  if (patch.body !== undefined) out.body = patch.body;
  if (patch.sender !== undefined) out.sender = patch.sender;
  if (patch.link !== undefined) out.link = patch.link;
  return out;
}

/** Инпут правки на тёмном фоне дровера. */
const DARK_INPUT =
  "rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-white/40";

/**
 * Чистое тело предпросмотра шаблона — маршрутизация по каналу (по `content.kind`):
 *  - email → поле «Тема письма» над письмом + стилизованное письмо (без темы внутри);
 *  - sms / push → стилизованное «как настоящее» сообщение;
 *  - ivr → панель «сценарий звонка» (всегда только просмотр).
 * При `readOnly=false` поля правятся инлайн, правка → onChange(patch).
 * Без провайдеров — тестируется в изоляции.
 */
export function TemplatePreviewBody({
  content,
  readOnly,
  onChange,
}: {
  content: NodeParams;
  readOnly: boolean;
  onChange: (patch: Partial<NodeParams>) => void;
}) {
  switch (content.kind) {
    case "email":
      return (
        <div className="flex flex-col gap-4">
          {/* Тема письма — отдельным полем над письмом (#) */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
              Тема письма
            </span>
            <EditableText
              value={content.subject}
              readOnly={readOnly}
              placeholder="Тема письма"
              onCommit={(v) => onChange({ subject: v })}
              className="text-sm font-medium text-foreground"
              inputClassName={DARK_INPUT}
            />
          </div>
          <EmailRenderer
            draft={emailParamsToDraft(content)}
            readOnly={readOnly}
            hideSubject
            onChange={(patch) => onChange(emailDraftPatchToParams(patch))}
          />
        </div>
      );
    case "sms":
      return <SmsRenderer params={content} readOnly={readOnly} onChange={onChange} />;
    case "push":
      return <PushRenderer params={content} readOnly={readOnly} onChange={onChange} />;
    case "ivr":
      return <IvrRenderer params={content} />;
    default:
      return null;
  }
}

/**
 * Боковой дровер предпросмотра/редактора выбранного шаблона. Открывается по
 * «глазу» в селекте шаблонов ноды И по карточке шаблона в «Артефактах».
 * Правки стейджатся локально; при изменениях в нижнем баре появляется
 * «Сохранить» (пишет в шаблон через template_content_updated). Использованный
 * шаблон (usedInCampaigns≥1) и IVR — только просмотр.
 */
export function TemplatePreviewDrawer() {
  const { templateDrawer, closeTemplateDrawer } = useChat();
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  const reduceMotion = useReducedMotion();

  const isPreview = templateDrawer.open && templateDrawer.mode === "preview";
  // Инлайновый шаблон (IVR-нода) имеет приоритет над поиском по библиотеке.
  const template = isPreview
    ? templateDrawer.previewTemplate ??
      templates.find((t) => t.id === templateDrawer.previewTemplateId)
    : undefined;
  const open = Boolean(template);

  // Замок редактирования (#3): использованный шаблон (usedInCampaigns≥1) и IVR —
  // только просмотр. Иначе поля правятся, с явным сохранением.
  const used = (template?.usedInCampaigns ?? 0) >= 1;
  const readOnly = used || template?.content.kind === "ivr";

  // Локальный черновик контента: правки копятся здесь и пишутся в шаблон только
  // по «Сохранить». Сбрасывается при открытии/смене шаблона.
  const [draft, setDraft] = useState<NodeParams | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (template) {
      setDraft(template.content);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, isPreview]);

  const content = draft ?? template?.content ?? null;

  function handleChange(patch: Partial<NodeParams>) {
    setDraft((d) => (d ? ({ ...d, ...patch } as NodeParams) : d));
    setDirty(true);
  }
  function save() {
    if (!template || !draft) return;
    dispatch({ type: "template_content_updated", id: template.id, patch: draft });
    setDirty(false);
  }
  function cancel() {
    if (template) setDraft(template.content);
    setDirty(false);
  }

  // Резервирует место справа в общем реестре — через --right-rail-width
  // (промпт-бар и ИИ-дровер читают её, чтобы не оказаться под панелью).
  useReserveRightRail(open ? PREVIEW_WIDTH_PX : 0);

  const showSave = !readOnly && dirty;

  return (
    <AnimatePresence>
      {open && template && content && (
        <motion.aside
          key="template-preview-drawer"
          data-testid="template-preview-drawer"
          initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
          animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : { duration: 0.46, ease: [0.16, 1, 0.3, 1] }
          }
          className="fixed right-0 top-0 z-40 box-border flex h-screen w-[560px] flex-col border-l border-white/10 bg-[rgba(14,14,12,0.96)] backdrop-blur-[2px]"
        >
          {/* Шапка панели: канал + имя шаблона */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
                Шаблон · {CHANNEL_LABEL[template.channel]}
              </span>
              <span className="text-sm font-medium text-foreground">
                {template.name}
              </span>
            </div>
            <button
              type="button"
              aria-label="Закрыть предпросмотр"
              onClick={closeTemplateDrawer}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Баннер замка — использованный шаблон править нельзя (#3) */}
          {used && (
            <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-[#e0b060]/25 bg-[#e0b060]/[0.07] px-3 py-2.5 text-xs leading-relaxed text-[#d8b98a]">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Шаблон использован в кампаниях, поэтому его нельзя редактировать.
              Продублируйте — копия откроется черновиком, и её можно будет менять.
            </div>
          )}

          {/* Предпросмотр / редактор сообщения */}
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <TemplatePreviewBody
              content={content}
              readOnly={readOnly}
              onChange={handleChange}
            />
          </div>

          {/* Низ: «Сохранить»/«Отмена» при правках, иначе «Закрыть» */}
          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            {showSave ? (
              <>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg bg-[#FFEC00] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
                >
                  Сохранить
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={closeTemplateDrawer}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Закрыть
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
