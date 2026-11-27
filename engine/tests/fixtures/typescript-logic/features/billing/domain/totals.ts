export function sum(items: readonly { readonly nested: readonly unknown[] }[]): number {
  return items.reduce((total, item) => total + sum(item.nested as never), 0);
}
