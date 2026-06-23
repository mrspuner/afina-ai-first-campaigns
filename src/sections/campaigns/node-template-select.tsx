"use client";

import { Eye, Pencil, Plus } from "lucide-react";
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
import type { MessageTemplate } from "@/state/app-state";
import { cn } from "@/lib/utils";

/**
 * Селект именованных шаблонов канала ноды (правки 9/10).
 *
 * Свободные поля Текст/Заголовок убраны — у коммуникационной ноды единственное
 * текстовое поле «Шаблон» это выбор из `app-state.templates`, отфильтрованных по
 * каналу ноды (тот же источник, что карточки Артефактов — «сходимость»).
 *
 * - каждый пункт: имя шаблона + кнопка-иконка «Предпросмотр» (не закрывает попап);
 * - последний пункт «Создать новый шаблон» открывает чат-дровер создания.
 * Все строки — русские.
 */
export function NodeTemplateSelect({
  label,
  templates,
  selectedName,
  isDirty,
  readOnly,
  onSelect,
  onPreview,
  onCreate,
}: {
  label: string;
  /** Уже отфильтрованы по каналу ноды (см. templateOptionsForKind). */
  templates: MessageTemplate[];
  /** Текущее выбранное имя шаблона (или "" если нет). */
  selectedName: string;
  isDirty: boolean;
  readOnly?: boolean;
  /** Применяет выбранный шаблон к ноде. */
  onSelect: (template: MessageTemplate) => void;
  /** Открывает предпросмотр шаблона по id, НЕ закрывая селект (шов блока 6). */
  onPreview: (templateId: string) => void;
  /** Открывает дровер создания нового шаблона для канала ноды (шов блока 6). */
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);

  const rowGrid =
    "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";
  const displayValue = selectedName || "—";

  const dirtyDot = isDirty ? (
    <span
      aria-hidden
      title="Параметр изменён"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
    />
  ) : null;

  // Лаунч/пауза/завершено: карточка только для просмотра — текст без попапа.
  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate text-foreground" title={displayValue}>
          {displayValue}
        </span>
        <span className="flex items-center justify-end">{dirtyDot}</span>
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
        <span
          className={cn(
            "truncate",
            selectedName ? "text-foreground" : "text-muted-foreground"
          )}
          title={displayValue}
        >
          {displayValue}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
          {dirtyDot}
          <Pencil aria-hidden className="h-3 w-3 shrink-0" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {templates.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Нет шаблонов для этого канала
              </div>
            )}
            {templates.length > 0 && (
              <CommandGroup>
                {templates.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    data-checked={t.name === selectedName}
                    onSelect={() => {
                      onSelect(t);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{t.name}</span>
                    <button
                      type="button"
                      aria-label="Предпросмотр"
                      title="Предпросмотр"
                      className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                      onClick={(e) => {
                        // Не выбираем шаблон и не закрываем попап — только превью.
                        e.stopPropagation();
                        onPreview(t.id);
                      }}
                    >
                      <Eye aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__create__"
                onSelect={() => {
                  onCreate();
                  setOpen(false);
                }}
              >
                <Plus aria-hidden className="h-3.5 w-3.5" />
                <span>Создать новый шаблон</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
