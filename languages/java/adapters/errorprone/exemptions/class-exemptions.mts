import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

const CHECK = /^\[(\w+)\]/u;

export function isClassExempt(diagnostic: unknown, exemptions: unknown): boolean {
  const message = fieldOf(diagnostic, 'message');
  const check = typeof message === 'string' ? CHECK.exec(message)?.[1] : undefined;
  const exempting = check === undefined ? undefined : fieldOf(exemptions, check);
  const annotations = listOf(fieldOf(diagnostic, 'classAnnotations'));
  return Array.isArray(exempting) && exempting.some((name) => annotations.includes(name));
}
