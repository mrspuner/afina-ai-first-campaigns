"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import type { MessageTemplate } from "@/state/app-state";
import { TemplateCard } from "./template-card";
import { TemplatesEmptyState } from "./templates-empty-state";

interface TemplatesTabViewProps {
  templates: MessageTemplate[];
  onUseInNewCampaign: (templateId: string) => void;
  onCreateManual: () => void;
}

/** Presentational list — pure, no state access (testable in isolation). */
export function TemplatesTabView({
  templates,
  onUseInNewCampaign,
  onCreateManual,
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
          onUseInNewCampaign={onUseInNewCampaign}
        />
      ))}
    </div>
  );
}

/** Connected Шаблоны tab — lists reusable channel-typed message templates. */
export function TemplatesTab() {
  const { templates } = useAppState();
  const dispatch = useAppDispatch();

  // Entering the wizard is sufficient for the prototype; template
  // pre-selection inside a communication node is a Кампании-epic concern.
  function startWizard() {
    dispatch({ type: "start_campaign_flow" });
  }

  return (
    <TemplatesTabView
      templates={templates}
      onUseInNewCampaign={startWizard}
      onCreateManual={startWizard}
    />
  );
}
