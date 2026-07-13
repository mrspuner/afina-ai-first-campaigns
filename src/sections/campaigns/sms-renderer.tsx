import type { SmsParams } from "@/types/workflow";
import { EditableText } from "./editable-text";

/** Инпут правки на тёмном превью — задаёт весь визуал (без светлых дефолтов). */
const EDIT_INPUT =
  "rounded-md border border-white/20 bg-white/10 text-foreground placeholder:text-muted-foreground/50 focus:border-white/40";

/**
 * Презентационный предпросмотр SMS — экран телефона с одним входящим пузырём
 * (как настоящий мессенджер в тёмной теме). Сверху — «контакт» (альфа-имя
 * отправителя), ниже слева — пузырь с текстом сообщения и временем.
 *
 * Тёплая тёмная палитра (без жёлтого — это не CTA и не активный элемент).
 * Текст рендерится как есть, включая переменные вида `{Имя}` (без подстановки).
 * При `readOnly=false` поля правятся точечно (клик → инпут), правка → onChange.
 */
export function SmsRenderer({
  params,
  readOnly = true,
  onChange,
}: {
  params: SmsParams;
  readOnly?: boolean;
  onChange?: (patch: Partial<SmsParams>) => void;
}) {
  const text = params.text.trim();
  const sender = params.alphaName.trim() || "Отправитель";
  const commit = (patch: Partial<SmsParams>) => onChange?.(patch);

  return (
    <div className="mx-auto w-full max-w-[320px]">
      {/* Корпус телефона */}
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d0c] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]">
        {/* Шапка разговора: контакт = альфа-имя */}
        <div className="flex flex-col items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-4 pb-3 pt-4">
          <div className="flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {sender.slice(0, 2)}
          </div>
          {readOnly ? (
            <div className="text-[13px] font-medium text-foreground">{sender}</div>
          ) : (
            <EditableText
              value={params.alphaName}
              placeholder="Альфа-имя"
              onCommit={(v) => commit({ alphaName: v })}
              className="text-[13px] font-medium text-foreground"
              inputClassName={`${EDIT_INPUT} px-2 py-0.5 text-center text-[13px]`}
              style={{ textAlign: "center" }}
            />
          )}
        </div>

        {/* Лента сообщений */}
        <div className="flex min-h-[150px] flex-col gap-1 px-3.5 py-4">
          <div className="text-center text-[10px] uppercase tracking-wide text-muted-foreground/40">
            SMS · сейчас
          </div>

          {/* Входящий пузырь (слева) */}
          <div className="flex flex-col items-start gap-1 pt-2">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-2.5">
              {readOnly ? (
                <p className="whitespace-pre-wrap text-[13.5px] leading-snug text-foreground">
                  {text || (
                    <span className="text-muted-foreground/50">Текст сообщения</span>
                  )}
                </p>
              ) : (
                <EditableText
                  value={params.text}
                  multiline
                  placeholder="Текст сообщения"
                  onCommit={(v) => commit({ text: v })}
                  className="whitespace-pre-wrap text-[13.5px] leading-snug text-foreground"
                  inputClassName={`${EDIT_INPUT} px-2 py-1 text-[13.5px]`}
                />
              )}
              {params.link ? (
                readOnly ? (
                  <p className="mt-1 break-all text-[12px] leading-snug text-sky-300/80 underline">
                    {params.link}
                  </p>
                ) : (
                  <EditableText
                    value={params.link}
                    placeholder="https://"
                    onCommit={(v) => commit({ link: v })}
                    className="mt-1 break-all text-[12px] leading-snug text-sky-300/80 underline"
                    inputClassName={`${EDIT_INPUT} mt-1 px-2 py-0.5 text-[12px]`}
                  />
                )
              ) : null}
            </div>
            <span className="pl-1 text-[10px] tabular-nums text-muted-foreground/40">
              12:30
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
