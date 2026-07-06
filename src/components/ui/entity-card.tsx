"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EntityCardAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
}

interface EntityCardShellProps {
  title: string;
  /** When supplied, the title becomes inline-editable. */
  onRename?: (name: string) => void;
  /** When supplied, a back button is shown above the header. */
  onBack?: () => void;
  /** Label for the back button (e.g. "К сигналам"). */
  backLabel?: string;
  badge?: ReactNode;
  tags?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  primaryAction?: EntityCardAction;
  secondaryActions?: EntityCardAction[];
}

export function EntityCardShell({
  title,
  onRename,
  onBack,
  backLabel = "Назад",
  badge,
  tags,
  meta,
  children,
  primaryAction,
  secondaryActions,
}: EntityCardShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-promptbar pt-[120px]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </button>
        )}
        {/* Header */}
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            {onRename ? (
              <InlineEditableTitle title={title} onRename={onRename} />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
            )}
            {badge}
          </div>
          {tags && <div className="flex flex-wrap items-center gap-2">{tags}</div>}
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        </section>

        {children}

        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="gap-2"
              >
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
            {secondaryActions?.map((a) => (
              <Button
                key={a.label}
                variant={a.variant ?? "outline"}
                onClick={a.onClick}
                disabled={a.disabled}
                className="gap-2"
              >
                {a.icon}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function InlineEditableTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="Название"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-2xl font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      className="group flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label="Переименовать"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </button>
  );
}

export function CardTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function CardSection({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      {label && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      )}
      {children}
    </section>
  );
}
