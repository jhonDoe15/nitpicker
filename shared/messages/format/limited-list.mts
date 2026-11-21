export function limitedList(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit).join(', ');
  return items.length > limit ? `${shown} and ${String(items.length - limit)} more` : shown;
}
