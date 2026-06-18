"use client";

import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MessageTemplate } from "@/state/app-state";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";

/** Plain-text preview of a template's content, keyed by channel field set. */
function previewOf(content: MessageTemplate["content"]): string {
  switch (content.kind) {
    case "sms":
      return content.text;
    case "push":
      return `${content.title} — ${content.body}`;
    case "email":
      return `${content.subject} — ${content.body}`;
    case "ivr":
      return content.scenario;
    default:
      return "";
  }
}

interface TemplateCardProps {
  template: MessageTemplate;
  onUseInNewCampaign: (templateId: string) => void;
  /**
   * Page-entrance stagger position (0-based). Each step adds 40 ms of
   * animation-delay so a fresh list cascades in instead of popping at once.
   */
  index?: number;
}

export function TemplateCard({
  template,
  onUseInNewCampaign,
  index = 0,
}: TemplateCardProps) {
  const { id, channel, name, content, usedInCampaigns } = template;
  const preview = previewOf(content);

  return (
    <Card
      className="animate-in fade-in-0 slide-in-from-bottom-2 gap-2 px-5 py-4 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]"
      style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{CHANNEL_LABEL[channel]}</Badge>
          <p className="text-sm font-semibold text-foreground">{name}</p>
        </div>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>

      <p className="text-xs text-muted-foreground/80">
        Использован в кампаниях: {usedInCampaigns}
      </p>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => onUseInNewCampaign(id)}>
          <Send className="h-4 w-4" />
          Использовать в новой кампании
        </Button>
      </div>
    </Card>
  );
}
