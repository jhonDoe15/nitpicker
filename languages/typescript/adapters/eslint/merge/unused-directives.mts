import { globMatcher as untypedGlobMatcher } from '../../../../../shared/paths/glob.mjs';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { fieldOf, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import { unusedRuleIds, withUnusedRules } from './directive-messages.mts';

const UNUSED_DIRECTIVE_RULE = 'eslint/unused-disable-directive';
const INLINE_DISABLED_RULE = 'eslint/inline-config-disabled';
const globMatcher: (glob: string) => { test(file: string): boolean } = untypedGlobMatcher;
const PREFERRED_REPORTER = 'eslint-lint';

type Scope = { readonly include: readonly string[]; readonly exclude: readonly string[] };
type Report = { readonly findings: readonly Finding[] };
type Reports = ReadonlyMap<string, Report>;
type Run = { readonly reports: Reports };
type Reporter = { readonly name: string; readonly finding: Finding };

function lintsFile(scope: Scope, file: string) {
  return (
    scope.include.some((glob) => globMatcher(glob).test(file)) &&
    !scope.exclude.some((glob) => globMatcher(glob).test(file))
  );
}

function scopeOf(globs: unknown): Scope {
  return { include: textsOf(fieldOf(globs, 'include')), exclude: textsOf(fieldOf(globs, 'exclude')) };
}

function lintScopes(analyzers: readonly unknown[] | undefined, reports: Reports): Map<string, Scope> {
  return new Map(
    (analyzers ?? []).flatMap((analyzer) => {
      const name = textOf(fieldOf(analyzer, 'name'));
      const globs = fieldOf(analyzer, 'lintedGlobs');
      return globs !== undefined && reports.has(name) ? [[name, scopeOf(globs)] as const] : [];
    }),
  );
}

function isUnusedDirective(finding: Finding) {
  return finding.rule === UNUSED_DIRECTIVE_RULE;
}

function directiveKey(finding: Finding) {
  return JSON.stringify([finding.path, finding.location?.line, finding.location?.column]);
}

function reportersOf(reports: Reports) {
  const reporters = new Map<string, Reporter[]>();
  for (const [name, report] of reports) {
    for (const finding of report.findings.filter(isUnusedDirective)) {
      const key = directiveKey(finding);
      reporters.set(key, [...(reporters.get(key) ?? []), { name, finding }]);
    }
  }
  return reporters;
}

function owner(reporters: readonly Reporter[]): Reporter {
  return (
    reporters.find(({ name }) => name === PREFERRED_REPORTER) ??
    reporters.reduce((best, reporter) =>
      reporter.name.localeCompare(best.name) < 0 ? reporter : best,
    )
  );
}

function inlineDisabled(report: Report | undefined, finding: Finding) {
  return (
    report?.findings.some(
      (other) =>
        other.rule === INLINE_DISABLED_RULE && directiveKey(other) === directiveKey(finding),
    ) ?? false
  );
}

function sharedReporter(reporters: readonly Reporter[]): Reporter | undefined {
  const preferred = owner(reporters);
  const groups = [...Map.groupBy(reporters, ({ name }) => name).values()];
  const ruleSets = groups.map((group) => [
    ...new Set(group.flatMap(({ finding }) => unusedRuleIds(finding.message))),
  ]);
  if (ruleSets.every((rules) => rules.length === 0)) {
    return preferred;
  }
  const shared = (ruleSets[0] ?? []).filter((rule) =>
    ruleSets.every((rules) => rules.includes(rule)),
  );
  return shared.length === 0
    ? undefined
    : { ...preferred, finding: withUnusedRules(preferred.finding, shared) };
}

function usedByAnotherAnalyzer(
  { reports, scopes }: { reports: Reports; scopes: ReadonlyMap<string, Scope> },
  reporters: readonly Reporter[],
): boolean {
  const finding = reporters[0]?.finding;
  if (finding === undefined) {
    return false;
  }
  const reported = new Set(reporters.map(({ name }) => name));
  return [...scopes].some(
    ([name, scope]) =>
      lintsFile(scope, finding.path) &&
      !inlineDisabled(reports.get(name), finding) &&
      !reported.has(name),
  );
}

function keptFindings(reports: Reports, scopes: ReadonlyMap<string, Scope>) {
  const kept = new Map<string, Reporter>();
  for (const [key, reporters] of reportersOf(reports)) {
    const selected = sharedReporter(reporters);
    if (selected !== undefined && !usedByAnotherAnalyzer({ reports, scopes }, reporters)) {
      kept.set(key, selected);
    }
  }
  return kept;
}

export function withSharedUnusedDirectives<R extends Run>(
  run: R,
  analyzers: readonly unknown[] | undefined,
): R {
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
