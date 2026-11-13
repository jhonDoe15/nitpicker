import { fieldOf, textOf, textsOf } from '../../shared/values/readers.mts';
import { projectFilePaths } from '../../shared/project-files/project-files.mjs';
import { renderRuleFilterSection } from '../diff/reporting/text.mjs';
import { exceptionsMatchingNoPath } from '../../shared/exceptions/finding-exceptions.mjs';
import { canonicalRule } from '../../shared/exceptions/rule-names.mjs';
import { RULE_IDS } from '../../shared/policy.mjs';

type Listed = { readonly entry: unknown; readonly label: string };

type ClosingRun = {
  readonly options: { readonly ruleFilters: readonly string[] };
  readonly config: unknown;
  readonly currentProjectRoot: string;
};

const filePathsOf: (root: string, options: { readonly includeLinks: boolean }) => string[] =
  projectFilePaths;
const ruleFilterSection: (report: unknown, ruleFilters: readonly string[]) => string =
  renderRuleFilterSection;
const matchingNoPath: (
  entries: readonly unknown[],
  files: readonly string[],
) => readonly unknown[] = exceptionsMatchingNoPath;
const canonicalOf: (rule: unknown) => unknown = canonicalRule;
const stabilityRule: unknown = RULE_IDS.stabilityDirection;

const PACKAGE_PRESETS: ReadonlySet<unknown> = new Set(['java', 'kotlin']);

function labeled(entries: unknown, name: string): Listed[] {
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  return list.map((entry, index) => ({ entry, label: `${name}[${String(index)}]` }));
}

function listedExceptions(config: unknown): Listed[] {
  return [
    ...labeled(fieldOf(config, 'exceptions'), 'exceptions'),
    ...labeled(fieldOf(fieldOf(config, 'python'), 'exceptions'), 'python.exceptions'),
  ];
}

function headFiles(projectRoot: string): string[] {
  return filePathsOf(projectRoot, { includeLinks: true });
}

export function staleExceptionLines(config: unknown, projectRoot: string): string[] {
  const listed = listedExceptions(config).filter(
    ({ entry }) =>
      !(
        PACKAGE_PRESETS.has(fieldOf(config, 'preset')) &&
        canonicalOf(fieldOf(entry, 'rule')) === stabilityRule
      ),
  );
  if (listed.length === 0) {
    return [];
  }
  const stale = new Set(
    matchingNoPath(
      listed.map(({ entry }) => entry),
      headFiles(projectRoot),
    ),
  );
  return listed
    .filter(({ entry }) => stale.has(entry))
    .map(
      ({ entry, label }) =>
        `${label} (${textOf(fieldOf(entry, 'rule'))}) matches no file: ${textsOf(fieldOf(entry, 'paths')).join(', ')}`,
    );
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
  report: unknown,
): string {
  const note = staleNote(staleExceptionLines(config, currentProjectRoot));
  return `${ruleFilterSection(report, options.ruleFilters)}${note}`;
}
