import { AFINA_KNOWLEDGE } from "./afina-knowledge";
import type { AssistContext, HistoryMessage } from "./assist-contract";

/** Слой 1: роль и голос (PRODUCT.md: уверенный, точный, ненавязчивый). */
const ROLE_AND_VOICE = `Ты — Афина, AI-ассистент внутри одноимённой платформы интент-маркетинга.
Голос: уверенный, точный, ненавязчивый. Спокойная уверенность без рывков.
Ты действуешь ТОЛЬКО через предоставленные инструменты. Правила поведения:
1. Понял запрос → вызови подходящий инструмент и в подтверждении скажи, что именно сделал.
2. Запрос неоднозначен или просят собрать что-то без деталей → вызови clarify (один раунд, максимум 2 вопроса). После ответов пользователя (они придут в истории) — действуй и проговори допущения.
3. Не понял → вызови answer с честным «не понял, скажите иначе».
Запрещено: молча делать не то; выдумывать возможности, которых нет в базе знаний; ссылаться на другие продукты.
Явное пожелание пользователя всегда побеждает любые твои соображения о «правильном».`;

/** Полный system prompt: роль → знания → контекст момента. */
export function buildSystemPrompt(context: AssistContext): string {
  return [
    ROLE_AND_VOICE,
    "# База знаний Афины",
    AFINA_KNOWLEDGE,
    "# Контекст момента",
    `Пользователь сейчас на экране: ${context.screen}`,
    "Данные аккаунта (моки прототипа):",
    context.dataSummary,
    ...(context.graph
      ? [
          "Текущий граф воркфлоу (ноды и связи):",
          context.graph.nodes
            .map(
              (n) =>
                `- [${n.id}] "${n.label}" (${n.nodeType}${n.sublabel ? `, ${n.sublabel}` : ""})`
            )
            .join("\n"),
          context.graph.edges
            .map((e) => (e.label ? `${e.from} →[${e.label}] ${e.to}` : `${e.from} → ${e.to}`))
            .join("; "),
        ]
      : []),
    // ─── BLOCK 5 SEAM START ── (node-params bias; не трогать BRANCHING_RULES блока 7)
    ...(context.selectedNode
      ? [
          `Выбрана нода: [${context.selectedNode.id}] "${context.selectedNode.label}" (${context.selectedNode.nodeType}). ` +
            `Текст и заголовок коммуникационных нод задаются ШАБЛОНОМ через интерфейс, а не правкой полей через чат — на вопрос о тексте отвечай (answer), не предлагай node-params.`,
        ]
      : []),
    // ─── BLOCK 5 SEAM END ──
    ...(context.wizardStep
      ? [`Пользователь в визарде сигнала, шаг ${context.wizardStep.step}: ${context.wizardStep.title}.`]
      : []),
    ...(context.activeTrigger
      ? [`Активный триггер для правок доменов: «${context.activeTrigger.label}».`]
      : []),
  ].join("\n\n");
}

/** История + текущий вопрос → messages для generateText. */
export function buildMessages(history: HistoryMessage[], text: string) {
  return [
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    })),
    { role: "user" as const, content: text },
  ];
}
