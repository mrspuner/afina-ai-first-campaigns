"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DescriptionMessage, DescriptionStage } from "@/state/graph-description";

const PLACEHOLDER = "Что вы хотите исправить?";
const NOT_YET = "Пока не могу применить правку — эта возможность появится позже.";

/**
 * Уточнение коммуникации после названия канала: имя шаблона, а для письма без
 * резолвнутого шаблона — тема. Пустая строка, когда не за что зацепиться.
 */
function qualifier(message: DescriptionMessage): string {
  if (message.templateName) return `, шаблон «${message.templateName}»`;
  if (message.subject) return `, тема «${message.subject}»`;
  return "";
}

/**
 * Текстовое описание цепочки кампании + вход в правку.
 *
 * Описание — ТОЛЬКО связный текст: подзаголовки этапов жирным, тексты сообщений
 * в кавычках. Никаких карточек нод и плашек — граф живёт отдельной миниатюрой
 * под этим блоком.
 *
 * Правка идёт через текст, поэтому «Изменить» стоит сразу под ним. На этой
 * итерации вход честно инертен: граф, шаблоны и миниатюра не меняются, редьюсер
 * не задействуется — всё состояние локальное.
 */
export function WorkflowDescription({ stages }: { stages: DescriptionStage[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [answered, setAnswered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft("");
    setAnswered(false);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft("");
  }

  function submit() {
    if (!draft.trim()) return;
    // Правка не применяется — ни к графу, ни к шаблонам. Только честный ответ.
    setEditing(false);
    setDraft("");
    setAnswered(true);
  }

  if (!stages.length) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
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
                    — <span className="text-foreground">{message.channel}</span>
                    {qualifier(message)}: «{message.text}»
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {editing ? (
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
              if (e.key === "Escape") cancel();
            }}
          />
          {/* Вторичная, не primary: жёлтый в карточке уже занят «Запустить». */}
          <Button type="submit" variant="secondary">
            Отправить
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Отмена
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={open} className="w-fit gap-2">
            <Pencil className="h-4 w-4" aria-hidden />
            Изменить
          </Button>
          {answered && <p className="text-sm text-muted-foreground">{NOT_YET}</p>}
        </div>
      )}
    </div>
  );
}
