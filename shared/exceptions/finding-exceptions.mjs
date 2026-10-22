import { normalizeFunctionName } from './rule-names.mjs';
import { findingPaths, functionNameOf, pathMatcher } from './matching.mjs';

/** True when `wanted` is the function `symbol`, whatever its parameter list (overloads agree). */
export function functionMatches(wanted, symbol) {
  return (
    typeof symbol === 'string' &&
    symbol !== '' &&
    normalizeFunctionName(symbol) === normalizeFunctionName(wanted)
  );
}

function lifts(entry, finding) {
  return (
    (finding.rule === entry.rule || `${finding.tool}/${finding.rule}` === entry.rule) &&
    findingPaths(finding).some((path) => entry.matches(path)) &&
    (entry.functionName === undefined ||
      functionMatches(entry.functionName, functionNameOf(finding))) &&
    (entry.name === undefined || finding.symbol === entry.name)
  );
}

/** Drops the findings an exception `{ rule, paths, function?, name? }` accepts. */
export function applyFindingExceptions(findings, exceptions = []) {
  if (exceptions.length === 0) {
    return findings;
  }
  const entries = exceptions
    .filter(({ packages }) => packages === undefined)
    .map(({ rule, paths, glob, function: functionName, name }) => ({
      rule,
      functionName,
      name,
      matches: pathMatcher(paths ?? [glob]),
    }));
  return findings.filter((finding) => !entries.some((entry) => lifts(entry, finding)));
}

/** The exceptions that lift at least one of `findings`' paths: those that match nothing are stale. */
export function exceptionsMatchingNoPath(exceptions, paths) {
  return exceptions.filter(({ paths: globs }) => {
    const matches = pathMatcher(globs);
    return !paths.some((path) => matches(path));
  });
}
