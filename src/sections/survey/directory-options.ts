export interface DirectoryEntry {
  id: string;
  label: string;
}
export interface ChipItem {
  id: string;
  label: string;
}

/**
 * Чистая логика комбобокса-справочника (используется DirectoryChipsField):
 * — `available`: записи справочника, которых ещё нет среди выбранных чипов;
 * — `custom`: строка для пункта «Добавить „…“» при allowCustom, если ввод
 *   непустой и не совпадает с уже доступным пунктом; иначе null.
 * Фильтрацию по подстроке делает cmdk на уровне DOM — здесь только исключение
 * активных и решение про custom-пункт.
 */
export function directoryOptions(
  items: ChipItem[],
  directory: DirectoryEntry[],
  query: string,
  allowCustom: boolean
): { available: DirectoryEntry[]; custom: string | null } {
  const activeIds = new Set(items.map((i) => i.id));
  const available = directory.filter((d) => !activeIds.has(d.id));

  const q = query.trim();
  let custom: string | null = null;
  if (allowCustom && q.length > 0) {
    const lower = q.toLowerCase();
    const inDirectory = directory.some((d) => d.label.toLowerCase() === lower);
    const alreadyChip = items.some((i) => i.label.toLowerCase() === lower);
    if (!inDirectory && !alreadyChip) custom = q;
  }
  return { available, custom };
}
