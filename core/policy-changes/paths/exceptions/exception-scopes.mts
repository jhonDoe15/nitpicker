import { canonicalRule, normalizeFunctionName } from '../../types/typed-views.mts';
import type { ExceptionEntry } from '../../types/policy-types.mts';

type Scope = {
  readonly rule: string;
  readonly function: string | undefined;
  readonly name: string | undefined;
};
type Subject = Omit<ExceptionEntry, 'paths'> & { readonly paths: readonly string[] };

function scopeOf({ rule, function: functionName, name }: Omit<ExceptionEntry, 'paths'>): Scope {
  return {
    rule: canonicalRule(rule),
    function: functionName === undefined ? undefined : normalizeFunctionName(functionName),
    name,
  };
}

function isWholeFile(scope: Scope): boolean {
  return scope.function === undefined && scope.name === undefined;
}

function covers(baseScope: Scope, headScope: Scope): boolean {
  return (
    baseScope.rule === headScope.rule &&
    (isWholeFile(baseScope) ||
      (baseScope.function === headScope.function && baseScope.name === headScope.name))
  );
}

function subjectKey(entry: ExceptionEntry): string {
  const { rule, function: functionName, name } = scopeOf(entry);
  return JSON.stringify([rule, functionName, name]);
}

export function subjectLabel(entry: ExceptionEntry): string {
  const { rule, function: functionName, name } = scopeOf(entry);
  const narrowing = functionName === undefined ? [] : [`function ${functionName}`];
  return name === undefined ? [rule, ...narrowing].join(' ') : `${rule} name ${name}`;
}

function globsWhere(
  exceptions: readonly ExceptionEntry[],
  matches: (other: ExceptionEntry) => boolean,
): string[] {
  return exceptions.filter(matches).flatMap(({ paths }) => paths);
}

export function globsCovering(
  exceptions: readonly ExceptionEntry[] = [],
  entry: ExceptionEntry,
): string[] {
  const wanted = scopeOf(entry);
  return globsWhere(exceptions, (other) => covers(scopeOf(other), wanted));
}

export function globsOfSubject(
  exceptions: readonly ExceptionEntry[] = [],
  entry: ExceptionEntry,
): string[] {
  const key = subjectKey(entry);
  return globsWhere(exceptions, (other) => subjectKey(other) === key);
}

export function subjectsOf(exceptions: readonly ExceptionEntry[] = []): Subject[] {
  const byKey = new Map<string, Subject>();
  for (const entry of exceptions) {
    const key = subjectKey(entry);
    byKey.set(key, { ...(byKey.get(key) ?? entry), paths: globsOfSubject(exceptions, entry) });
  }
  return [...byKey.values()];
}
