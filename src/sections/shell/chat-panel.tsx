"use client";

import { useRef } from "react";
import { useChat } from "@/state/chat-context";
import { PromptBar } from "./prompt-bar";
import {
  PromptComposer,
  DRAWER_INPUT_CLASS,
  type PromptComposerHandle,
} from "./prompt-composer";
import { DraftQueueList } from "./draft-queue-list";
import { TransientReply } from "./transient-reply";

/** Промпт-бар для guided-campaign. Тот же PromptComposer, что в шелле и drawer. */
export function ChatPanel({ placeholder }: { placeholder: string }) {
  const chat = useChat();
  const composerRef = useRef<PromptComposerHandle>(null);

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      slot={
        <>
          <DraftQueueList
            variant="compact"
            onTakeDraft={(draft) => composerRef.current?.loadDraft(draft)}
          />
          <TransientReply messages={chat.messages} />
        </>
      }
    >
      <PromptComposer
        ref={composerRef}
        placeholder={placeholder}
        captureGlobalTyping
        inputClassName={DRAWER_INPUT_CLASS}
      />
    </PromptBar>
  );
}
