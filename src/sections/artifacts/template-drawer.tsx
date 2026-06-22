"use client";

import type { Channel } from "@/types/campaign";
import type { TemplateDrawerState, TemplateDrawerVariant } from "@/state/chat-context";
import { CHANNEL_LABEL } from "@/sections/campaigns/campaign-cost";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────────────────

const CHANNELS: Channel[] = ["sms", "email", "push", "ivr"];

export interface TemplateDrawerViewProps {
  open: boolean;
  step: TemplateDrawerState["step"];
  channel: Channel | null;
  intent: string;
  variants: TemplateDrawerVariant[];
  selectedId: string | null;
  generating: boolean;
  onClose: () => void;
  onSelectChannel: (channel: Channel) => void;
  onIntentChange: (intent: string) => void;
  onGenerate: () => void;
  onSelectVariant: (id: string) => void;
  onSave: () => void;
}

// ── Presentational component ──────────────────────────────────────────────────

/**
 * TemplateDrawerView — пошаговый drawer создания шаблона (#15).
 * Чистый presentational: не обращается к контексту.
 * Три шага: channel → intent → variants.
 */
export function TemplateDrawerView({
  open,
  step,
  channel,
  intent,
  variants,
  selectedId,
  generating,
  onClose,
  onSelectChannel,
  onIntentChange,
  onGenerate,
  onSelectVariant,
  onSave,
}: TemplateDrawerViewProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Создать шаблон"
      data-testid="template-drawer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="relative flex w-[480px] max-h-[80vh] flex-col rounded-lg border border-white/10 bg-[#0e0e0e] p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">Создать шаблон</h2>
          <button
            type="button"
            aria-label="закрыть"
            className="rounded p-1 text-muted-foreground hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step: channel */}
        {step === "channel" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Выберите канал</p>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => onSelectChannel(ch)}
                  className={[
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    channel === ch
                      ? "border-[#FFEC00] bg-[#FFEC00]/10 text-[#FFEC00]"
                      : "border-white/15 text-white/70 hover:border-white/30 hover:text-white",
                  ].join(" ")}
                >
                  {CHANNEL_LABEL[ch]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: intent */}
        {step === "intent" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Опишите, что нужно донести до клиента. Укажите тему, оффер или тон.
            </p>
            <textarea
              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none resize-none"
              rows={4}
              placeholder="Например: приветственное SMS с предложением на первый кредит, дружелюбный тон"
              value={intent}
              onChange={(e) => onIntentChange(e.target.value)}
            />

            {generating ? (
              <div
                data-testid="template-drawer-generating"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Image src="/mascot-icon.svg" alt="" width={20} height={20} aria-hidden />
                <span>Афина генерирует варианты…</span>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!intent.trim()}
                onClick={onGenerate}
              >
                Сгенерировать варианты
              </Button>
            )}
          </div>
        )}

        {/* Step: variants */}
        {step === "variants" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Выберите вариант для сохранения
            </p>
            <div className="flex flex-col gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVariant(v.id)}
                  className={[
                    "rounded border p-3 text-left text-sm transition-colors",
                    selectedId === v.id
                      ? "border-[#FFEC00] bg-[#FFEC00]/5 text-white"
                      : "border-white/10 text-white/80 hover:border-white/20",
                  ].join(" ")}
                >
                  <span className="font-medium">{v.name}</span>
                </button>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              disabled={!selectedId}
              onClick={onSave}
            >
              Сохранить шаблон
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Connected component ───────────────────────────────────────────────────────

import { nanoid } from "nanoid";
import { useCallback } from "react";
import { useChat } from "@/state/chat-context";
import { useAppDispatch } from "@/state/app-state-context";

const TEMPLATE_GENERATE_URL = "/api/ai/create-template";

/**
 * TemplateDrawer (connected) — монтируется один раз в page.tsx рядом с ChatDrawer.
 * Читает состояние из ChatContext, диспатчит в AppState через useAppDispatch.
 */
export function TemplateDrawer() {
  const chat = useChat();
  const dispatch = useAppDispatch();
  const { templateDrawer } = chat;

  const handleSave = useCallback(() => {
    const variant = templateDrawer.variants.find((v) => v.id === templateDrawer.selectedId);
    if (!variant || !templateDrawer.channel) return;
    dispatch({
      type: "template_added",
      template: {
        id: `tpl_${nanoid(8)}`,
        channel: templateDrawer.channel,
        name: variant.name,
        content: variant.content,
        usedInCampaigns: 0,
      },
    });
    chat.closeTemplateDrawer();
  }, [templateDrawer, dispatch, chat]);

  const handleGenerate = useCallback(async () => {
    if (!templateDrawer.channel || !templateDrawer.intent.trim()) return;
    chat.setTemplateGenerating(true);

    try {
      const res = await fetch(TEMPLATE_GENERATE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: templateDrawer.channel,
          intent: templateDrawer.intent,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const json = (await res.json()) as { variants?: Array<{ name: string; content: Record<string, unknown> }> };
      const variants: TemplateDrawerVariant[] = (json.variants ?? []).map((v) => ({
        id: nanoid(6),
        name: v.name,
        content: v.content as TemplateDrawerVariant["content"],
      }));
      chat.setTemplateVariants(variants);
    } catch {
      // On failure: leave intent step so user can retry
      chat.setTemplateGenerating(false);
    } finally {
      chat.setTemplateGenerating(false);
    }
  }, [templateDrawer, chat]);

  return (
    <TemplateDrawerView
      open={templateDrawer.open}
      step={templateDrawer.step}
      channel={templateDrawer.channel}
      intent={templateDrawer.intent}
      variants={templateDrawer.variants}
      selectedId={templateDrawer.selectedId}
      generating={templateDrawer.generating}
      onClose={chat.closeTemplateDrawer}
      onSelectChannel={chat.setTemplateChannel}
      onIntentChange={chat.setTemplateIntent}
      onGenerate={handleGenerate}
      onSelectVariant={chat.setTemplateSelected}
      onSave={handleSave}
    />
  );
}
