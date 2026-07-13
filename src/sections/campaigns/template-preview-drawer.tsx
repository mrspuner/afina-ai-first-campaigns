"use client";

import { X, Lock } from "lucide-react";
import { useLayoutEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useChat } from "@/state/chat-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import type { MessageTemplate } from "@/state/app-state";
import type { EmailParams, NodeParams } from "@/types/workflow";
import type { EmailDraft } from "@/state/email-directory";
import { EmailRenderer } from "./email-renderer";
import { SmsRenderer } from "./sms-renderer";
import { PushRenderer } from "./push-renderer";
import { IvrRenderer } from "./ivr-renderer";

const PREVIEW_WIDTH_PX = 560;

/**
 * #32-mapping: разворачивает плоские EmailParams в EmailDraft, который рисует
 * EmailRenderer. Та же логика, что в templates-tab — CTA показывается только при
 * наличии ссылки. Контент только для просмотра, поэтому id/name косметические.
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

/**
 * Чистое тело предпросмотра шаблона — маршрутизация по каналу:
 *  - email / sms / push → стилизованный рендерер «как настоящее» сообщение;
 *  - ivr → панель «сценарий звонка» (всегда только просмотр).
 * При `readOnly=false` поля правятся инлайн, правка → onChange(patch).
 * Без провайдеров — тестируется в изоляции.
 */
export function TemplatePreviewBody({
  template,
  readOnly,
  onChange,
}: {
  template: MessageTemplate;
  readOnly: boolean;
  onChange: (patch: Partial<NodeParams>) => void;
}) {
  const { content } = template;

  switch (content.kind) {
    case "email":
      return (
        <EmailRenderer
          draft={emailParamsToDraft(content)}
          readOnly={readOnly}
          onChange={(patch) => onChange(emailDraftPatchToParams(patch))}
        />
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
 * Боковой дровер предпросмотра выбранного шаблона (шов блока 5/6). Открывается
 * по «глазу» в селекте шаблонов ноды И по карточке шаблона в «Артефактах».
 * Состояние живёт в chat-context (templateDrawer, mode === "preview"); сам
 * шаблон ищется по previewTemplateId в app-state.templates.
 */
export function TemplatePreviewDrawer() {
  const { templateDrawer, closeTemplateDrawer } = useChat();
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  // Под reduced-motion слайд по X отключаем — только opacity (см. globals.css).
  // Слайд (motion anim: translateX) — inline-transform на rAF, который CSS-крушение
  // reduced-motion не ловит; в финальных кадрах ease-out он оставляет дробный X,
  // из-за чего снимок дровера-элемента округляется до 560/561px и флачит визуал.
  const reduceMotion = useReducedMotion();

  const isPreview = templateDrawer.open && templateDrawer.mode === "preview";
  // Инлайновый шаблон (IVR-нода) имеет приоритет над поиском по библиотеке —
  // его контент живёт в ноде, а не в `app-state.templates`.
  const template = isPreview
    ? templateDrawer.previewTemplate ??
      templates.find((t) => t.id === templateDrawer.previewTemplateId)
    : undefined;
  const open = Boolean(template);

  // Замок редактирования (#3): использованный шаблон (usedInCampaigns≥1) правкам
  // не подлежит — только дублирование (через ⋯ на карточке). IVR — всегда только
  // просмотр. Иначе поля правятся инлайн, автосейв в шаблон.
  const used = (template?.usedInCampaigns ?? 0) >= 1;
  const readOnly = used || template?.content.kind === "ivr";

  // Канвас/дровер чата читают --email-preview-width, чтобы освободить место
  // справа — переиспользуем тот же шов, что и email-панель (взаимоисключаемы).
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--email-preview-width",
      open ? `${PREVIEW_WIDTH_PX}px` : "0px",
    );
    return () => {
      root.style.removeProperty("--email-preview-width");
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && template && (
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
              template={template}
              readOnly={readOnly}
              onChange={(patch) =>
                dispatch({ type: "template_content_updated", id: template.id, patch })
              }
            />
          </div>

          {/* Низ: «Готово» при правке (автосейв), «Закрыть» при просмотре */}
          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={closeTemplateDrawer}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              {readOnly ? "Закрыть" : "Готово"}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
