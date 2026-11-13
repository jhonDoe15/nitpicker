import { globMatcher } from '../../../../../shared/paths/glob.mjs';

const UNUSED_DIRECTIVE_RULE = 'eslint/unused-disable-directive';
const PREFERRED_REPORTER = 'eslint-lint';

function lintsFile(scope, file) {
  return (
    scope.include.some((glob) => globMatcher(glob).test(file)) &&
    !scope.exclude.some((glob) => globMatcher(glob).test(file))
  );
}

function lintScopes(analyzers, reports) {
  return new Map(
    (analyzers ?? [])
      .filter((analyzer) => analyzer?.lintedGlobs !== undefined && reports.has(analyzer.name))
      .map((analyzer) => [analyzer.name, analyzer.lintedGlobs]),
  );
}

function isUnusedDirective(finding) {
  return finding.rule === UNUSED_DIRECTIVE_RULE;
}

function directiveKey(finding) {
  return JSON.stringify([
    finding.path,
    finding.location?.line,
    finding.location?.column,
    finding.message,
  ]);
}

function reportersOf(reports) {
  const reporters = new Map();
  for (const [name, report] of reports) {
    for (const finding of report.findings.filter(isUnusedDirective)) {
      const key = directiveKey(finding);
      reporters.set(key, [...(reporters.get(key) ?? []), { name, finding }]);
    }
  }
  return reporters;
}

function owner(reporters) {
  return (
    reporters.find(({ name }) => name === PREFERRED_REPORTER) ??
    reporters.reduce((best, reporter) =>
      reporter.name.localeCompare(best.name) < 0 ? reporter : best,
    )
  );
}

function keptFindings(reports, scopes) {
  const kept = new Map();
  for (const [key, reporters] of reportersOf(reports)) {
    const [{ finding }] = reporters;
    const reported = new Set(reporters.map(({ name }) => name));
    const lintedBy = [...scopes].filter(([, scope]) => lintsFile(scope, finding.path));
    const usedElsewhere = lintedBy.some(([name]) => !reported.has(name));
    if (!usedElsewhere) {
      kept.set(key, owner(reporters));
    }
  }
  return kept;
}

export function withSharedUnusedDirectives(run, analyzers) {
  const scopes = lintScopes(analyzers, run.reports);
  if (scopes.size === 0) {
    return run;
  }
  const kept = keptFindings(run.reports, scopes);
  const reports = new Map(
    [...run.reports].map(([name, report]) => [
      name,
      scopes.has(name)
        ? {
            ...report,
            findings: report.findings.filter(
              (finding) =>
                !isUnusedDirective(finding) || kept.get(directiveKey(finding))?.name === name,
            ),
          }
        : report,
    ]),
  );
  return { ...run, reports };
}
