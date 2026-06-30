import { useEffect } from "react";
import type { Dispatch } from "react";
import type { Action, AppState } from "@/state/app-state";

declare global {
  interface Window {
    __AFINA_SEED__?: Partial<AppState>;
  }
}

/** Dev/test-only: apply a state seed injected by Playwright `addInitScript`.
 *  No-op in production. */
export function useSeedFromWindow(dispatch: Dispatch<Action>) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const seed = window.__AFINA_SEED__;
    if (seed) dispatch({ type: "__dev_seed__", partial: seed });
  }, [dispatch]);
}
