"use client";

import { Eye, Pencil } from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";
import { useAppState } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import {
  channelForNodeKind,
  ivrNodePreviewTemplate,
  templateOptionsForKind,
} from "@/state/node-template-options";
import { CHANNEL_LABEL } from "@/state/channel-nodes";
import { NODE_STYLES, NODE_ICON } from "./node-visuals";

/** Ключ params, по которому текущий контент ноды сверяется с библиотекой
 *  шаблонов — совпадает с `TEMPLATE_MATCH_KEY` в graph-description.ts (то же
 *  сравнение, что и в тексте описания и в селекте «Шаблон» графа). Email тоже
 *  сверяется по `body`: с миграции «Шаблон» на `control:"template"` (см.
 *  `NODE_FIELD_EDITABILITY`) email резолвится РОВНО как sms/push. */
const TEMPLATE_MATCH_KEY: Partial<Record<"sms" | "email" | "push", string>> = {
  sms: "text",
  email: "body",
  push: "body",
};

/** Что показать в блоке + что делать по клику (undefined — блок не кликабелен,
 *  показывать нечего открыть). */
interface Resolved {
  label: string;
  open?: () => void;
}

/**
 * «Сценарий кампании» node-block for a first-touch communication node (A2.1 —
 * «Первое касание»): один блок на каждую sms/email/push/ivr ноду из
 * `firstTouchCommunicationNodes` (state/graph-description.ts), окрашен под
 * свой `nodeType` (node-visuals.ts, как и блок «Старта»).
 *
 * Показывает ТЕКУЩИЙ шаблон канала и открывает СУЩЕСТВУЮЩИЙ редактор —
 * ровно тот, что уже открывает «глаз»/«Открыть» у соответствующего поля
 * ноды в графе (тот же дровер, та же логика резолва «какой шаблон
 * привязан»). Выбор другого шаблона — вне рамок этой задачи: если поле
 * не резолвится к библиотеке, блок просто показывает сырой текст без клика,
 * как и в графе (нет «глаза» без резолвнутого шаблона).
 *
 * - sms/email/push: резолв как у `NodeTemplateSelect` — совпадение текущего
 *   text/body с содержимым шаблона канала; открывает `TemplatePreviewDrawer`.
 *   Email после миграции «Шаблон» на `control:"template"` (см.
 *   `NODE_FIELD_EDITABILITY`) резолвится ТАК ЖЕ, как sms/push — `EmailField`/
 *   `EmailEditorPanel` для графовых нод больше не используются.
 * - ivr: сценарий никогда не хранится в библиотеке — оборачивается в
 *   шаблон-однодневку (`ivrNodePreviewTemplate`), как «глаз» combo-поля
 *   «Текст» в графе; всегда кликабелен, если сценарий не пуст.
 *
 * `readOnly` (после запуска кампании) влияет только на иконку-аффорданс
 * (Pencil/Eye) — сам клик работает одинаково, ровно как «Изменить»/«Показать»
 * у `ScoringRow`: read-only ограничивает ПРАВКУ (её накладывает сам дровер —
 * использованный шаблон блокируется через `usedInCampaigns`), а не
 * возможность посмотреть.
 */
export function CampaignCommunicationNodeBlock({
  node,
  readOnly,
}: {
  node: WorkflowNode;
  readOnly: boolean;
}) {
  const { templates } = useAppState();
  const { openTemplatePreview } = useChat();
  const params = node.data.params;
  const nodeType = node.data.nodeType;
  const style = NODE_STYLES[nodeType];
  const Icon = NODE_ICON[nodeType];

  if (!params) return null;

  const channel = channelForNodeKind(params.kind);
  const channelLabel = channel ? CHANNEL_LABEL[channel] : node.data.label;

  let resolved: Resolved | null = null;

  if (params.kind === "sms" || params.kind === "email" || params.kind === "push") {
    const matchKey = TEMPLATE_MATCH_KEY[params.kind]!;
    const current = (params as unknown as Record<string, unknown>)[matchKey];
    const matched = templateOptionsForKind(templates, params.kind).find(
      (t) => (t.content as unknown as Record<string, unknown>)[matchKey] === current,
    );
    resolved = matched
      ? { label: matched.name, open: () => openTemplatePreview(matched.id) }
      : { label: (current as string) || "—" };
  } else if (params.kind === "ivr") {
    const text = params.scenario.trim();
    resolved = {
      label: text || "—",
      open: text
        ? () => openTemplatePreview(ivrNodePreviewTemplate(node.id, params))
        : undefined,
    };
  }

  if (!resolved) return null;

  return (
    <div
      data-testid={`comm-node-block-${node.id}`}
      className="flex min-w-[180px] flex-col gap-2 rounded-lg px-3.5 py-3"
      style={{ border: `1px solid ${style.border}`, background: style.bg }}
    >
      <div
        className="flex items-center gap-1.5 text-[11px] font-medium"
        style={{ color: style.color }}
      >
        {Icon && <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />}
        <span>{channelLabel}</span>
      </div>
      <div className="border-t border-white/5 pt-2">
        {resolved.open ? (
          <button
            type="button"
            onClick={resolved.open}
            aria-label={
              readOnly
                ? `Показать шаблон: ${resolved.label}`
                : `Изменить шаблон: ${resolved.label}`
            }
            className="group flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1 truncate text-foreground" title={resolved.label}>
              {resolved.label}
            </span>
            {readOnly ? (
              <Eye
                className="h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
                aria-hidden
              />
            ) : (
              <Pencil
                className="h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
                aria-hidden
              />
            )}
          </button>
        ) : (
          <span
            className="block truncate px-1 py-0.5 text-[11px] text-foreground"
            title={resolved.label}
          >
            {resolved.label}
          </span>
        )}
      </div>
    </div>
  );
}
