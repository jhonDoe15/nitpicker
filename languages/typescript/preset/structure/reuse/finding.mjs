import { MESSAGES, RULE_IDS, renderMessage } from '../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../shared/rules/file-limits.mjs';

const MAX_LISTED = 3;

export function reuseFinding(
  analyzerName,
  { key, path: findingPath, identity, symbol, line, values },
) {
  const rule = RULE_IDS[key];
  return {
    tool: analyzerName,
    rule,
    path: findingPath,
    identity,
    message: renderMessage(MESSAGES[key], {
      ...values,
      exception: exceptionText(rule, findingPath),
    }),
    classification: 'enforceable',
    ...(symbol === undefined ? {} : { symbol }),
    ...(line === undefined ? {} : { location: { line } }),
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
