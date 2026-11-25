import { fieldOf, textOf, textsOf } from '../../shared/values/readers.mts';
import { projectFilePaths } from '../../shared/project-files/project-files.mts';
import { renderRuleFilterSection as ruleFilterSection } from '../diff/reporting/text.mts';
import { exceptionsMatchingNoPath } from '../../shared/exceptions/finding-exceptions.mts';
import { canonicalRule } from '../../shared/exceptions/rule-names.mts';
import { RULE_IDS } from '../../shared/policy.mts';
import type { ReportData } from '../../shared/values/findings.mts';

type Listed = {
  readonly entry: unknown;
  readonly label: string;
  readonly rule: string;
  readonly paths: readonly string[];
};

type ClosingRun = {
  readonly options: { readonly ruleFilters: readonly string[] };
  readonly config: unknown;
  readonly currentProjectRoot: string;
};

const PACKAGE_PRESETS: ReadonlySet<unknown> = new Set(['java', 'kotlin']);

function labeled(entries: unknown, name: string): Listed[] {
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  return list.map((entry, index) => ({
    entry,
    label: `${name}[${String(index)}]`,
    rule: textOf(fieldOf(entry, 'rule')),
    paths: textsOf(fieldOf(entry, 'paths')),
  }));
}

function listedExceptions(config: unknown): Listed[] {
  return [
    ...labeled(fieldOf(config, 'exceptions'), 'exceptions'),
    ...labeled(fieldOf(fieldOf(config, 'python'), 'exceptions'), 'python.exceptions'),
  ];
}

function headFiles(projectRoot: string): string[] {
  return projectFilePaths(projectRoot, { includeLinks: true });
}

export function staleExceptionLines(config: unknown, projectRoot: string): string[] {
  const listed = listedExceptions(config).filter(
    ({ rule }) =>
      !(
        PACKAGE_PRESETS.has(fieldOf(config, 'preset')) &&
        canonicalRule(rule) === RULE_IDS.stabilityDirection
      ),
  );
  if (listed.length === 0) {
    return [];
  }
  const stale = new Set(exceptionsMatchingNoPath(listed, headFiles(projectRoot)));
  return listed
    .filter((exception) => stale.has(exception))
    .map(({ label, rule, paths }) => `${label} (${rule}) matches no file: ${paths.join(', ')}`);
}

function staleNote(lines: readonly string[]): string {
  if (lines.length === 0) {
    return '';
  }
  const count = lines.length;
  const noun = count === 1 ? 'exception' : 'exceptions';
  const pronoun = count === 1 ? 'it' : 'them';
  const listed = lines.map((line) => `  ${line}`).join('\n');
  return `Note: ${String(count)} ${noun} matching no file (not failing; remove or fix ${pronoun}):\n${listed}\n`;
}

export function renderClosingSections(
  { options, config, currentProjectRoot }: ClosingRun,
  report: ReportData,
): string {
  const note = staleNote(staleExceptionLines(config, currentProjectRoot));
  return `${ruleFilterSection(report, options.ruleFilters)}${note}`;
}
