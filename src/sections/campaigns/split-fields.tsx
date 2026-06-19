"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAppDispatch } from "@/state/app-state-context";
import { splitSegmentBranches } from "@/state/split-segments";
import type { NodeParams, SplitParams } from "@/types/workflow";
import { cn } from "@/lib/utils";

const BY_LABELS: Record<SplitParams["by"], string> = {
  equal: "Поровну",
  random: "Рандомно",
  segment: "По сегменту",
};

const BY_OPTIONS: SplitParams["by"][] = ["equal", "random", "segment"];
const BRANCH_OPTIONS = [2, 3, 4, 5];

const rowGrid =
  "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

/**
 * Поля сплиттера (A6): «По» — селект типа разделения (Поровну / Рандомно /
 * По сегменту + ИИ); «Ветки» — селект 2–5 при equal/random, авто-показ
 * «По категориям сигнала (N)» при segment. Сознательное исключение из A7.
 */
export function SplitFields({
  nodeId,
  params,
  dirtyParams,
  readOnly,
  onAiHandoff,
}: {
  nodeId: string;
  params: SplitParams;
  dirtyParams?: string[];
  readOnly: boolean;
  /** Передаёт поле «По» ассистенту (тег в PromptBar). */
  onAiHandoff: () => void;
}) {
  const dispatch = useAppDispatch();
  const segmentBranches = splitSegmentBranches();
  const segmentCount = segmentBranches.length;

  function patch(p: Partial<SplitParams>) {
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: p as Partial<NodeParams>,
    });
  }

  function setBy(by: SplitParams["by"]) {
    // При переходе на «по сегменту» число веток авто-подставляется из сигнала.
    if (by === "segment") patch({ by, branches: segmentCount });
    else patch({ by });
  }

  const byDirty = dirtyParams?.includes("by") ?? false;
  const branchesDirty = dirtyParams?.includes("branches") ?? false;

  return (
    <>
      {/* По — тип разделения */}
      <SelectRow
        label="По"
        value={BY_LABELS[params.by]}
        isDirty={byDirty}
        readOnly={readOnly}
        renderItems={(close) => (
          <>
            <CommandGroup>
              {BY_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt}
                  value={BY_LABELS[opt]}
                  data-checked={params.by === opt}
                  onSelect={() => {
                    setBy(opt);
                    close();
                  }}
                >
                  {BY_LABELS[opt]}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__ai__"
                onSelect={() => {
                  onAiHandoff();
                  close();
                }}
              >
                <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
                <span>Сформировать с помощью ИИ</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      />

      {/* Ветки — число (equal/random) либо авто (segment) */}
      {params.by === "segment" ? (
        <div className={cn(rowGrid, "px-1 py-0.5")}>
          <span className="text-muted-foreground">Ветки</span>
          <span className="truncate text-foreground">
            По категориям сигнала ({segmentCount})
          </span>
          <span className="flex items-center justify-end">
            {branchesDirty && <DirtyDot />}
          </span>
        </div>
      ) : (
        <SelectRow
          label="Ветки"
          value={String(params.branches)}
          isDirty={branchesDirty}
          readOnly={readOnly}
          renderItems={(close) => (
            <CommandGroup>
              {BRANCH_OPTIONS.map((n) => (
                <CommandItem
                  key={n}
                  value={String(n)}
                  data-checked={params.branches === n}
                  onSelect={() => {
                    patch({ branches: n });
                    close();
                  }}
                >
                  {n}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        />
      )}
    </>
  );
}

function DirtyDot() {
  return (
    <span
      aria-hidden
      title="Параметр изменён"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
    />
  );
}

function SelectRow({
  label,
  value,
  isDirty,
  readOnly,
  renderItems,
}: {
  label: string;
  value: string;
  isDirty: boolean;
  readOnly: boolean;
  renderItems: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate text-foreground">{value}</span>
        <span className="flex items-center justify-end">
          {isDirty && <DirtyDot />}
        </span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Изменить поле «${label}»`}
        className={cn(
          rowGrid,
          "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
          "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none",
          "data-[popup-open]:bg-white/5"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate text-foreground">{value}</span>
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          {isDirty && <DirtyDot />}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-56 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandList>{renderItems(() => setOpen(false))}</CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
