import { CLASS_LIMIT_DEFAULTS } from '../../project-rules/size-rules.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { nextOccurrence } from '../finding-helpers.mjs';
import { exceptionMatcher, exceptionText } from '../exceptions.mjs';
import { messagesFor, ratchetedFinding } from '../file-limits.mjs';

const COMPONENT_KINDS = new Set(['record', 'data class']);
const LIMITS = [
  { metric: 'methods', threshold: 'classMethods', messages: 'classMethods' },
  { metric: 'fields', threshold: 'classFields', messages: 'classFields' },
  { metric: 'inheritanceDepth', threshold: 'inheritanceDepth', messages: 'inheritanceDepth' },
];

export function classLimitFindings(classes, options) {
  const limits = { ...CLASS_LIMIT_DEFAULTS, ...options.thresholds };
  const isExcepted = exceptionMatcher(options.exceptions ?? []);
  const projectPath = options.projectPath ?? ((file) => file);
  const occurrences = new Map();
  const found = classes.flatMap((entry) => {
    const occurrence = nextOccurrence(occurrences, `${entry.file}\0${entry.name}`);
    return LIMITS.filter(({ metric, threshold, messages }) => {
      const rule = RULE_IDS[messages];
      return entry[metric] > limits[threshold] && !isExcepted(rule, projectPath(entry.file));
    }).map((limit) =>
      classFinding(options.analyzerName, {
        entry,
        occurrence,
        limit: { ...limit, messages: options.messageKeys?.[limit.messages] ?? limit.messages },
        max: limits[limit.threshold],
        exceptionPath: projectPath(entry.file),
      }),
    );
  });
  return largestFirstPerFile(found);
}

function largestFirstPerFile(found) {
  const slots = Map.groupBy(
    found.keys(),
    (index) => `${found[index].path}\0${found[index].ratchet.key}`,
  );
  const ordered = [...found];
  for (const indices of slots.values()) {
    const largestFirst = indices
      .map((index) => found[index])
      .toSorted((left, right) => right.ratchet.value - left.ratchet.value);
    for (const [position, index] of indices.entries()) {
      ordered[index] = largestFirst[position];
    }
  }
  return ordered;
}

function classFinding(analyzerName, { entry, occurrence, limit, max, exceptionPath }) {
  const rule = RULE_IDS[limit.threshold];
  const value = entry[limit.metric];
  const messages =
    COMPONENT_KINDS.has(entry.kind) && limit.messages === 'classFields'
      ? 'recordComponents'
      : limit.messages;
  const label = `${entry.kind[0].toUpperCase()}${entry.kind.slice(1)} ${entry.name}`;
  const finding = ratchetedFinding(
    { analyzerName },
    {
      rule,
      path: entry.file,
      identity: `${limit.metric}:${entry.name}:occurrence:${String(occurrence)}:${String(value)}`,
      key: limit.metric,
      value,
      messages: messagesFor(messages, {
        name: label,
        value,
        limit: max,
        exception: exceptionText(rule, exceptionPath),
        base: '{base}',
      }),
    },
  );
  return { ...finding, location: { line: entry.start } };
}
