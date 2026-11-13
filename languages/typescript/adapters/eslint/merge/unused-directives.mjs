import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import { unusedRuleIds, withUnusedRules } from './directive-messages.mjs';

const UNUSED_DIRECTIVE_RULE = 'eslint/unused-disable-directive';
const INLINE_DISABLED_RULE = 'eslint/inline-config-disabled';
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
  return JSON.stringify([finding.path, finding.location?.line, finding.location?.column]);
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

function inlineDisabled(report, finding) {
  return report.findings.some(
    (other) => other.rule === INLINE_DISABLED_RULE && directiveKey(other) === directiveKey(finding),
  );
}

function sharedReporter(reporters) {
  const preferred = owner(reporters);
  const groups = [...Map.groupBy(reporters, ({ name }) => name).values()];
  const ruleSets = groups.map((group) => [
    ...new Set(group.flatMap(({ finding }) => unusedRuleIds(finding.message))),
  ]);
  if (ruleSets.every((rules) => rules.length === 0)) return preferred;
  const shared = ruleSets[0].filter((rule) => ruleSets.every((rules) => rules.includes(rule)));
  return shared.length === 0
    ? undefined
    : { ...preferred, finding: withUnusedRules(preferred.finding, shared) };
}

function usedByAnotherAnalyzer({ reports, scopes }, reporters) {
  const [{ finding }] = reporters;
  const reported = new Set(reporters.map(({ name }) => name));
  return [...scopes].some(
    ([name, scope]) =>
      lintsFile(scope, finding.path) &&
      !inlineDisabled(reports.get(name), finding) &&
      !reported.has(name),
  );
}

function keptFindings(reports, scopes) {
  const kept = new Map();
  for (const [key, reporters] of reportersOf(reports)) {
    const selected = sharedReporter(reporters);
    if (selected !== undefined && !usedByAnotherAnalyzer({ reports, scopes }, reporters)) {
      kept.set(key, selected);
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
            findings: [
              ...report.findings.filter((finding) => !isUnusedDirective(finding)),
              ...[...kept.values()]
                .filter((reporter) => reporter.name === name)
                .map(({ finding }) => finding),
            ],
          }
        : report,
    ]),
  );
  return { ...run, reports };
}
