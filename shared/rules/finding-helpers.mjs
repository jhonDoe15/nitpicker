// Small helpers the shared rules (and the adapters' remaining normalizers) build findings with.
// Language-neutral: only Node built-ins.

import { createHash } from 'node:crypto';

/** Tool-error rules for a project whose own tests fail; the skipped one is a notice, not a cause. */
export const TESTS_FAILED_RULE = 'tests-failed';
export const TESTS_NOT_RUN_RULE = 'tests-not-run';
export const TESTS_FAILED_SKIPPED_RULE = 'tests-failed-skipped';
export const TESTS_FAILED_RULES = [TESTS_FAILED_RULE, TESTS_FAILED_SKIPPED_RULE];
/** One tool of an analyzer did not run; its findings are left out of the comparison on both snapshots. */
export const TOOL_SKIPPED_RULE = 'tool-skipped';
/** A tests-failed finding's `symbol` lists the directories it covers, joined by this. */
export const TESTS_FAILED_SCOPE_SEPARATOR = ',';
/** A mutation run that failed for one module; its `symbol` is that module's directory. */
export const MUTATION_FAILED_PART_RULE = 'pit-failure';
export const TYPECHECK_FAILED_SKIPPED_RULE = 'typecheck-failed-skipped';
export const COMPILE_ERROR_TOOL = 'build';
export const COMPILE_ERROR_RULE = 'compile-error';
export const COMPILE_FAILED_SKIPPED_RULE = 'compile-failed-skipped';
const COMPILE_ERROR_HINT = 'The code does not compile; fix it before anything else is checked.';

export function compileErrorMessage(compilerText) {
  return `${compilerText.trim().replace(/\.$/u, '')}. ${COMPILE_ERROR_HINT}`;
}

const MAX_LISTED_TESTS = 5;

/**
 * The first line of every preset's failing-tests message on the head: the count, what the failure
 * skipped, and the ask. The console summary leads with it.
 */
export function testsFailHeadline(count, consequence, where = '') {
  const verb = count === 1 ? 'test fails' : 'tests fail';
  return `${String(count)} ${verb}${where}; ${consequence}. Fix the tests and rerun:`;
}

/** The note of a base whose own tests fail: one headline, then the failing tests. */
export function testsFailOnBase(tests, where = '') {
  const listed = tests.slice(0, MAX_LISTED_TESTS).map((test) => `  ${test}`);
  const omitted = tests.length - listed.length;
  return [
    `Tests fail on the base${where}:`,
    ...listed,
    ...(omitted > 0 ? [`  and ${String(omitted)} more`] : []),
  ].join('\n');
}

/** A stable 24-character digest used inside finding identities. */
export function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

const NAME_PART = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const NAME_PLACEHOLDER = '\0';

/**
 * A digest of a function's text with the words of its own name (`Owner.method`) masked, so the
 * same body under a renamed function or class has the same digest.
 */
export function nameFreeHash(text, name) {
  const parts = new Set(String(name).match(NAME_PART) ?? []);
  const masked = String(text).replaceAll(/[\p{L}\p{N}_$]+/gu, (word) =>
    parts.has(word) ? NAME_PLACEHOLDER : word,
  );
  return hash(masked);
}

/** The first line of a function's text that is not blank or an annotation or decorator. */
export function declarationLine(text) {
  return (
    String(text)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('@')) ?? ''
  );
}

/** The n-th (1-based) time `key` has been seen in `occurrences`; mutates the map. */
export function nextOccurrence(occurrences, key) {
  const occurrence = (occurrences.get(key) ?? 0) + 1;
  occurrences.set(key, occurrence);
  return occurrence;
}

const REPEATING_UNIT_NAME = /<(?:init|clinit|lambda)>$/u;

/** Whether a function name (`Owner.<init>`, `Owner.run.<lambda>`) may repeat in one file with other source. */
export function repeatsInSource(name) {
  return REPEATING_UNIT_NAME.test(name);
}

/** `value` when it is a positive integer (a usable line number), else undefined. */
export function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Appends a descriptive metric finding; non-finite or non-numeric values are skipped. */
export function addMetric(
  findings,
  { analyzerName, rule, path: findingPath, identity, message, metricName, value, symbol, line },
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return;
  }
  findings.push({
    tool: analyzerName,
    rule,
    path: findingPath,
    identity,
    message,
    classification: 'descriptive',
    metric: { name: metricName, value },
    ...(typeof symbol === 'string' && symbol.length > 0 ? { symbol } : {}),
    ...(positiveInteger(line) === undefined ? {} : { location: { line } }),
  });
}

/** One descriptive metric per numeric entry of a `{ metricName: number }` summary. */
export function summaryMetrics(analyzerName, summary = {}, rule, ignored = []) {
  const findings = [];
  for (const [metricName, value] of Object.entries(summary)) {
    if (ignored.includes(metricName)) {
      continue;
    }
    addMetric(findings, {
      analyzerName,
      rule,
      path: '.',
      identity: `summary:${metricName}`,
      message: `${metricName} summary`,
      metricName,
      value,
    });
  }
  return findings;
}

/** The name of the narrowest function of `file` (`{ file, name, start, end }[]`) that holds `line`. */
export function enclosingFunctionName(functions, file, line) {
  return enclosingFunction(functions, file, line)?.name;
}

export function enclosingFunction(functions, file, line) {
  let found;
  for (const candidate of functions) {
    const holds = candidate.file === file && candidate.start <= line && line <= candidate.end;
    if (
      holds &&
      (found === undefined || candidate.end - candidate.start < found.end - found.start)
    ) {
      found = candidate;
    }
  }
  return found;
}

/** A function that calls `read` the first time it is called and returns that value from then on. */
export function lazy(read) {
  let value;
  return () => {
    value ??= read();
    return value;
  };
}
