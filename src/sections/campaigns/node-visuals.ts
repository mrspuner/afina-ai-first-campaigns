import {
  Radar,
  Database,
  Gauge,
  GitFork,
  Clock,
  GitBranch,
  MessageSquare,
  Mail,
  Bell,
  Phone,
  CheckCircle2,
  CircleStop,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNodeType } from "@/types/workflow";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export interface NodeStyle {
  border: string;
  bg: string;
  color: string;
}

/** Цвета узлов workflow. Источник правды для самой карточки И для тегов (M5). */
export const NODE_STYLES: Record<WorkflowNodeType, NodeStyle> = {
  // Endpoints
  signal:     { border: "#1e3a8a", bg: "#050815", color: "#93c5fd" },
  // source/scoring: provisional — reuse the legacy `signal` node's palette/icon
  // until the UI-decision (spec §7.7) is confirmed with the user.
  source:     { border: "#1e3a8a", bg: "#050815", color: "#93c5fd" },
  scoring:    { border: "#1e3a8a", bg: "#050815", color: "#93c5fd" },
  success:    { border: "#14532d", bg: "#030d06", color: "#4ade80" },
  end:        { border: "#374151", bg: "#0a0a0a", color: "#9ca3af" },
  // Logic
  split:      { border: "#5a2f52", bg: "#241020", color: "#e08bd0" },
  wait:       { border: "#4a3c1c", bg: "#2a2314", color: "#f2b34a" },
  condition:  { border: "#5a2f52", bg: "#241020", color: "#e08bd0" },
  // Communication
  sms:        { border: "#2f6b4d", bg: "#12241b", color: "#8ff0c4" },
  email:      { border: "#523a78", bg: "#1b1327", color: "#d6bcff" },
  push:       { border: "#2f5580", bg: "#111d2b", color: "#a9caff" },
  ivr:        { border: "#7a5730", bg: "#271a10", color: "#ffcf9e" },
  // Legacy
  default:    { border: "#2a2a2a", bg: "#111111", color: "#e5e5e5" },
  channel:    { border: "#2f6b4d", bg: "#12241b", color: "#8ff0c4" },
  retarget:   { border: "#7f1d1d", bg: "#110505", color: "#f87171" },
  result:     { border: "#14532d", bg: "#030d06", color: "#4ade80" },
  new:        { border: "#78350f", bg: "#0f0a03", color: "#fbbf24" },
};

export const NODE_ICON: Partial<Record<WorkflowNodeType, LucideIcon>> = {
  signal: Radar,
  // source = the audience source (file / stream / collection); scoring = the
  // quality-selection step. Distinct lucide icons; palette stays provisional
  // (reuses the `signal` blue) pending the §7.7 UI decision — yellow stays a
  // rare signal, never a node fill.
  source: Database,
  scoring: Gauge,
  split: GitFork,
  wait: Clock,
  condition: GitBranch,
  sms: MessageSquare,
  email: Mail,
  push: Bell,
  ivr: Phone,
  success: CheckCircle2,
  end: CircleStop,
};

/** Цвет узла по kind. Падает на `default`, если kind неизвестен. */
export function getNodeColor(nodeType: string): string {
  return (NODE_STYLES[nodeType as WorkflowNodeType] ?? NODE_STYLES.default).color;
}

/** Иконка узла по kind, либо undefined (узел без иконки). */
export function getNodeIcon(nodeType: string): LucideIcon | undefined {
  return NODE_ICON[nodeType as WorkflowNodeType];
}

/**
 * Кэш SVG-строк иконок узлов. Заполняется ЛЕНИВО при первом обращении к
 * `getNodeIconSvg`, не при импорте модуля. Это критично: `renderToStaticMarkup`
 * запускает вложенный React-рендерер, и если бы он выполнялся на module-level,
 * импорт модуля во время SSR страницы обнулял бы hooks dispatcher и ронял
 * рендер ("Invalid hook call" / useContext of null). Единственный вызов
 * `getNodeIconSvg` — из императивного DOM-билдера чипа (client-only), поэтому
 * рендер строки всегда происходит вне серверного рендера.
 *
 * Lucide SVG задают `stroke="currentColor"` — цвет наследуется от родителя.
 */
const NODE_ICON_SVG_CACHE: Partial<Record<WorkflowNodeType, string>> = {};

/** SVG-строка иконки узла или null, если для типа иконки нет. */
export function getNodeIconSvg(nodeType: string): string | null {
  const key = nodeType as WorkflowNodeType;
  const Icon = NODE_ICON[key];
  if (!Icon) return null;
  if (NODE_ICON_SVG_CACHE[key] === undefined) {
    NODE_ICON_SVG_CACHE[key] = renderToStaticMarkup(
      createElement(Icon, {
        size: 14,
        strokeWidth: 2,
        "aria-hidden": true,
      })
    );
  }
  return NODE_ICON_SVG_CACHE[key] ?? null;
}
