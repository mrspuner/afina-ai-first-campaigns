"use client";

import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  formatDateRangeRu,
  resolvePeriod,
} from "../period-utils";
import {
  PERIOD_LABELS,
  periodLabel,
  type Period,
  type PeriodPreset,
} from "../statistics-state";

const PRESET_GROUPS: { heading: string; presets: PeriodPreset[] }[] = [
  {
    heading: "Быстрый выбор",
    presets: ["today", "yesterday"],
  },
  {
    heading: "Периоды",
    presets: [
      "this-quarter",
      "last-quarter",
      "this-month",
      "last-month",
      "this-year",
      "last-year",
    ],
  },
];

type TriggerVariant = "chip" | "field";

export function PeriodField({
  value,
  onChange,
  triggerVariant = "field",
  className,
}: {
  value: Period;
  onChange: (period: Period) => void;
  triggerVariant?: TriggerVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from ?? "");
  const [customTo, setCustomTo] = useState(value.to ?? "");
  const [draftPreset, setDraftPreset] = useState<PeriodPreset>(value.preset);

  function commit(preset: PeriodPreset) {
    if (preset === "custom") {
      if (customFrom && customTo) {
        onChange({ preset, from: customFrom, to: customTo });
        setOpen(false);
      }
      return;
    }
    onChange({ preset });
    setOpen(false);
  }

  const triggerClass =
    triggerVariant === "chip"
      ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-sm text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted"
      : "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 data-[popup-open]:bg-muted/60";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraftPreset(value.preset);
      }}
    >
      <PopoverTrigger className={cn(triggerClass, className)}>
        {triggerVariant === "chip" ? (
          <>
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span>{periodLabel(value)}</span>
          </>
        ) : (
          <>
            <span className="truncate">{periodLabel(value)}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={triggerVariant === "chip" ? "start" : "start"}
        // w-80 (was w-72): the widest row «Прошлый квартал 01.01.2026 —
        // 31.03.2026» wrapped onto two lines at 288px. Sized to the longest
        // «name + date range» so the row stays on ONE line (see whitespace-nowrap).
        className="w-80 p-1"
      >
        {PRESET_GROUPS.map((group, gi) => (
          <div key={group.heading} className={gi > 0 ? "mt-1" : ""}>
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {group.heading}
            </div>
            {group.presets.map((preset) => {
              const active = value.preset === preset;
              const range = formatDateRangeRu(
                resolvePeriod({ preset }),
              );
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => commit(preset)}
                  className={cn(
                    // whitespace-nowrap keeps «name + date range» on one line;
                    // the popover is widened (w-80) to fit the longest row.
                    "flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span>{PERIOD_LABELS[preset]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {range}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="mt-1 border-t border-border pt-1">
          <button
            type="button"
            onClick={() => setDraftPreset("custom")}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition-colors",
              draftPreset === "custom" || value.preset === "custom"
                ? "bg-primary/10 text-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            Произвольный период
          </button>
          {(draftPreset === "custom" || value.preset === "custom") && (
            <div className="mt-2 space-y-2 px-2 pb-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-8">С</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-8">По</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
                />
              </label>
              <Button
                size="sm"
                className="w-full"
                disabled={!customFrom || !customTo}
                onClick={() => commit("custom")}
              >
                Применить
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
