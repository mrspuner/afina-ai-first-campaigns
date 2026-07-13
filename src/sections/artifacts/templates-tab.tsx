"use client";

import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import { useTemplateFlow } from "@/sections/shell/use-template-flow";
import type { MessageTemplate } from "@/state/app-state";
import { TemplateCard } from "./template-card";
import { TemplatesEmptyState } from "./templates-empty-state";

interface TemplatesTabViewProps {
  templates: MessageTemplate[];
  onCreateManual: () => void;
  onRename: (id: string, name: string) => void;
  /** Open a template's preview / inline editor in the side drawer (any channel). */
  onPreview: (id: string) => void;
  /** Duplicate a template (⋯-menu) → editable copy. */
  onDuplicate: (id: string) => void;
}

/** Presentational list — pure, no state access (testable in isolation). */
export function TemplatesTabView({
  templates,
  onCreateManual,
  onRename,
  onPreview,
  onDuplicate,
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
          onPreview={onPreview}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

/** Connected Шаблоны tab — lists reusable channel-typed message templates. */
export function TemplatesTab() {
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  const { openTemplatePreview } = useChat();
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
      // Клик по карточке открывает шаблон в правом дровере — предпросмотр и, для
      // неиспользованных не-IVR шаблонов, инлайн-правка с автосейвом (#3, #4).
      onPreview={(id) => openTemplatePreview(id)}
      // ⋯ → «Дублировать»: копия-черновик, сразу открывается редактируемой (#3).
      onDuplicate={(id) => {
        const newId = `tpl_${nanoid(8)}`;
        dispatch({ type: "template_duplicated", id, newId });
        openTemplatePreview(newId);
      }}
    />
  );
}
