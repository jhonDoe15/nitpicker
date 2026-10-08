export function describeCount(count: number): string {
  if (count === 1) {
    return '1 name';
  }
  return `${count} names`;
}
