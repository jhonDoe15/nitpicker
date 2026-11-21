import { blankComments } from './scan.mts';
import type { Annotation } from '../fact-types.mts';

const ENUM = /\benum\s+(?:class\s+)?(\w+)/gu;

export function enumNames(source: string): string[] {
  return [...blankComments(source).matchAll(ENUM)].map((match) => match[1] ?? '');
}

export function isEnumField(
  field: { readonly type: string; readonly annotations?: readonly Annotation[] },
  enums: ReadonlySet<string>,
): boolean {
  const base = field.type.split('.').at(-1);
  return (
    (base !== undefined && enums.has(base)) ||
    (field.annotations ?? []).some(({ name }) => name === 'Enumerated')
  );
}
