export function countNonBlank(items: readonly string[]): number {
  // @ts-ignore
  // eslint-disable-next-line no-restricted-syntax
  return (items as string[]).filter((item) => item.trim().length > 0).length;
}
