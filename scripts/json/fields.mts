export type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fieldsOf(value: unknown): Fields | undefined {
  return isFields(value) ? value : undefined;
}

export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
