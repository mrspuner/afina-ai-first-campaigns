"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
  availableRegisteredDomains,
  normalizeDomainInput,
} from "@/lib/domain-add";

export interface AddDomainComboboxProps {
  /** Domains already in THIS trigger's `delta.added` — excluded from the
   *  registered-options list (already there, nothing to re-add). */
  alreadyAdded: readonly string[];
  /** The account's previously-registered own-domains (any moderation
   *  status) — the combobox's selectable directory. */
  registeredDomains: readonly string[];
  /** A registered domain was picked from the directory — no (re-)moderation,
   *  just wire it into the trigger's delta as an active entry. */
  onSelectRegistered: (domain: string) => void;
  /** Free text was submitted (click "Добавить «…»"). The caller normalizes,
   *  classifies known/unknown and dispatches registration when needed. */
  onSubmitTyped: (raw: string) => void;
}

/**
 * «Добавить свой домен» combobox (Task 8): a Popover + Command listing the
 * account's previously-registered own-domains, plus a free-typed "Добавить
 * «…»" entry. Visually replaces the old dashed placeholder button — same
 * label/icon/style, now opening a picker instead of routing through the
 * prompt-bar text-command flow.
 */
export function AddDomainCombobox({
  alreadyAdded,
  registeredDomains,
  onSelectRegistered,
  onSubmitTyped,
}: AddDomainComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const available = availableRegisteredDomains(
    registeredDomains.map((domain) => ({ domain })),
    alreadyAdded
  );

  const trimmed = query.trim();
  const normalizedTrimmed = normalizeDomainInput(trimmed);
  const addedNormalized = new Set(
    alreadyAdded.map((d) => normalizeDomainInput(d))
  );
  const showCustom =
    trimmed.length > 0 &&
    !available.some((d) => normalizeDomainInput(d) === normalizedTrimmed) &&
    !addedNormalized.has(normalizedTrimmed);

  function reset() {
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground data-[popup-open]:border-brand/40 data-[popup-open]:text-foreground">
        <Plus className="h-3 w-3" />
        Добавить свой домен
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput
            placeholder="Домен (example.ru)"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {available.map((domain) => (
                <CommandItem
                  key={domain}
                  value={domain}
                  onSelect={() => {
                    onSelectRegistered(domain);
                    reset();
                  }}
                >
                  {domain}
                </CommandItem>
              ))}
              {showCustom && (
                <CommandItem
                  key="__custom__"
                  value={trimmed}
                  onSelect={() => {
                    onSubmitTyped(trimmed);
                    reset();
                  }}
                >
                  Добавить «{trimmed}»
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
