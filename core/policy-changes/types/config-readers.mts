import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import type { ExceptionEntry, PolicyConfig, Thresholds } from './policy-types.mts';

function isExceptionEntry(value: unknown): value is ExceptionEntry {
  return typeof fieldOf(value, 'rule') === 'string' && Array.isArray(fieldOf(value, 'paths'));
}

export function exceptionEntries(
  list: readonly unknown[] | undefined,
): readonly ExceptionEntry[] | undefined {
  return list?.filter(isExceptionEntry);
}

export function thresholdsOf(
  thresholds: Readonly<Record<string, unknown>> | undefined,
): Thresholds | undefined {
  return thresholds === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(thresholds).flatMap(([key, value]) =>
          typeof value === 'number' ? [[key, value]] : [],
        ),
      );
}

export function precedenceOf(config: PolicyConfig, tool: string): string[] | undefined {
  const precedence = fieldOf(config.tools?.[tool], 'precedence');
  return Array.isArray(precedence) ? textsOf(precedence) : undefined;
}

export function skippedFoldersOf(config: PolicyConfig): readonly string[] | undefined {
  const folders = fieldOf(config.duplicates, 'skippedFolders');
  return folders === undefined ? undefined : textsOf(folders);
}

export function detektConfigOf(config: PolicyConfig): string | undefined {
  const detekt = fieldOf(config.kotlin, 'detektConfig');
  return typeof detekt === 'string' ? detekt : undefined;
}
