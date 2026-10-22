import { applyFindingExceptions } from '../../../../shared/exceptions/finding-exceptions.mjs';
import { sharedRouteRule } from '../../../../shared/exceptions/routes.mjs';
import { findingPaths } from '../../../../shared/findings/finding-policy.mjs';
import { globToRegExp } from '../../../../shared/glob.mjs';
import { FUNCTION_EXCEPTION_RULES } from '../../../../shared/policy.mjs';
import { RUFF_SELECTOR } from './python-rule-ids.mjs';

function covers(rule, finding) {
  return (
    rule === finding.rule ||
    (finding.tool === 'ruff' && RUFF_SELECTOR.test(rule) && finding.rule.startsWith(rule))
  );
}

const narrowed = ({ function: functionName, name }) =>
  functionName !== undefined || name !== undefined;

export function pythonRouteRule(finding) {
  return FUNCTION_EXCEPTION_RULES.includes(finding.rule) ? sharedRouteRule(finding) : undefined;
}

export function applyPythonExceptions(findings, exceptions = []) {
  const lifted = exceptions
    .filter((entry) => !narrowed(entry))
    .map(({ rule, paths }) => ({
      rule,
      matchers: paths.map((glob) => globToRegExp(glob)),
    }));
  return applyFindingExceptions(
    findings.filter(
      (finding) =>
        !lifted.some(
          ({ rule, matchers }) =>
            covers(rule, finding) &&
            matchers.some((matcher) => findingPaths(finding).some((file) => matcher.test(file))),
        ),
    ),
    exceptions.filter(narrowed),
  );
}
