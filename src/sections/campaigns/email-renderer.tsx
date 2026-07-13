"use client";

import { ImageIcon } from "lucide-react";
import type { EmailDraft } from "@/state/email-directory";
import { EditableText } from "./editable-text";

/**
 * Презентационный шаблон письма (~560px контент) для предпросмотра (спека A5):
 * отправитель → тема-заголовок → блоки тела → кнопка-CTA (link) → подвал.
 * Поля темы/тела/подписи CTA/ссылки редактируемы точечно (клик → инпут).
 * Inline-стили — письмо рисуется «как настоящее», вне токенов тёмной темы.
 */
export function EmailRenderer({
  draft,
  readOnly,
  onChange,
}: {
  draft: EmailDraft;
  readOnly?: boolean;
  onChange: (patch: Partial<EmailDraft>) => void;
}) {
  const blocks = draft.body.split(/\n\n+/);

  return (
    <div
      style={{
        background: "#f4f4f2",
        borderRadius: 12,
        padding: 20,
        color: "#1a1a1a",
        fontFamily: "var(--font-onest, sans-serif)",
      }}
    >
      {/* Шапка: отправитель */}
      <div
        style={{
          fontSize: 12,
          color: "#6b6b66",
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "1px solid #e2e2de",
        }}
      >
        От: {draft.sender || "Отправитель"}
      </div>

      {/* Картинка-плейсхолдер (стандартный блок, показать/скрыть) */}
      {draft.showImage && (
        <div
          style={{
            height: 120,
            background: "#e7e7e3",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9a9a93",
            marginBottom: 16,
          }}
        >
          <ImageIcon size={28} />
        </div>
      )}

      {/* Тема — заголовок письма */}
      <EditableText
        value={draft.subject}
        readOnly={readOnly}
        placeholder="Тема письма"
        onCommit={(v) => onChange({ subject: v })}
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 16,
          color: "#111",
        }}
      />

      {/* Тело — редактируется как единый блок (textarea) */}
      <EditableText
        value={draft.body}
        readOnly={readOnly}
        multiline
        placeholder="Текст письма"
        onCommit={(v) => onChange({ body: v })}
        renderDisplay={() => (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {blocks.map((b, i) => (
              <p key={i} style={{ fontSize: 15, lineHeight: 1.55, margin: 0, color: "#2a2a2a" }}>
                {b}
              </p>
            ))}
          </div>
        )}
      />

      {/* Кнопка-CTA → link (стандартный блок, показать/скрыть) */}
      {draft.showCta && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              display: "inline-flex",
              background: "#FFEC00",
              color: "#1a1a1a",
              fontWeight: 600,
              fontSize: 14,
              padding: "10px 22px",
              borderRadius: 8,
            }}
          >
            <EditableText
              value={draft.cta}
              readOnly={readOnly}
              placeholder="Перейти"
              onCommit={(v) => onChange({ cta: v })}
              style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#8a8a83" }}>
            Ссылка:{" "}
            <EditableText
              value={draft.link}
              readOnly={readOnly}
              placeholder="https://"
              onCommit={(v) => onChange({ link: v })}
              inline
              style={{ fontSize: 12, color: "#4a6fa5", textDecoration: "underline" }}
            />
          </div>
        </div>
      )}

      {/* Подвал */}
      <div
        style={{
          marginTop: 26,
          paddingTop: 14,
          borderTop: "1px solid #e2e2de",
          fontSize: 11,
          color: "#9a9a93",
          lineHeight: 1.5,
        }}
      >
        Вы получили это письмо, потому что подписаны на рассылку.
        <br />
        Отписаться · Настройки уведомлений
      </div>
    </div>
  );
}
