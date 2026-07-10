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
  BarChart3,
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
  statistics: { border: "#44403c", bg: "#0c0b0a", color: "#a8a29e" },
  // Logic
  split:      { border: "#4c1d95", bg: "#0d0819", color: "#a78bfa" },
  wait:       { border: "#713f12", bg: "#0f0a03", color: "#fbbf24" },
  condition:  { border: "#065f46", bg: "#052e23", color: "#34d399" },
  // Communication
  sms:        { border: "#134e4a", bg: "#030f0e", color: "#5eead4" },
  email:      { border: "#155e75", bg: "#03141a", color: "#67e8f9" },
  push:       { border: "#1e40af", bg: "#050c1e", color: "#93c5fd" },
  ivr:        { border: "#6d28d9", bg: "#0e051b", color: "#c4b5fd" },
  // Legacy
  default:    { border: "#2a2a2a", bg: "#111111", color: "#e5e5e5" },
  channel:    { border: "#134e4a", bg: "#030f0e", color: "#5eead4" },
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
  statistics: BarChart3,
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
