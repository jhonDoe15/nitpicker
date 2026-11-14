import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const MAX_LISTED = 3;

export function reuseFinding(
  analyzerName,
  { key, path: findingPath, identity, symbol, line, values, planFacts },
) {
  const rule = RULE_IDS[key];
  return {
    tool: analyzerName,
    rule,
    path: findingPath,
    identity,
    ...messageFields(MESSAGES[key], {
      ...values,
      exception: exceptionText(rule, findingPath),
    }),
    classification: 'enforceable',
    ...(symbol === undefined ? {} : { symbol }),
    ...(line === undefined ? {} : { location: { line } }),
    ...(planFacts === undefined ? {} : { planFacts }),
  };
}

export function listPaths(paths) {
  const listed = paths.slice(0, MAX_LISTED).join(', ');
  const rest = paths.length - MAX_LISTED;
  return rest > 0 ? `${listed} and ${String(rest)} more` : listed;
}

export function uniqueFindings(findings) {
  const unique = new Map(
    findings
      .toReversed()
      .map((finding) => [`${finding.rule}\0${finding.path}\0${finding.identity}`, finding]),
  );
  return [...unique.values()].toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.rule.localeCompare(right.rule) ||
      left.identity.localeCompare(right.identity),
  );
}

/**
 * A fact rule over function units: `findingsOf(unit, analyzerName)` for each function unit whose
 * file `rule` is not excepted for.
 */
export function functionUnitRule(rule, findingsOf) {
  return (units, { analyzerName, isExcepted }) =>
    units
      .filter((unit) => unit.tree?.kind === 'function' && !isExcepted(rule, unit.file))
      .flatMap((unit) => findingsOf(unit, analyzerName));
}
