import { Bell } from "lucide-react";
import type { PushParams } from "@/types/workflow";

/**
 * Презентационный предпросмотр Push — карточка системного уведомления
 * (как баннер iOS/Android в тёмной теме): слот иконки приложения + имя + время,
 * жирный заголовок, тело. Тёплая тёмная палитра, без жёлтого акцента.
 * Текст рендерится как есть, включая переменные вида `{Имя}` (без подстановки).
 */
export function PushRenderer({ params }: { params: PushParams }) {
  const title = params.title.trim();
  const body = params.body.trim();

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
          <p className="text-[14px] font-semibold leading-snug text-foreground">
            {title || <span className="text-muted-foreground/50">Заголовок</span>}
          </p>

          {/* Тело */}
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground">
            {body || (
              <span className="text-muted-foreground/40">Текст уведомления</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
