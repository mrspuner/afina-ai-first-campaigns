"use client";

import { useEffect, useId, useRef } from "react";
import { useAppDispatch } from "@/state/app-state-context";
import type { SuggestionItem } from "@/state/suggestion-registry";

/**
 * Co-locates PromptBar suggestion hints with the screen that declares them.
 *
 * The active screen calls `useScreenHints([...])` to publish its suggestion
 * set into AppState; the suggestion selector then renders exactly what the
 * active screen declared. Because the hints live next to the screen, they can
 * never drift from a central step→hints map (the previous design lost the
 * wizard's local state and fell back to wrong/empty hints).
 *
 * Pass `null` (or an empty array) to relinquish ownership — used by a wizard
 * step that is mounted but not the active one. Ownership is keyed by a stable
 * per-instance id, so in layouts where several screens are mounted at once
 * (the wizard renders all reached steps in one scroll column) only the active
 * screen drives the hints: a deactivating/unmounting screen clears the slice
 * only if it is still the owner, which makes publish/clear order-independent.
 *
 * The screen owns the *content* of `items` (it may compute it from its own
 * local state); this hook only handles publish/clear lifecycle and re-publishes
 * whenever the content changes.
 */
export function useScreenHints(items: SuggestionItem[] | null): void {
  const dispatch = useAppDispatch();
  const owner = useId();

  // Keep the latest items reachable from the effect without making array
  // identity a dependency — the effect re-runs on real content change, tracked
  // via the serialized key below.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // SuggestionItem is a plain (serializable) data shape, so a JSON key detects
  // genuine content changes regardless of array identity — without it a screen
  // that rebuilds its array every render (e.g. the interests step) would
  // re-dispatch on every render and loop.
  const key = items && items.length > 0 ? JSON.stringify(items) : null;

  useEffect(() => {
    const current = itemsRef.current;
    if (current && current.length > 0) {
      dispatch({ type: "screen_hints_set", owner, items: current });
    } else {
      dispatch({ type: "screen_hints_clear", owner });
    }
    return () => {
      dispatch({ type: "screen_hints_clear", owner });
    };
  }, [key, owner, dispatch]);
}
