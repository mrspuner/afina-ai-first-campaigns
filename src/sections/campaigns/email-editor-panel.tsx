"use client";

import { ImageIcon, MousePointerClick, X } from "lucide-react";
import { useLayoutEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useChat } from "@/state/chat-context";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { addEmail } from "@/state/email-directory";
import type { NodeParams } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { EmailRenderer } from "./email-renderer";

const PREVIEW_WIDTH_PX = 600;

/**
 * Панель предпросмотра-редактора письма (спека A5). Фиксирована у правого края
 * (~600px). Рендерит черновик письма из chat-context (EmailRenderer),
 * правки идут вручную (в превью) и через ИИ (чат дровера слева).
 * «Сохранить» пишет subject/body/link в параметры ноды и добавляет письмо в
 * справочник; «Закрыть» возвращает дровер к правому краю.
 */
export function EmailEditorPanel() {
  const chat = useChat();
  const appState = useAppState();
  const dispatch = useAppDispatch();
  const { open, nodeId, draft, preview } = chat.emailEditor;

  // Только на просмотр: либо письмо открыто из карточки шаблона (#32, preview),
  // либо это запущенная/просматриваемая кампания.
  const readOnly =
    preview || (appState.view.kind === "workflow" && appState.view.launched);

  // Канвас резервирует справа ширину предпросмотра — через --email-preview-width
  // (дровер дополнительно читает её, чтобы встать на левую границу превью).
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--email-preview-width",
      open ? `${PREVIEW_WIDTH_PX}px` : "0px"
    );
    return () => {
      root.style.removeProperty("--email-preview-width");
    };
  }, [open]);

  // #7 — «Сохранить» убрана: изменения письма применяются к ноде автоматически
  // при закрытии редактора (и записываются в справочник писем). Read-only —
  // просто закрываемся, ничего не применяя.
  function applyToNode() {
    if (!draft || !nodeId) return;
    // Письмо в справочник: обновляем существующее (по id) или создаём новое.
    const saved = addEmail({
      id: draft.id,
      name: draft.name || draft.subject || "Без названия",
      subject: draft.subject,
      body: draft.body,
      link: draft.link,
      cta: draft.cta,
      sender: draft.sender,
    });
    // Контент письма + ссылка на запись пишутся в параметры ноды.
    dispatch({
      type: "workflow_node_field_set",
      nodeId,
      patch: {
        subject: draft.subject,
        body: draft.body,
        link: draft.link,
        sender: draft.sender,
        emailId: saved.id,
      } as Partial<NodeParams>,
    });
  }

  function handleClose() {
    if (!readOnly) applyToNode();
    chat.closeEmailEditor();
  }

  return (
    <AnimatePresence>
      {open && draft && (
        <motion.aside
          key="email-editor-panel"
          data-testid="email-editor-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          className="fixed right-0 top-0 z-40 flex h-screen w-[600px] flex-col border-l border-white/10 bg-[rgba(14,14,12,0.96)] backdrop-blur-[2px]"
        >
          {/* Шапка панели */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/60">
                Письмо
              </span>
              <input
                value={draft.name}
                readOnly={readOnly}
                onChange={(e) => chat.setEmailDraft({ name: e.target.value })}
                placeholder="Название письма"
                className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={handleClose}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Тулбар стандартных блоков (показать/скрыть) */}
          {!readOnly && (
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
              <BlockToggle
                active={draft.showCta}
                onClick={() => chat.setEmailDraft({ showCta: !draft.showCta })}
                icon={<MousePointerClick className="size-3.5" />}
                label="Кнопка"
              />
              <BlockToggle
                active={draft.showImage}
                onClick={() => chat.setEmailDraft({ showImage: !draft.showImage })}
                icon={<ImageIcon className="size-3.5" />}
                label="Картинка"
              />
            </div>
          )}

          {/* Предпросмотр письма */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <EmailRenderer
              draft={draft}
              readOnly={readOnly}
              onChange={(patch) => chat.setEmailDraft(patch)}
            />
          </div>

          {/* #7 — «Сохранить» убрана. Read-only → «Закрыть» (ghost); в режиме
              правки → «Готово» (акцент): применяет изменения к ноде и закрывает. */}
          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            {readOnly ? (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Закрыть
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-[#FFEC00] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
              >
                Готово
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function BlockToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-[#FFEC00]/40 bg-[#FFEC00]/10 text-foreground"
          : "border-white/10 text-muted-foreground hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
