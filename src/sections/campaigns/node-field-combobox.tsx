"use client";

import Image from "next/image";
import { Eye, Pencil } from "lucide-react";
import { useState } from "react";
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
  CommandSeparator,
} from "@/components/ui/command";
import {
  addFieldValue,
  getFieldOptions,
  type FieldOptionsKey,
} from "@/state/field-directory";
import { cn } from "@/lib/utils";

/**
 * Combo-контрол manual-поля ноды (спека A7): дропдаун, объединяющий выбор
 * готового значения, ручной ввод и передачу поля ИИ.
 *
 * - CommandInput — одновременно поиск по справочнику и поле ручного ввода.
 * - Список готовых значений (пресеты + введённые в сессии).
 * - «Использовать „{ввод}“» — когда введённый текст не совпал с готовым.
 * - Разделитель + «Сформировать с помощью ИИ» (иконка-маскот).
 */
export function NodeFieldCombobox({
  label,
  value,
  optionsKey,
  isDirty,
  onSelect,
  onAiHandoff,
  onPreview,
}: {
  label: string;
  value: string;
  optionsKey: FieldOptionsKey;
  isDirty: boolean;
  /** Применяет выбранное/введённое значение к ноде. */
  onSelect: (next: string) => void;
  /** Передаёт поле ассистенту (тег + шаблон в PromptBar/дровер). */
  onAiHandoff: () => void;
  /** Когда задан — у каждого варианта появляется «глаз» предпросмотра (не
   *  выбирает вариант). Для IVR — предпросмотр сценария звонка. */
  onPreview?: (option: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Справочник пополняется в сессии — читаем актуальный список каждый рендер.
  const options = getFieldOptions(optionsKey);

  const trimmed = query.trim();
  const hasExactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed
    ? options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
    : options;

  function apply(next: string) {
    const v = next.trim();
    if (!v) return;
    addFieldValue(optionsKey, v);
    onSelect(v);
    setQuery("");
    setOpen(false);
  }

  const rowGrid =
    "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

  const displayValue = value || "—";

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
        <span
          className={cn(
            "truncate",
            value ? "text-foreground" : "text-muted-foreground"
          )}
          title={displayValue}
        >
          {displayValue}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          {isDirty && (
            <span
              aria-hidden
              title="Параметр изменён"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
            />
          )}
          {/* Индикатор «поле редактируемо» — не отдельная кнопка, клик по нему
              открывает тот же дропдаун, что и вся строка-триггер. */}
          <Pencil aria-hidden className="h-3 w-3 shrink-0" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Выберите или впишите своё"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !hasExactMatch) {
                e.preventDefault();
                apply(trimmed);
              }
            }}
          />
          <CommandList>
            {filtered.length === 0 && !trimmed && (
              <CommandEmpty>Ничего не найдено</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    data-checked={opt === value}
                    onSelect={() => apply(opt)}
                    className={
                      onPreview ? "flex items-center justify-between gap-2" : undefined
                    }
                  >
                    <span className="min-w-0 truncate">{opt}</span>
                    {onPreview && (
                      <button
                        type="button"
                        aria-label="Предпросмотр"
                        title="Предпросмотр"
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        onClick={(e) => {
                          // Не выбираем вариант — только превью.
                          e.stopPropagation();
                          onPreview(opt);
                        }}
                      >
                        <Eye aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {trimmed && !hasExactMatch && (
              <CommandGroup>
                <CommandItem value={`__use__${trimmed}`} onSelect={() => apply(trimmed)}>
                  Использовать «{trimmed}»
                </CommandItem>
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__ai__"
                onSelect={() => {
                  onAiHandoff();
                  setOpen(false);
                }}
              >
                <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
                <span>Сформировать с помощью ИИ</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
