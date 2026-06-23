"use client";

import { Card } from "@/components/ui/card";
import { pluralizeRaz } from "@/lib/pluralize";
import type { MessageTemplate } from "@/state/app-state";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { NODE_STYLES } from "@/sections/campaigns/node-visuals";
import type { WorkflowNodeType } from "@/types/workflow";

/** Per-channel field rows rendered below the preview. */
function FieldList({ content }: { content: MessageTemplate["content"] }) {
  let rows: Array<{ label: string; value: string | undefined }>;

  switch (content.kind) {
    case "email":
      rows = [
        { label: "Тема", value: content.subject },
        { label: "Текст", value: content.body },
        { label: "Отправитель", value: content.sender },
      ];
      break;
    case "sms":
      rows = [
        { label: "Текст", value: content.text },
        { label: "Альфа-имя", value: content.alphaName },
      ];
      break;
    case "push":
      rows = [
        { label: "Заголовок", value: content.title },
        { label: "Текст", value: content.body },
      ];
      break;
    case "ivr":
      rows = [
        { label: "Сценарий", value: content.scenario },
        { label: "Голос", value: content.voiceType },
      ];
      break;
    default:
      rows = [];
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      {rows.map(({ label, value }) => (
        <>
          <dt
            key={`lbl-${label}`}
            className="text-xs text-muted-foreground/60 whitespace-nowrap"
          >
            {label}:
          </dt>
          <dd
            key={`val-${label}`}
            className="text-xs text-muted-foreground line-clamp-1"
          >
            {value ?? "—"}
          </dd>
        </>
      ))}
    </dl>
  );
}

interface TemplateCardProps {
  template: MessageTemplate;
  /**
   * Page-entrance stagger position (0-based). Each step adds 40 ms of
   * animation-delay so a fresh list cascades in instead of popping at once.
   */
  index?: number;
}

export function TemplateCard({ template, index = 0 }: TemplateCardProps) {
  const { id, channel, name, content, usedInCampaigns } = template;

  const nodeStyle =
    NODE_STYLES[channel as WorkflowNodeType] ?? NODE_STYLES.default;

  // Pill style: use the node's border/color for foreground + border,
  // and a subtle translucent version of the bg for fill.
  const chipStyle: React.CSSProperties = {
    border: `1px solid ${nodeStyle.border}`,
    backgroundColor: nodeStyle.bg,
    color: nodeStyle.color,
    borderRadius: "9999px",
    padding: "1px 8px",
    fontSize: "0.65rem",
    fontWeight: 500,
    lineHeight: "1.4",
    display: "inline-block",
    letterSpacing: "0.02em",
  };

  return (
    <Card
      className="animate-in fade-in-0 slide-in-from-bottom-2 gap-2 px-5 py-4 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]"
      style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      {/* Row 1: channel chip + grey usage chip on one line */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span style={chipStyle} data-channel={channel}>
          {CHANNEL_LABEL[channel]}
        </span>
        {/* grey usage chip — same pill geometry as the channel chip, neutral
            tokens. Never the yellow accent (PRODUCT.md): muted/border tokens. */}
        <span
          data-usage-chip
          className="inline-block rounded-full border border-border bg-muted px-2 py-px text-[0.65rem] font-medium leading-[1.4] tracking-[0.02em] text-muted-foreground"
        >
          Использовано {pluralizeRaz(usedInCampaigns)}
        </span>
      </div>

      {/* Row 2: template name */}
      <p className="text-sm font-semibold text-foreground">{name}</p>

      {/* Per-channel component fields */}
      <FieldList content={content} />
    </Card>
  );
}
