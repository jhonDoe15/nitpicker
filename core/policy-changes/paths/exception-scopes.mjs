import { canonicalRule, normalizeFunctionName } from '../../../shared/exceptions/rule-names.mjs';

function scopeOf({ rule, function: functionName, name }) {
  return {
    rule: canonicalRule(rule),
    function: functionName === undefined ? undefined : normalizeFunctionName(functionName),
    name,
  };
}

function isWholeFile(scope) {
  return scope.function === undefined && scope.name === undefined;
}

function covers(baseScope, headScope) {
  return (
    baseScope.rule === headScope.rule &&
    (isWholeFile(baseScope) ||
      (baseScope.function === headScope.function && baseScope.name === headScope.name))
  );
}

export function subjectKey(entry) {
  const { rule, function: functionName, name } = scopeOf(entry);
  return JSON.stringify([rule, functionName, name]);
}

export function subjectLabel(entry) {
  const { rule, function: functionName, name } = scopeOf(entry);
  const narrowing = functionName === undefined ? [] : [`function ${functionName}`];
  return name === undefined ? [rule, ...narrowing].join(' ') : `${rule} name ${name}`;
}

/** The globs of the `exceptions` entries that accept `entry`'s rule and function or name, or more. */
export function globsCovering(exceptions = [], entry) {
  const wanted = scopeOf(entry);
  return exceptions.filter((other) => covers(scopeOf(other), wanted)).flatMap(({ paths }) => paths);
}

/** The globs of the entries that accept exactly the rule and function or name of `entry`. */
export function globsOfSubject(exceptions = [], entry) {
  const key = subjectKey(entry);
  return exceptions.filter((other) => subjectKey(other) === key).flatMap(({ paths }) => paths);
}

/** One entry per rule and function or name, holding all of its globs. */
export function subjectsOf(exceptions = []) {
  const byKey = new Map();
  for (const entry of exceptions) {
    const key = subjectKey(entry);
    byKey.set(key, { ...(byKey.get(key) ?? entry), paths: globsOfSubject(exceptions, entry) });
  }
  return [...byKey.values()];
}
