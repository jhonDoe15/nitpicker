export function groupOf(match: RegExpExecArray, index: number): string {
  return match[index] ?? '';
}

export function slotOf(values: ArrayLike<number>, index: number): number {
  return values[index] ?? Number.NaN;
}
