import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { MAX_SHOWN_FAILING_TESTS } from '../../../../shared/rules/failing-tests/failing-tests.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';

type ExitReport = {
  readonly summary: Readonly<Record<string, unknown>>;
  readonly toolErrors: readonly ReportEntry[];
};

type FailingTestStyle = {
  readonly headline: (text: string) => string;
  readonly label: (tool: unknown) => string;
  readonly diagnosticsPath: string;
};

const testsFailedRule: unknown = TESTS_FAILED_RULE;
const maxShown: number = MAX_SHOWN_FAILING_TESTS;

export function failingHeadTests<T extends ReportEntry>(toolErrors: readonly T[]): T[] {
  return toolErrors.filter(
    ({ rule, snapshot }) => rule === testsFailedRule && (snapshot ?? 'head') === 'head',
  );
}

export function comparisonExitCode(report: ExitReport): number {
  if (Number(report.summary['newEnforceableFindings']) > 0) {
    return 1;
  }
  if (failingHeadTests(report.toolErrors).length > 0) {
    return 1;
  }
  return report.summary['overallStatus'] === 'completed' ? 0 : 2;
}

const ENTRY_LINE = /^ {2}\S/u;
const DETAIL_LINE = /^ {4}/u;
const MORE_LINE = /^ {2}and (\d+) more$/u;

function isListed(line: string): boolean {
  return !MORE_LINE.test(line) && (ENTRY_LINE.test(line) || DETAIL_LINE.test(line));
}

function shownEntries(listed: readonly string[]): string[] {
  let entry = 0;
  return listed.filter((line) => {
    entry += ENTRY_LINE.test(line) ? 1 : 0;
    return entry <= maxShown;
  });
}

function cappedEntries(lines: readonly string[], diagnosticsPath: string): string[] {
  const listed = lines.filter((line) => isListed(line));
  const others = lines.filter((line) => !(isListed(line) || MORE_LINE.test(line)));
  const unlisted = lines.reduce((total, line) => total + Number(MORE_LINE.exec(line)?.[1] ?? 0), 0);
  const entries = listed.filter((line) => ENTRY_LINE.test(line)).length;
  const hidden = unlisted + Math.max(0, entries - maxShown);
  const pointer = hidden === 0 ? [] : [`  … and ${String(hidden)} more; see ${diagnosticsPath}`];
  return [...shownEntries(listed), ...pointer, ...others];
}

export function failingTestLines(
  errors: readonly ReportEntry[],
  { headline, label, diagnosticsPath }: FailingTestStyle,
): string[] {
  return errors.flatMap((error) => {
    const [first = '', ...rest] = String(error.message).split('\n');
    const owner = errors.length === 1 ? '' : `${label(error.tool)}: `;
    return [headline(`✖ ${owner}${first}`), ...cappedEntries(rest, diagnosticsPath)];
  });
}
