import { didYouMean } from '../../shared/messages/closest-match.mjs';

type LabelRow = readonly [label: string, description: string];

export const KIND_LABELS: readonly LabelRow[] = [
  ['bug', 'code that likely behaves wrongly: logic errors, null dereferences, races, misused APIs'],
  ['security', 'vulnerabilities, injection, weak crypto, secrets, exposed endpoints'],
  ['performance', 'wasted work: N+1 queries, I/O in loops, costly collections, rebuilt objects'],
  ['reliability', 'failure handling: timeouts, resource leaks, swallowed errors, transactions'],
  ['simplification', 'code that can be simpler: redundant or dead code, needless steps'],
  ['maintainability', 'size, complexity, duplication, coupling, architecture and design'],
  ['tests', 'test quality: failing tests, coverage, mutation, assertions, flaky tests'],
  ['style', 'formatting, naming, documentation layout and one-way conventions'],
];

export const FRAMEWORK_LABELS: readonly LabelRow[] = [
  ['spring', 'Spring and Spring Boot'],
  ['react', 'React, JSX and hooks'],
  ['persistence', 'JPA, Spring Data, ORMs, SQL and migrations'],
  ['async', 'promises, coroutines, reactive streams and executors'],
];

const KINDS: readonly string[] = KIND_LABELS.map(([label]) => label);
const FRAMEWORKS: readonly string[] = FRAMEWORK_LABELS.map(([label]) => label);

export const LABELS: readonly string[] = [...KINDS, ...FRAMEWORKS];

const suggestion: (argument: string, candidates: readonly string[], quote: string) => string =
  didYouMean;

export type LabelFilter = {
  readonly kinds: readonly string[];
  readonly frameworks: readonly string[];
};

export function isKind(label: string): boolean {
  return KINDS.includes(label);
}

export function isLabel(label: string): boolean {
  return LABELS.includes(label);
}

function prefixHint(input: string): string {
  const [only, ...others] = LABELS.filter((label) => label.startsWith(input.toLowerCase()));
  return only === undefined || others.length > 0 ? '' : `. Did you mean ${only}?`;
}

export function labelFilter(labels: readonly string[]): LabelFilter | undefined {
  const unknown = labels.filter((label) => !isLabel(label));
  if (unknown.length > 0) {
    const [first = ''] = unknown;
    const hint = suggestion(first, LABELS, '') || prefixHint(first);
    throw new Error(
      `Unknown --label: ${unknown.join(', ')}${hint === '' ? '.' : hint} Known labels: ${LABELS.join(', ')}.`,
    );
  }
  if (labels.length === 0) {
    return undefined;
  }
  return {
    kinds: KINDS.filter((label) => labels.includes(label)),
    frameworks: FRAMEWORKS.filter((label) => labels.includes(label)),
  };
}

function hasAny(labels: readonly string[], wanted: readonly string[]): boolean {
  return wanted.length === 0 || wanted.some((label) => labels.includes(label));
}

export function matchesFilter(labels: readonly string[], filter: LabelFilter): boolean {
  return hasAny(labels, filter.kinds) && hasAny(labels, filter.frameworks);
}

export function selectedLabels(filter: LabelFilter): string[] {
  return [...filter.kinds, ...filter.frameworks];
}

export function filterText(filter: LabelFilter): string {
  const kinds = filter.kinds.join(' or ');
  const frameworks = filter.frameworks.join(' or ');
  if (kinds === '' || frameworks === '') {
    return kinds + frameworks;
  }
  return `${kinds} in ${frameworks} code`;
}
