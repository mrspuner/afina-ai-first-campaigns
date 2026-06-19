"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";
import { isCampaignDone, isOnWelcome } from "@/state/app-state";
import { useChat } from "@/state/chat-context";
import {
  POST_CAMPAIGN_REPLY,
  POST_ONBOARDING_CHIPS,
  WAVE_0_CHIPS,
  WAVES,
  type Chip,
} from "./onboarding-chat";

export type OnboardingChatState = {
  /** Чипы текущей волны онбординга (для SuggestionBar через welcome-wave scope). */
  chips: Chip[];
  submitChip: (chip: Chip) => void;
};

// Пауза между сообщением пользователя и появлением «думающего» пузыря бота.
const PRE_THINK_DELAY_MS = 260;
// Сколько бот «думает» (точки) до материализации ответа.
const THINK_DELAY_MS = 1000;

/**
 * Онбординг-чат welcome-экрана. Раньше держал собственную инлайн-историю,
 * из-за чего welcome-экран «морфился». Теперь пишет в ОБЩИЙ чат (`useChat`) и
 * открывает drawer — поведение унифицировано со всем интерфейсом. Локальным
 * остаётся только состояние волн (`chips`): граф WAVES и его прогрессия
 * сохранены, меняется лишь поверхность вывода.
 *
 * Требует, чтобы хук вызывался внутри `<ChatProvider>` (см. WelcomeChatBridge
 * в page.tsx) — иначе `useChat()` бросит.
 */
export function useOnboardingChat(): OnboardingChatState {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const chat = useChat();
  const done = isCampaignDone(state);
  const onWelcome = isOnWelcome(state);

  const [chips, setChips] = useState<Chip[]>(
    done ? POST_ONBOARDING_CHIPS : WAVE_0_CHIPS
  );

  const preThinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReplyTimer = () => {
    if (preThinkTimerRef.current) {
      clearTimeout(preThinkTimerRef.current);
      preThinkTimerRef.current = null;
    }
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearReplyTimer();
  }, []);

  // Сброс волн при (повторном) входе на welcome без завершённого онбординга
  // либо при смене `done`. Историю чата сбрасывает сам ChatProvider (по смене
  // view), здесь возвращаем только стартовые чипы.
  const prevOnWelcome = useRef(onWelcome);
  const prevDone = useRef(done);
  useEffect(() => {
    const enteredWelcome = !prevOnWelcome.current && onWelcome;
    const doneChanged = prevDone.current !== done;
    if (enteredWelcome || doneChanged) {
      clearReplyTimer();
      // Синхронизация волн с маршрутом (вход на welcome / смена done) —
      // намеренный setState в эффекте, как и в прочих route-эффектах проекта.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChips(done ? POST_ONBOARDING_CHIPS : WAVE_0_CHIPS);
    }
    prevOnWelcome.current = onWelcome;
    prevDone.current = done;
  }, [onWelcome, done]);

  // Двухшаговый показ ответа в общем чате: pending-пузырь → текст на месте.
  const queueBotReply = useCallback(
    (botText: string, chipsAfter: Chip[]) => {
      clearReplyTimer();
      setChips([]);
      preThinkTimerRef.current = setTimeout(() => {
        const id = chat.append({ role: "assistant", text: "", pending: true });
        preThinkTimerRef.current = null;
        replyTimerRef.current = setTimeout(() => {
          chat.updatePending(id, botText);
          setChips(chipsAfter);
          replyTimerRef.current = null;
        }, THINK_DELAY_MS);
      }, PRE_THINK_DELAY_MS);
    },
    [chat]
  );

  const submitChip = useCallback(
    (chip: Chip) => {
      if (!done) {
        const node = WAVES[chip.next];
        if (!node) return; // create-signal убран — таких чипов больше нет
        chat.openSidebar();
        chat.append({ role: "user", text: chip.label });
        // wave-3-repeat зацикливался на себя — после удаления create-signal
        // ветка просто завершается (без чипов).
        const nextChips = chip.next === "wave-3-repeat" ? [] : node.chips;
        queueBotReply(node.answer, nextChips);
        return;
      }

      // Post-onboarding (после запуска первой кампании).
      if (chip.next === "post-create-signal") {
        clearReplyTimer();
        setChips([]);
        dispatch({ type: "start_campaign_flow" });
        return;
      }
      if (chip.next === "post-create-campaign") {
        chat.openSidebar();
        chat.append({ role: "user", text: chip.label });
        queueBotReply(POST_CAMPAIGN_REPLY, POST_ONBOARDING_CHIPS);
      }
    },
    [chat, dispatch, done, queueBotReply]
  );

  return { chips, submitChip };
}
