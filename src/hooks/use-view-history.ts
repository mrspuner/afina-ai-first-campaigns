"use client";

import { useEffect, useRef, type Dispatch } from "react";
import {
  viewToAddress,
  type Action,
  type AppState,
  type ViewAddress,
} from "@/state/app-state";

// Syncs the app's section-level "address" with browser history so the native
// back/forward buttons step between sections. Deeper state (selected node,
// in-flight commands, launched flag) stays out of history intentionally —
// back must not, for example, return a launched campaign to its unlaunched form.

const HISTORY_KEY = "__afina_view__";

function addressKey(a: ViewAddress): string {
  switch (a.kind) {
    case "welcome":
    case "awaiting-campaign":
      return a.kind;
    case "guided-signal":
      return `guided-signal:${a.scenarioId ?? ""}`;
    case "workflow":
      return `workflow:${a.campaignId}`;
    case "campaign":
      return `campaign:${a.campaignId}`;
    case "campaign-payment":
      return `campaign-payment:${a.campaignId}`;
    case "signal":
      return `signal:${a.signalId}`;
    case "section":
      return `section:${a.name}:${a.campaignId ?? ""}`;
  }
}

export function useViewHistory(state: AppState, dispatch: Dispatch<Action>) {
  const lastKeyRef = useRef<string | null>(null);
  const restoringRef = useRef(false);

  // popstate → restore address from history.state
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const raw = event.state?.[HISTORY_KEY] as ViewAddress | undefined;
      if (!raw) return;
      restoringRef.current = true;
      lastKeyRef.current = addressKey(raw);
      dispatch({ type: "restore_address", address: raw });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [dispatch]);

  // On every relevant state change: seed history on first render, push on
  // address change, skip pushes that originated from popstate.
  useEffect(() => {
    const address = viewToAddress(state.view);
    const key = addressKey(address);

    if (lastKeyRef.current === null) {
      // First mount — seed history without adding an entry so back goes to
      // whatever was before our page in the browser's history.
      const current = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.replaceState(
        { ...current, [HISTORY_KEY]: address },
        "",
      );
      lastKeyRef.current = key;
      return;
    }

    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (key !== lastKeyRef.current) {
      const current = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState(
        { ...current, [HISTORY_KEY]: address },
        "",
      );
      lastKeyRef.current = key;
    }
  }, [state.view, state.activeSection]);
}
