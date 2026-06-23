"use client";

import { useRef, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { pluralizeRaz } from "@/lib/pluralize";
import type { MessageTemplate } from "@/state/app-state";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { NODE_STYLES } from "@/sections/campaigns/node-visuals";
import type { EmailParams, WorkflowNodeType } from "@/types/workflow";

/**
 * Compact clickable «Письмо» field for email templates (#32). The inline
 * letter card was hidden behind this row: it surfaces the subject as the value
 * and, on click, opens the full letter in the side drawer (read-only preview).
 * Pure — the actual drawer open is delegated to `onOpenEmail` so the card stays
 * testable without ChatProvider.
 */
function EmailField({
  content,
  onOpenEmail,
}: {
  content: EmailParams;
  onOpenEmail?: (content: EmailParams) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Письмо"
      onClick={() => onOpenEmail?.(content)}
      className="group flex w-full items-center gap-2 rounded-md border border-border bg-input/20 px-2.5 py-1.5 text-left transition-colors hover:border-ring/60 hover:bg-input/40"
    >
      <span className="shrink-0 text-xs text-muted-foreground/60">Письмо:</span>
      <span className="flex-1 truncate text-xs text-muted-foreground">
        {content.subject || "Без темы"}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}

/** Per-channel field rows rendered below the preview. */
function FieldList({
  content,
  onOpenEmail,
}: {
  content: MessageTemplate["content"];
  onOpenEmail?: (content: EmailParams) => void;
}) {
  // Email collapses to a compact clickable field; the letter opens in the drawer.
  if (content.kind === "email") {
    return <EmailField content={content} onOpenEmail={onOpenEmail} />;
  }

  let rows: Array<{ label: string; value: string | undefined }>;

  switch (content.kind) {
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
            className="text-xs text-muted-foreground break-words"
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
  /** Commit a renamed template name. Empty/whitespace input is dropped. */
  onRename: (id: string, name: string) => void;
  /**
   * #32: open an email template's letter in the side drawer. Delegated so the
   * card stays pure (no ChatProvider dependency) — the connected tab wires this.
   */
  onOpenEmail?: (content: EmailParams) => void;
  /**
   * Page-entrance stagger position (0-based). Each step adds 40 ms of
   * animation-delay so a fresh list cascades in instead of popping at once.
   */
  index?: number;
}

export function TemplateCard({
  template,
  onRename,
  onOpenEmail,
  index = 0,
}: TemplateCardProps) {
  const { id, channel, name, content, usedInCampaigns } = template;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Set when Escape cancels editing, so the resulting blur skips committing.
  const cancelledRef = useRef(false);

  function startEditing() {
    setDraft(name);
    cancelledRef.current = false;
    setEditing(true);
  }

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const value = draft.trim();
    if (value) onRename(id, value);
    setEditing(false);
  }

  function cancel() {
    cancelledRef.current = true;
    setEditing(false);
  }

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

      {/* Row 2: template name with inline rename */}
      {editing ? (
        <input
          aria-label="Название шаблона"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          className="w-full rounded-md border border-border bg-input/30 px-2 py-1 text-sm font-semibold text-foreground outline-none focus-visible:border-ring"
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <button
            type="button"
            aria-label="Переименовать"
            onClick={startEditing}
            className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Per-channel component fields */}
      <FieldList content={content} onOpenEmail={onOpenEmail} />
    </Card>
  );
}
