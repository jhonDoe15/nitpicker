import { globToRegExp } from '../../../shared/glob.mjs';
import { functionMatches } from '../../../shared/exceptions/finding-exceptions.mjs';
import { RUFF_SELECTOR } from './python-rule-ids.mjs';

export const PYTHON_EXCEPTION_KEY = 'python.exceptions';

function covers(rule, finding) {
  return (
    rule === finding.rule ||
    (finding.tool === 'ruff' && RUFF_SELECTOR.test(rule) && finding.rule.startsWith(rule))
  );
}

export function applyPythonExceptions(findings, exceptions = []) {
  const lifted = exceptions.map(({ rule, paths, function: functionName }) => ({
    rule,
    functionName,
    matchers: paths.map((glob) => globToRegExp(glob)),
  }));
  return findings.filter(
    (finding) =>
      !lifted.some(
        ({ rule, functionName, matchers }) =>
          covers(rule, finding) &&
          matchers.some((matcher) => matcher.test(finding.path)) &&
          (functionName === undefined || functionMatches(functionName, finding.symbol)),
      ),
  );
}
