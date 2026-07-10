"use client";

import { ExternalLink } from "lucide-react";
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
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useChat } from "@/state/chat-context";
import { useAppDispatch } from "@/state/app-state-context";
import {
  draftFromRecord,
  generateEmailDraft,
  getEmail,
  getEmails,
} from "@/state/email-directory";
import type { EmailParams, NodeParams } from "@/types/workflow";
import { DirtyDot } from "./dirty-dot";
import { cn } from "@/lib/utils";

const NEW_EMAIL_QUESTION =
  "Какое письмо вы хотите? Опишите цель и тон — соберу черновик.";

/**
 * Спец-контрол поля email.Текст (письмо), спека A5: дропдаун ранее созданных
 * писем + пункт «Создать новое» (иконка ИИ); у выбранного письма — кнопка
 * «Открыть» (просмотр/редактирование в дровере). Свободного ввода нет.
 */
export function EmailField({
  nodeId,
  params,
  isDirty,
  readOnly,
}: {
  nodeId: string;
  params: EmailParams;
  isDirty: boolean;
  readOnly: boolean;
}) {
  const chat = useChat();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  // Справочник пополняется в сессии — читаем актуальный список каждый рендер.
  const emails = getEmails();

  // Какое письмо выбрано: по emailId, иначе по совпадению темы (для нод,
  // заполненных до A5). Имя письма — для показа в поле.
  const selected = params.emailId
    ? getEmail(params.emailId)
    : emails.find((e) => e.subject === params.subject && params.subject);
  const displayValue = selected?.name ?? params.subject ?? "—";
  const hasSelection = Boolean(selected || params.subject);

  function selectEmail(id: string) {
    const rec = getEmail(id);
    if (!rec) return;
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: {
        subject: rec.subject,
        body: rec.body,
        link: rec.link,
        sender: rec.sender,
        emailId: rec.id,
      } as Partial<NodeParams>,
    });
    setOpen(false);
  }

  function createNew() {
    setOpen(false);
    // Открываем дровер с вопросом ИИ и сразу собираем стартовый черновик —
    // предпросмотр открывается, дальше пользователь уточняет в чате.
    chat.openSidebar();
    chat.append({ role: "assistant", text: NEW_EMAIL_QUESTION });
    const draft = generateEmailDraft("");
    chat.openEmailEditor(nodeId, { isNew: true, draft });
  }

  function openExisting() {
    setOpen(false);
    // Письмо берём из справочника (если есть запись), иначе восстанавливаем
    // черновик из параметров ноды.
    const draft = selected
      ? draftFromRecord(selected)
      : {
          ...generateEmailDraft(""),
          name: params.subject || "Письмо",
          subject: params.subject,
          body: params.body,
          link: params.link ?? "",
          sender: params.sender,
        };
    chat.openSidebar();
    chat.openEmailEditor(nodeId, {
      emailId: selected?.id,
      draft,
    });
  }

  const rowGrid =
    "grid grid-cols-[minmax(72px,max-content)_1fr_auto] items-center gap-x-2.5 text-[11px]";

  return (
    <div className={cn(rowGrid, "px-1 py-0.5")}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        Текст
        {isDirty && <DirtyDot />}
      </span>

      <Popover open={open} onOpenChange={readOnly ? undefined : setOpen}>
        <PopoverTrigger
          disabled={readOnly}
          aria-label="Выбрать письмо"
          className={cn(
            "nodrag flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left transition-colors",
            !readOnly && "hover:bg-white/5 data-[popup-open]:bg-white/5",
            "focus-visible:bg-white/5 focus-visible:outline-none"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              "truncate",
              hasSelection ? "text-foreground" : "text-muted-foreground"
            )}
            title={displayValue}
          >
            {displayValue}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--anchor-width) min-w-72 p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder="Поиск письма" />
            <CommandList>
              <CommandGroup heading="Письма">
                {emails.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={e.name}
                    data-checked={selected?.id === e.id}
                    onSelect={() => selectEmail(e.id)}
                  >
                    <span className="truncate">{e.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__new__" onSelect={createNew}>
                  <Image src="/mascot-icon.svg" width={14} height={14} alt="" aria-hidden />
                  <span>Создать новое</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <span className="ml-1 flex shrink-0 items-center gap-1.5 text-muted-foreground/50">
        {hasSelection && (
          <button
            type="button"
            aria-label="Открыть письмо"
            title="Открыть"
            onClick={(e) => {
              e.stopPropagation();
              openExisting();
            }}
            className="nodrag flex items-center gap-1 rounded px-1 py-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            <span className="text-[10px]">Открыть</span>
          </button>
        )}
      </span>
    </div>
  );
}
