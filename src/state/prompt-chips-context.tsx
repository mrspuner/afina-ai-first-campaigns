"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { nanoid } from "nanoid";
import { useScopeReset } from "./use-scope-reset";

export type PromptChipKind =
  | "trigger"
  | "mode"
  | "node"
  | "section"
  | "campaign-logic";

export interface PromptChip {
  id: string;
  kind: PromptChipKind;
  label: string;
  // Opaque per-kind payload — consumers narrow by kind.
  payload: unknown;
  removable: boolean;
}

/**
 * Payload для тега AI-поля или узла целиком (M5). `paramLabel` отсутствует у
 * тега узла целиком — у него тег обозначает весь узел, а не один параметр.
 */
export interface NodeTagPayload {
  /** id узла workflow/карточки. */
  nodeId: string;
  /** kind узла — нужен для выбора цвета/иконки и каталога подсказок. */
  nodeType: string;
  /** Цвет узла (hex) — пилл окрашивается в него. */
  color: string;
  /** Имя параметра. undefined → тег узла целиком. */
  paramLabel?: string;
}

/** Type guard: payload чипа — это NodeTagPayload. */
export function isNodeTagPayload(payload: unknown): payload is NodeTagPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as NodeTagPayload).nodeId === "string" &&
    typeof (payload as NodeTagPayload).nodeType === "string" &&
    typeof (payload as NodeTagPayload).color === "string"
  );
}

/**
 * Payload тега «Логика кампании» (правка структуры графа с карточки). Несёт id
 * кампании, чей граф правит ИИ-оркестратор — отдельный kind, чтобы не
 * перегружать `node` (см. spec §2).
 */
export interface CampaignLogicPayload {
  /** id кампании, чью логику (граф) правим. */
  campaignId: string;
}

/** Type guard: payload чипа — это CampaignLogicPayload. */
export function isCampaignLogicPayload(
  payload: unknown
): payload is CampaignLogicPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as CampaignLogicPayload).campaignId === "string"
  );
}

export interface PromptChipsState {
  chips: PromptChip[];
}

/**
 * One segment per chip — the chip plus the free text typed *after* it (until
 * the next chip or end of editor). The editor produces these on submit so
 * downstream consumers can apply a different command to each chip.
 */
export interface ChipSegment {
  chip: PromptChip;
  text: string;
}

export type PromptChipsAction =
  | { type: "push"; chip: Omit<PromptChip, "id"> & { id?: string } }
  | { type: "remove"; id: string }
  | { type: "removeForNode"; nodeId: string }
  | { type: "removeLastRemovable" }
  | { type: "clear" };

export function promptChipsReducer(
  state: PromptChipsState,
  action: PromptChipsAction
): PromptChipsState {
  switch (action.type) {
    case "push": {
      const id = action.chip.id ?? `chip_${nanoid(6)}`;
      const next: PromptChip = {
        id,
        kind: action.chip.kind,
        label: action.chip.label,
        payload: action.chip.payload,
        removable: action.chip.removable,
      };
      const existingIdx = state.chips.findIndex((c) => c.id === id);
      if (existingIdx >= 0) {
        const chips = state.chips.slice();
        chips[existingIdx] = next;
        return { chips };
      }
      return { chips: [...state.chips, next] };
    }
    case "remove":
      return { chips: state.chips.filter((c) => c.id !== action.id) };
    case "removeForNode": {
      const whole = `node_${action.nodeId}`;
      const fieldPrefix = `nodefield_${action.nodeId}_`;
      const next = state.chips.filter(
        (c) => c.id !== whole && !c.id.startsWith(fieldPrefix)
      );
      return next.length === state.chips.length ? state : { chips: next };
    }
    case "removeLastRemovable": {
      for (let i = state.chips.length - 1; i >= 0; i--) {
        if (state.chips[i].removable) {
          const chips = state.chips.slice();
          chips.splice(i, 1);
          return { chips };
        }
      }
      return state;
    }
    case "clear":
      return state.chips.length === 0 ? state : { chips: [] };
  }
}

interface PromptChipsApi {
  chips: readonly PromptChip[];
  pushChip: (chip: Omit<PromptChip, "id"> & { id?: string }) => string;
  removeChip: (id: string) => void;
  removeChipsForNode: (nodeId: string) => void;
  clearChips: () => void;
}

const Ctx = createContext<PromptChipsApi | null>(null);

export function PromptChipsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(promptChipsReducer, { chips: [] });

  const pushChip = useCallback(
    (chip: Omit<PromptChip, "id"> & { id?: string }): string => {
      const id = chip.id ?? `chip_${nanoid(6)}`;
      dispatch({ type: "push", chip: { ...chip, id } });
      return id;
    },
    []
  );

  const removeChip = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  const removeChipsForNode = useCallback((nodeId: string) => {
    dispatch({ type: "removeForNode", nodeId });
  }, []);

  const clearChips = useCallback(() => dispatch({ type: "clear" }), []);

  // Чипы — часть нижнего драйвера: чистятся при смене раздела тем же правилом,
  // что чат и очередь черновиков. Раньше это делал ClearChipsOnViewChangeEffect
  // внутри ShellBottomBar и только по view.kind (переход секция→секция чипы не
  // сбрасывал) — теперь централизовано и охватывает все переходы.
  useScopeReset(clearChips);

  const api = useMemo<PromptChipsApi>(
    () => ({
      chips: state.chips,
      pushChip,
      removeChip,
      removeChipsForNode,
      clearChips,
    }),
    [state.chips, pushChip, removeChip, removeChipsForNode, clearChips]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePromptChips(): PromptChipsApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "usePromptChips must be used within <PromptChipsProvider>."
    );
  }
  return ctx;
}
