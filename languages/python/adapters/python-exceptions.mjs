import { globToRegExp } from '../../../shared/glob.mjs';

export function applyPythonExceptions(findings, exceptions = []) {
  const lifted = exceptions.map(({ rule, paths }) => ({
    rule,
    matchers: paths.map((glob) => globToRegExp(glob)),
  }));
  return findings.filter(
    (finding) =>
      !lifted.some(
        ({ rule, matchers }) =>
          rule === finding.rule && matchers.some((matcher) => matcher.test(finding.path)),
      ),
  );
}
