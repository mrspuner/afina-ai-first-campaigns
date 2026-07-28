"use client";

import { ChevronDown, Eye } from "lucide-react";
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
import type { MessageTemplate } from "@/state/app-state";
import { DirtyDot } from "./dirty-dot";
import { cn } from "@/lib/utils";

/**
 * Содержимое поповера выбора шаблона — список Command без триггера (Task 7).
 * Вынесен из `NodeTemplateSelect`, чтобы им же питался поповер у пилюли тега
 * названия шаблона в описании кампании (`description-tag.tsx`): та же карточка
 * узла графа не должна заметить рефакторинг — публичный API
 * `NodeTemplateSelect` не меняется, он просто оборачивает этот список триггером.
 *
 * - каждый пункт: имя шаблона + кнопка-иконка «Предпросмотр» (не закрывает попап);
 * - последний пункт «Создать новый шаблон» открывает чат-дровер создания.
 * Закрытие поповера после выбора/создания — забота вызывающего (он владеет
 * `open`), поэтому `onSelect`/`onCreate` здесь не закрывают ничего сами.
 */
export function NodeTemplateList({
  templates,
  selectedName,
  onSelect,
  onPreview,
  onCreate,
}: {
  /** Уже отфильтрованы по каналу ноды (см. templateOptionsForKind). */
  templates: MessageTemplate[];
  /** Текущее выбранное имя шаблона (или "" если нет) — подсвечивает пункт. */
  selectedName: string;
  /** Применяет выбранный шаблон. */
  onSelect: (template: MessageTemplate) => void;
  /** Открывает предпросмотр шаблона по id, НЕ закрывая список (шов блока 6). */
  onPreview: (templateId: string) => void;
  /** Открывает дровер создания нового шаблона для канала ноды (шов блока 6). */
  onCreate: () => void;
}) {
  return (
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
                onSelect={() => onSelect(t)}
                className="flex items-center justify-between gap-2"
              >
                {/* #6 — min-w-0 позволяет длинному названию усекаться, а не
                    выталкивать закреплённый глазик за границу узкой выпадашки. */}
                <span className="min-w-0 truncate">{t.name}</span>
                <button
                  type="button"
                  aria-label="Предпросмотр"
                  title="Предпросмотр"
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
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
          <CommandItem value="__create__" onSelect={() => onCreate()}>
            <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
            <span>Создать новый шаблон</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/**
 * Селект именованных шаблонов канала ноды (правки 9/10).
 *
 * Свободные поля Текст/Заголовок убраны — у коммуникационной ноды единственное
 * текстовое поле «Шаблон» это выбор из `app-state.templates`, отфильтрованных по
 * каналу ноды (тот же источник, что карточки Артефактов — «сходимость»).
 *
 * Триггер сверстан как строка сетки узла (`rowGrid`); содержимое поповера —
 * `NodeTemplateList` (Task 7 вынес его наружу, чтобы им же питался поповер у
 * тега названия в описании кампании).
 */
export function NodeTemplateSelect({
  label,
  templates,
  selectedName,
  selectedTemplateId,
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
  /** id выбранного шаблона — для встроенного глазика предпросмотра (#6). */
  selectedTemplateId?: string;
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

  // #6 — глазик предпросмотра живёт ВНУТРИ дропдауна, перед раскрывающим
  // шевроном. base-ui PopoverTrigger рендерит нативную <button>, поэтому глазик —
  // span role="button" (вложенная <button> невалидна). stopPropagation не даёт
  // клику раскрыть попап.
  const previewEye = selectedTemplateId ? (
    <span
      role="button"
      tabIndex={0}
      aria-label="Предпросмотр"
      title="Предпросмотр"
      className="nodrag inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none"
      onClick={(e) => {
        e.stopPropagation();
        onPreview(selectedTemplateId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onPreview(selectedTemplateId);
        }
      }}
    >
      <Eye aria-hidden className="h-3.5 w-3.5" />
    </span>
  ) : null;

  // Лаунч/пауза/завершено: карточка только для просмотра — текст без попапа.
  if (readOnly) {
    return (
      <div className={cn(rowGrid, "px-1 py-0.5")}>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {isDirty && <DirtyDot />}
        </span>
        <span className="truncate text-foreground" title={displayValue}>
          {displayValue}
        </span>
        <span className="flex items-center justify-end">{previewEye}</span>
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
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {isDirty && <DirtyDot />}
        </span>
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
          {previewEye}
          <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <NodeTemplateList
          templates={templates}
          selectedName={selectedName}
          onSelect={(t) => {
            onSelect(t);
            setOpen(false);
          }}
          onPreview={onPreview}
          onCreate={() => {
            onCreate();
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
