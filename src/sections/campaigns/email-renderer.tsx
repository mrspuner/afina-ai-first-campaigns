"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EmailDraft } from "@/state/email-directory";

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

/**
 * Точечно редактируемый текст: показ → клик → инпут/textarea → commit на blur
 * или Enter (для однострочных). В read-only — только показ.
 */
function EditableText({
  value,
  placeholder,
  onCommit,
  readOnly,
  multiline,
  inline,
  style,
  renderDisplay,
}: {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
  inline?: boolean;
  style?: React.CSSProperties;
  renderDisplay?: () => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setLocal(value);
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    setEditing(false);
    if (local !== value) onCommit(local);
  }

  if (editing && !readOnly) {
    const sharedStyle: React.CSSProperties = {
      ...style,
      width: "100%",
      background: "#fff",
      border: "1px solid #c9c9c3",
      borderRadius: 6,
      padding: multiline ? "8px 10px" : "4px 8px",
      outline: "none",
      // Нейтральный фокус — без жёлтого (жёлтый = редкий сигнал, не подсветка).
      boxShadow: "0 0 0 1px #b7b7b0, 0 0 0 3px rgba(120,120,120,0.18)",
      resize: multiline ? "vertical" : undefined,
    };
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="nodrag"
          value={local}
          rows={Math.max(4, local.split("\n").length + 1)}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          style={sharedStyle}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className="nodrag"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") setEditing(false);
        }}
        style={sharedStyle}
      />
    );
  }

  const Tag = inline ? "span" : "div";
  return (
    <Tag
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={() => !readOnly && setEditing(true)}
      onKeyDown={(e) => {
        if (!readOnly && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title={readOnly ? undefined : "Нажмите, чтобы изменить"}
      style={{
        ...style,
        cursor: readOnly ? "default" : "text",
        display: inline ? "inline" : "block",
        borderRadius: 4,
      }}
    >
      {renderDisplay
        ? renderDisplay()
        : value || (
            <span style={{ color: "#b5b5ad" }}>{placeholder}</span>
          )}
    </Tag>
  );
}
