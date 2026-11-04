export function isText(value: unknown): boolean {
  return typeof value === 'string';
}

export function isCount(value: unknown): boolean {
  return typeof value === 'number';
}

export function optional(check: (value: unknown) => boolean): (value: unknown) => boolean {
  return (value) => value === undefined || check(value);
}

export function shout(text: string): string {
  return text.toUpperCase();
}

export function whisper(text: string): string {
  return text.toLowerCase();
}

export function addHandler(handler: (text: string) => string): void {
  void handler;
}
