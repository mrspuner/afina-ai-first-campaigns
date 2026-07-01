"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { useTemplateFlow } from "@/sections/shell/use-template-flow";
import type { MessageTemplate } from "@/state/app-state";
import type { EmailDraft } from "@/state/email-directory";
import type { EmailParams } from "@/types/workflow";
import { TemplateCard } from "./template-card";
import { TemplatesEmptyState } from "./templates-empty-state";

interface TemplatesTabViewProps {
  templates: MessageTemplate[];
  onCreateManual: () => void;
  onRename: (id: string, name: string) => void;
  /** #32: open an email template's letter in the read-only side drawer. */
  onOpenEmail?: (content: EmailParams) => void;
  /** Open a non-email template's styled preview in the read-only side drawer. */
  onPreview?: (id: string) => void;
}

/** Presentational list — pure, no state access (testable in isolation). */
export function TemplatesTabView({
  templates,
  onCreateManual,
  onRename,
  onOpenEmail,
  onPreview,
}: TemplatesTabViewProps) {
  if (templates.length === 0) {
    return <TemplatesEmptyState onCreateManual={onCreateManual} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={onCreateManual}>
          <Plus className="h-4 w-4" />
          Создать шаблон вручную
        </Button>
      </div>
      {templates.map((template, i) => (
        <TemplateCard
          key={template.id}
          template={template}
          index={i}
          onRename={onRename}
          onOpenEmail={onOpenEmail}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

/**
 * #32: map a template's plain EmailParams onto an EmailDraft the drawer renders.
 * Same mapping the inline EmailPreview used before — only the CTA shows when a
 * link exists. The draft is read-only preview content, so id/name are cosmetic.
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

/** Connected Шаблоны tab — lists reusable channel-typed message templates. */
export function TemplatesTab() {
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  const { openEmailEditor, openTemplatePreview } = useChat();
  const templateFlow = useTemplateFlow();

  // «Создать шаблон» запускает поток создания в чат-дровере (#14): ассистент
  // задаёт вопрос канала, варианты ответа — в VariantPicker над промпт-баром.
  function startCreate() {
    templateFlow.start();
  }

  return (
    <TemplatesTabView
      templates={templates}
      onCreateManual={startCreate}
      onRename={(id, name) => dispatch({ type: "template_renamed", id, name })}
      // #32: открыть письмо шаблона в правом дровере на просмотр. nodeId пустой —
      // сохранять некуда (мы в «Артефактах»), поэтому preview гасит «Сохранить».
      onOpenEmail={(content) =>
        openEmailEditor("", {
          draft: emailParamsToDraft(content),
          preview: true,
        })
      }
      // sms/push/ivr: открыть стилизованный предпросмотр в правом дровере.
      onPreview={(id) => openTemplatePreview(id)}
    />
  );
}
