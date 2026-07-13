"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Точечно редактируемый текст: показ → клик → инпут/textarea → commit на blur
 * или Enter (для однострочных). В read-only — только показ.
 *
 * По умолчанию инпут светлый (для письма на светлом фоне). Для тёмных превью
 * (SMS/push) передайте `inputClassName` — тогда светлые inline-визуалы
 * (белый фон/рамка/ring) НЕ применяются, стиль полностью задаёт className.
 * `className` вешается на элемент показа (напр. Tailwind-цвет текста).
 */
export function EditableText({
  value,
  placeholder,
  onCommit,
  readOnly,
  multiline,
  inline,
  style,
  className,
  inputClassName,
  renderDisplay,
}: {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
  inline?: boolean;
  style?: React.CSSProperties;
  className?: string;
  inputClassName?: string;
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
    // Структурные стили — всегда. Светлые визуалы — только когда inputClassName
    // не задан (режим письма). В тёмном режиме визуал задаёт inputClassName.
    const lightVisual: React.CSSProperties = inputClassName
      ? {}
      : {
          background: "#fff",
          border: "1px solid #c9c9c3",
          // Нейтральный фокус — без жёлтого.
          boxShadow: "0 0 0 1px #b7b7b0, 0 0 0 3px rgba(120,120,120,0.18)",
        };
    const sharedStyle: React.CSSProperties = {
      ...style,
      width: "100%",
      borderRadius: 6,
      padding: multiline ? "8px 10px" : "4px 8px",
      outline: "none",
      resize: multiline ? "vertical" : undefined,
      ...lightVisual,
    };
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={inputClassName ?? "nodrag"}
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
        className={inputClassName ?? "nodrag"}
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
      className={className}
      style={{
        ...style,
        cursor: readOnly ? "default" : "text",
        display: inline ? "inline" : "block",
        borderRadius: 4,
      }}
    >
      {renderDisplay
        ? renderDisplay()
        : value || <span style={{ color: "#b5b5ad" }}>{placeholder}</span>}
    </Tag>
  );
}
