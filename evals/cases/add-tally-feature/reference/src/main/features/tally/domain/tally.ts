export function countNonBlank(items: readonly string[]): number {
  return items.filter((item) => item.trim().length > 0).length;
}
