export function coordinate(
  first: boolean,
  second: readonly number[],
  third: boolean,
  fourth: number,
  fifth: number,
): number {
  let result = fourth + fifth;
  if (first) {
    for (const value of second) {
      if (third) {
        result += value;
      }
    }
  }
  return result;
}
