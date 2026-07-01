import { Phone } from "lucide-react";
import type { IvrParams } from "@/types/workflow";

/** Человеческие подписи типа голоса IVR (звонок — без визуального сообщения). */
export const VOICE_LABEL: Record<IvrParams["voiceType"], string> = {
  male: "Мужской",
  female: "Женский",
  neutral: "Нейтральный",
};

/**
 * Презентационный предпросмотр IVR — панель «сценарий звонка». У голосового
 * вызова нет визуального сообщения (как у sms/push), поэтому показываем сам
 * скрипт: ПОЛНЫЙ текст `scenario` целиком, с сохранением переносов строк
 * (whitespace-pre-wrap), с переносом длинных строк (break-words) и без обрезки —
 * тело дровера само скроллит длинный скрипт. Сверху — мета-строка с типом голоса.
 *
 * Тёплая тёмная палитра (без жёлтого — это не CTA и не активный элемент).
 * Текст рендерится как есть, включая переменные вида `{Имя}` (без подстановки).
 */
export function IvrRenderer({ params }: { params: IvrParams }) {
  const scenario = params.scenario.trim();

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {/* Мета-строка: канал звонка + тип голоса */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
          <div className="flex size-5 items-center justify-center rounded-[6px] bg-white/[0.08] text-muted-foreground">
            <Phone className="size-3" aria-hidden />
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Скрипт звонка
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground/50">
            Голос · {VOICE_LABEL[params.voiceType]}
          </span>
        </div>

        {/* Тело скрипта: весь текст, переносы сохранены, ничего не обрезается */}
        <div className="px-4 py-3.5">
          {scenario ? (
            <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground">
              {scenario}
            </p>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground/50">
              Текст скрипта
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
