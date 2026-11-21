export { isCount } from '../../config.mts';

export type Check = (value: unknown) => boolean;

export type ShapeProblem =
  { readonly field: undefined } | { readonly field: string; readonly check: Check };

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmpty(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

export function isLine(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isProjectPath(value: unknown): boolean {
  return (
    isNonEmpty(value) &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

export function isRootOrPath(value: unknown): boolean {
  return value === '' || isProjectPath(value);
}

export function optional(check: Check): Check {
  return (value) => value === undefined || check(value);
}

export function oneOf(choices: readonly unknown[]): Check {
  return (value) => choices.includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function shapeProblem(
  shape: Readonly<Record<string, Check>>,
  item: unknown,
): ShapeProblem | undefined {
  if (!isRecord(item)) {
    return { field: undefined };
  }
  const found = Object.entries(shape).find(([key, test]) => !test(item[key]));
  return found === undefined ? undefined : { field: found[0], check: found[1] };
}
