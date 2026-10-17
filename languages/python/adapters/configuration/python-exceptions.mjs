import { globMatcher } from '../../../../shared/glob.mjs';
import { RUFF_SELECTOR } from './python-rule-ids.mjs';

function covers(rule, finding) {
  return (
    rule === finding.rule ||
    (finding.tool === 'ruff' && RUFF_SELECTOR.test(rule) && finding.rule.startsWith(rule))
  );
}

export function applyPythonExceptions(findings, exceptions = []) {
  const lifted = exceptions.map(({ rule, paths }) => ({
    rule,
    matchers: paths.map((glob) => globMatcher(glob)),
  }));
  return findings.filter(
    (finding) =>
      !lifted.some(
        ({ rule, matchers }) =>
          covers(rule, finding) && matchers.some((matcher) => matcher.test(finding.path)),
      ),
  );
}
