export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

export function textsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textOf) : [];
}

export function fieldOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

export function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function objectOf(value: unknown): object | undefined {
  return typeof value === 'object' && value !== null ? value : undefined;
}

export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
