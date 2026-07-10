"use client";

import Image from "next/image";
import { splitSummary } from "@/state/split-segments";
import type { SplitParams } from "@/types/workflow";
import { DirtyDot } from "./dirty-dot";
import { cn } from "@/lib/utils";

const rowGrid =
  "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

/**
 * Сплиттер (spec B #3): одна строка-аффорданс «Ветвление». Клик открывает
 * ИИ-дровер (тот же handleSplitAiField). Значение — splitSummary(params),
 * совпадает с подзаголовком узла. Поля by/branches в модели остаются.
 */
export function SplitFields({
  params,
  dirtyParams,
  readOnly,
  onAiHandoff,
}: {
  params: SplitParams;
  dirtyParams?: string[];
  readOnly: boolean;
  onAiHandoff: () => void;
}) {
  const value = splitSummary(params);
  const isDirty =
    (dirtyParams?.includes("by") || dirtyParams?.includes("branches")) ?? false;

  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Ветвление
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">{value}</span>
        <span />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label="Настроить «Ветвление» с помощью ИИ"
      onClick={(e) => {
        e.stopPropagation();
        onAiHandoff();
      }}
      className={cn(
        rowGrid,
        "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
        "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Ветвление
        {isDirty && <DirtyDot />}
      </span>
      <span className="truncate text-foreground">{value}</span>
      <span className="ml-1 flex shrink-0 items-center gap-1.5">
        <Image
          src="/mascot-icon.svg"
          width={14}
          height={14}
          alt=""
          aria-hidden
          className="opacity-70 transition-opacity group-hover:opacity-100"
        />
      </span>
    </button>
  );
}
