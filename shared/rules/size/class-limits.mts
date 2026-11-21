import { CLASS_LIMIT_DEFAULTS } from '../../project-rules/size-rules.mts';
import { RULE_IDS } from '../../policy.mts';
import { occurrenceCounter } from '../finding-parts.mts';
import { exceptionMatcher, exceptionText } from '../exceptions.mts';
import { isCheckName, messagesFor, ratchetedFinding } from '../file-limits.mts';
import type { Finding } from '../../values/findings.mts';
import { fieldOf, fieldsOf, numberOr, optionalText, textOf } from '../../values/readers.mts';

const COMPONENT_KINDS = new Set(['record', 'data class']);
const RULES: Readonly<Record<string, string>> = RULE_IDS;
const CLASS_FIELDS = 'classFields';
const INHERITANCE_DEPTH = 'inheritanceDepth';
const LIMITS: readonly Limit[] = [
  { metric: 'methods', threshold: 'classMethods', messages: 'classMethods' },
  { metric: 'fields', threshold: CLASS_FIELDS, messages: CLASS_FIELDS },
  { metric: INHERITANCE_DEPTH, threshold: INHERITANCE_DEPTH, messages: INHERITANCE_DEPTH },
];

export type ClassFinding = Finding & { readonly location: { readonly line: number } };

type Limit = { metric: string; threshold: string; messages: string };
type ClassOptions = {
  readonly analyzerName: string;
  readonly thresholds?: object | undefined;
  readonly exceptions?: readonly unknown[] | undefined;
  readonly projectPath?: ((file: string) => string) | undefined;
  readonly messageKeys?: { readonly [field: string]: unknown } | undefined;
};

function ruleOf(key: string): string {
  const rule = RULES[key];
  if (rule === undefined) {
    throw new TypeError(`"${key}" is not a rule key`);
  }
  return rule;
}

export function classLimitFindings(
  classes: readonly object[],
  options: ClassOptions,
): ClassFinding[] {
  const limits = fieldsOf({ ...CLASS_LIMIT_DEFAULTS, ...options.thresholds });
  const isExcepted = exceptionMatcher(options.exceptions ?? []);
  const projectPath = options.projectPath ?? ((file: string) => file);
  const nextOccurrence = occurrenceCounter();
  const found = classes.flatMap((entry) => {
    const file = textOf(fieldOf(entry, 'file'));
    const occurrence = nextOccurrence(`${file}\0${textOf(fieldOf(entry, 'name'))}`);
    return LIMITS.filter(({ metric, threshold, messages }) => {
      const rule = ruleOf(messages);
      return (
        numberOr(fieldOf(entry, metric), Number.NaN) > numberOr(limits[threshold], Number.NaN) &&
        !isExcepted(rule, projectPath(file))
      );
    }).map((limit) =>
      classFinding(options.analyzerName, {
        entry,
        occurrence,
        limit: {
          ...limit,
          messages: optionalText(options.messageKeys?.[limit.messages]) ?? limit.messages,
        },
        max: numberOr(limits[limit.threshold], Number.NaN),
        exceptionPath: projectPath(file),
      }),
    );
  });
  return largestFirstPerFile(found);
}

function ratchetKey(finding: Finding): string {
  return textOf(fieldOf(fieldOf(finding, 'ratchet'), 'key'));
}

function ratchetValue(finding: Finding): number {
  return numberOr(fieldOf(fieldOf(finding, 'ratchet'), 'value'), Number.NaN);
}

function placeLargestFirst(
  ordered: ClassFinding[],
  indexed: readonly [number, ClassFinding][],
): void {
  const largestFirst = indexed
    .map(([, item]) => item)
    .toSorted((left, right) => ratchetValue(right) - ratchetValue(left));
  for (const [position, [index]] of indexed.entries()) {
    const replacement = largestFirst[position];
    if (replacement !== undefined) {
      ordered[index] = replacement;
    }
  }
}

function largestFirstPerFile(found: ClassFinding[]): ClassFinding[] {
  const slots = Map.groupBy(found.entries(), ([, item]) => `${item.path}\0${ratchetKey(item)}`);
  const ordered = [...found];
  for (const indexed of slots.values()) {
    placeLargestFirst(ordered, indexed);
  }
  return ordered;
}

function classFinding(
  analyzerName: string,
  {
    entry,
    occurrence,
    limit,
    max,
    exceptionPath,
  }: { entry: object; occurrence: number; limit: Limit; max: number; exceptionPath: string },
): ClassFinding {
  const rule = ruleOf(limit.threshold);
  const value = numberOr(fieldOf(entry, limit.metric), Number.NaN);
  const kind = textOf(fieldOf(entry, 'kind'));
  const name = textOf(fieldOf(entry, 'name'));
  const file = textOf(fieldOf(entry, 'file'));
  const messages =
    COMPONENT_KINDS.has(kind) && limit.messages === CLASS_FIELDS
      ? 'recordComponents'
      : limit.messages;
  if (!isCheckName(messages)) {
    throw new TypeError(`"${messages}" is not a message key`);
  }
  const label = `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)} ${name}`;
  const finding = ratchetedFinding(
    { analyzerName },
    {
      rule,
      path: file,
      identity: `${limit.metric}:${name}:occurrence:${String(occurrence)}:${String(value)}`,
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
  return { ...finding, location: { line: numberOr(fieldOf(entry, 'start'), Number.NaN) } };
}
