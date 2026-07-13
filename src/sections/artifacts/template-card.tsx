"use client";

import { Fragment, useRef, useState } from "react";
import { Copy, MoreHorizontal, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pluralizeRaz } from "@/lib/pluralize";
import type { MessageTemplate } from "@/state/app-state";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { NODE_STYLES } from "@/sections/campaigns/node-visuals";
import type { WorkflowNodeType } from "@/types/workflow";

/** Per-channel field rows под именем. Письмо (#2) показывает Тему + превью
 *  Текста, как остальные каналы; тело письма зажато line-clamp-2, чтобы карточка
 *  оставалась компактной. */
function FieldList({ content }: { content: MessageTemplate["content"] }) {
  let rows: Array<{ label: string; value: string | undefined; clamp?: boolean }>;

  switch (content.kind) {
    case "email":
      rows = [
        { label: "Тема", value: content.subject },
        { label: "Текст", value: content.body, clamp: true },
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
      {rows.map(({ label, value, clamp }) => (
        <Fragment key={label}>
          <dt className="whitespace-nowrap text-xs text-muted-foreground/60">
            {label}:
          </dt>
          <dd
            className={cn(
              "break-words text-xs text-muted-foreground",
              clamp && "line-clamp-2"
            )}
          >
            {value ?? "—"}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

interface TemplateCardProps {
  template: MessageTemplate;
  /** Commit a renamed template name. Empty/whitespace input is dropped. */
  onRename: (id: string, name: string) => void;
  /**
   * Open the template in the side drawer (preview / inline edit). Fired by a
   * click anywhere on the card (#4). Delegated so the card stays pure.
   */
  onPreview: (id: string) => void;
  /** Duplicate the template (⋯-menu). Used for locked (used) templates. */
  onDuplicate: (id: string) => void;
  /**
   * Page-entrance stagger position (0-based). Each step adds 40 ms of
   * animation-delay so a fresh list cascades in instead of popping at once.
   */
  index?: number;
}

export function TemplateCard({
  template,
  onRename,
  onPreview,
  onDuplicate,
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
      role="button"
      tabIndex={0}
      onClick={() => onPreview(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(id);
        }
      }}
      className="group/card animate-in fade-in-0 slide-in-from-bottom-2 cursor-pointer gap-2 px-5 py-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [--tw-animation-duration:220ms] [--tw-ease:var(--ease-out)]"
      style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
    >
      {/* Row 1: name (+ hover rename) on the left, ⋯-menu on the right */}
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <input
            aria-label="Название шаблона"
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            className="w-full rounded-md border border-border bg-input/30 px-2 py-1 text-sm font-semibold text-foreground outline-none focus-visible:border-ring"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <button
              type="button"
              aria-label="Переименовать"
              onClick={(e) => {
                e.stopPropagation();
                startEditing();
              }}
              className="shrink-0 text-muted-foreground/60 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 hover:text-muted-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ⋯-menu — как у карточки сигнала. Клик не открывает предпросмотр. */}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Действия с шаблоном"
                  className="size-7 text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDuplicate(id)}>
                <Copy className="mr-2 h-4 w-4" />
                Дублировать
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Per-channel component fields */}
      <FieldList content={content} />

      {/* Footer: channel chip + usage chip (#6 — переехали вниз, под разделитель) */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
        <span style={chipStyle} data-channel={channel}>
          {CHANNEL_LABEL[channel]}
        </span>
        {/* grey usage chip — neutral tokens, never the yellow accent (PRODUCT.md) */}
        <span
          data-usage-chip
          className="inline-block rounded-full border border-border bg-muted px-2 py-px text-[0.65rem] font-medium leading-[1.4] tracking-[0.02em] text-muted-foreground"
        >
          Использовано {pluralizeRaz(usedInCampaigns)}
        </span>
      </div>
    </Card>
  );
}
