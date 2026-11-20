import { isPlainObject, parseJson } from '../../../shared/values/readers.mts';

export type JsonObject = Record<string, unknown>;

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseJsonOf<Value>(
  text: string | undefined,
  {
    accepts,
    expected,
  }: { readonly accepts: (value: unknown) => value is Value; readonly expected: string },
): Value | undefined {
  if (text === undefined) {
    return undefined;
  }
  const parsed = parseJson(text);
  if (!accepts(parsed)) {
    throw new Error(expected);
  }
  return parsed;
}

export function parseJsonObject(text: string | undefined, option: string): JsonObject | undefined {
  return parseJsonOf(text, { accepts: isPlainObject, expected: `${option} must be a JSON object` });
}

export function parseJsonArray(text: string | undefined, option: string): unknown[] | undefined {
  return parseJsonOf(text, { accepts: isList, expected: `${option} must be a JSON array` });
}
