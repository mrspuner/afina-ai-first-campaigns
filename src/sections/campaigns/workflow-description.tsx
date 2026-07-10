"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { DescriptionMessage, DescriptionStage } from "@/state/graph-description";
import { DRAWER_HINT, SPINNER_TEXT, type EditPhase } from "@/sections/shell/use-campaign-edit-flow";

const PLACEHOLDER = "Что вы хотите исправить?";

/**
 * Уточнение коммуникации после названия канала: имя шаблона, а для письма без
 * резолвнутого шаблона — тема. Пустая строка, когда не за что зацепиться.
 */
function qualifier(message: DescriptionMessage): string {
  if (message.templateName) return `, шаблон «${message.templateName}»`;
  if (message.subject) return `, тема «${message.subject}»`;
  return "";
}

interface WorkflowDescriptionProps {
  stages: DescriptionStage[];
  /** Правка доступна только до запуска — как read-only режим скоринг-дровера. */
  canEdit: boolean;
  /** Фаза правки: модель думает / задаёт вопросы в дровере / покой. */
  phase?: EditPhase;
  /** Текст ошибки модели, показывается под кнопкой входа в правку. */
  error?: string | null;
  onSubmitEdit?: (text: string) => void;
  onCancelEdit?: () => void;
}

/**
 * Текстовое описание цепочки кампании + вход в правку.
 *
 * Описание — ТОЛЬКО связный текст: подзаголовки этапов жирным, тексты сообщений
 * в кавычках. Никаких карточек нод — граф живёт отдельной миниатюрой ниже.
 *
 * Правка идёт через текст, поэтому «Изменить» стоит сразу под ним. Пока модель
 * готовит уточняющие вопросы и пока пользователь на них отвечает, описание
 * размыто: править его в этот момент бессмысленно, а блюр честно показывает,
 * что кампания «в работе». Граф и шаблоны не меняются ни на одном шаге.
 */
export function WorkflowDescription({
  stages,
  canEdit,
  phase = "idle",
  error = null,
  onSubmitEdit,
  onCancelEdit,
}: WorkflowDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const busy = phase === "working" || phase === "asking";

  function open() {
    setDraft("");
    setEditing(true);
  }

  function cancelInput() {
    setEditing(false);
    setDraft("");
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setEditing(false);
    setDraft("");
    onSubmitEdit?.(text);
  }

  if (!stages.length) return null;

  return (
    <div className="flex flex-col gap-5">
      <div
        data-testid="description-body"
        className={cn(
          "flex flex-col gap-3 text-sm leading-relaxed text-foreground transition-[filter,opacity] duration-300",
          busy && "pointer-events-none select-none blur-[3px] opacity-60",
        )}
        aria-busy={busy}
      >
        {stages.map((stage) => (
          <div key={stage.id} className="flex flex-col gap-1.5">
            <p>
              <strong className="font-semibold text-foreground">{stage.heading}</strong>{" "}
              {stage.body}
            </p>
            {stage.messages && (
              <ul className="flex flex-col gap-1 pl-1">
                {stage.messages.map((message) => (
                  <li key={`${message.channel}|${message.text}`}>
                    {/* Тело описания белое, поэтому канал выделяем весом,
                        а не цветом — иначе строка потеряла бы точку опоры. */}
                    — <span className="font-medium">{message.channel}</span>
                    {qualifier(message)}: «{message.text}»
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {busy ? (
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2.5 text-sm text-foreground">
            {phase === "working" ? (
              <>
                <Spinner className="h-4 w-4" />
                {SPINNER_TEXT}
              </>
            ) : (
              DRAWER_HINT
            )}
          </div>
          <Button variant="secondary" onClick={onCancelEdit}>
            Отмена
          </Button>
        </div>
      ) : (
        canEdit &&
        (editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              ref={inputRef}
              value={draft}
              aria-label={PLACEHOLDER}
              placeholder={PLACEHOLDER}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelInput();
              }}
            />
            {/* Вторичная, не primary: рядом на карточке стоит «Запустить» —
                главное действие; две одинаково светлых кнопки конкурировали бы. */}
            <Button type="submit" variant="secondary">
              Отправить
            </Button>
            <Button type="button" variant="ghost" onClick={cancelInput}>
              Отмена
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={open} className="w-fit gap-2">
              <Pencil className="h-4 w-4" aria-hidden />
              Изменить
            </Button>
            {error && <p className="text-sm text-muted-foreground">{error}</p>}
          </div>
        ))
      )}
    </div>
  );
}
