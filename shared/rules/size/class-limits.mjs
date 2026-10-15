import { CLASS_LIMIT_DEFAULTS, RULE_IDS } from '../../policy.mjs';
import { nextOccurrence } from '../finding-helpers.mjs';
import { exceptionMatcher, exceptionText, messagesFor, ratchetedFinding } from '../file-limits.mjs';

const LIMITS = [
  { metric: 'methods', threshold: 'classMethods', messages: 'classMethods' },
  { metric: 'fields', threshold: 'classFields', messages: 'classFields' },
  { metric: 'inheritanceDepth', threshold: 'inheritanceDepth', messages: 'inheritanceDepth' },
];

export function classLimitFindings(classes, options) {
  const limits = { ...CLASS_LIMIT_DEFAULTS, ...options.thresholds };
  const isExcepted = exceptionMatcher(options.exceptions ?? []);
  const occurrences = new Map();
  return classes.flatMap((entry) => {
    const occurrence = nextOccurrence(occurrences, `${entry.file}\0${entry.name}`);
    return LIMITS.filter(({ metric, threshold, messages }) => {
      const rule = RULE_IDS[messages];
      return entry[metric] > limits[threshold] && !isExcepted(rule, entry.file);
    }).map((limit) =>
      classFinding(options.analyzerName, {
        entry,
        occurrence,
        limit,
        max: limits[limit.threshold],
      }),
    );
  });
}

function classFinding(analyzerName, { entry, occurrence, limit, max }) {
  const rule = RULE_IDS[limit.messages];
  const value = entry[limit.metric];
  const label = `${entry.kind[0].toUpperCase()}${entry.kind.slice(1)} ${entry.name}`;
  const finding = ratchetedFinding(
    { analyzerName },
    {
      rule,
      path: entry.file,
      identity: `${limit.metric}:${entry.name}:occurrence:${String(occurrence)}:${String(value)}`,
      key: `${limit.metric}:${entry.name}:occurrence:${String(occurrence)}`,
      value,
      messages: messagesFor(limit.messages, {
        name: label,
        value,
        limit: max,
        exception: exceptionText(rule, entry.file),
        base: '{base}',
      }),
    },
  );
  return { ...finding, symbol: entry.name, location: { line: entry.start } };
}
