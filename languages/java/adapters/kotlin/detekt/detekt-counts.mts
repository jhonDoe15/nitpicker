import {
  unitAt as untypedUnitAt,
  countInMessage as untypedCountInMessage,
  countPattern as untypedCountPattern,
  REMEDIES,
  withCountRatchets as untypedWithCountRatchets,
} from '../../../../../shared/rules/counts/count-ratchet.mjs';
import { noUnit } from '../../reporting/counts/java-counts.mts';
import type { JavaFinding } from '../../typed/java-values.mts';

type CountedRule = { pattern: RegExp; unit: string; remedy: string };
type Measured = { unit: string; remedy?: string };
type Count = { value: number; subject: string; unit: string; remedy?: string | undefined };
type DetektCount = { file: string; rule: string; line?: number; column?: number; value: number };
type Locate = (file: string, line: number) => unknown;

const countPattern: (template: string, unit: string, remedy?: string) => CountedRule =
  untypedCountPattern;
const countInMessage: (
  message: string,
  pattern: RegExp,
) => { value: number; subject: string } | undefined = untypedCountInMessage;
const unitAt: (finding: JavaFinding, locate: Locate) => unknown = untypedUnitAt;
const withCountRatchets: (
  findings: JavaFinding[],
  countOf: (finding: JavaFinding) => Count | undefined,
  unitOf: (finding: JavaFinding) => unknown,
) => JavaFinding[] = untypedWithCountRatchets;

const DETEKT_TOOL = 'detekt';

const MESSAGE_COUNTS = new Map<string, CountedRule>([
  ['ReturnCount', countPattern('has {count} return statements', 'return statements')],
  ['LongMethod', countPattern(String.raw`is too long \({count}\)`, 'lines')],
  [
    'CyclomaticComplexMethod',
    countPattern(String.raw`\(complexity: {count}\)`, 'cyclomatic complexity'),
  ],
  [
    'CognitiveComplexMethod',
    countPattern(String.raw`\(complexity: {count}\)`, 'cognitive complexity'),
  ],
  [
    'ComplexCondition',
    countPattern(String.raw`too complex \({count}\)`, 'conditions', REMEDIES.condition),
  ],
  ['TooManyFunctions', countPattern("with '{count}' functions", 'functions', REMEDIES.file)],
  [
    'NestedScopeFunctions',
    countPattern(
      String.raw`nested too deeply \('{count}'\)`,
      'scope function nesting',
      REMEDIES.nesting,
    ),
  ],
  [
    'MethodOverloading',
    countPattern(
      'overloaded {count} times',
      'overloads',
      'Give the new overload a name of its own.',
    ),
  ],
  [
    'DestructuringDeclarationWithTooManyEntries',
    countPattern(
      'contains {count} but',
      'destructured entries',
      'Destructure only the entries you use.',
    ),
  ],
]);

const MEASURED_COUNTS = new Map<string, Measured>([
  ['ThrowsCount', { unit: 'throw statements' }],
  ['NestedBlockDepth', { unit: 'nesting levels', remedy: REMEDIES.nesting }],
  ['LargeClass', { unit: 'lines of code', remedy: REMEDIES.class }],
  ['LoopWithTooManyJumpStatements', { unit: 'break and continue statements' }],
  ['LongParameterList', { unit: 'parameters', remedy: REMEDIES.parameters }],
]);

const PARAMETER_PRINT = /\(.*\)(?= has too many parameters)/u;
const FILE_PATH = /(?<=^File )'.*'(?= with)/u;

function ruleName(finding: JavaFinding): string | undefined {
  return finding.tool === DETEKT_TOOL ? finding.rule.split('.').at(-1) : undefined;
}

function measuredIndex(detektCounts: readonly DetektCount[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const entry of detektCounts) {
    for (const key of [
      [entry.file, entry.rule, entry.line, entry.column],
      [entry.file, entry.rule, entry.line],
    ]) {
      const id = JSON.stringify(key);
      index.set(id, [...(index.get(id) ?? []), entry.value]);
    }
  }
  return index;
}

function measuredValue(
  index: Map<string, number[]>,
  finding: JavaFinding,
  rule: string | undefined,
): number | undefined {
  const { line, column } = finding.location ?? {};
  return [
    [finding.path, rule, line, column],
    [finding.path, rule, line],
  ]
    .map((key) => index.get(JSON.stringify(key)) ?? [])
    .find((values) => values.length === 1)?.[0];
}

function countOf(index: Map<string, number[]>, finding: JavaFinding): Count | undefined {
  const rule = ruleName(finding);
  const counted = MESSAGE_COUNTS.get(rule ?? '');
  if (counted !== undefined) {
    const count = countInMessage(finding.message ?? '', counted.pattern);
    return count === undefined
      ? undefined
      : {
          ...count,
          subject: count.subject.replace(FILE_PATH, 'this file'),
          unit: counted.unit,
          remedy: counted.remedy,
        };
  }
  const measured = MEASURED_COUNTS.get(rule ?? '');
  const value = measured === undefined ? undefined : measuredValue(index, finding, rule);
  return measured === undefined || value === undefined
    ? undefined
    : { ...measured, value, subject: (finding.message ?? '').replace(PARAMETER_PRINT, '(…)') };
}

export function withDetektCountRatchets(
  findings: JavaFinding[],
  detektCounts: readonly DetektCount[] = [],
  locate: Locate = noUnit,
): JavaFinding[] {
  const index = measuredIndex(detektCounts);
  return withCountRatchets(
    findings,
    (finding: JavaFinding) => countOf(index, finding),
    (finding: JavaFinding) => unitAt(finding, locate),
  );
}
