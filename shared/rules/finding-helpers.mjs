// Small helpers the shared rules (and the adapters' remaining normalizers) build findings with.
// Language-neutral: only Node built-ins.

import { createHash } from 'node:crypto';

/** Tool-error rules for a project whose own tests fail; the skipped one is a notice, not a cause. */
export const TESTS_FAILED_RULE = 'tests-failed';
export const TESTS_FAILED_SKIPPED_RULE = 'tests-failed-skipped';

/** A stable 24-character digest used inside finding identities. */
export function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

/** The n-th (1-based) time `key` has been seen in `occurrences`; mutates the map. */
export function nextOccurrence(occurrences, key) {
  const occurrence = (occurrences.get(key) ?? 0) + 1;
  occurrences.set(key, occurrence);
  return occurrence;
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
