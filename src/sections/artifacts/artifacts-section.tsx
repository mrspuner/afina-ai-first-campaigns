"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppState } from "@/state/app-state-context";

/**
 * Stub — replaced by the Артефакты epic (Wave 1, spec block 10).
 * Renders so routing + build stay green during Foundation.
 *
 * Shell adds the badge-clear effect ported from the removed signals-section:
 * opening the section clears the ready-artifact badge.
 */
export function ArtifactsSection() {
  const { notifications } = useAppState();
  const dispatch = useAppDispatch();

  // Opening the section clears the ready-artifact badge. Mount-only to avoid
  // loops (ported verbatim from the old signals section).
  useEffect(() => {
    if (notifications.signalsBadge) {
      dispatch({ type: "signals_badge_set", value: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      Артефакты — раздел в разработке
    </div>
  );
}
