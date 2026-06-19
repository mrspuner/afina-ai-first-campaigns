"use client";

import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/state/app-state-context";
import { isOnWelcome, isWorkflowView } from "@/state/app-state";
import { getNodeColor } from "@/sections/campaigns/node-visuals";
import { useChat } from "@/state/chat-context";
import { PromptBar } from "./prompt-bar";
import {
  PromptComposer,
  SHELL_INPUT_CLASS,
  type PromptComposerHandle,
} from "./prompt-composer";
import { DraftQueueList } from "./draft-queue-list";
import { TransientReply } from "./transient-reply";

/**
 * Нижний промпт-бар для всех экранов, кроме guided-campaign (там ChatPanel).
 * Тонкая обёртка над общим {@link PromptComposer} — submit/clear/подсказки и
 * состояние едины с drawer и chat-panel.
 */
export function ShellBottomBar() {
  const state = useAppState();
  const { view, selectedWorkflowNode } = state;
  const chat = useChat();
  const composerRef = useRef<PromptComposerHandle>(null);

  // B1: при выборе ноды в workflow бар коротко подсвечивается её цветом.
  // Токен растёт только при смене id ноды — повторный выбор той же ноды не
  // перезапускает анимацию (без анти-мерцания).
  const [glow, setGlow] = useState<{ color: string; token: number } | null>(null);
  const prevNodeIdRef = useRef<string | null>(null);
  const glowTokenRef = useRef(0);
  const selectedNodeId =
    view.kind === "workflow" ? selectedWorkflowNode?.id ?? null : null;
  const selectedNodeType =
    view.kind === "workflow" ? selectedWorkflowNode?.nodeType : undefined;
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevNodeIdRef.current) {
      glowTokenRef.current += 1;
      setGlow({
        color: getNodeColor(selectedNodeType ?? "default"),
        token: glowTokenRef.current,
      });
    }
    prevNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId, selectedNodeType]);

  const chatPlaceholder = isOnWelcome(state)
    ? "Задайте вопрос…"
    : isWorkflowView(state)
      ? "Опишите изменение сценария..."
      : view.kind === "guided-campaign"
          ? "Введите ваши параметры или задайте вопрос"
          : view.kind === "section" && view.name === "Кампании"
            ? "Напишите, что вы хотите сделать"
            : "Выберите шаг или задайте вопрос…";

  return (
    <PromptBar
      onOpenDrawer={chat.openSidebar}
      glow={glow}
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
        placeholder={chatPlaceholder}
        captureGlobalTyping
        inputClassName={SHELL_INPUT_CLASS}
      />
    </PromptBar>
  );
}
