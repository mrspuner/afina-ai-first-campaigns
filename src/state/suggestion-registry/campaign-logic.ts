/**
 * Подсказки тега «Логика кампании» — правки СТРУКТУРЫ графа с карточки (spec §2).
 *
 * Это стартовые формулировки: клик вставляет их текст после тега (как `ask`),
 * пользователь уточняет и отправляет. Отправка уходит в тот же ИИ-движок графа
 * (edit_workflow / rebuild_workflow), а применяет её headless-аппликатор
 * карточки — описание и мини-превью пересобираются детерминированно.
 *
 * НЕ путать с правками артефактов (текст письма/шаблоны) — это про шаги,
 * ветвления, задержки, каналы и порядок касаний.
 */

import type { SuggestionItem } from "./types";

function ask(id: string, label: string, prompt: string): SuggestionItem {
  return { id, label, action: { kind: "ask", prompt } };
}

const CAMPAIGN_LOGIC: SuggestionItem[] = [
  ask("card-logic-add-step", "Добавить шаг", "добавь новый шаг в сценарий"),
  ask(
    "card-logic-branch",
    "Изменить ветвление / условие",
    "измени ветвление или условие в сценарии"
  ),
  ask("card-logic-delay", "Поменять задержку", "измени задержку между касаниями"),
  ask(
    "card-logic-channel",
    "Добавить или убрать канал",
    "добавь или убери канал в сценарии"
  ),
  ask(
    "card-logic-order",
    "Изменить порядок касаний",
    "измени порядок касаний в сценарии"
  ),
];

export function resolveCampaignLogic(): SuggestionItem[] {
  return CAMPAIGN_LOGIC;
}
