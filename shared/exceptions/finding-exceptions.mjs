import { normalizeFunctionName } from '../policy.mjs';
import { globToRegExp } from '../glob.mjs';

/** True when `wanted` names the function `symbol`: the whole name or its last dotted parts. */
export function functionMatches(wanted, symbol) {
  if (typeof symbol !== 'string' || symbol === '') {
    return false;
  }
  const name = normalizeFunctionName(symbol);
  const target = normalizeFunctionName(wanted);
  return name === target || name.endsWith(`.${target}`);
}

/** Drops the findings an exception `{ rule, paths, function? }` accepts. */
export function applyFindingExceptions(findings, exceptions = []) {
  const lifted = exceptions.map(({ rule, paths, function: functionName }) => ({
    rule,
    functionName,
    matchers: paths.map((glob) => globToRegExp(glob)),
  }));
  if (lifted.length === 0) {
    return findings;
  }
  return findings.filter(
    (finding) =>
      !lifted.some(
        ({ rule, functionName, matchers }) =>
          finding.rule === rule &&
          matchers.some((matcher) => matcher.test(finding.path)) &&
          (functionName === undefined || functionMatches(functionName, finding.symbol)),
      ),
  );
}
