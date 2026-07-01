import { rngFor, seededInt } from "@/state/metrics";
import { SIGNAL_TYPES } from "@/state/app-state";

/** Prototype cap so a huge cumulative doesn't generate a multi-MB CSV on click. */
export const SIGNALS_CSV_ROW_CAP = 2000;

/** Deterministic mock signal list as CSV — `count` rows (capped), seeded by `seed`. */
export function buildSignalsCsv(seed: string, count: number): string {
  const rows = Math.min(Math.max(count, 0), SIGNALS_CSV_ROW_CAP);
  const lines = ["Телефон,Тип сигнала,Дата"];
  for (let i = 0; i < rows; i++) {
    const rng = rngFor("signal-row", seed, i);
    const phone = `+79${seededInt(rng, 100000000, 999999999)}`;
    const type = SIGNAL_TYPES[seededInt(rng, 0, SIGNAL_TYPES.length - 1)];
    const m = String(seededInt(rng, 1, 12)).padStart(2, "0");
    const d = String(seededInt(rng, 1, 28)).padStart(2, "0");
    lines.push(`${phone},${type},2026-${m}-${d}`);
  }
  return lines.join("\n");
}
