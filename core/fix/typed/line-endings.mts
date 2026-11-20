export function lineEndingOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}
