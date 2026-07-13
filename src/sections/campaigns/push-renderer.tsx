import { Bell } from "lucide-react";
import type { PushParams } from "@/types/workflow";
import { EditableText } from "./editable-text";

/** Инпут правки на тёмном превью — задаёт весь визуал (без светлых дефолтов). */
const EDIT_INPUT =
  "rounded-md border border-white/20 bg-white/10 text-foreground placeholder:text-muted-foreground/50 focus:border-white/40";

/**
 * Презентационный предпросмотр Push — карточка системного уведомления
 * (как баннер iOS/Android в тёмной теме): слот иконки приложения + имя + время,
 * жирный заголовок, тело. Тёплая тёмная палитра, без жёлтого акцента.
 * Текст рендерится как есть, включая переменные вида `{Имя}` (без подстановки).
 * При `readOnly=false` заголовок/тело правятся точечно (клик → инпут).
 */
export function PushRenderer({
  params,
  readOnly = true,
  onChange,
}: {
  params: PushParams;
  readOnly?: boolean;
  onChange?: (patch: Partial<PushParams>) => void;
}) {
  const title = params.title.trim();
  const body = params.body.trim();
  const commit = (patch: Partial<PushParams>) => onChange?.(patch);

  return (
    <div className="mx-auto w-full max-w-[340px]">
      {/* Подложка «экрана» — даёт уведомлению контекст баннера */}
      <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.015] p-3">
        {/* Карточка уведомления */}
        <div className="rounded-2xl border border-white/10 bg-[#1a1a18]/95 px-3.5 py-3 shadow-[0_18px_44px_-22px_rgba(0,0,0,0.85)] backdrop-blur-sm">
          {/* Строка приложения: иконка + имя + время */}
          <div className="mb-1.5 flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded-[6px] bg-white/[0.08] text-muted-foreground">
              <Bell className="size-3" aria-hidden />
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Афина
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground/40">
              сейчас
            </span>
          </div>

          {/* Заголовок */}
          {readOnly ? (
            <p className="text-[14px] font-semibold leading-snug text-foreground">
              {title || <span className="text-muted-foreground/50">Заголовок</span>}
            </p>
          ) : (
            <EditableText
              value={params.title}
              placeholder="Заголовок"
              onCommit={(v) => commit({ title: v })}
              className="text-[14px] font-semibold leading-snug text-foreground"
              inputClassName={`${EDIT_INPUT} px-2 py-1 text-[14px] font-semibold`}
            />
          )}

          {/* Тело */}
          {readOnly ? (
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground">
              {body || (
                <span className="text-muted-foreground/40">Текст уведомления</span>
              )}
            </p>
          ) : (
            <EditableText
              value={params.body}
              multiline
              placeholder="Текст уведомления"
              onCommit={(v) => commit({ body: v })}
              className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground"
              inputClassName={`${EDIT_INPUT} mt-0.5 px-2 py-1 text-[13px]`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
