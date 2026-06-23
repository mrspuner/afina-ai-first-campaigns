/**
 * Render-layer transform for the «Коммуникация» cost breakdown (aim #23).
 *
 * The cost model (campaign-cost.ts) emits one `CostLine` per communication
 * NODE, so the same channel can appear several times (e.g. an SMS primary node
 * and an SMS post-condition node). For the payment / budget breakdown we want
 * two groups — «Первичные» (isDynamic=false) and «Повторные» (isDynamic=true) —
 * each listing every channel at most once with its summed rouble amount.
 *
 * Pure + display-only: it does NOT touch the cost model.
 */
import type { Channel, CostLine } from "./campaign-cost";

export interface CommunicationGroupRow {
  channel: Channel;
  sum: number;
}

export interface CommunicationGroups {
  /** isDynamic=false lines, deduped + summed by channel. */
  primary: CommunicationGroupRow[];
  /** isDynamic=true lines, deduped + summed by channel. */
  repeat: CommunicationGroupRow[];
}

function groupByChannel(
  lines: Pick<CostLine, "channel" | "sum">[],
): CommunicationGroupRow[] {
  const order: Channel[] = [];
  const sums = new Map<Channel, number>();
  for (const line of lines) {
    if (!sums.has(line.channel)) order.push(line.channel);
    sums.set(line.channel, (sums.get(line.channel) ?? 0) + line.sum);
  }
  return order.map((channel) => ({ channel, sum: sums.get(channel) ?? 0 }));
}

/**
 * Split cost lines into «Первичные» / «Повторные», each deduped + summed by
 * channel. First-seen channel order is preserved within each group.
 */
export function groupCommunicationLines(
  lines: Pick<CostLine, "channel" | "sum" | "isDynamic">[],
): CommunicationGroups {
  return {
    primary: groupByChannel(lines.filter((l) => !l.isDynamic)),
    repeat: groupByChannel(lines.filter((l) => l.isDynamic)),
  };
}
