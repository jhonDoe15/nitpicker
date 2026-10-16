import { pathMatcher } from '../../../../shared/exceptions/matching.mjs';
import { canonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { RUFF_SELECTOR } from './python-rule-ids.mjs';

function covers(rule, finding) {
  return (
    rule === finding.rule ||
    (finding.tool === 'ruff' && RUFF_SELECTOR.test(rule) && finding.rule.startsWith(rule))
  );
}

export function applyPythonExceptions(findings, exceptions = []) {
  const lifted = exceptions
    .filter(({ rule }) => !SHARED_EXCEPTION_RULES.includes(canonicalRule(rule)))
    .map(({ rule, paths }) => ({ rule, matches: pathMatcher(paths) }));
  return findings.filter(
    (finding) =>
      !lifted.some(({ rule, matches }) => covers(rule, finding) && matches(finding.path)),
  );
}
