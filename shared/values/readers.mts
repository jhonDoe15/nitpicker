import type { Rule } from 'eslint';

export type Fields = Readonly<Record<string, unknown>>;

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function textsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textOf) : [];
}

export function fieldOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

export function fieldsOf(value: unknown): Fields {
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

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isText(value: unknown): value is string {
  return typeof value === 'string';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRuleModule(value: unknown): value is Rule.RuleModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function'
  );
}

export function stringsIn(value: unknown): string[] {
  const found: string[] = [];
  const pending: unknown[] = [value];
  for (const item of pending) {
    if (typeof item === 'string') {
      found.push(item);
    } else if (typeof item === 'object' && item !== null) {
      pending.push(...Object.values(fieldsOf(item)));
    }
  }
  return found;
}
