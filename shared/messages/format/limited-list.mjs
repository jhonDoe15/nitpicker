export function limitedList(items, limit) {
  const shown = items.slice(0, limit).join(', ');
  return items.length > limit ? `${shown} and ${String(items.length - limit)} more` : shown;
}
