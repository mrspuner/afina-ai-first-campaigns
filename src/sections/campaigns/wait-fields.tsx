"use client";

import { ChevronDown } from "lucide-react";
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
} from "@/components/ui/command";
import { useAppDispatch } from "@/state/app-state-context";
import { NodeFieldCombobox } from "./node-field-combobox";
import { DirtyDot } from "./dirty-dot";
import type { NodeParams, WaitParams } from "@/types/workflow";
import { cn } from "@/lib/utils";

const rowGrid =
  "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

const MODE_LABELS: Record<WaitParams["mode"], string> = {
  duration: "Длительность",
  until_event: "До события",
};
const MODE_OPTIONS: WaitParams["mode"][] = ["duration", "until_event"];

const UNITS: { label: string; hours: number }[] = [
  { label: "часов", hours: 1 },
  { label: "дней", hours: 24 },
  { label: "недель", hours: 168 },
];

/** Раскладывает часы в {число, единица}, выбирая крупнейшую кратную единицу. */
export function splitDuration(hours: number): { value: number; unitIdx: number } {
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const u = UNITS[i].hours;
    if (hours >= u && hours % u === 0) return { value: hours / u, unitIdx: i };
  }
  return { value: hours, unitIdx: 0 };
}

/**
 * Поля ноды ожидания (Block 7 §3): «Режим» — Select (длительность / до
 * события); далее в зависимости от режима — «Длительность» (число + единица) или
 * «Событие» (combo из справочника событий).
 */
export function WaitFields({
  nodeId,
  params,
  dirtyParams,
  readOnly,
  onEventAiHandoff,
}: {
  nodeId: string;
  params: WaitParams;
  dirtyParams?: string[];
  readOnly: boolean;
  onEventAiHandoff: () => void;
}) {
  const dispatch = useAppDispatch();

  function patch(p: Partial<WaitParams>) {
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: p as Partial<NodeParams>,
    });
  }

  const modeDirty = dirtyParams?.includes("mode") ?? false;
  const durationDirty = dirtyParams?.includes("durationHours") ?? false;
  const hours = params.durationHours ?? 24;
  const { value, unitIdx } = splitDuration(hours);

  return (
    <>
      <ModeRow
        value={MODE_LABELS[params.mode]}
        isDirty={modeDirty}
        readOnly={readOnly}
        renderItems={(close) => (
          <CommandGroup>
            {MODE_OPTIONS.map((opt) => (
              <CommandItem
                key={opt}
                value={MODE_LABELS[opt]}
                data-checked={params.mode === opt}
                onSelect={() => {
                  // При переключении даём осмысленный дефолт второму полю.
                  if (opt === "duration") patch({ mode: opt, durationHours: hours });
                  else patch({ mode: opt });
                  close();
                }}
              >
                {MODE_LABELS[opt]}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      />

      {params.mode === "duration" ? (
        <DurationRow
          value={value}
          unitIdx={unitIdx}
          isDirty={durationDirty}
          readOnly={readOnly}
          onApply={(v, idx) => patch({ durationHours: v * UNITS[idx].hours })}
        />
      ) : (
        <NodeFieldCombobox
          label="Событие"
          value={params.untilEvent ?? ""}
          optionsKey="eventCatalog"
          isDirty={dirtyParams?.includes("untilEvent") ?? false}
          onSelect={(next) => patch({ untilEvent: next })}
          onAiHandoff={onEventAiHandoff}
        />
      )}
    </>
  );
}

function ModeRow({
  value,
  isDirty,
  readOnly,
  renderItems,
}: {
  value: string;
  isDirty: boolean;
  readOnly: boolean;
  renderItems: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Режим
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">{value}</span>
        <span className="flex items-center justify-end" />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Изменить поле «Режим»"
        className={cn(
          rowGrid,
          "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
          "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none",
          "data-[popup-open]:bg-white/5"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Режим
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">{value}</span>
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
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

function DurationRow({
  value,
  unitIdx,
  isDirty,
  readOnly,
  onApply,
}: {
  value: number;
  unitIdx: number;
  isDirty: boolean;
  readOnly: boolean;
  onApply: (value: number, unitIdx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Длительность
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">
          {value} {UNITS[unitIdx].label}
        </span>
        <span className="flex items-center justify-end" />
      </div>
    );
  }

  function apply(idx: number) {
    const n = Math.max(1, Math.round(Number(draft) || value));
    onApply(n, idx);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(String(value));
      }}
    >
      <PopoverTrigger
        aria-label="Изменить поле «Длительность»"
        className={cn(
          rowGrid,
          "group nodrag w-full rounded px-1 py-0.5 text-left transition-colors",
          "hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none",
          "data-[popup-open]:bg-white/5"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Длительность
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground">
          {value} {UNITS[unitIdx].label}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-56 p-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <input
            type="number"
            min={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Число"
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <div className="flex gap-1">
            {UNITS.map((u, idx) => (
              <button
                key={u.label}
                type="button"
                onClick={() => apply(idx)}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1 text-xs transition-colors",
                  idx === unitIdx
                    ? "border-brand/60 bg-brand-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
