export function lastSegment(text: string): string | undefined {
  return text.split('.').at(-1);
}
