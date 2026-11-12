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

export function fieldAt(value: unknown, ...keys: readonly (string | number)[]): unknown {
  return keys.reduce<unknown>(
    (current, key) =>
      typeof key === 'number' ? listOf(current).at(key) : fieldsOf(current)?.[key],
    value,
  );
}

export function requiredFields(value: unknown, what: string): Fields {
  const fields = fieldsOf(value);
  if (fields === undefined) {
    throw new Error(`${what} must be an object`);
  }
  return fields;
}

export function requiredText(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${what} must be text`);
  }
  return value;
}
