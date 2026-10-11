export function countNonBlank(items: readonly string[]): number {
  return (items as string[]).filter((item) => item.trim().length > 0).length;
}
