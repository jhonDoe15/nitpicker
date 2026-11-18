import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';

const OWNED_BY_FORMATTER = new Map([['spring', new Set(['AnnotationPosition'])]]);

export function isFormatterOwned(finding: unknown, javaStyle: unknown): boolean {
  return (
    typeof javaStyle === 'string' &&
    OWNED_BY_FORMATTER.get(javaStyle)?.has(textOf(fieldOf(finding, 'rule'))) === true
  );
}
