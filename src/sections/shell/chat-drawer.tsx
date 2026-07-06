"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useChat } from "@/state/chat-context";
import { ChatPanelHeader } from "./chat-panel-header";
import { ChatHistoryList } from "./chat-history-list";
import {
  PromptComposer,
  DRAWER_INPUT_CLASS,
  type PromptComposerHandle,
} from "./prompt-composer";
import { DraftQueueList } from "./draft-queue-list";

const SIDEBAR_WIDTH_PX = 420;

function EmptyHistory() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <Image src="/mascot-icon.svg" alt="" width={32} height={32} aria-hidden />
      <p className="text-xs text-muted-foreground">
        Здесь будет история переписки с афина ИИ
      </p>
    </div>
  );
}

const EMAIL_PREVIEW_WIDTH_PX = 600;

/** Глобальный правый AI-drawer. Открывается кнопкой PanelRightOpen в PromptBar. */
export function ChatDrawer({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const composerRef = useRef<PromptComposerHandle>(null);
  const isSidebar = chat.mode === "sidebar";
  // Когда открыт редактор письма (A5), дровер встаёт на левую границу
  // предпросмотра, а канвас резервирует справа сумму обеих ширин.
  const emailPreviewOpen = chat.emailEditor.open;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const reserved =
      (isSidebar ? SIDEBAR_WIDTH_PX : 0) +
      (emailPreviewOpen ? EMAIL_PREVIEW_WIDTH_PX : 0);
    root.style.setProperty("--chat-sidebar-width", `${reserved}px`);
    return () => {
      root.style.removeProperty("--chat-sidebar-width");
    };
  }, [isSidebar, emailPreviewOpen]);

  return (
    <AnimatePresence>
      {isSidebar && (
        <motion.aside
          key="chat-drawer"
          data-testid="chat-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          style={{ right: "var(--email-preview-width, 0px)" }}
          className="fixed top-0 z-30 flex h-screen w-[420px] flex-col gap-3 border-l border-white/10 bg-[rgba(10,10,10,0.85)] p-4 backdrop-blur-[2px] transition-[right] duration-300"
        >
          <ChatPanelHeader
            mode={chat.mode}
            onOpenSidebar={chat.openSidebar}
            onCloseSidebar={chat.closeSidebar}
          />
          <DraftQueueList
            variant="drawer"
            onTakeDraft={(draft) => composerRef.current?.loadDraft(draft)}
          />
          {chat.messages.length === 0 ? (
            <EmptyHistory />
          ) : (
            <ChatHistoryList messages={chat.messages} />
          )}
          <PromptComposer
            ref={composerRef}
            placeholder={placeholder}
            inputClassName={DRAWER_INPUT_CLASS}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
