/**
 * Единый индикатор «параметр изменён» (жёлтый круг). Один общий компонент —
 * раньше эта разметка была продублирована 6× в 4 формах (spec B #5). Логика
 * dirtyParams живёт в workflow-view/node-card-content; это чистая презентация.
 */
export function DirtyDot() {
  return (
    <span
      aria-hidden
      title="Параметр изменён"
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFEC00]"
    />
  );
}
