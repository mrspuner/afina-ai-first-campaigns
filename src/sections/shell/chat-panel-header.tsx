// src/sections/shell/chat-panel-header.tsx
"use client";

import Image from "next/image";
import { PanelRightOpen, X } from "lucide-react";
import type { ChatPanelMode } from "@/state/chat-context";

interface ChatPanelHeaderProps {
  mode: ChatPanelMode;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
}

export function ChatPanelHeader({ mode, onOpenSidebar, onCloseSidebar }: ChatPanelHeaderProps) {
  const inSidebar = mode === "sidebar";
  return (
    <div className="flex w-full items-center justify-between px-1 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Image src="/mascot-icon.svg" alt="" width={14} height={14} aria-hidden className="shrink-0" />
        афина ИИ
      </span>
      <div className="flex items-center">
        {inSidebar ? (
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label="Закрыть drawer"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Открыть в drawer"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
