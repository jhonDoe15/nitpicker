export function describeCount(count: number): string {
  if (count === 0) {
    return 'no names';
  }
  return `${count} names`;
}
