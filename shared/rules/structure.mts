import { appendAll } from '../lists/lists.mts';
import {
  FUNCTION_STRUCTURE_LIMITS,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  messageFields,
  renderMessage,
} from '../policy.mts';
import { allowedFormField, definedField } from '../messages/messages.mts';
import {
  type OccurrenceCounter,
  hash,
  metricFindings,
  occurrenceCounter,
  positiveInteger,
  summaryMetrics,
} from './finding-parts.mts';
import { exceptionRoute } from '../exceptions/rule-names.mts';
import type { Finding } from '../values/findings.mts';
import { fieldOf, fieldsOf, listOf, numberOr, textOf } from '../values/readers.mts';

const METADATA_FIELDS = new Set([
  'file',
  'name',
  'sourceHash',
  'anchorHash',
  'declarationHash',
  'numberedAmongSameSource',
  'start',
  'end',
]);

type Hints = Readonly<Record<string, string | undefined>>;
type MessageOptions = { readonly hints: Hints };

type Entry = {
  readonly file?: unknown;
  readonly name?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly sourceHash?: unknown;
  readonly anchorHash?: unknown;
  readonly declarationHash?: unknown;
  readonly numberedAmongSameSource?: unknown;
  readonly [metric: string]: unknown;
};

type LimitFindingInput = {
  readonly analyzerName: string;
  readonly entry: Entry;
  readonly metricName: string;
  readonly limit: number;
  readonly ruleId: string;
  readonly occurrence: number;
  readonly sourceHash: string;
  readonly hint: string | undefined;
};

export function evaluateStructure(
  report: unknown,
  analyzerName: string,
  { hints = {} }: { readonly hints?: Hints } = {},
): Finding[] {
  const findings = summaryMetrics(analyzerName, fieldsOf(fieldOf(report, 'summary')), 'structure');
  for (const [kind, values] of Object.entries(fieldsOf(fieldOf(report, 'distributions')))) {
    for (const [percentile, value] of Object.entries(fieldsOf(values))) {
      appendAll(
        findings,
        metricFindings({
          analyzerName,
          rule: 'distribution',
          path: '.',
          identity: `${kind}:${percentile}`,
          message: `${percentile} ${kind}`,
          metricName: `${kind}.${percentile}`,
          value,
        }),
      );
    }
  }
  const functions = listOf(fieldOf(report, 'functions'));
  addEntries(findings, {
    analyzerName,
    entries: functions,
    kind: 'function',
    messageOptions: { hints },
  });
  const classes = listOf(fieldOf(report, 'classes'));
  addEntries(findings, {
    analyzerName,
    entries: classes,
    kind: 'class',
    messageOptions: { hints },
  });
  return findings;
}

type EntryBatch = {
  readonly analyzerName: string;
  readonly entries: readonly unknown[];
  readonly kind: string;
  readonly messageOptions: MessageOptions;
};

type EntryMetrics = {
  readonly analyzerName: string;
  readonly kind: string;
  readonly entry: Entry;
  readonly occurrence: number;
};

function addEntryMetrics(
  findings: Finding[],
  { analyzerName, kind, entry, occurrence }: EntryMetrics,
): void {
  const name = textOf(entry.name);
  for (const [metricName, value] of Object.entries(entry)) {
    if (METADATA_FIELDS.has(metricName)) {
      continue;
    }
    appendAll(
      findings,
      metricFindings({
        analyzerName,
        rule: `${kind}-structure`,
        path: textOf(entry.file),
        identity: `${kind}:${name}:occurrence:${String(occurrence)}:${metricName}`,
        message: `${metricName} for ${name}`,
        metricName,
        value,
        symbol: entry.name,
        line: entry.start,
      }),
    );
  }
}

function addEntries(
  findings: Finding[],
  { analyzerName, entries, kind, messageOptions }: EntryBatch,
): void {
  const nextOccurrence = occurrenceCounter();
  const nextViolation = occurrenceCounter();
  for (const item of entries) {
    const entry: Entry = fieldsOf(item);
    const occurrence = nextOccurrence(`${textOf(entry.file)}\0${textOf(entry.name)}`);
    if (kind === 'function') {
      addLimitViolations(findings, {
        analyzerName,
        entry,
        numbering: { occurrence, nextViolation },
        messageOptions,
      });
    }
    addEntryMetrics(findings, { analyzerName, kind, entry, occurrence });
  }
}

function templateOf(messages: object, key: string): string {
  const template: unknown = Reflect.get(messages, key);
  if (typeof template !== 'string') {
    throw new TypeError(`No message template for ${key}`);
  }
  return template;
}

function structureMessage(metricName: string): typeof MESSAGES.functionStructure {
  if (metricName === 'maxControlNesting') {
    return MESSAGES.functionControlNesting;
  }
  return metricName === 'statements' ? MESSAGES.functionStatements : MESSAGES.functionStructure;
}

function withHint(message: string, hint: string | undefined): string {
  if (hint === undefined) {
    return message;
  }
  return message.endsWith('.') ? `${message} ${hint}` : `${message}. ${hint}`;
}

function limitFinding({
  analyzerName,
  entry,
  metricName,
  limit,
  ruleId,
  occurrence,
  sourceHash,
  hint,
}: LimitFindingInput): Finding {
  const name = textOf(entry.name);
  const route = exceptionRoute({
    rule: ruleId,
    path: textOf(entry.file),
    function: name,
    name: undefined,
    key: undefined,
  });
  const values = { name, value: numberOr(entry[metricName], Number.NaN), limit, base: '{base}' };
  const shown = messageFields(structureMessage(metricName), { ...values, metric: metricName });
  const worse = messageFields(templateOf(GREW_MESSAGES, metricName), values);
  return {
    tool: analyzerName,
    rule: ruleId,
    path: textOf(entry.file),
    identity: `function:${name}:occurrence:${String(occurrence)}:source:${sourceHash}`,
    message: withHint(withHint(textOf(shown['message']), hint), route),
    ...allowedFormField(shown['allowedForm'], hint),
    classification: 'enforceable',
    symbol: name,
    ratchet: {
      key: `function:${name}:occurrence:${String(occurrence)}:${metricName}`,
      value: entry[metricName],
      worseMessage: withHint(textOf(worse['message']), route),
      ...definedField('worseAllowedForm', worse['allowedForm']),
      heldMessage: renderMessage(templateOf(HELD_MESSAGES, metricName), values),
      ...(typeof entry.declarationHash === 'string'
        ? {
            declarationKey: `function:${name}:declaration:${textOf(entry.declarationHash)}:${metricName}`,
          }
        : {}),
    },
    ...(typeof entry.anchorHash === 'string'
      ? { anchor: { key: `function:${metricName}:text:${entry.anchorHash}` } }
      : {}),
    ...locationOf(entry),
  };
}

function locationOf({ start }: Entry): { location?: { line: number } } {
  const line = positiveInteger(start);
  return line === undefined ? {} : { location: { line } };
}

type LimitViolations = {
  readonly analyzerName: string;
  readonly entry: Entry;
  readonly numbering: { readonly occurrence: number; readonly nextViolation: OccurrenceCounter };
  readonly messageOptions: MessageOptions;
};

function addLimitViolations(
  findings: Finding[],
  { analyzerName, entry, numbering, messageOptions: { hints } }: LimitViolations,
): void {
  const sourceHash = textOf(
    entry.sourceHash ?? hash(`${textOf(entry.file)}:${textOf(entry.start)}:${textOf(entry.end)}`),
  );
  for (const [metricName, { limit, ruleId }] of Object.entries(FUNCTION_STRUCTURE_LIMITS)) {
    const metricValue = entry[metricName];
    if (typeof metricValue !== 'number' || metricValue <= limit) {
      continue;
    }
    const occurrence =
      entry.numberedAmongSameSource === true
        ? numbering.nextViolation(
            `${textOf(entry.file)}\0${textOf(entry.name)}\0${metricName}\0${sourceHash}`,
          )
        : numbering.occurrence;
    findings.push(
      limitFinding({
        analyzerName,
        entry,
        metricName,
        limit,
        ruleId,
        occurrence,
        sourceHash,
        hint: hints[metricName],
      }),
    );
  }
}
