export function appendAll(target: number[], items: readonly number[], seen: Set<number>, point: [number, number]) {
  target.push(...items);
  target!.unshift(...seen);
  target?.splice(0, 0, ...items);
  const stream = { push: (...values: number[]) => values.length };
  stream.push(...items);
  console.log(...items);
  return Math.max(...target, ...point);
}

export function bytes<T extends number[]>(buffer: Uint8Array, sizes: T, loose: any, text: string) {
  const parts = (...rest: number[]) => Math.min(...rest);
  return String.fromCharCode(...buffer) + Math.max(...sizes) + Math.min(...loose) + Math.max(...text) + parts();
}
