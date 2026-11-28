import {
  TESTS_BASE_NOT_RUN_RULE,
  TESTS_TIMED_OUT_RULE,
} from '../../../../shared/rules/finding-parts.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';

const CONTINUATION_INDENT = '  ';

export function noteText(note: ReportEntry): string {
  const [first = '', ...rest] = textOf(note.message).split('\n');
  return [
    `${textOf(note.tool)} (${textOf(note.snapshot)}): ${first}`,
    ...rest.map((line) => `${CONTINUATION_INDENT}${line}`),
  ].join('\n');
}

export function noteSectionLines(notes: readonly ReportEntry[] = []): string[] {
  if (notes.length === 0) {
    return [];
  }
  return ['', 'Notes:', ...notes.flatMap((note) => noteText(note).split('\n'))];
}

const UNKNOWN_ON_BASE = [
  'Coverage, CRAP, mutation, slow-test and test-console results are unknown there,',
  'so only added files and edited lines are judged on them.',
].join(' ');

function outcomeOf(failed: readonly ReportEntry[]): string {
  if (failed.every(({ rule }) => rule === TESTS_BASE_NOT_RUN_RULE)) {
    return 'were not run';
  }
  const timedOut = failed.filter(({ rule }) => rule === TESTS_TIMED_OUT_RULE).length;
  if (timedOut === 0) {
    return 'fail';
  }
  return timedOut === failed.length ? 'did not finish' : 'fail or did not finish';
}

export function noteSummaryLines(notes: readonly ReportEntry[] = []): string[] {
  const failed = notes.filter(({ rule }) => rule !== 'tests-removed');
  if (failed.length === 0) {
    return [];
  }
  const tools = [...new Set(failed.map(({ tool }) => tool))].join(', ');
  const removed = notes.find(({ rule }) => rule === 'tests-removed');
  return [
    `Note: the project's tests ${outcomeOf(failed)} on the base (${tools}).`,
    removed === undefined ? UNKNOWN_ON_BASE : textOf(removed.message),
  ];
}
