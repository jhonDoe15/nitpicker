import { failingHeadTests } from '../failing-tests/failing-tests.mts';
import {
  toolErrorHelpLine,
  troubleshootingLinkOf,
} from '../../../../shared/messages/troubleshooting.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../shared/rules/finding-helpers.mjs';
import { singleLine } from '../format/text.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';

const oneLine: (value: unknown) => string = singleLine;
const helpLineOf: (messages: readonly unknown[]) => string | undefined = toolErrorHelpLine;
const linkOf: (message: string) => string | undefined = troubleshootingLinkOf;
const testsFailedRule: unknown = TESTS_FAILED_RULE;
const testsSkippedRule: unknown = TESTS_FAILED_SKIPPED_RULE;

export function splitToolErrors(toolErrors: readonly ReportEntry[]): {
  readonly failingTests: ReportEntry[];
  readonly otherErrors: ReportEntry[];
} {
  const failingTests = failingHeadTests(toolErrors);
  return {
    failingTests,
    otherErrors: withoutSkipNotices(toolErrors).filter((error) => !failingTests.includes(error)),
  };
}

export function toolErrorSummaryLines(shown: readonly ReportEntry[], color: boolean): string[] {
  if (shown.length === 0) {
    return [];
  }
  const help = helpLineOf(shown.map(({ message }) => message));
  return [
    style(
      `✖ ${String(shown.length)} ${pluralize('tool error', shown.length)}`,
      [ANSI.bold, ANSI.red],
      { color },
    ),
    ...shown.flatMap((error) => toolErrorLines(error, color)),
    ...(help === undefined ? [] : [style(help, [ANSI.dim], { color })]),
  ];
}

function toolErrorLines(error: ReportEntry, color: boolean): string[] {
  const label =
    error.snapshot === undefined
      ? textOf(error.tool)
      : `${textOf(error.tool)} (${textOf(error.snapshot)})`;
  if (error.rule === undefined) {
    return [`  ${style(label, [ANSI.yellow], { color })}: ${errorHeadline(error.message)}`];
  }
  const [first = '', ...rest] = String(error.message).split('\n');
  return [
    `  ${style(label, [ANSI.yellow], { color })}: ${first}`,
    ...rest.map((line) => `  ${line}`),
  ];
}

export function withoutSkipNotices<T extends ReportEntry>(toolErrors: readonly T[]): T[] {
  const listedSnapshots = new Set(
    toolErrors.filter(({ rule }) => rule === testsFailedRule).map(({ snapshot }) => snapshot),
  );
  return toolErrors.filter(
    ({ rule, snapshot }) => rule !== testsSkippedRule || !listedSnapshots.has(snapshot),
  );
}

const ERROR_HEADLINE_LIMIT = 300;

const ERROR_LINE_PATTERN = /error TS\d+|Error:|ERR_|Cannot find|not found|ENOENT/u;

export function errorHeadline(message: unknown): string {
  const link = linkOf(String(message));
  const text = oneLine(String(message).replace(link ?? '', ''));
  const start = Math.max(text.search(ERROR_LINE_PATTERN), 0);
  const headline = text.slice(start, start + ERROR_HEADLINE_LIMIT).trimEnd();
  const shown =
    headline.length < text.length - start
      ? `${headline}… (full text in the diagnostics file)`
      : headline;
  return link === undefined ? shown : `${shown} ${link}`;
}

export function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

export function style(
  value: string,
  codes: readonly string[],
  { color }: { readonly color: boolean },
): string {
  return color ? `${codes.join('')}${value}${ANSI.reset}` : value;
}

export const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
};
