"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  directoryOptions,
  type ChipItem,
  type DirectoryEntry,
} from "./directory-options";

/**
 * Строка удаляемых чипов + кнопка-чип «+ Добавить» → Popover с Command
 * (поиск + справочник). Контролируемый: без глобального стейта — работает и в
 * staged-review, и (позже) в блоках настроек. Логика фильтрации/custom — в
 * чистой directoryOptions.
 */
export function DirectoryChipsField({
  items,
  directory,
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
  searchPlaceholder = "Поиск",
  emptyText = "Ничего не найдено",
  allowCustom = false,
}: {
  items: ChipItem[];
  directory: DirectoryEntry[];
  onAdd: (item: ChipItem) => void;
  onRemove: (id: string) => void;
  addLabel: string;
  removeLabel: (item: ChipItem) => string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { available, custom } = directoryOptions(
    items,
    directory,
    query,
    allowCustom
  );

  function add(item: ChipItem) {
    onAdd(item);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground"
        >
          {item.label}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={removeLabel(item)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground data-[popup-open]:border-brand/50 data-[popup-open]:text-foreground">
          <Plus className="h-3 w-3 text-[var(--brand)]" />
          {addLabel}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {available.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.label}
                    onSelect={() => add({ id: d.id, label: d.label })}
                  >
                    {d.label}
                  </CommandItem>
                ))}
                {custom !== null && (
                  <CommandItem
                    key="__custom__"
                    value={custom}
                    onSelect={() => add({ id: custom, label: custom })}
                  >
                    Добавить «{custom}»
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
