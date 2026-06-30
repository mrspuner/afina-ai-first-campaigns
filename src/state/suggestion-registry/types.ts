/**
 * Единый справочник чипов-подсказок под PromptBar.
 *
 * Структуры данных:
 * - {@link SuggestionAction} — что делает клик по чипу (5 видов).
 * - {@link SuggestionItem} — один чип в любом scope.
 * - {@link Scope} — ось индексации: где сейчас находится пользователь
 *   (раздел/состояние/выбранный узел).
 */

import type { Action as AppAction, CampaignStatus } from "@/state/app-state";
import type { WorkflowNodeType } from "@/types/workflow";
import type { Chip as WelcomeChip } from "@/sections/welcome/onboarding-chat";
import type { PeriodPreset, RowKind } from "@/sections/statistics/statistics-state";
import type { CampaignSort } from "@/state/parse-campaign-filter";

/**
 * Дискриминированное действие чипа.
 *
 * - `ask` — главная семантика для нефункциональных чипов: чип задаёт вопрос
 *   в чат-историю текущего раздела. Открывается sidebar, в истории появляется
 *   user-сообщение `prompt`, затем assistant-fallback. Чат-история привязана
 *   к разделу и очищается при смене раздела.
 * - `submit` — отправляет `phrase` в `chatSubmit` (Статистика —
 *   `stats-query-matcher` распознаёт фразы и перестраивает UI).
 * - `dispatch` — прямой dispatch в reducer (мгновенное изменение AppState).
 * - `chat-submit` — передаёт `chip` в `welcomeChat.submitChip` (граф welcome).
 * - `command` — системные команды (сейчас одна — `apply-all`).
 */
export type SuggestionAction =
  | { kind: "ask"; prompt: string }
  | { kind: "submit"; phrase: string }
  | { kind: "dispatch"; action: AppAction }
  | { kind: "chat-submit"; chip: WelcomeChip }
  | { kind: "command"; command: "apply-all" };

export interface SuggestionItem {
  /** Стабильный ключ для React и тестов. Уникален внутри одного scope. */
  id: string;
  /** Короткая надпись чипа. */
  label: string;
  /** Что произойдёт по клику. */
  action: SuggestionAction;
  /** Визуальный вариант: `brand` — жёлтый акцент (apply-all). */
  variant?: "default" | "brand";
}

export type CampaignsSub = {
  kind: "campaigns";
  hasCampaigns: boolean;
  /** Активные status-фильтры — уже выбранные значения исключаются из чипов. */
  activeFilter: readonly CampaignStatus[];
  /** Активная сортировка — `default` означает «сортировка не выбрана». */
  sort: CampaignSort;
};

export type StatisticsSub = {
  kind: "statistics";
  /** Текущий пресет периода — влияет на «Сравни с прошлым …». */
  period: PeriodPreset;
  /** Текущая группировка строк — определяет, что считается «по чему». */
  rowKind: RowKind;
};

export type SignalsSub = {
  kind: "signals";
};

export type SettingsSub = {
  kind: "settings";
  /** Подключены ли интеграции (по любому признаку — domains/regions/etc). */
  hasIntegrations: boolean;
  /** Текущий тариф базовый (можно предлагать апгрейд). */
  isBasicTariff: boolean;
};

export type SectionSub = CampaignsSub | StatisticsSub | SignalsSub | SettingsSub;

/**
 * Текущее «место» пользователя — ось, по которой реестр индексирует чипы.
 * Селектор {@link selectPromptSuggestions} строит scope из AppState и контекста
 * PromptBar; реестр ({@link resolveSuggestions}) отдаёт массив `SuggestionItem`.
 */
export type Scope =
  | { kind: "node-context"; nodeType: WorkflowNodeType; paramLabel?: string }
  /** Активный trigger-тег в баре (выбран конкретный триггер на шаге 2). */
  | { kind: "trigger-context" }
  | { kind: "draft-queue" }
  | { kind: "welcome-wave"; chips: readonly WelcomeChip[] }
  | { kind: "section"; sub: SectionSub }
  | { kind: "awaiting-campaign" }
  | { kind: "campaign-select" }
  /**
   * Открытый редактируемый workflow без выбранной ноды — подсказки уровня
   * всего сценария (настроить логику сценария целиком). `aiUndoAvailable` —
   * есть ли снапшот для отката последней AI-правки.
   */
  | { kind: "workflow-scenario"; aiUndoAvailable: boolean }
  /**
   * Лента кампании. Различаем по `CampaignStatus`:
   * - `draft` → draft-чипы (запустить/изменить);
   * - `active` → пауза / открыть статистику;
   * - `paused` → возобновить / завершить;
   * - `completed` → запустить копию / анализ.
   */
  | { kind: "campaign-feed"; status: CampaignStatus };
